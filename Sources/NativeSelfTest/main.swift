import CoreGraphics
import Foundation
import MacCore

var count = 0
@MainActor func check(_ condition: Bool, _ name: String) {
  guard condition else {
    fputs("FAILED: \(name)\n", stderr)
    exit(1)
  }
  count += 1
}
@MainActor func rejects(_ name: String, _ operation: () throws -> Void) {
  do {
    try operation()
    check(false, name)
  } catch { count += 1 }
}
let rect = CGRect(x: -1200, y: 20, width: 1000, height: 800)
check(
  try Coordinates.resolve(
    x: 0.5, y: 0.5, unit: "normalized", bounds: rect, pixelWidth: nil, pixelHeight: nil)
    == CGPoint(x: -700, y: 420), "负坐标显示器")
check(
  try Coordinates.resolve(
    x: 100, y: 200, unit: "pixels", bounds: CGRect(x: 10, y: 20, width: 500, height: 400),
    pixelWidth: 1000, pixelHeight: 800) == CGPoint(x: 60, y: 120), "Retina 像素换算")
rejects("禁止猜测单位") {
  _ = try Coordinates.resolve(
    x: 1, y: 1, unit: "auto", bounds: rect, pixelWidth: nil, pixelHeight: nil)
}
rejects("边界越界") {
  _ = try Coordinates.resolve(
    x: 1000, y: 1, unit: "points", bounds: rect, pixelWidth: nil, pixelHeight: nil)
}
rejects("NaN") {
  _ = try Coordinates.resolve(
    x: .nan, y: 1, unit: "points", bounds: rect, pixelWidth: nil, pixelHeight: nil)
}
let snapshot = Snapshot(window: 1, pid: 2, bounds: rect)
rejects("窗口移动") {
  try snapshot.validate(window: 1, pid: 2, bounds: CGRect(x: 0, y: 0, width: 1000, height: 800))
}
rejects("窗口替换") { try snapshot.validate(window: 2, pid: 2, bounds: rect) }
rejects("进程替换") { try snapshot.validate(window: 1, pid: 3, bounds: rect) }
check(
  try JSONDecoder().decode(Snapshot.self, from: JSONEncoder().encode(snapshot)).bounds == rect,
  "快照往返")
rejects("重复参数") { _ = try Arguments(["type", "--text", "a", "--text", "b"]) }
check(try Arguments(["click", "--dry-run"]).dryRun, "预演解析")
rejects("拒绝拼错的预演参数") { _ = try Arguments(["click", "--dryrun", "true"]) }
rejects("拒绝其他命令参数") { _ = try Arguments(["windows", "--text", "unexpected"]) }
let lockPath = NSTemporaryDirectory() + UUID().uuidString + ".lock"
let lock = try SessionMutex(path: lockPath)
rejects("互斥锁拒绝并发") { _ = try SessionMutex(path: lockPath) }
lock.release()
let second = try SessionMutex(path: lockPath)
second.release()
check(true, "锁可释放再获取")
try FileManager.default.removeItem(atPath: lockPath)
print("{\"status\":\"success\",\"tests\":\(count)}")
