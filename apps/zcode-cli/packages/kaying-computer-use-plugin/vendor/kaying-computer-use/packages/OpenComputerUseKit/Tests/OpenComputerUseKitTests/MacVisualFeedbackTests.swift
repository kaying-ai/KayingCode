import AppKit
import CoreGraphics
@preconcurrency import ScreenCaptureKit
import XCTest
@testable import OpenComputerUseKit

final class MacVisualFeedbackTests: XCTestCase {
    private let screens = [
        VisualCursorScreenMapping(
            screenStateFrame: CGRect(x: 0, y: 0, width: 1440, height: 900),
            appKitFrame: CGRect(x: 0, y: 0, width: 1440, height: 900)
        ),
        VisualCursorScreenMapping(
            screenStateFrame: CGRect(x: -1280, y: -1024, width: 1280, height: 1024),
            appKitFrame: CGRect(x: -1280, y: 900, width: 1280, height: 1024)
        ),
    ]

    func testScreenshotScaleUsesQuartzDisplayIntersectionAndWindowMoveKeepsLocalPoint() {
        let displays: [(bounds: CGRect, scale: CGFloat)] = [
            (CGRect(x: 0, y: 0, width: 1512, height: 982), 2),
            (CGRect(x: 1512, y: -98, width: 1920, height: 1080), 1),
        ]
        XCTAssertEqual(screenshotDisplayScale(windowBounds: CGRect(x: 1700, y: -90, width: 600, height: 70), displays: displays), 1)
        XCTAssertEqual(screenshotDisplayScale(windowBounds: CGRect(x: 100, y: 50, width: 600, height: 400), displays: displays), 2)
        let old = TargetedInputWindow(windowID: 1, bounds: CGRect(x: 100, y: 50, width: 600, height: 400))
        let moved = TargetedInputWindow(windowID: 1, bounds: CGRect(x: -1200, y: -900, width: 600, height: 400))
        XCTAssertEqual(moved.rebase(CGPoint(x: 220, y: 140), from: old), CGPoint(x: -1080, y: -810))
    }

    func testTargetedEventsCarryWindowLocalAndGlobalCoordinatesOnMultipleDisplays() throws {
        for bounds in [CGRect(x: 160, y: 330, width: 640, height: 432),
                       CGRect(x: 1700, y: -98, width: 800, height: 600),
                       CGRect(x: -1200, y: -900, width: 800, height: 600)] {
            let point = CGPoint(x: bounds.minX + 120, y: bounds.minY + 90)
            for type in [CGEventType.leftMouseDown, .leftMouseDragged, .mouseMoved] {
                let event = try targetedMouseEvent(type: type, point: point, button: .left,
                                                  clickState: 1, windowID: 123, windowBounds: bounds)
                let cocoa = try XCTUnwrap(NSEvent(cgEvent: event))
                XCTAssertEqual(cocoa.windowNumber, 123)
                // 外部窗口在本进程没有 NSWindow，局部位置必须在接收应用内验证。
                XCTAssertEqual(targetedWindowLocalPoint(point, windowBounds: bounds), CGPoint(x: 120, y: bounds.height - 90))
                XCTAssertEqual(event.location, point)
            }
        }
    }

