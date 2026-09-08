import AppKit
import ApplicationServices
import Darwin
import MacCore
@preconcurrency import ScreenCaptureKit

final class LocalOnlySessionDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
}
func architecture() -> String {
  var info = utsname()
  uname(&info)
  return withUnsafePointer(to: &info.machine) {
    $0.withMemoryRebound(to: CChar.self, capacity: 256) { String(cString: $0) }
  }
}
struct Window {
  let id: UInt32
  let pid: Int32
  let name: String
  let owner: String
  let bounds: CGRect
  var json: [String: Any] {
    [
      "id": id, "pid": pid, "title": name, "app": owner,
      "bounds": [
        "x": bounds.minX, "y": bounds.minY, "width": bounds.width, "height": bounds.height,
      ],
    ]
  }
}
func windows(onScreen: Bool = false) -> [Window] {
  let rows =
    CGWindowListCopyWindowInfo(
      onScreen
        ? [.optionOnScreenOnly, .excludeDesktopElements] : [.optionAll, .excludeDesktopElements],
      kCGNullWindowID) as? [[String: Any]] ?? []
  return rows.compactMap { r in
    guard let id = r[kCGWindowNumber as String] as? UInt32,
      let pid = r[kCGWindowOwnerPID as String] as? Int32,
      let rect = r[kCGWindowBounds as String] as? [String: Any],
      let b = CGRect(dictionaryRepresentation: rect as CFDictionary),
      r[kCGWindowLayer as String] as? Int == 0
    else { return nil }
    return Window(
      id: id, pid: pid, name: r[kCGWindowName as String] as? String ?? "",
      owner: r[kCGWindowOwnerName as String] as? String ?? "", bounds: b)
  }
}
func attr(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(e, key as CFString, &value) == .success else { return nil }
  return value
}
func children(_ e: AXUIElement) -> [AXUIElement] {
  attr(e, kAXChildrenAttribute) as? [AXUIElement] ?? []
}
func axWindow(_ w: Window) throws -> AXUIElement {
  guard AXIsProcessTrusted() else { throw Refusal("需要辅助功能权限") }
  let app = AXUIElementCreateApplication(w.pid)
  AXUIElementSetMessagingTimeout(app, 2)
  let list = attr(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
  let matches = list.filter { e in
    var p = CGPoint.zero
    var s = CGSize.zero
    guard let pv = attr(e, kAXPositionAttribute), let sv = attr(e, kAXSizeAttribute),
      CFGetTypeID(pv) == AXValueGetTypeID(), CFGetTypeID(sv) == AXValueGetTypeID()
    else { return false }
    AXValueGetValue(unsafeDowncast(pv, to: AXValue.self), .cgPoint, &p)
    AXValueGetValue(unsafeDowncast(sv, to: AXValue.self), .cgSize, &s)
    return abs(p.x - w.bounds.minX) < 1 && abs(p.y - w.bounds.minY) < 1
      && abs(s.width - w.bounds.width) < 1 && abs(s.height - w.bounds.height) < 1
  }
  guard matches.count == 1 else { throw Refusal("AX 窗口匹配不唯一或不可访问") }
  return matches[0]
}
func flatten(_ root: AXUIElement) -> [(String, AXUIElement)] {
  var out: [(String, AXUIElement)] = []
  func visit(_ e: AXUIElement, _ path: String, _ depth: Int) {
    guard depth < 32, out.count < 2000 else { return }
    out.append((path, e))
    for (i, c) in children(e).enumerated() { visit(c, path + "/\(i)", depth + 1) }
  }
  visit(root, "0", 0)
  return out
}
func description(_ e: AXUIElement) -> [String: Any] {
  var d: [String: Any] = [:]
  for (key, name) in [
    (kAXRoleAttribute, "role"), (kAXTitleAttribute, "title"), (kAXValueAttribute, "value"),
    (kAXIdentifierAttribute, "identifier"), (kAXDescriptionAttribute, "description"),
  ] {
    if let v = attr(e, key) {
      if let s = v as? String { d[name] = s } else if let n = v as? NSNumber { d[name] = n }
    }
  }
  return d
}
func selected(_ args: Arguments) throws -> Window {
  guard let id = UInt32(try args.required("window")),
    let w = windows().first(where: { $0.id == id })
  else { throw Refusal("窗口不存在或不在当前桌面") }
  return w
}
func snapshot(_ args: Arguments, _ w: Window) throws -> Snapshot {
  let data = try Data(contentsOf: URL(fileURLWithPath: args.required("snapshot")))
  let s = try JSONDecoder().decode(Snapshot.self, from: data)
  try s.validate(window: w.id, pid: w.pid, bounds: w.bounds)
  return s
}
func persist(_ s: Snapshot, _ path: String) throws {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  try encoder.encode(s).write(to: URL(fileURLWithPath: path), options: .atomic)
}
func point(_ args: Arguments, _ s: Snapshot) throws -> CGPoint {
  try Coordinates.resolve(
    x: args.number("x"), y: args.number("y"), unit: args.required("unit"), bounds: s.bounds,
    pixelWidth: s.pixelWidth, pixelHeight: s.pixelHeight)
}
func signature(_ e: AXUIElement) -> String {
  [kAXRoleAttribute, kAXIdentifierAttribute, kAXTitleAttribute, kAXDescriptionAttribute].map {
    attr(e, $0) as? String ?? ""
  }.joined(separator: "\u{1f}")
}
func element(_ args: Arguments, _ w: Window, _ snapshot: Snapshot) throws -> AXUIElement {
  guard args.values["element"] == nil || args.values["identifier"] == nil else {
    throw Failure("element 与 identifier 不可同时指定")
  }
  let entries = flatten(try axWindow(w))
  let matches: [(String, AXUIElement)]
  if let path = args.values["element"] {
    matches = entries.filter { $0.0 == path }
  } else {
    let identifier = try args.required("identifier")
    matches = entries.filter { attr($0.1, kAXIdentifierAttribute) as? String == identifier }
  }
  guard matches.count == 1 else { throw Refusal("元素不存在或匹配不唯一") }
  guard entries.filter({ signature($0.1) == signature(matches[0].1) }).count == 1 else {
    throw Refusal("元素签名不唯一，请使用唯一标识的控件")
  }
  guard snapshot.elements?[matches[0].0] == signature(matches[0].1) else {
    throw Refusal("元素引用变化，请重新读取 AX 快照")
  }
  return matches[0].1
}
@MainActor final class GuardedWrite {
  let mutex: SessionMutex
  let previous: NSRunningApplication?
  let previousWindow: AXUIElement?
  var activated = false
  var touchedFocus = false
  var monitor: Any?
  var interrupted = false
  init() throws {
    previous = NSWorkspace.shared.frontmostApplication
    if let previous,
      let value = attr(
        AXUIElementCreateApplication(previous.processIdentifier), kAXFocusedWindowAttribute),
      CFGetTypeID(value) == AXUIElementGetTypeID()
    {
      previousWindow = unsafeDowncast(value, to: AXUIElement.self)
    } else {
      previousWindow = nil
    }
    mutex = try SessionMutex()
    monitor = NSEvent.addGlobalMonitorForEvents(matching: [
      .keyDown, .leftMouseDown, .rightMouseDown, .mouseMoved, .scrollWheel, .flagsChanged,
      .otherMouseDown,
    ]) { [weak self] event in
      if event.cgEvent?.getIntegerValueField(.eventSourceUserData) != 0x4d4355 {
        MainActor.assumeIsolated { self?.interrupted = true }
      }
    }
  }
  func check() throws {
    RunLoop.current.run(until: Date())
    guard !interrupted else { throw Refusal("用户恢复输入，操作已停止") }
  }
  func idle() throws {
    let deadline = Date().addingTimeInterval(15)
    while [
      CGEventType.keyDown, .mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown,
      .scrollWheel, .flagsChanged,
    ].contains(where: {
      CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: $0) < 2
    }) {
      guard Date() < deadline else { throw Refusal("等待用户空闲超时") }
      RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    interrupted = false
  }
  func prepare(_ w: Window) throws {
    try idle()
    guard let current = windows(onScreen: true).first(where: { $0.id == w.id }),
      current.bounds == w.bounds
    else { throw Refusal("目标窗口已变化或不在当前桌面") }
    touchedFocus = true
    let beforeActivationTarget = try axWindow(w)
    guard AXUIElementPerformAction(beforeActivationTarget, kAXRaiseAction as CFString) == .success
    else { throw Refusal("无法置顶目标窗口") }
    if NSWorkspace.shared.frontmostApplication?.processIdentifier != w.pid {
      guard let app = NSRunningApplication(processIdentifier: w.pid), app.activate(options: [])
      else { throw Refusal("无法激活当前桌面目标") }
      activated = true
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
      try check()
      guard NSWorkspace.shared.frontmostApplication?.processIdentifier == w.pid else {
        throw Refusal("目标未成为前台")
      }
    }
    let target = try axWindow(w)
    guard let focused = attr(AXUIElementCreateApplication(w.pid), kAXFocusedWindowAttribute),
      CFEqual(focused, target)
    else { throw Refusal("目标窗口未取得键盘焦点") }
  }
  func unobscured(_ p: CGPoint, _ w: Window) throws {
    // AX 命中测试会跳过系统透明事件穿透窗口，并能识别菜单与浮层。
    var hit: AXUIElement?
    guard
      AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(p.x), Float(p.y), &hit)
        == .success, let hit
    else { throw Refusal("无法验证操作点遮挡") }
    var pid: pid_t = 0
    AXUIElementGetPid(hit, &pid)
    guard pid == w.pid else { throw Refusal("操作点被其他应用或浮层遮挡") }
    let target = try axWindow(w)
    let hitWindow = attr(hit, kAXWindowAttribute)
    guard CFEqual(hit, target) || (hitWindow.map { CFEqual($0, target) } ?? false) else {
      throw Refusal("操作点不属于目标窗口")
    }
    try check()
  }
  func finish() -> [String: Any] {
    RunLoop.current.run(until: Date().addingTimeInterval(0.03))
    if touchedFocus && !interrupted {
      if let previousWindow {
        _ = AXUIElementPerformAction(previousWindow, kAXRaiseAction as CFString)
      }
      if activated {
        _ = previous?.activate(options: [])
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
      }
    }
    if let monitor { NSEvent.removeMonitor(monitor) }
    mutex.release()
    let restored =
      previous.map {
        NSWorkspace.shared.frontmostApplication?.processIdentifier == $0.processIdentifier
      } ?? true
    return [
      "changed": touchedFocus, "restored": touchedFocus ? restored : true,
      "userInterrupted": interrupted,
    ]
  }
}
@MainActor func run(_ a: Arguments) async throws -> [String: Any] {
  var result: [String: Any] = [
    "status": "success", "channel": "native", "target": NSNull(), "error": NSNull(), "evidence": [],
  ]
  switch a.command {
  case "help":
    result["commands"] = [
      "doctor", "probe --app BUNDLE_ID [--ports 9222,9333]", "windows",
      "shot --window ID --output FILE --snapshot-out FILE", "ax --window ID --snapshot-out FILE",
      "ax-set --window ID --snapshot FILE --identifier ID --text TEXT",
      "click|hover --window ID --snapshot FILE --x N --y N --unit points|normalized|pixels",
      "scroll --window ID --snapshot FILE --x N --y N --unit points --delta N",
      "type --window ID --snapshot FILE --text TEXT",
      "key --window ID --snapshot FILE --key enter|tab|escape|backspace|a|c|v --modifiers command,shift",
      "open --app BUNDLE_ID [--cdp-port 9222 --relaunch]", "所有写命令支持 --dry-run",
    ]
  case "doctor":
    result["data"] = [
      "accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess(),
      "os": ProcessInfo.processInfo.operatingSystemVersionString, "architecture": architecture(),
      "frontmostPID": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1,
    ]
  case "windows": result["data"] = windows().map(\.json)
  case "probe":
    let bundle = try a.required("app")
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle),
      let info = Bundle(url: url)?.infoDictionary
    else { throw Failure("未找到应用") }
    let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundle)
    let scripts =
      (try? FileManager.default.contentsOfDirectory(
        atPath: url.appendingPathComponent("Contents/Resources").path))?.filter {
        $0.hasSuffix(".sdef")
      } ?? []
    var ports: [[String: Any]] = []
    for portText in (a.values["ports"] ?? "9222,9229,9333").split(separator: ",") {
      guard let port = Int(portText), (1...65535).contains(port) else {
        throw Failure("无效 --ports")
      }
      var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/json/version")!)
      request.timeoutInterval = 0.5
      if let (data, response) = try? await URLSession(
        configuration: .ephemeral, delegate: LocalOnlySessionDelegate(), delegateQueue: nil
      ).data(for: request),
        (response as? HTTPURLResponse)?.statusCode == 200,
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      {
        ports.append(["port": port, "version": json, "ownership": "unverified"])
      }
    }
    result["target"] = bundle
    result["data"] = [
      "path": url.path, "pids": running.map(\.processIdentifier), "scriptingDefinitions": scripts,
      "urlTypes": info["CFBundleURLTypes"] ?? [], "debugPorts": ports,
    ]
  case "open":
    let bundle = try a.required("app")
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) else {
      throw Failure("未找到应用")
    }
    result["target"] = bundle
    if let port = a.values["cdp-port"] {
      guard let n = Int(port), (1024...65535).contains(n) else { throw Failure("无效调试端口") }
    }
    if a.dryRun {
      result["data"] = ["dryRun": true]
      break
    }
    let lock = try GuardedWrite()
    defer { result["focus"] = lock.finish() }
    try lock.idle()
    try lock.check()
    let config = NSWorkspace.OpenConfiguration()
    config.activates = false
    if let portText = a.values["cdp-port"] {
      guard let port = Int(portText), (1024...65535).contains(port) else {
        throw Failure("调试端口须为 1024...65535")
      }
      let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundle)
      if !running.isEmpty {
        guard a.values["relaunch"] != nil else { throw Refusal("应用已运行；使用 --relaunch 显式请求重启") }
        for app in running { guard app.terminate() else { throw Refusal("应用拒绝退出，未强制终止") } }
        let deadline = Date().addingTimeInterval(10)
        while running.contains(where: { !$0.isTerminated }) {
          guard Date() < deadline else { throw Refusal("应用退出超时，未强制终止") }
          try await Task.sleep(for: .milliseconds(100))
        }
      }
      config.arguments = [
        "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=\(port)",
      ]
    }
    let app = try await NSWorkspace.shared.openApplication(at: url, configuration: config)
    result["data"] = ["pid": app.processIdentifier]
  case "shot", "ax":
    let w = try selected(a)
    result["target"] = w.json
    var s = Snapshot(window: w.id, pid: w.pid, bounds: w.bounds)
    let snapshotPath = try a.required("snapshot-out")
    if a.command == "ax" {
      let entries = flatten(try axWindow(w))
      s.elements = Dictionary(uniqueKeysWithValues: entries.map { ($0.0, signature($0.1)) })
      result["data"] = entries.map { entry -> [String: Any] in
        var d = description(entry.1)
        d["element"] = entry.0
        return d
      }
    } else {
      guard CGPreflightScreenCaptureAccess() else { throw Refusal("需要屏幕录制权限") }
      let output = try a.required("output")
      let content = try await SCShareableContent.excludingDesktopWindows(
        true, onScreenWindowsOnly: false)
      guard let window = content.windows.first(where: { $0.windowID == w.id }) else {
        throw Failure("截图目标已消失")
      }
      let filter = SCContentFilter(desktopIndependentWindow: window)
      let config = SCStreamConfiguration()
      config.width = Int(w.bounds.width * Double(filter.pointPixelScale))
      config.height = Int(w.bounds.height * Double(filter.pointPixelScale))
      config.showsCursor = false
      config.ignoreShadowsSingleWindow = true
      let image = try await SCScreenshotManager.captureImage(
        contentFilter: filter, configuration: config)
      let rep = NSBitmapImageRep(cgImage: image)
      guard let png = rep.representation(using: .png, properties: [:]) else {
        throw Failure("PNG 编码失败")
      }
      try png.write(to: URL(fileURLWithPath: output), options: .atomic)
      s.pixelWidth = Double(image.width)
      s.pixelHeight = Double(image.height)
      result["evidence"] = [output, snapshotPath]
    }
    guard let live = windows().first(where: { $0.id == w.id }) else { throw Failure("观察期间窗口消失") }
    try s.validate(window: live.id, pid: live.pid, bounds: live.bounds)
    try persist(s, snapshotPath)
    result["snapshot"] = snapshotPath
  case "ax-set", "click", "hover", "scroll", "type", "key":
    let w = try selected(a)
    let s = try snapshot(a, w)
    result["target"] = w.json
    var targetElement: AXUIElement?
    var location: CGPoint?
    if a.command == "ax-set" {
      targetElement = try element(a, w, s)
      _ = try a.required("text")
    }
    if ["click", "hover", "scroll"].contains(a.command) { location = try point(a, s) }
    if a.command == "type" {
      guard try a.required("text").utf16.count <= 1024 else {
        throw Failure("单次输入最多 1024 个 UTF-16 单元")
      }
    }
    if a.command == "scroll" {
      let n = try a.number("delta")
      guard abs(n) <= 10000 else { throw Failure("滚动幅度过大") }
    }
    let keys: [String: CGKeyCode] = [
      "enter": 36, "tab": 48, "escape": 53, "backspace": 51, "a": 0, "c": 8, "v": 9, "x": 7, "z": 6,
      "left": 123, "right": 124, "down": 125, "up": 126, "space": 49,
    ]
    var flags: CGEventFlags = []
    if a.command == "key" {
      guard keys[try a.required("key")] != nil else { throw Failure("不支持的按键") }
      for f in (a.values["modifiers"] ?? "").split(separator: ",") {
        switch f {
        case "command": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "option": flags.insert(.maskAlternate)
        case "control": flags.insert(.maskControl)
        default: throw Failure("不支持的修饰键")
        }
      }
    }
    if a.dryRun {
      result["data"] = ["dryRun": true]
      break
    }
    guard AXIsProcessTrusted() else { throw Refusal("需要辅助功能权限") }
    let lock = try GuardedWrite()
    defer { result["focus"] = lock.finish() }
    if a.command == "ax-set" { try lock.idle() } else { try lock.prepare(w) }
    guard let live = windows(onScreen: a.command != "ax-set").first(where: { $0.id == w.id }) else {
      throw Refusal("窗口已消失或离开当前桌面")
    }
    try s.validate(window: live.id, pid: live.pid, bounds: live.bounds)
    if let location { try lock.unobscured(location, w) }
    try lock.check()
    if targetElement != nil {
      let targetElement = try element(a, w, s)
      let before = description(targetElement)
      let text = try a.required("text")
      let status = AXUIElementSetAttributeValue(
        targetElement, kAXValueAttribute as CFString, text as CFString)
      guard status == .success else {
        result["status"] = "unknown"
        result["error"] = "AX 写入返回 \(status.rawValue)，结果不确定，禁止重放"
        return result
      }
      result["status"] =
        (attr(targetElement, kAXValueAttribute) as? String == text) ? "success" : "unknown"
      result["data"] = ["before": before, "after": description(targetElement)]
      break
    }
    let source = CGEventSource(stateID: .privateState)
    source?.userData = 0x4d4355
    switch a.command {
    case "click", "hover":
      let p = location!
      let move = CGEvent(
        mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left
      )
      if a.command == "hover" { move?.post(tap: .cghidEventTap) }
      if a.command == "click" {
        CGEvent(
          mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: p,
          mouseButton: .left)?.post(tap: .cghidEventTap)
        CGEvent(
          mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: p,
          mouseButton: .left)?.post(tap: .cghidEventTap)
      }
    case "scroll":
      let event = CGEvent(
        scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1,
        wheel1: Int32(try a.number("delta")), wheel2: 0, wheel3: 0)
      event?.location = location!
      event?.post(tap: .cghidEventTap)
    case "type":
      let units = Array(try a.required("text").utf16)
      guard units.count <= 1024 else { throw Failure("单次输入最多 1024 个 UTF-16 单元") }
      let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
      let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
      units.withUnsafeBufferPointer {
        down?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: $0.baseAddress)
        up?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: $0.baseAddress)
      }
      down?.post(tap: .cghidEventTap)
      up?.post(tap: .cghidEventTap)
    case "key":
      let code = keys[try a.required("key")]!
      let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)
      let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
      down?.flags = flags
      up?.flags = flags
      down?.post(tap: .cghidEventTap)
      up?.post(tap: .cghidEventTap)
    default: break
    }
    result["status"] = "unknown"
    result["data"] = ["dispatched": true, "reason": "事件已发送，须通过 AX 状态或实际产物验证；禁止自动重放"]
  default: throw Failure("未知命令: \(a.command)")
  }
  return result
}
// 整个命令设定硬超时，系统 API 卡住时进程退出并释放文件锁。
DispatchQueue.global().asyncAfter(deadline: .now() + 30) {
  let message =
    "{\"status\":\"unknown\",\"channel\":\"native\",\"target\":null,\"error\":\"command timeout after 30 seconds; do not replay writes\",\"evidence\":[]}\n"
  FileHandle.standardOutput.write(Data(message.utf8))
  exit(2)
}
let args: Arguments
var exitStatus: Int32 = 0
var output: [String: Any]
do {
  args = try Arguments(Array(CommandLine.arguments.dropFirst()))
  output = try await run(args)
  if output["status"] as? String == "unknown" { exitStatus = 2 }
} catch {
  output = [
    "status": error is Refusal ? "refused" : "failed", "channel": "native", "target": NSNull(),
    "error": String(describing: error), "evidence": [],
  ]
  exitStatus = error is Refusal ? 2 : 1
}
if let data = try? JSONSerialization.data(
  withJSONObject: output, options: [.sortedKeys, .prettyPrinted]),
  let string = String(data: data, encoding: .utf8)
{
  print(string)
}
exit(exitStatus)
