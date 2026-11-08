param([string]$OutputDirectory)
$ErrorActionPreference = "Stop"
$runtime = Join-Path $PSScriptRoot "../../vendor/kaying-computer-use/apps/OpenComputerUseWindows/runtime.ps1"
try { . $runtime } catch { if ($_.Exception.Message -notlike "*-Worker or -OperationPath*") { throw } }
if (-not (Initialize-RealInputTypes)) { throw "native types failed: $script:RealInputLastError" }

foreach ($scale in @(1.0, 1.5, 2.0)) {
    $form = New-Object OCUOverlayForm
    $form.VisualScale = $scale
    $idle = $form.CreateFeedbackFrame(1)
    $pulse = $form.CreateFeedbackFrame(0.35)
    $frame = $form.CreateTargetFrame([int](640 * $scale), [int](400 * $scale))
    try {
        if ($idle.Width -ne [int](96 * $scale)) { throw "incorrect DPI size" }
        if ($form.Hotspot -ne [int](40 * $scale)) { throw "hotspot shifted" }
        $pointer = $idle.GetPixel([int](47 * $scale), [int](49 * $scale))
        if ($pointer.A -lt 240 -or $pointer.R -gt 80) { throw "idle pointer must be opaque and dark" }
        if ($idle.GetPixel(0, 0).A -ne 0) { throw "cursor background must be transparent" }
        $changes = 0
        for ($y = 0; $y -lt $idle.Height; $y++) {
            for ($x = 0; $x -lt $idle.Width; $x++) {
                if ($idle.GetPixel($x, $y) -ne $pulse.GetPixel($x, $y)) { $changes++ }
            }
        }
        if ($changes -lt 20) { throw "click pulse must be visible" }
        if ($frame.GetPixel([int]($frame.Width / 2), [int]($frame.Height / 2)).A -ne 0) { throw "work area must remain transparent" }
        if ($frame.GetPixel([int]($frame.Width / 2), [int](7 * $scale)).A -lt 180) { throw "work area edge missing" }
        if ($frame.GetPixel(0, 0).A -ne 0) { throw "rounded frame corner must be transparent" }
        # 比较脉冲前后的箭头内部，保证视觉反馈不会移动注入热点。
        if ($pulse.GetPixel([int](47 * $scale), [int](49 * $scale)) -ne $pointer) { throw "pulse moved the pointer" }
        if ($OutputDirectory) {
            [void][IO.Directory]::CreateDirectory($OutputDirectory)
            $idle.Save((Join-Path $OutputDirectory "cursor-$scale.png"))
            $pulse.Save((Join-Path $OutputDirectory "pulse-$scale.png"))
            $frame.Save((Join-Path $OutputDirectory "frame-$scale.png"))
        }
    } finally { $idle.Dispose(); $pulse.Dispose(); $frame.Dispose(); $form.Dispose() }
}

$form = New-Object OCUOverlayForm
try {
    $flags = [System.Windows.Forms.Control].GetProperty("CreateParams", [Reflection.BindingFlags]"Instance, NonPublic").GetValue($form, $null).ExStyle
    foreach ($flag in @(0x20, 0x80, 0x80000, 0x8000000)) {
        if (($flags -band $flag) -ne $flag) { throw "missing click-through/nonactivating style" }
    }
    if ($form.ShowInTaskbar) { throw "feedback must not be in the taskbar" }
} finally { $form.Dispose() }

$feedback = New-Object OCUVisualFeedback
try {
    $feedback.Reset()
    $feedback.Suspend()
    $feedback.Resume()
    $feedback.Tick()
    if ($feedback.IsActive -or $feedback.Cursor.IsPresented -or $feedback.Target.IsPresented) { throw "reset feedback was restored" }
} finally { $feedback.Dispose() }
Write-Output "visual feedback: OK"