    @MainActor
    func testInteractiveTargetedPointerEventsArriveAtWindowLocalPoint() throws {
        try requireInteractiveDesktop()
        let window = fixtureWindow(x: 1700)
        defer { window.close() }
        window.orderFront(nil)
        pumpEvents(for: 0.5)
        let mappings = currentVisualCursorScreenMappings()
        let quartz = CGRect(x: window.frame.minX,
                            y: mappings[0].appKitFrame.maxY - window.frame.maxY,
                            width: window.frame.width, height: window.frame.height)
        let point = CGPoint(x: quartz.minX + 120, y: quartz.minY + 90)
        var received: [NSEvent.EventType: NSEvent] = [:]
        let monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseDragged, .scrollWheel]) { event in
            received[event.type] = event
            return nil
        }
        defer { if let monitor { NSEvent.removeMonitor(monitor) } }
        try InputSimulation.clickTargeted(at: point, button: .left, clickCount: 1, pid: getpid(),
                                         window: TargetedInputWindow(windowID: CGWindowID(window.windowNumber), bounds: quartz))
        pumpEvents(for: 0.2)
        let event = try XCTUnwrap(received[.leftMouseDown])
        XCTAssertEqual(event.windowNumber, window.windowNumber)
        XCTAssertEqual(event.locationInWindow.x, 120, accuracy: 0.01)
        XCTAssertEqual(event.locationInWindow.y, quartz.height - 90, accuracy: 0.01)
        let target = TargetedInputWindow(windowID: CGWindowID(window.windowNumber), bounds: quartz)
        let end = CGPoint(x: point.x + 80, y: point.y + 40)
        try InputSimulation.dragTargeted(from: point, to: end, pid: getpid(), window: target)
        try InputSimulation.scrollTargeted(at: point, direction: "down", pages: 1, pid: getpid(), window: target)
        pumpEvents(for: 0.2)
        let drag = try XCTUnwrap(received[.leftMouseDragged])
        XCTAssertEqual(drag.windowNumber, window.windowNumber)
        XCTAssertEqual(drag.locationInWindow.x, 200, accuracy: 0.01)
        XCTAssertEqual(drag.locationInWindow.y, quartz.height - 130, accuracy: 0.01)
        let scroll = try XCTUnwrap(received[.scrollWheel])
        XCTAssertEqual(scroll.windowNumber, window.windowNumber)
        XCTAssertEqual(scroll.locationInWindow.x, 120, accuracy: 0.01)
        XCTAssertEqual(scroll.locationInWindow.y, quartz.height - 90, accuracy: 0.01)
        XCTAssertLessThan(scroll.scrollingDeltaY, 0)
        XCTAssertThrowsError(try target.current(for: 0))

    }

    func testWorkAreaConvertsNegativeAndSpanningWindowCoordinates() {
        XCTAssertEqual(
            targetWorkAreaFrame(windowBounds: CGRect(x: -1200, y: -900, width: 800, height: 600), screenMappings: screens),
            CGRect(x: -1200, y: 1200, width: 800, height: 600)
        )
        XCTAssertEqual(
            targetWorkAreaFrame(windowBounds: CGRect(x: -200, y: -200, width: 800, height: 600), screenMappings: screens),
            CGRect(x: -200, y: 500, width: 800, height: 600)
        )
    }

    func testWorkAreaRejectsEmptyInvalidAndOffscreenBounds() {
        for bounds in [CGRect.zero, CGRect.null, CGRect.infinite, CGRect(x: 5000, y: 5000, width: 100, height: 100)] {
            XCTAssertNil(targetWorkAreaFrame(windowBounds: bounds, screenMappings: screens))
        }
        XCTAssertNil(targetWorkAreaFrame(windowBounds: CGRect(x: 10, y: 10, width: 100, height: 100), screenMappings: []))
    }

    func testPointerHotspotStaysAtScreenEdges() {
        let screen = CGRect(x: -1280, y: 900, width: 1280, height: 1024)
        for point in [CGPoint(x: -1280, y: 900), CGPoint(x: -1, y: 1923)] {
            XCTAssertEqual(visualCursorClampedTipPosition(point, screenFrame: screen), point)
        }
        XCTAssertEqual(
            visualCursorClampedTipPosition(CGPoint(x: -1300, y: 2000), screenFrame: screen),
            CGPoint(x: -1280, y: 1924)
        )
    }

    func testRotationAndClickCompressionKeepTheGlyphHotspotFixed() {
        let bounds = CGRect(origin: .zero, size: SoftwareCursorGlyphMetrics.windowSize)
        let anchor = SoftwareCursorGlyphMetrics.tipAnchor
        for rotation in [CGFloat.zero, .pi / 3, -.pi / 2] {
            let state = SoftwareCursorGlyphRenderState(
                rotation: rotation, cursorBodyOffset: CGVector(dx: 4, dy: -6),
                fogOffset: .zero, fogOpacity: 0.2, fogScale: 1.1, clickProgress: 0.8
            )
            let transformed = anchor.applying(visualCursorGlyphTransform(in: bounds, state: state))
            XCTAssertEqual(transformed.x, anchor.x, accuracy: 0.001)
            XCTAssertEqual(transformed.y, anchor.y, accuracy: 0.001)
        }
    }

    @MainActor
    func testWorkAreaDrawingLeavesContentAndCornersTransparentAtOneAndTwoTimesScale() throws {
        for scale in [1, 2] {
            let bitmap = try XCTUnwrap(NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: 640 * scale, pixelsHigh: 400 * scale,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
            ))
            let context = try XCTUnwrap(NSGraphicsContext(bitmapImageRep: bitmap))
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = context
            context.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
            TargetWorkAreaOutlineRenderer.draw(in: CGRect(x: 0, y: 0, width: 640, height: 400), context: context.cgContext)
            NSGraphicsContext.restoreGraphicsState()
            XCTAssertEqual(try XCTUnwrap(bitmap.colorAt(x: 320 * scale, y: 200 * scale)).alphaComponent, 0)
            XCTAssertEqual(try XCTUnwrap(bitmap.colorAt(x: 0, y: 0)).alphaComponent, 0)
            XCTAssertGreaterThan(try XCTUnwrap(bitmap.colorAt(x: 320 * scale, y: 8 * scale)).alphaComponent, 0.5)
        }
    }

    @MainActor
    func testFeedbackPanelsCannotTakeFocusAndResetHidesBoth() throws {
        guard !NSScreen.screens.isEmpty else { throw XCTSkip("A macOS Window Server is required") }
        let panel = makeVisualFeedbackPanel(frame: CGRect(x: 10, y: 10, width: 120, height: 120))
        defer { panel.close() }
        XCTAssertFalse(panel.canBecomeKey)
        XCTAssertFalse(panel.canBecomeMain)
        XCTAssertTrue(panel.ignoresMouseEvents)
        XCTAssertEqual(panel.sharingType, .none)
        XCTAssertFalse(panel.hidesOnDeactivate)
        SoftwareCursorOverlay.reset()
        XCTAssertTrue(feedbackPanels.allSatisfy { !$0.isVisible })
    }

    @MainActor
    func testInteractiveTargetSwitchGeometryOcclusionAndCleanup() throws {
        try requireInteractiveDesktop()
        let first = fixtureWindow(x: 120)
        let other = fixtureWindow(x: 200)
        defer { SoftwareCursorOverlay.reset(); first.close(); other.close() }
        first.makeKeyAndOrderFront(nil)
        showFeedback(for: first)
        XCTAssertEqual(feedbackPanels.filter(\.isVisible).count, 2)
        XCTAssertTrue(NSApp.keyWindow === first)

        other.makeKeyAndOrderFront(nil)
        XCTAssertTrue(SoftwareCursorOverlay.refreshActiveOrderingIfNeeded())
        XCTAssertTrue(NSApp.keyWindow === other)
        let order = NSApp.orderedWindows.map(\.windowNumber)
        let otherIndex = try XCTUnwrap(order.firstIndex(of: other.windowNumber))
        for panel in feedbackPanels where panel.isVisible {
            XCTAssertGreaterThan(try XCTUnwrap(order.firstIndex(of: panel.windowNumber)), otherIndex)
        }

        showFeedback(for: other)
        var frame = other.frame
        frame.origin.x += 60
        frame.size.width += 40
        other.setFrame(frame, display: true)
        pumpEvents(for: 0.1)
        XCTAssertTrue(SoftwareCursorOverlay.refreshActiveOrderingIfNeeded())
        XCTAssertTrue(feedbackPanels.contains { $0.frame == frame.insetBy(dx: -8, dy: -8) })
        XCTAssertEqual(feedbackPanels.filter(\.isVisible).count, 2)

        other.miniaturize(nil)
        pumpEvents(for: 0.3)
        XCTAssertFalse(SoftwareCursorOverlay.refreshActiveOrderingIfNeeded())
        XCTAssertTrue(feedbackPanels.allSatisfy { !$0.isVisible })
        showFeedback(for: first)
        first.close()
        pumpEvents(for: 0.1)
        XCTAssertFalse(SoftwareCursorOverlay.refreshActiveOrderingIfNeeded())
        XCTAssertTrue(feedbackPanels.allSatisfy { !$0.isVisible })

        other.deminiaturize(nil)
        showFeedback(for: other)
        SoftwareCursorOverlay.scheduleHide(after: 0)
        pumpEvents(for: 0.02)
        XCTAssertTrue(feedbackPanels.allSatisfy { !$0.isVisible })
        showFeedback(for: other)
        resetOpenComputerUseVisualCursor()
        showFeedback(for: other)
        pumpEvents(for: 0.2)
        XCTAssertEqual(feedbackPanels.filter(\.isVisible).count, 2)
        SoftwareCursorOverlay.reset()
        XCTAssertTrue(feedbackPanels.allSatisfy { !$0.isVisible })
    }

    @MainActor
    func testInteractiveSingleWindowCaptureExcludesFeedback() async throws {
        try requireInteractiveDesktop()
        guard CGPreflightScreenCaptureAccess() else { throw XCTSkip("Screen Recording permission is required") }
        let window = fixtureWindow(x: 120)
        defer { SoftwareCursorOverlay.reset(); window.close() }
        window.makeKeyAndOrderFront(nil)
        try await Task.sleep(for: .milliseconds(100))
        let content = try await SCShareableContent.current
        let target = try XCTUnwrap(content.windows.first { $0.windowID == CGWindowID(window.windowNumber) })
        let filter = SCContentFilter(desktopIndependentWindow: target)
        let config = SCStreamConfiguration()
        config.width = Int(window.frame.width * window.backingScaleFactor)
        config.height = Int(window.frame.height * window.backingScaleFactor)
        config.showsCursor = false
        config.ignoreShadowsSingleWindow = true
        let before = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        showFeedback(for: window)
        let after = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        let beforeBytes = try XCTUnwrap(before.dataProvider?.data)
        let afterBytes = try XCTUnwrap(after.dataProvider?.data)
        XCTAssertEqual(beforeBytes as Data, afterBytes as Data)
    }

    @MainActor
    private func pumpEvents(for duration: TimeInterval) {
        let deadline = Date().addingTimeInterval(duration)
        repeat {
            RunLoop.main.run(until: Date().addingTimeInterval(0.005))
            while let event = NSApp.nextEvent(matching: .any, until: nil, inMode: .default, dequeue: true) {
                NSApp.sendEvent(event)
            }
            NSApp.updateWindows()
        } while Date() < deadline
    }

    @MainActor
    private var feedbackPanels: [VisualFeedbackPanel] {
        NSApplication.shared.windows.compactMap { $0 as? VisualFeedbackPanel }
    }

    @MainActor
    private func requireInteractiveDesktop() throws {
        guard ProcessInfo.processInfo.environment["KAYING_COMPUTER_USE_TEST_INTERACTIVE"] == "1", !NSScreen.screens.isEmpty else {
            throw XCTSkip("Set KAYING_COMPUTER_USE_TEST_INTERACTIVE=1 on an unlocked macOS desktop")
        }
        _ = NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.finishLaunching()
        NSApplication.shared.activate(ignoringOtherApps: true)
        pumpEvents(for: 0.1)
    }

    @MainActor
    private func fixtureWindow(x: CGFloat) -> NSWindow {
        let window = NSWindow(
            contentRect: CGRect(x: x, y: 150, width: 640, height: 400),
            styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false
        )
        window.animationBehavior = .none
        window.isReleasedWhenClosed = false
        window.title = "KayingCode visual feedback fixture"
        return window
    }

    @MainActor
    private func showFeedback(for window: NSWindow) {
        // 新窗口/最小化恢复需先由 Window Server 发布，不能在同一调用栈断言 on-screen。
        pumpEvents(for: 0.1)
        SoftwareCursorOverlay.settle(
            at: CGPoint(x: window.frame.midX, y: window.frame.midY),
            in: CursorTargetWindow(windowID: CGWindowID(window.windowNumber), layer: 0)
        )
    }
}
