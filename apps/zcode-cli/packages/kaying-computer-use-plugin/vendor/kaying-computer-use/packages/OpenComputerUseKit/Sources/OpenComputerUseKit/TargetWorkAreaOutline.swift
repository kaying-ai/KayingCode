import AppKit
import CoreGraphics

func targetWorkAreaFrame(windowBounds: CGRect, screenMappings: [VisualCursorScreenMapping]) -> CGRect? {
    guard !windowBounds.isNull, !windowBounds.isInfinite,
          windowBounds.minX.isFinite, windowBounds.minY.isFinite,
          windowBounds.width.isFinite, windowBounds.height.isFinite,
          windowBounds.width > 0, windowBounds.height > 0 else {
        return nil
    }
    // 使用有最大交集的屏幕作坐标基准；窗口左上角可能在屏幕外或横跨多个显示器。
    let visibleMappings = screenMappings.filter { !$0.screenStateFrame.intersection(windowBounds).isEmpty }
    guard let mapping = visibleMappings.max(by: {
        let left = $0.screenStateFrame.intersection(windowBounds)
        let right = $1.screenStateFrame.intersection(windowBounds)
        return left.width * left.height < right.width * right.height
    }) else { return nil }
    return CGRect(
        x: mapping.appKitFrame.minX + windowBounds.minX - mapping.screenStateFrame.minX,
        y: mapping.appKitFrame.maxY - (windowBounds.maxY - mapping.screenStateFrame.minY),
        width: windowBounds.width, height: windowBounds.height
    )
}

enum VisualFeedbackStyle {
    static let accent = NSColor(calibratedRed: 83.0 / 255, green: 157.0 / 255, blue: 1, alpha: 1)
    static let accentEnd = NSColor(calibratedRed: 150.0 / 255, green: 123.0 / 255, blue: 247.0 / 255, alpha: 1)
    static let outlineOutset: CGFloat = 8
}

@MainActor
func makeVisualFeedbackPanel(frame: CGRect) -> VisualFeedbackPanel {
    let panel = VisualFeedbackPanel(
        contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false
    )
    panel.level = .normal
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = false
    panel.ignoresMouseEvents = true
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.sharingType = .none
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    panel.animationBehavior = .none
    return panel
}

final class VisualFeedbackPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

// 只管理绘制资源；目标 ID、刷新时序和有效期仍由 SoftwareCursorOverlay 独占。
@MainActor
final class TargetWorkAreaOutline {
    let panel = makeVisualFeedbackPanel(frame: .zero)

    init() {
        panel.contentView = TargetWorkAreaOutlineView(frame: .zero)
    }

    func update(frame: CGRect, target: CursorTargetWindow, reorder: Bool) {
        let panelFrame = frame.insetBy(dx: -VisualFeedbackStyle.outlineOutset, dy: -VisualFeedbackStyle.outlineOutset)
        if panel.frame != panelFrame {
            panel.setFrame(panelFrame, display: true)
            panel.contentView?.needsDisplay = true
        }
        panel.level = NSWindow.Level(rawValue: target.layer)
        if reorder || !panel.isVisible {
            panel.order(.above, relativeTo: Int(target.windowID))
        }
    }

    func hide() { panel.orderOut(nil) }
}

enum TargetWorkAreaOutlineRenderer {
    static func draw(in bounds: CGRect, context: CGContext) {
        let edge = bounds.insetBy(dx: VisualFeedbackStyle.outlineOutset, dy: VisualFeedbackStyle.outlineOutset)
        guard edge.width > 0, edge.height > 0 else { return }
        let path = CGPath(roundedRect: edge, cornerWidth: 10, cornerHeight: 10, transform: nil)
        context.saveGState()
        defer { context.restoreGState() }
        context.clear(bounds)
        // 只描边，不填充窗口正文；用低透明度宽描边形成柔光。
        for width in [CGFloat(12), 8, 4] {
            context.addPath(path)
            context.setStrokeColor(VisualFeedbackStyle.accent.withAlphaComponent(0.05).cgColor)
            context.setLineWidth(width)
            context.strokePath()
        }
        context.addPath(path)
        context.setLineWidth(2)
        context.replacePathWithStrokedPath()
        context.clip()
        let colors = [VisualFeedbackStyle.accent.cgColor, VisualFeedbackStyle.accentEnd.cgColor] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
        context.drawLinearGradient(
            gradient, start: CGPoint(x: edge.minX, y: edge.maxY),
            end: CGPoint(x: edge.maxX, y: edge.minY), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
        )
    }
}

private final class TargetWorkAreaOutlineView: NSView {
    override var isOpaque: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.clear(dirtyRect)
        TargetWorkAreaOutlineRenderer.draw(in: bounds, context: context)
    }
}
