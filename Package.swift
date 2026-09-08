// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "mac-computer-use", platforms: [.macOS(.v14)],
  products: [
    .executable(name: "mac-computer-use", targets: ["MacComputerUse"]),
    .executable(name: "native-fixture", targets: ["NativeFixture"]),
  ],
  targets: [
    .target(name: "MacCore"), .executableTarget(name: "NativeSelfTest", dependencies: ["MacCore"]),
    .executableTarget(name: "MacComputerUse", dependencies: ["MacCore"]),
    .executableTarget(name: "NativeFixture"),
    .testTarget(name: "MacCoreTests", dependencies: ["MacCore"], path: "tests/MacCoreTests"),
  ])
