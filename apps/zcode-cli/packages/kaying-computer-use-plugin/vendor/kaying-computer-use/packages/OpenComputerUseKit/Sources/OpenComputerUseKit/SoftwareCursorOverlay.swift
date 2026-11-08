import AppKit
import CoreGraphics
import Foundation
import QuartzCore

public enum VisualCursorSupport {
    public static var isEnabled: Bool {
        visualCursorEnabled(environment: ProcessInfo.processInfo.environment)
    }

    static func performOnMain(_ body: @escaping @MainActor () -> Void) {
        if Thread.isMainThread {
            MainActor.assumeIsolated {
                body()
            }
            return
        }

        DispatchQueue.main.sync {
            MainActor.assumeIsolated {
                body()
            }
        }
    }
}

func visualCursorEnabled(environment: [String: String]) -> Bool {
    guard let rawValue = environment["KAYING_COMPUTER_USE_VISUAL_CURSOR"]?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
        return true
    }

    return !["0", "false", "no", "off"].contains(rawValue)
}

func defaultVisualCursorInitialTipPosition(
    windowOrigin: CGPoint = .zero,
    tipAnchor: CGPoint = SoftwareCursorGlyphMetrics.tipAnchor
) -> CGPoint {
    return CGPoint(
        x: windowOrigin.x + tipAnchor.x,
        y: windowOrigin.y + tipAnchor.y
    )
}

func visualCursorRenderBaseHeading(
    artworkNeutralHeading: CGFloat = SoftwareCursorGlyphMetrics.targetNeutralHeading
) -> CGFloat {
    artworkNeutralHeading
}

func visualCursorAppKitForwardHeading(
    renderRotation: CGFloat,
    artworkNeutralHeading: CGFloat = SoftwareCursorGlyphMetrics.targetNeutralHeading
) -> CGFloat {
    -artworkNeutralHeading - renderRotation
}

func visualCursorRuntimeRenderYAxisMultiplier() -> CGFloat {
    // Window placement uses AppKit global coordinates, but glyph render state is
    // still interpreted as CursorMotion's y-down screen state before drawing.
    -1
}

func visualCursorScreenStateVelocity(
    fromRuntimeVelocity velocity: CGVector,
    yAxisMultiplier: CGFloat
) -> CGVector {
    CGVector(dx: velocity.dx, dy: velocity.dy * yAxisMultiplier)
}

func visualCursorPostInteractionIdleTimeout() -> TimeInterval {
    30
}

func visualCursorIdleRotationAmplitude() -> CGFloat {
    0.09
}

public struct VisualCursorObservationPoint: Codable, Sendable {
    public let x: Double
    public let y: Double

    public init(point: CGPoint) {
        x = point.x
        y = point.y
    }
}

public struct VisualCursorObservationSnapshot: Codable, Sendable {
    public let phase: String
    public let tipPosition: VisualCursorObservationPoint?
    public let restingTipPosition: VisualCursorObservationPoint?
    public let rotation: Double?
    public let timestamp: Double

    public init(
        phase: String,
        tipPosition: CGPoint?,
        restingTipPosition: CGPoint?,
        rotation: CGFloat?,
        timestamp: CFTimeInterval
    ) {
        self.phase = phase
        self.tipPosition = tipPosition.map(VisualCursorObservationPoint.init(point:))
        self.restingTipPosition = restingTipPosition.map(VisualCursorObservationPoint.init(point:))
        self.rotation = rotation.map(Double.init)
        self.timestamp = timestamp
    }
}

struct VisualCursorIdlePose {
    let tipPosition: CGPoint
    let angleOffset: CGFloat
}

func visualCursorIdlePose(restingTipPosition: CGPoint, phase: CGFloat) -> VisualCursorIdlePose {
    VisualCursorIdlePose(
        tipPosition: restingTipPosition,
        angleOffset: sin(phase * 0.8) * visualCursorIdleRotationAmplitude()
    )
}

func visualCursorClampedTipPosition(_ point: CGPoint, screenFrame: CGRect) -> CGPoint {
    CGPoint(
        x: point.x.clamped(to: screenFrame.minX...screenFrame.maxX),
        y: point.y.clamped(to: screenFrame.minY...screenFrame.maxY)
    )
}

