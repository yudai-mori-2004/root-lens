// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "EgoReceiverCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "EgoReceiverCore", targets: ["EgoReceiverCore"])],
    targets: [
        .target(name: "EgoReceiverCore"),
        .testTarget(name: "EgoReceiverCoreTests", dependencies: ["EgoReceiverCore"]),
    ]
)

