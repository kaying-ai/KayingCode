// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "OpenComputerUse",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "OpenComputerUseKit",
            targets: ["OpenComputerUseKit"]
        ),
        .executable(
            name: "OpenComputerUse",
            targets: ["OpenComputerUse"]
        ),
    ],
    targets: [
        .target(
            name: "OpenComputerUseKit",
            path: "packages/OpenComputerUseKit/Sources/OpenComputerUseKit"
        ),
        .executableTarget(
            name: "OpenComputerUse",
            dependencies: ["OpenComputerUseKit"],
            path: "apps/OpenComputerUse/Sources/OpenComputerUse"
        ),
        .testTarget(
            name: "OpenComputerUseKitTests",
            dependencies: ["OpenComputerUseKit"],
            path: "packages/OpenComputerUseKit/Tests/OpenComputerUseKitTests"
        ),
    ]
)