public func visualCursorObservationFileURL(environment: [String: String]) -> URL? {
    guard
        let rawPath = environment["KAYING_COMPUTER_USE_VISUAL_CURSOR_OBSERVATION_FILE"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
        !rawPath.isEmpty
    else {
        return nil
    }

    return URL(fileURLWithPath: rawPath)
}

public let openComputerUseTurnEndedNotificationName = Notification.Name("ai.kaying.computeruse.turn-ended")

public func postOpenComputerUseTurnEndedNotification() {
    DistributedNotificationCenter.default().postNotificationName(
        openComputerUseTurnEndedNotificationName,
        object: nil,
        userInfo: nil,
        deliverImmediately: true
    )
}

@MainActor
public func resetOpenComputerUseVisualCursor() {
    SoftwareCursorOverlay.reset()
}

struct CursorTargetWindow: Equatable, Sendable {
    let windowID: CGWindowID
    let layer: Int
}

struct CursorWindowGeometry {
    let windowSize: CGSize
    let tipAnchor: CGPoint

    func origin(forTipPosition tipPosition: CGPoint) -> CGPoint {
        CGPoint(
            x: tipPosition.x - tipAnchor.x,
            y: tipPosition.y - tipAnchor.y
        )
    }

    func tipPosition(forOrigin origin: CGPoint) -> CGPoint {
        CGPoint(
            x: origin.x + tipAnchor.x,
            y: origin.y + tipAnchor.y
        )
    }
}

private struct CursorArtwork {
    let geometry: CursorWindowGeometry
    static let active = CursorArtwork(
        geometry: CursorWindowGeometry(
            windowSize: SoftwareCursorGlyphMetrics.windowSize,
            tipAnchor: SoftwareCursorGlyphMetrics.tipAnchor
        ),
    )
}

@MainActor
enum SoftwareCursorOverlay {
    private static let artwork = CursorArtwork.active
    private static let renderBaseHeading = visualCursorRenderBaseHeading()
    private static let renderYAxisMultiplier = visualCursorRuntimeRenderYAxisMultiplier()
    private static var panel: VisualFeedbackPanel?
    private static var targetOutline: TargetWorkAreaOutline?
    private static var cursorView: SoftwareCursorView?
    private static var restingTipPosition: CGPoint?
    private static var displayedTipPosition: CGPoint?
    private static var activeTargetWindow: CursorTargetWindow?
    private static var visualDynamicsState: CursorVisualDynamicsState?
    private static var idleTimer: Timer?
    private static var hideTimer: Timer?
    private static var idlePhase: CGFloat = 0
    private static var observationPhase = "hidden"
    private static var presentationGeneration: UInt64 = 0

    static func moveCursor(to targetPoint: CGPoint, in targetWindow: CursorTargetWindow?) {
        guard preparePresentation(in: targetWindow) else { return }

        let constrainedTarget = clampTipPosition(targetPoint)
        let isFreshStart = displayedTipPosition == nil
        let startPoint = displayedTipPosition ?? defaultInitialTipPosition()
        let now = CACurrentMediaTime()

        observationPhase = "moving"
        panel?.alphaValue = 1
        if isFreshStart {
            visualDynamicsState = CursorVisualDynamicsAnimator.state(at: startPoint, time: CGFloat(now))
            placeCursor(using: initialRenderState(at: startPoint), clickProgress: 0)
        } else {
            seedVisualDynamicsIfNeeded(at: startPoint, time: now)
            placeCursor(
                using: advanceVisualDynamics(
                    toward: startPoint,
                    at: now
                ),
                clickProgress: 0
            )
        }

        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            placeCursor(using: initialRenderState(at: constrainedTarget), clickProgress: 0)
        } else if distanceBetween(startPoint, constrainedTarget) > 2 {
            animateMove(from: startPoint, to: constrainedTarget, relativeTo: targetWindow)
        }
    }

    static func pulseClick(at targetPoint: CGPoint, clickCount: Int, mouseButton: MouseButtonKind, in targetWindow: CursorTargetWindow?) {
        guard preparePresentation(in: targetWindow) else { return }
        let constrainedTarget = clampTipPosition(targetPoint)
        let now = CACurrentMediaTime()
        seedVisualDynamicsIfNeeded(at: constrainedTarget, time: now)
        restingTipPosition = constrainedTarget
        observationPhase = "pulse"
        let generation = presentationGeneration
        animateClickPulse(at: constrainedTarget, clickCount: max(clickCount, 1), mouseButton: mouseButton)
        guard generation == presentationGeneration else { return }
        startIdleAnimation()
        scheduleHide(after: visualCursorPostInteractionIdleTimeout())
    }

    static func settle(at targetPoint: CGPoint, in targetWindow: CursorTargetWindow?) {
        guard preparePresentation(in: targetWindow) else { return }
        let constrainedTarget = clampTipPosition(targetPoint)
        restingTipPosition = constrainedTarget
        observationPhase = "settling"
        placeCursor(
            using: advanceVisualDynamics(
                toward: constrainedTarget,
                at: CACurrentMediaTime()
            ),
            clickProgress: 0
        )
        startIdleAnimation()
        scheduleHide(after: visualCursorPostInteractionIdleTimeout())
    }

    static func reset() {
        presentationGeneration &+= 1
        stopIdleAnimation()
        cancelPendingHide()
        displayedTipPosition = nil
        restingTipPosition = nil
        activeTargetWindow = nil
        visualDynamicsState = nil
        observationPhase = "hidden"
        writeObservationSnapshot(tipPosition: nil, rotation: nil)
        panel?.orderOut(nil)
        panel?.alphaValue = 1
        targetOutline?.hide()
    }

    private static var canPresentOverlay: Bool {
        !NSScreen.screens.isEmpty
    }

    private static func preparePresentation(in targetWindow: CursorTargetWindow?) -> Bool {
        guard VisualCursorSupport.isEnabled, canPresentOverlay else { reset(); return false }
        // 新操作使旧 timer/动画失效，防止 RunLoop 中的 turn-ended 或后续操作被旧帧覆盖。
        presentationGeneration &+= 1
        stopIdleAnimation()
        cancelPendingHide()
        prepareWindowIfNeeded()
        return configureOrdering(relativeTo: targetWindow)
    }

    private static func prepareWindowIfNeeded() {
        guard panel == nil else {
            return
        }

        let panel = makeVisualFeedbackPanel(frame: CGRect(origin: .zero, size: artwork.geometry.windowSize))

        let view = SoftwareCursorView(frame: CGRect(origin: .zero, size: artwork.geometry.windowSize))
        panel.contentView = view

        self.panel = panel
        self.cursorView = view
        targetOutline = TargetWorkAreaOutline()
    }

    private static func configureOrdering(relativeTo targetWindow: CursorTargetWindow?) -> Bool {
        configureOrdering(relativeTo: targetWindow, forceReorder: false)
    }

    private static func configureOrdering(relativeTo targetWindow: CursorTargetWindow?, forceReorder: Bool) -> Bool {
        guard let panel else { return false }
        let presentation = targetWindow.flatMap { targetPresentation(for: $0) }
        // 失效目标不能变成 orderFront 的匿名指针，否则关闭/最小化后仍会留下悬浮标记。
        if targetWindow != nil && presentation == nil { reset(); return false }
        let effectiveTargetWindow = presentation?.target

        let desiredLevel = NSWindow.Level(rawValue: effectiveTargetWindow?.layer ?? 0)
        if panel.level != desiredLevel {
            panel.level = desiredLevel
        }

        let reorder = shouldReorderCursorPanel(
            activeTargetWindow: activeTargetWindow,
            effectiveTargetWindow: effectiveTargetWindow,
            panelIsVisible: panel.isVisible,
            forceReorder: forceReorder
        )
        if let presentation {
            targetOutline?.update(frame: presentation.frame, target: presentation.target, reorder: reorder)
        } else {
            targetOutline?.hide()
        }
        if reorder {
            if let effectiveTargetWindow {
                // 区域框位于目标之上，指针位于框之上；两者都保持目标的层级而非全局置顶。
                panel.order(.above, relativeTo: targetOutline?.panel.windowNumber ?? Int(effectiveTargetWindow.windowID))
            } else {
                panel.orderFront(nil)
            }
            activeTargetWindow = effectiveTargetWindow
        }
        return true
    }

    private static func animateMove(from start: CGPoint, to end: CGPoint, relativeTo targetWindow: CursorTargetWindow?) {
        let generation = presentationGeneration
        let candidate = bestMotionCandidate(from: start, to: end, relativeTo: targetWindow)
        let path = candidate.path
        // Use the recovered official progress spring timing instead of the older
        // distance-compressed local duration, otherwise medium and long moves feel
        // noticeably faster than the bundled app.
        let duration = OfficialCursorMotionModel.calibratedTravelDuration(
            distance: distanceBetween(start, end),
            measurement: candidate.measurement
        )
        let springTargetDuration = OfficialCursorMotionModel.closeEnoughTime
        let startTime = CACurrentMediaTime()
        var progress: CGFloat = 0
        var springState = CursorMotionSpringState()

        while true {
            guard generation == presentationGeneration, refreshActiveOrderingIfNeeded() else { return }

            let elapsed = CGFloat(CACurrentMediaTime() - startTime)
            let normalizedElapsed = (elapsed / max(duration, 0.001)).clamped(to: 0...1)
            let springTime = normalizedElapsed * springTargetDuration
            (progress, springState) = CursorMotionProgressAnimator.advance(
                current: progress,
                state: springState,
                to: springTime
            )

            let sample = path.sample(at: progress)
            placeCursor(
                using: advanceVisualDynamics(
                    toward: sample.point,
                    at: CACurrentMediaTime()
                ),
                clickProgress: 0
            )

            if normalizedElapsed >= 1 || CursorMotionProgressAnimator.isCloseEnough(progress: progress) {
                break
            }

            pumpFrame()
        }

        guard generation == presentationGeneration else { return }
        placeCursor(
            using: advanceVisualDynamics(
                toward: end,
                at: CACurrentMediaTime()
            ),
            clickProgress: 0
        )
    }

    private static func bestMotionCandidate(from start: CGPoint, to end: CGPoint, relativeTo targetWindow: CursorTargetWindow?) -> CursorMotionCandidate {
        let bounds = motionBounds(from: start, to: end)
        let candidates = HeadingDrivenCursorMotionModel.makeCandidates(
            start: start,
            end: end,
            bounds: bounds,
            startForward: currentForwardVector(),
            endForward: restingForwardVector()
        )
        let defaultCandidate = HeadingDrivenCursorMotionModel.chooseBestCandidate(from: candidates)
            ?? CursorMotionCandidate(
                identifier: "legacy-fallback",
                kind: .base,
                side: 0,
                tableAScale: nil,
                tableBScale: nil,
                path: CursorMotionPath(start: start, end: end),
                measurement: CursorMotionPath(start: start, end: end).measure(bounds: bounds),
                score: 0
            )

        guard let targetWindow else {
            return defaultCandidate
        }

        let excludingWindowNumber = max(panel?.windowNumber ?? 0, 0)
        let evaluations = candidates.map { candidate in
            (
                candidate: candidate,
                hitCount: windowConstraintHitCount(
                    for: candidate.path,
                    relativeTo: targetWindow,
                    excludingWindowNumber: excludingWindowNumber
                )
            )
        }

        let totalSampleCount = candidates.first?.path.sampledConstraintPoints().count ?? 0
        let bestHitCount = evaluations.map(\.hitCount).max() ?? 0

        if bestHitCount == totalSampleCount, bestHitCount > 0 {
            return evaluations
                .filter { $0.hitCount == bestHitCount }
                .map(\.candidate)
                .sorted(by: candidatePreference)
                .first ?? defaultCandidate
        }

        if bestHitCount > 0 {
            return evaluations
                .filter { $0.hitCount == bestHitCount }
                .map(\.candidate)
                .sorted(by: candidatePreference)
                .first ?? defaultCandidate
        }

        return defaultCandidate
    }

    private static func currentForwardVector() -> CGVector {
        let renderRotation = cursorView?.rotation ?? 0
        return forwardVector(renderRotation: renderRotation)
    }

    private static func restingForwardVector() -> CGVector {
        forwardVector(renderRotation: 0)
    }

    private static func forwardVector(renderRotation: CGFloat) -> CGVector {
        let angle = visualCursorAppKitForwardHeading(renderRotation: renderRotation)
        return CGVector(dx: cos(angle), dy: sin(angle))
    }

    private static func windowConstraintHitCount(
        for path: CursorMotionPath,
        relativeTo targetWindow: CursorTargetWindow,
        excludingWindowNumber: Int
    ) -> Int {
        path.sampledConstraintPoints().reduce(into: 0) { result, point in
            if windowID(at: point, excludingWindowNumber: excludingWindowNumber) == targetWindow.windowID {
                result += 1
            }
        }
    }

    private static func motionBounds(from start: CGPoint, to end: CGPoint) -> CGRect? {
        let startScreen = screen(containing: start) ?? NSScreen.main ?? NSScreen.screens.first
        let endScreen = screen(containing: end) ?? startScreen

        switch (startScreen, endScreen) {
        case let (startScreen?, endScreen?) where startScreen === endScreen:
            return startScreen.visibleFrame
        case let (startScreen?, endScreen?):
            return startScreen.visibleFrame.union(endScreen.visibleFrame)
        case let (screen?, nil), let (nil, screen?):
            return screen.visibleFrame
        default:
            return nil
        }
    }

    private static func candidatePreference(_ lhs: CursorMotionCandidate, _ rhs: CursorMotionCandidate) -> Bool {
        if lhs.measurement.staysInBounds != rhs.measurement.staysInBounds {
            return lhs.measurement.staysInBounds && !rhs.measurement.staysInBounds
        }
        if lhs.score != rhs.score {
            return lhs.score < rhs.score
        }
        return lhs.identifier < rhs.identifier
    }

    private static func windowID(at point: CGPoint, excludingWindowNumber: Int) -> CGWindowID? {
        var windowNumber = NSWindow.windowNumber(
            at: NSPoint(x: point.x, y: point.y),
            belowWindowWithWindowNumber: excludingWindowNumber
        )

        // 新增区域框也是独立窗口；命中约束要跳过自己的透明框，继续读取真实目标。
        if windowNumber == targetOutline?.panel.windowNumber {
            windowNumber = NSWindow.windowNumber(
                at: NSPoint(x: point.x, y: point.y), belowWindowWithWindowNumber: windowNumber
            )
        }

        guard windowNumber > 0 else {
            return nil
        }

        return CGWindowID(windowNumber)
    }

    private static func targetPresentation(for target: CursorTargetWindow) -> (target: CursorTargetWindow, frame: CGRect)? {
        guard target.windowID != 0,
              let windows = CGWindowListCopyWindowInfo([.optionIncludingWindow], target.windowID) as? [[String: Any]],
              let info = windows.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == target.windowID }),
              (info[kCGWindowIsOnscreen as String] as? Bool) == true,
              let bounds = info[kCGWindowBounds as String] as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: bounds),
              let frame = targetWorkAreaFrame(windowBounds: rect, screenMappings: currentVisualCursorScreenMappings())
        else { return nil }
        let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? target.layer
        return (CursorTargetWindow(windowID: target.windowID, layer: layer), frame)
    }

    static func refreshActiveOrderingIfNeeded() -> Bool {
        guard VisualCursorSupport.isEnabled else { reset(); return false }
        guard let activeTargetWindow else { return panel?.isVisible == true }
        return configureOrdering(relativeTo: activeTargetWindow, forceReorder: true)
    }

    private static func animateClickPulse(at point: CGPoint, clickCount: Int, mouseButton: MouseButtonKind) {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else {
            placeCursor(using: initialRenderState(at: point), clickProgress: 0)
            return
        }
        let generation = presentationGeneration
        let pulseBias: CGFloat = mouseButton == .right ? 0.82 : 1

        for pulse in 0..<clickCount {
            let duration = 0.16
            let startTime = CACurrentMediaTime()

            while true {
                guard generation == presentationGeneration, refreshActiveOrderingIfNeeded() else { return }
                let elapsed = CACurrentMediaTime() - startTime
                let rawProgress = min(max(elapsed / duration, 0), 1)
                let clickProgress = sin(rawProgress * .pi) * pulseBias

                placeCursor(
                    using: advanceVisualDynamics(
                        toward: point,
                        at: CACurrentMediaTime()
                    ),
                    clickProgress: clickProgress
                )

                if rawProgress >= 1 {
                    break
                }

                pumpFrame()
            }

            if pulse < clickCount - 1 {
                pause(for: 0.05)
            }
        }

        guard generation == presentationGeneration else { return }
        placeCursor(
            using: advanceVisualDynamics(
                toward: point,
                at: CACurrentMediaTime()
            ),
            clickProgress: 0
        )
    }

    private static func startIdleAnimation() {
        guard canPresentOverlay, let restingTipPosition else {
            return
        }

        observationPhase = "idle"
        idlePhase = 0
        let generation = presentationGeneration
        let timer = Timer(timeInterval: 1 / 60, repeats: true) { _ in
            MainActor.assumeIsolated {
                guard generation == presentationGeneration, panel != nil, cursorView != nil,
                      refreshActiveOrderingIfNeeded() else {
                    return
                }

                observationPhase = "idle"
                idlePhase += 0.05
                let idlePose = visualCursorIdlePose(
                    restingTipPosition: restingTipPosition,
                    phase: idlePhase
                )

                if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
                    placeCursor(using: initialRenderState(at: restingTipPosition), clickProgress: 0)
                    return
                }
                placeCursor(
                    using: advanceVisualDynamics(
                        toward: idlePose.tipPosition,
                        idleAngleOffset: idlePose.angleOffset,
                        at: CACurrentMediaTime()
                    ),
                    clickProgress: 0
                )
            }
        }

        RunLoop.main.add(timer, forMode: .common)
        idleTimer = timer

        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            placeCursor(using: initialRenderState(at: restingTipPosition), clickProgress: 0)
            return
        }
        placeCursor(
            using: advanceVisualDynamics(
                toward: restingTipPosition,
                at: CACurrentMediaTime()
            ),
            clickProgress: 0
        )
    }

    private static func stopIdleAnimation() {
        idleTimer?.invalidate()
        idleTimer = nil
    }

    static func scheduleHide(after delay: TimeInterval) {
        cancelPendingHide()
        let generation = presentationGeneration
        let timer = Timer(timeInterval: delay, repeats: false) { _ in
            MainActor.assumeIsolated {
                guard generation == presentationGeneration else { return }
                hideOverlay()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        hideTimer = timer
    }

    private static func cancelPendingHide() {
        hideTimer?.invalidate()
        hideTimer = nil
    }

    private static func hideOverlay() {
        // 淡出完成回调可能晚于下一次操作；同步 reset 避免旧生命周期隐藏新目标。
        reset()
    }

    private static func defaultInitialTipPosition() -> CGPoint {
        defaultVisualCursorInitialTipPosition(
            windowOrigin: .zero,
            tipAnchor: artwork.geometry.tipAnchor
        )
    }

    private static func initialRenderState(at tipPosition: CGPoint) -> CursorVisualRenderState {
        CursorVisualRenderState(
            tipPosition: tipPosition,
            rotation: 0,
            cursorBodyOffset: CGVector(dx: 0, dy: 0),
            fogOffset: CGVector(dx: 0, dy: 0),
            fogOpacity: CursorVisualDynamicsConfiguration.officialInspired.fogOpacityBase,
            fogScale: 1
        )
    }

    private static func seedVisualDynamicsIfNeeded(at tipPosition: CGPoint, time: CFTimeInterval) {
        guard visualDynamicsState == nil else {
            return
        }

        visualDynamicsState = CursorVisualDynamicsAnimator.state(
            at: tipPosition,
            time: CGFloat(time)
        )
    }

    private static func advanceVisualDynamics(
        toward targetTipPosition: CGPoint,
        idleAngleOffset: CGFloat = 0,
        at time: CFTimeInterval
    ) -> CursorVisualRenderState {
        let clampedTarget = clampTipPosition(targetTipPosition)
        seedVisualDynamicsIfNeeded(at: clampedTarget, time: time)

        let result = CursorVisualDynamicsAnimator.advance(
            state: visualDynamicsState ?? CursorVisualDynamicsAnimator.state(at: clampedTarget, time: CGFloat(time)),
            targetTipPosition: clampedTarget,
            targetTime: CGFloat(time),
            idleAngleOffset: idleAngleOffset,
            baseHeading: renderBaseHeading,
            renderYAxisMultiplier: renderYAxisMultiplier
        )
        visualDynamicsState = result.state
        return result.renderState
    }

    private static func placeCursor(using renderState: CursorVisualRenderState, clickProgress: CGFloat) {
        guard let panel, let cursorView else {
            return
        }

        panel.setFrameOrigin(artwork.geometry.origin(forTipPosition: renderState.tipPosition))
        cursorView.rotation = renderState.rotation
        cursorView.cursorBodyOffset = renderState.cursorBodyOffset
        cursorView.fogOffset = renderState.fogOffset
        cursorView.fogOpacity = renderState.fogOpacity
        cursorView.fogScale = renderState.fogScale
        cursorView.clickProgress = clickProgress
        cursorView.needsDisplay = true
        displayedTipPosition = renderState.tipPosition
        writeObservationSnapshot(
            tipPosition: renderState.tipPosition,
            rotation: renderState.rotation
        )
    }

    private static func writeObservationSnapshot(tipPosition: CGPoint?, rotation: CGFloat?) {
        guard
            let url = visualCursorObservationFileURL(environment: ProcessInfo.processInfo.environment)
        else {
            return
        }

        let snapshot = VisualCursorObservationSnapshot(
            phase: observationPhase,
            tipPosition: tipPosition,
            restingTipPosition: restingTipPosition,
            rotation: rotation,
            timestamp: CACurrentMediaTime()
        )

        do {
            let directory = url.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(snapshot)
            try data.write(to: url, options: .atomic)
        } catch {
            // Observation is debug-only and must not affect tool execution.
        }
    }

    private static func clampTipPosition(_ tipPosition: CGPoint) -> CGPoint {
        guard let screen = screen(containing: tipPosition) ?? NSScreen.main ?? NSScreen.screens.first else {
            return tipPosition
        }

        // 约束整张透明窗口会把屏幕边缘的真实点击点向内推几十像素；只约束热点。
        return visualCursorClampedTipPosition(tipPosition, screenFrame: screen.frame)
    }

    private static func screen(containing point: CGPoint) -> NSScreen? {
        NSScreen.screens.first { $0.frame.contains(point) }
    }

    private static func pumpFrame() {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(1 / 120))
    }

    private static func pause(for duration: TimeInterval) {
        let start = CACurrentMediaTime()
        while CACurrentMediaTime() - start < duration {
            pumpFrame()
        }
    }

    private static func distanceBetween(_ lhs: CGPoint, _ rhs: CGPoint) -> CGFloat {
        hypot(rhs.x - lhs.x, rhs.y - lhs.y)
    }
}

