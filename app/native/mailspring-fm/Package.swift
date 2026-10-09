// swift-tools-version:6.0
import PackageDescription

// The helper Mailspring's extraction process starts to reach Apple's on-device model
// (docs/plans/views-apple-foundation-models-plan.md). Apple silicon only; built on macOS 26+.
let package = Package(
  name: "mailspring-fm",
  platforms: [.macOS("26.0")],
  targets: [
    .executableTarget(
      name: "mailspring-fm",
      path: "Sources/mailspring-fm",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
