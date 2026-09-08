import CoreGraphics
import Darwin
import Foundation

public struct Refusal: Error, CustomStringConvertible {
  public let description: String
  public init(_ text: String) { description = text }
}
public struct Failure: Error, CustomStringConvertible {
  public let description: String
  public init(_ text: String) { description = text }
}
public struct Arguments {
  public let command: String
  public var values: [String: String] = [:]
  public var dryRun: Bool { values["dry-run"] != nil }
  public init(_ args: [String]) throws {
    command = args.first ?? "help"
    let allowed: [String: Set<String>] = [
      "help": [], "doctor": [], "windows": [], "probe": ["app", "ports"],
      "shot": ["window", "output", "snapshot-out"], "ax": ["window", "snapshot-out"],
      "ax-set": ["window", "snapshot", "identifier", "element", "text", "dry-run"],
      "click": ["window", "snapshot", "x", "y", "unit", "dry-run"],
      "hover": ["window", "snapshot", "x", "y", "unit", "dry-run"],
      "scroll": ["window", "snapshot", "x", "y", "unit", "delta", "dry-run"],
      "type": ["window", "snapshot", "text", "dry-run"],
      "key": ["window", "snapshot", "key", "modifiers", "dry-run"],
      "open": ["app", "cdp-port", "relaunch", "dry-run"],
    ]
    guard let options = allowed[command] else { throw Failure("未知命令") }
    var i = 1
    while i < args.count {
      let key = args[i]
      guard key.hasPrefix("--") else { throw Failure("需要 --参数: \(key)") }
      let name = String(key.dropFirst(2))
      guard options.contains(name) else { throw Failure("不支持的参数: \(name)") }
      guard values[name] == nil else { throw Failure("重复参数: \(name)") }
      if ["dry-run", "relaunch"].contains(name) {
        values[name] = "true"
        i += 1
      } else {
        guard i + 1 < args.count else { throw Failure("缺少参数值: \(name)") }
        values[name] = args[i + 1]
        i += 2
      }
    }
  }
  public func required(_ name: String) throws -> String {
    guard let v = values[name], !v.isEmpty else { throw Failure("缺少 --\(name)") }
    return v
  }
  public func number(_ name: String) throws -> Double {
    guard let n = Double(try required(name)), n.isFinite else { throw Failure("--\(name) 必须为有限数字") }
    return n
  }
}
public enum Coordinates {
  public static func resolve(
    x: Double, y: Double, unit: String, bounds: CGRect, pixelWidth: Double?, pixelHeight: Double?
  ) throws -> CGPoint {
    guard x.isFinite, y.isFinite, bounds.width > 0, bounds.height > 0 else { throw Failure("无效坐标") }
    let px: Double
    let py: Double
    switch unit {
    case "points":
      px = x
      py = y
    case "normalized":
      px = x * bounds.width
      py = y * bounds.height
    case "pixels":
      guard let w = pixelWidth, let h = pixelHeight, w > 0, h > 0 else {
        throw Failure("像素坐标需要截图尺寸")
      }
      px = x * bounds.width / w
      py = y * bounds.height / h
    default: throw Failure("unit 只能是 points、normalized 或 pixels")
    }
    guard px >= 0, py >= 0, px < bounds.width, py < bounds.height else { throw Failure("坐标超出窗口") }
    return CGPoint(x: bounds.minX + px, y: bounds.minY + py)
  }
}
public struct Snapshot: Codable {
  public let id: String
  public let created: Date
  public let window: UInt32
  public let pid: Int32
  public let bounds: CGRect
  public var pixelWidth: Double?
  public var pixelHeight: Double?
  public var elements: [String: String]?
  public init(window: UInt32, pid: Int32, bounds: CGRect) {
    id = UUID().uuidString
    created = Date()
    self.window = window
    self.pid = pid
    self.bounds = bounds
  }
  public func validate(window: UInt32, pid: Int32, bounds: CGRect) throws {
    guard self.window == window, self.pid == pid, self.bounds == bounds,
      Date().timeIntervalSince(created) < 300
    else { throw Refusal("快照过期或目标几何变化，请重新观察") }
  }
}

public final class SessionMutex {
  private var descriptor: Int32
  public init(path: String = NSTemporaryDirectory() + "mac-computer-use-\(getuid()).lock") throws {
    descriptor = Darwin.open(path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
    guard descriptor >= 0 else { throw Refusal("无法打开会话互斥锁") }
    guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
      close(descriptor)
      descriptor = -1
      throw Refusal("其他自动化写操作正在执行")
    }
  }
  public func release() {
    if descriptor >= 0 {
      flock(descriptor, LOCK_UN)
      close(descriptor)
      descriptor = -1
    }
  }
  deinit { release() }
}