func shouldReorderCursorPanel(
    activeTargetWindow: CursorTargetWindow?,
    effectiveTargetWindow: CursorTargetWindow?,
    panelIsVisible: Bool,
    forceReorder: Bool
) -> Bool {
    forceReorder || activeTargetWindow != effectiveTargetWindow || panelIsVisible == false
}

private final class SoftwareCursorView: NSView {
    var rotation: CGFloat = 0
    var cursorBodyOffset: CGVector = CGVector(dx: 0, dy: 0)
    var fogOffset: CGVector = CGVector(dx: 0, dy: 0)
    var fogOpacity: CGFloat = 0.12
    var fogScale: CGFloat = 1
    var clickProgress: CGFloat = 0

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isOpaque: Bool {
        false
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        NSColor.clear.setFill()
        dirtyRect.fill()

        guard let context = NSGraphicsContext.current?.cgContext else {
            return
        }

        SoftwareCursorGlyphRenderer.draw(
            in: bounds,
            context: context,
            state: SoftwareCursorGlyphRenderState(
                rotation: rotation,
                cursorBodyOffset: cursorBodyOffset,
                fogOffset: fogOffset,
                fogOpacity: fogOpacity,
                fogScale: fogScale,
                clickProgress: clickProgress
            )
        )
    }
}
