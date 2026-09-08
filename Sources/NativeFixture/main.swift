import AppKit

@MainActor final class FixtureController: NSObject {
  let status: NSTextField
  var count = 0
  init(_ status: NSTextField) { self.status = status }
  @objc func confirm() {
    count += 1
    status.stringValue = "确认次数: \(count)"
  }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let menu = NSMenu()
let editItem = NSMenuItem()
menu.addItem(editItem)
let edit = NSMenu(title: "编辑")
edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
editItem.submenu = edit
app.mainMenu = menu
let window = NSWindow(
  contentRect: NSRect(x: 200, y: 200, width: 500, height: 260),
  styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
window.title =
  CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "mac-computer-use Fixture"
let field = NSTextField(frame: NSRect(x: 30, y: 160, width: 440, height: 32))
field.identifier = NSUserInterfaceItemIdentifier("fixture-input")
field.setAccessibilityIdentifier("fixture-input")
field.stringValue = "初始文本"
let status = NSTextField(labelWithString: "确认次数: 0")
status.frame = NSRect(x: 150, y: 100, width: 280, height: 32)
status.setAccessibilityIdentifier("fixture-status")
let controller = FixtureController(status)
let button = NSButton(title: "确认", target: controller, action: #selector(FixtureController.confirm))
button.frame = NSRect(x: 30, y: 100, width: 100, height: 32)
button.setAccessibilityIdentifier("fixture-confirm")
window.contentView?.addSubview(status)
window.contentView?.addSubview(field)
window.contentView?.addSubview(button)
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
app.run()
