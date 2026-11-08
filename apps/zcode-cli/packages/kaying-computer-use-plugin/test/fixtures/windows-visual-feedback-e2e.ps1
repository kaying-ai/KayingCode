param([string]$OutputDirectory)
$ErrorActionPreference = "Stop"
$runtime = Join-Path $PSScriptRoot "../../vendor/kaying-computer-use/apps/OpenComputerUseWindows/runtime.ps1"
try { . $runtime } catch { if ($_.Exception.Message -notlike "*-Worker or -OperationPath*") { throw } }
[void](Initialize-RealInputSupport)
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Windows.Forms;
public class OCUFeedbackFixture : Form {
    public int Clicks, Doubles, Drags, Wheels, Keys;
    public OCUFeedbackFixture(string name, int x) {
        Text = name; StartPosition = FormStartPosition.Manual;
        Bounds = new Rectangle(x, 140, 640, 440);
        BackColor = Color.FromArgb(248, 250, 253); KeyPreview = true;
    }
    protected override void OnMouseDown(MouseEventArgs e) { Clicks++; base.OnMouseDown(e); }
    protected override void OnMouseDoubleClick(MouseEventArgs e) { Doubles++; base.OnMouseDoubleClick(e); }
    protected override void OnMouseMove(MouseEventArgs e) { if (e.Button == MouseButtons.Left) Drags++; base.OnMouseMove(e); }
    protected override void OnMouseWheel(MouseEventArgs e) { Wheels++; base.OnMouseWheel(e); }
    protected override void OnKeyPress(KeyPressEventArgs e) { Keys++; base.OnKeyPress(e); }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e);
        using (var title = new Font("Segoe UI", 18))
        using (var body = new Font("Segoe UI", 11)) {
            e.Graphics.DrawString("Computer Use", title, Brushes.Black, 32, 28);
            e.Graphics.DrawString("Native visual feedback test workspace", body, Brushes.DimGray, 34, 72);
            e.Graphics.DrawString("Click  /  Drag  /  Scroll  /  Type", body, Brushes.DimGray, 34, 310);
        }
    }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing

$before = [OCUWindow]::GetForegroundWindow()
$position = [OCUInput]::CursorPosition()
$first = New-Object OCUFeedbackFixture "KayingCode feedback fixture A", 160
$second = New-Object OCUFeedbackFixture "KayingCode feedback fixture B", 220
function Pump { [System.Windows.Forms.Application]::DoEvents(); Update-VisualFeedback }
function Assert-Active {
    Pump
    if (-not $script:VisualFeedback.IsActive -or -not $script:VisualFeedback.Target.IsPresented) {
        throw "target feedback missing: $($script:VisualFeedback.LastDismissalReason)"
    }
    if ([OCUWindow]::GetForegroundWindow() -ne $first.Handle) { throw "feedback took focus" }
}
try {
    $first.Show(); Pump
    # windowsHide 的 STARTUPINFO 会覆盖子进程第一次 ShowWindow；显式显示测试专用窗口。
    [void][OCUWindow]::ShowWindow($first.Handle, 5)
    [void][OCUWindow]::EnsureForeground($first.Handle)
    [void](Enable-WindowForInput $first.Handle)
    if ($null -eq $script:VisualFeedback) { throw "feedback was not initialized" }
    Assert-Active
    $point = $first.PointToScreen([Drawing.Point]::new(200, 170))
    Invoke-RealMouseClick $point.X $point.Y "left" 1
    Assert-Active
    if ($first.Clicks -ne 1) { throw "overlay intercepted single click" }
    if (-not $script:VisualFeedback.Cursor.IsPresented) { throw "resting pointer missing" }
    Invoke-RealMouseClick $point.X $point.Y "left" 2
    Pump
    if ($first.Clicks -ne 3 -or $first.Doubles -lt 1) { throw "double click did not reach target" }
    Invoke-RealDrag $point.X $point.Y ($point.X + 100) ($point.Y + 40)
    Pump
    if ($first.Drags -lt 1) { throw "drag did not reach target" }
    Invoke-RealWheel $point.X $point.Y "up" 1
    Pump
    if ($first.Wheels -lt 1) { throw "scroll did not reach target" }
    Invoke-RealTypeText "cu"
    Invoke-RealKey "a"
    Pump
    if ($first.Keys -ne 3) { throw "keyboard did not reach target" }
    Assert-Active

    # 比对同一区域的屏幕像素，截图暂停前后必须与移除叠层后的基线相同。
    $bounds = [pscustomobject]@{ x = $point.X - 35; y = $point.Y - 35; width = 96; height = 96 }
    $captured = Capture-BoundedScreenshot $bounds
    if ($null -eq $captured) { throw "capture failed: $($Error[0].Exception.Message)" }
    Assert-Active
    $script:VisualFeedback.Suspend()
    $baseline = Capture-BoundedScreenshot $bounds
    if ($null -eq $captured -or $captured.base64 -ne $baseline.base64) {
        if ($OutputDirectory -and $null -ne $captured -and $null -ne $baseline) {
            [void][IO.Directory]::CreateDirectory($OutputDirectory)
            [IO.File]::WriteAllBytes((Join-Path $OutputDirectory "captured.png"), [Convert]::FromBase64String($captured.base64))
            [IO.File]::WriteAllBytes((Join-Path $OutputDirectory "baseline.png"), [Convert]::FromBase64String($baseline.base64))
        }
        throw "capture includes feedback: captured=$($null -ne $captured), baseline=$($null -ne $baseline)"
    }
    $script:VisualFeedback.Resume()

    if ($OutputDirectory) {
        [void][IO.Directory]::CreateDirectory($OutputDirectory)
        # 原生绘制预览：使用实际 Form 内容与两张实际叠层 surface，便于离屏核对样式。
        $preview = New-Object Drawing.Bitmap ($first.Width + 32), ($first.Height + 32)
        $surface = New-Object Drawing.Bitmap $first.Width, $first.Height
        $first.DrawToBitmap($surface, [Drawing.Rectangle]::new(0, 0, $first.Width, $first.Height))
        $edge = $script:VisualFeedback.Target.CreateTargetFrame($first.Width + 14, $first.Height + 14)
        $cursor = $script:VisualFeedback.Cursor.CreateFeedbackFrame(1)
        $graphics = [Drawing.Graphics]::FromImage($preview)
        try {
            $graphics.Clear([Drawing.Color]::FromArgb(231, 235, 242))
            $graphics.DrawImage($surface, 16, 16)
            $graphics.DrawImage($edge, 9, 9)
            $graphics.DrawImage($cursor, 176, 166)
            $preview.Save((Join-Path $OutputDirectory "native-feedback-preview.png"))
        } finally { $graphics.Dispose(); $preview.Dispose(); $surface.Dispose(); $edge.Dispose(); $cursor.Dispose() }
    }

    $oldBounds = $script:VisualFeedback.Target.Bounds
    $first.Left += 50; $first.Width += 30
    Pump
    if ($script:VisualFeedback.Target.Left -ne ($oldBounds.Left + 50) -or $script:VisualFeedback.Target.Width -ne ($oldBounds.Width + 30)) { throw "target geometry stale" }

    $second.Show(); Pump
    [void](Enable-WindowForInput $second.Handle)
    if ($script:VisualFeedback.Cursor.IsPresented) { throw "old target pointer survived switch" }
    if (-not $script:VisualFeedback.Target.IsPresented) { throw "new target frame missing" }
    $second.Close(); Pump
    if ($script:VisualFeedback.IsActive) { throw "closed target retained feedback" }

    [void](Enable-WindowForInput $first.Handle)
    $point = $first.PointToScreen([Drawing.Point]::new(200, 170))
    Invoke-RealMouseClick $point.X $point.Y "left" 1
    [void][OCUInput]::SetCursorPos(($point.X + 20), $point.Y)
    Pump
    if ($script:VisualFeedback.IsActive -or $script:VisualFeedback.LastDismissalReason -ne "pointer") { throw "user takeover did not clear feedback" }
    $script:VisualFeedback.Suspend(); $script:VisualFeedback.Resume()
    if ($script:VisualFeedback.Target.IsPresented) { throw "capture restored stale target" }

    [void](Enable-WindowForInput $first.Handle)
    $last = [OCUVisualFeedback].GetField("lastActivity", [Reflection.BindingFlags]"Instance, NonPublic")
    $last.SetValue($script:VisualFeedback, [long]0)
    Pump
    if ($script:VisualFeedback.IsActive -or $script:VisualFeedback.LastDismissalReason -ne "expired") { throw "expired feedback remained visible" }

    [void](Enable-WindowForInput $first.Handle)
    $second = New-Object OCUFeedbackFixture "KayingCode feedback fixture B", 220
    $second.Show(); [void][OCUWindow]::EnsureForeground($second.Handle); Pump
    if ($script:VisualFeedback.IsActive -or $script:VisualFeedback.LastDismissalReason -ne "focus") { throw "focus loss did not clear feedback" }

    [void](Enable-WindowForInput $first.Handle)
    [void][OCUWindow]::ShowWindow($first.Handle, 6)
    Pump
    if ($script:VisualFeedback.IsActive -or $script:VisualFeedback.LastDismissalReason -ne "window") { throw "minimized target retained feedback" }
    [void][OCUWindow]::ShowWindow($first.Handle, 9)
    [void](Enable-WindowForInput $first.Handle)

    # 覆盖真正的 Invoke-Operation 返回边界，而非只手工 Dispose 展示对象。
    $originalBuildSnapshot = ${function:Build-Snapshot}
    try {
        function Build-Snapshot($app) {
            [void](Enable-WindowForInput $first.Handle)
            Show-VisualCursor $point.X $point.Y
            $script:OperationFeedback = $script:VisualFeedback
            return [pscustomobject]@{ windowTitle = "cleanup fixture" }
        }
        $result = Invoke-Operation ([pscustomobject]@{ tool = "get_app_state"; app = "fixture" })
        $completed = $script:OperationFeedback
        if (-not $result.ok -or $null -ne $script:VisualFeedback -or
            -not $completed.Cursor.IsDisposed -or -not $completed.Target.IsDisposed) {
            throw "successful response returned before both overlays were disposed"
        }
        $again = Invoke-Operation ([pscustomobject]@{ tool = "get_app_state"; app = "fixture" })
        if (-not $again.ok -or [Object]::ReferenceEquals($completed, $script:OperationFeedback)) {
            throw "next operation could not recreate feedback"
        }
        function Build-Snapshot($app) {
            [void](Enable-WindowForInput $first.Handle)
            Show-VisualCursor $point.X $point.Y
            $script:OperationFeedback = $script:VisualFeedback
            throw "cleanup fixture failure"
        }
        $failed = Invoke-Operation ([pscustomobject]@{ tool = "get_app_state"; app = "fixture" })
        if ($failed.ok -or $null -ne $script:VisualFeedback -or
            -not $script:OperationFeedback.Cursor.IsDisposed -or -not $script:OperationFeedback.Target.IsDisposed) {
            throw "failed response retained feedback"
        }
        [void](Enable-WindowForInput $first.Handle)
        $ended = $script:VisualFeedback
        foreach ($attempt in 1..2) {
            $ack = Invoke-Operation ([pscustomobject]@{ tool = "turn_ended" })
            if (-not $ack.ok -or $null -ne $script:VisualFeedback) { throw "turn end cleanup is not idempotent" }
        }
        if (-not $ended.Cursor.IsDisposed -or -not $ended.Target.IsDisposed) { throw "turn end retained overlays" }
        if ([OCUWindow]::GetForegroundWindow() -ne $first.Handle) { throw "cleanup changed foreground target" }
    } finally { ${function:Build-Snapshot} = $originalBuildSnapshot }

    $env:KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY = "background"
    $result = Invoke-Operation ([pscustomobject]@{ tool = "list_apps" })
    if (-not $result.ok -or $null -ne $script:VisualFeedback) { throw "background mode retained feedback" }
    $env:KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY = "foreground"
    [void](Enable-WindowForInput $first.Handle)
    $disposed = $script:VisualFeedback
    Close-VisualFeedback
    if (-not $disposed.Cursor.IsDisposed -or -not $disposed.Target.IsDisposed) { throw "feedback windows were not released" }

    $env:KAYING_COMPUTER_USE_WINDOWS_DISABLE_VISUAL_CURSOR = "1"
    [void](Enable-WindowForInput $first.Handle)
    if ($null -ne $script:VisualFeedback) { throw "disabled feedback was created" }
    Write-Output "visual feedback E2E: OK"
} finally {
    Close-VisualFeedback
    $first.Dispose(); $second.Dispose()
    [void][OCUInput]::SetCursorPos($position.X, $position.Y)
    [void][OCUWindow]::EnsureForeground($before)
}
