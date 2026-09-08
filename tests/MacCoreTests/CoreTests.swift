import XCTest

@testable import MacCore

final class CoreTests: XCTestCase {
  func testNegativeDisplayOrigin() throws {
    XCTAssertEqual(
      try Coordinates.resolve(
        x: 0.5, y: 0.5, unit: "normalized",
        bounds: CGRect(x: -1200, y: 20, width: 1000, height: 800), pixelWidth: nil, pixelHeight: nil
      ), CGPoint(x: -700, y: 420))
  }
  func testPixels() throws {
    XCTAssertEqual(
      try Coordinates.resolve(
        x: 100, y: 200, unit: "pixels", bounds: CGRect(x: 10, y: 20, width: 500, height: 400),
        pixelWidth: 1000, pixelHeight: 800), CGPoint(x: 60, y: 120))
  }
  func testRejectGuessedUnitsAndBounds() {
    XCTAssertThrowsError(
      try Coordinates.resolve(
        x: 1, y: 1, unit: "auto", bounds: CGRect(x: 0, y: 0, width: 100, height: 100),
        pixelWidth: nil, pixelHeight: nil))
    XCTAssertThrowsError(
      try Coordinates.resolve(
        x: 100, y: 1, unit: "points", bounds: CGRect(x: 0, y: 0, width: 100, height: 100),
        pixelWidth: nil, pixelHeight: nil))
  }
  func testStaleSnapshot() throws {
    let s = Snapshot(window: 1, pid: 2, bounds: CGRect(x: 0, y: 0, width: 100, height: 100))
    XCTAssertThrowsError(
      try s.validate(window: 1, pid: 2, bounds: CGRect(x: 1, y: 0, width: 100, height: 100)))
    XCTAssertThrowsError(try s.validate(window: 2, pid: 2, bounds: s.bounds))
  }
  func testArgumentFlags() throws {
    let a = try Arguments(["click", "--window", "3", "--dry-run"])
    XCTAssertEqual(a.command, "click")
    XCTAssertEqual(a.values["window"], "3")
    XCTAssertTrue(a.dryRun)
  }
  func testDuplicateArgumentsRejected() {
    XCTAssertThrowsError(try Arguments(["type", "--text", "a", "--text", "b"]))
  }
}
