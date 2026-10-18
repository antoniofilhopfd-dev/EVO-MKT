// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "EVOMKT",
    platforms: [.iOS(.v17)],
    products: [.library(name: "EVOMKT", targets: ["EVOMKT"])],
    targets: [.target(name: "EVOMKT")]
)
