package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func requirePowerShell(t *testing.T) {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("PowerShell worker tests only run on Windows")
	}
	if _, err := exec.LookPath("powershell.exe"); err != nil {
		t.Skip("powershell.exe is not available")
	}
}

func TestPSWorkerRoundTripAndSequentialRequests(t *testing.T) {
	requirePowerShell(t)

	worker, err := startPSWorker()
	if err != nil {
		t.Fatal(err)
	}
	defer worker.close()

	for attempt := 0; attempt < 3; attempt++ {
		response, err := worker.run(psRequest{Tool: "list_apps"})
		if err != nil {
			t.Fatalf("request %d failed: %v", attempt, err)
		}
		if !response.OK {
			t.Fatalf("request %d returned error: %s", attempt, response.Error)
		}
		if strings.TrimSpace(response.Text) == "" {
			t.Fatalf("request %d returned empty app list", attempt)
		}
	}
}

func TestPSWorkerReportsScriptErrorsAsFailedResponse(t *testing.T) {
	requirePowerShell(t)

	worker, err := startPSWorker()
	if err != nil {
		t.Fatal(err)
	}
	defer worker.close()

	response, err := worker.run(psRequest{Tool: "get_app_state", App: "no-such-app-404"})
	if err != nil {
		t.Fatalf("protocol failure (expected in-band error): %v", err)
	}
	if response.OK {
		t.Fatal("expected ok=false for unknown app")
	}
	if !strings.Contains(response.Error, "appNotFound") {
		t.Fatalf("unexpected error text: %s", response.Error)
	}

	// A failed operation must not poison the worker for the next request.
	after, err := worker.run(psRequest{Tool: "list_apps"})
	if err != nil {
		t.Fatalf("worker unusable after failed operation: %v", err)
	}
	if !after.OK {
		t.Fatalf("follow-up request returned error: %s", after.Error)
	}
}

func TestPSWorkerCloseIsIdempotent(t *testing.T) {
	requirePowerShell(t)

	worker, err := startPSWorker()
	if err != nil {
		t.Fatal(err)
	}
	worker.close()
	done := make(chan struct{})
	go func() {
		worker.close()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("second close() did not return")
	}
}

func TestPSWorkerOneShotModeStillWorks(t *testing.T) {
	requirePowerShell(t)

	tempDir := t.TempDir()
	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		t.Fatal(err)
	}
	operationPath := filepath.Join(tempDir, "operation.json")
	operation, err := json.Marshal(psRequest{Tool: "list_apps"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(operationPath, operation, 0o600); err != nil {
		t.Fatal(err)
	}

	output, err := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", scriptPath, operationPath,
	).Output()
	if err != nil {
		t.Fatalf("one-shot runtime failed: %v", err)
	}
	var response psResponse
	if err := json.Unmarshal(bytes.TrimSpace(output), &response); err != nil {
		t.Fatalf("one-shot output was not a psResponse: %v: %s", err, string(output))
	}
	if !response.OK || strings.TrimSpace(response.Text) == "" {
		t.Fatalf("unexpected one-shot response: %+v", response)
	}
}

func TestPSWorkerRejectsUnsupportedPlatformAtStart(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("negative platform check only exercises non-Windows hosts")
	}
	if _, err := startPSWorker(); err == nil {
		t.Fatal("expected startPSWorker to fail on non-Windows hosts")
	} else if !strings.Contains(err.Error(), "powershell.exe") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunOperationSurfacesWorkerProtocolErrors(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("runOperation is guarded by runtime.GOOS; the positive path is covered by worker tests")
	}
	svc := newService()
	if _, err := svc.runOperation(psRequest{Tool: "list_apps"}); !errors.Is(err, errWorkerNotAccepting) && err == nil {
		t.Fatal("expected an error on non-Windows hosts")
	}
}

// TestRuntimeScreenshotBoundingAndCoordinateMapping executes the embedded
// runtime.ps1 functions against a synthetic 800x600 capture and locks the
// docs/IMAGE_CAPTURE.md bounding algorithm plus the screenshot-coordinate
// mapping that keeps click x/y accurate after downscaling.
func TestRuntimeScreenshotBoundingAndCoordinateMapping(t *testing.T) {
	requirePowerShell(t)

	tempDir := t.TempDir()
	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		t.Fatal(err)
	}
	harness := filepath.Join(tempDir, "harness.ps1")
	harnessScript := `
$ErrorActionPreference = "Stop"
try { . .\runtime.ps1 } catch { if ($_.Exception.Message -notlike "*-Worker or -OperationPath*") { throw } }
$bounds = [pscustomobject]@{ x = 0; y = 0; width = 800; height = 600 }

function Assert-Size([string]$label, [string]$envName, [string]$envValue, [int]$wantWidth, [int]$wantHeight) {
    if ($envName -ne "") { [Environment]::SetEnvironmentVariable($envName, $envValue) } else { [Environment]::SetEnvironmentVariable("KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION", $null) }
    $r = Capture-BoundedScreenshot $bounds
    if ($r.width -ne $wantWidth -or $r.height -ne $wantHeight) {
        throw "${label}: got $($r.width)x$($r.height), want ${wantWidth}x${wantHeight}"
    }
}

Assert-Size "default 800x600 stays" "" "" 800 600
Assert-Size "maxDimension 64 clamps to minScale" "KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION" "64" 200 150
Assert-Size "maxDimension 16 stays at minScale floor" "KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION" "16" 200 150
[Environment]::SetEnvironmentVariable("KAYING_COMPUTER_USE_IMAGE_MIN_SCALE", "0.05")
Assert-Size "lowered minScale breaks the floor" "KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION" "16" 40 30
[Environment]::SetEnvironmentVariable("KAYING_COMPUTER_USE_IMAGE_MIN_SCALE", $null)

$windowBounds = [pscustomobject]@{ x = 100; y = 200; width = 800; height = 600 }
$mapped = ConvertFrom-ScreenshotPoint 320 240 400 300 $windowBounds
if ([math]::Abs($mapped.x - 640) -gt 0.001 -or [math]::Abs($mapped.y - 480) -gt 0.001) {
    throw "screenshot mapping: got $($mapped.x),$($mapped.y), want 640,480"
}
$fallback = ConvertFrom-ScreenshotPoint 320 240 0 0 $windowBounds
if ($fallback.x -ne 320 -or $fallback.y -ne 240) {
    throw "1:1 fallback mapping: got $($fallback.x),$($fallback.y), want 320,240"
}
Write-Output "OK"
`
	if err := os.WriteFile(harness, []byte(harnessScript), 0o600); err != nil {
		t.Fatal(err)
	}

	harnessCmd := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", harness,
	)
	// The harness dot-sources .\runtime.ps1 relative to its working directory.
	harnessCmd.Dir = tempDir
	output, err := harnessCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("screenshot harness failed: %v: %s", err, string(output))
	}
	if !strings.Contains(string(output), "OK") {
		t.Fatalf("harness did not report OK: %s", string(output))
	}
}

func TestRuntimeForegroundInputConstantsAndKeyAliases(t *testing.T) {
	requirePowerShell(t)

	tempDir := t.TempDir()
	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		t.Fatal(err)
	}
	harness := filepath.Join(tempDir, "foreground-input-harness.ps1")
	harnessScript := `
$ErrorActionPreference = "Stop"
try { . .\runtime.ps1 } catch { if ($_.Exception.Message -notlike "*-Worker or -OperationPath*") { throw } }
if (-not (Initialize-RealInputTypes)) { throw "real input types failed: $script:RealInputLastError" }

$mouseConstants = @{
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP = 0x0040
}
foreach ($entry in $mouseConstants.GetEnumerator()) {
    $actual = [OCUInput].GetField($entry.Key).GetRawConstantValue()
    if ($actual -ne $entry.Value) { throw "$($entry.Key): got $actual, want $($entry.Value)" }
}

$leftShift = Get-ModifierKeySpec "Shift_L"
if ($leftShift.virtualKey -ne 0xA0 -or $leftShift.extended) { throw "Shift_L mapping is incorrect" }
$rightControl = Get-ModifierKeySpec "Control_R"
if ($rightControl.virtualKey -ne 0xA3 -or -not $rightControl.extended) { throw "Control_R mapping is incorrect" }
if ((Get-VirtualKey "Numpad_0") -ne 0x60) { throw "Numpad_0 mapping is incorrect" }
if (-not (Test-ExtendedVirtualKey "Numpad_Enter" 0x0D)) { throw "Numpad_Enter must be extended" }
try {
    Get-ModifierKeySpec "mystery_modifier" | Out-Null
    throw "unknown modifier was accepted"
} catch {
    if ($_.Exception.Message -eq "unknown modifier was accepted") { throw }
}
Write-Output "OK"
`
	if err := os.WriteFile(harness, []byte(harnessScript), 0o600); err != nil {
		t.Fatal(err)
	}

	harnessCmd := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", harness,
	)
	harnessCmd.Dir = tempDir
	output, err := harnessCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("foreground input harness failed: %v: %s", err, string(output))
	}
	if !strings.Contains(string(output), "OK") {
		t.Fatalf("foreground input harness did not report OK: %s", string(output))
	}
}

func TestRuntimeSoftwareCursorFrame(t *testing.T) {
	requirePowerShell(t)

	tempDir := t.TempDir()
	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		t.Fatal(err)
	}
	harness := filepath.Join(tempDir, "visual-feedback-harness.ps1")
	harnessScript := `
$ErrorActionPreference = "Stop"
try { . .\runtime.ps1 } catch { if ($_.Exception.Message -notlike "*-Worker or -OperationPath*") { throw } }
if (-not (Initialize-RealInputTypes)) { throw "real input types failed: $script:RealInputLastError" }

$form = New-Object OCUOverlayForm
$start = $form.CreateFeedbackFrame(0.0)
$finish = $form.CreateFeedbackFrame(1.0)
try {
    if ($start.Width -ne 96 -or $start.Height -ne 96) { throw "feedback frame must be 96x96" }
    if ($finish.GetPixel(47, 49).A -lt 240) { throw "resting pointer must remain visible" }
    if ($start.GetPixel(0, 0).A -ne 0) { throw "feedback corner must stay transparent" }

    $visiblePixels = 0
    $warmPixels = 0
    for ($y = 0; $y -lt $start.Height; $y++) {
        for ($x = 0; $x -lt $start.Width; $x++) {
            $pixel = $start.GetPixel($x, $y)
            if ($pixel.A -gt 16) { $visiblePixels++ }
            if ($pixel.A -gt 48 -and $pixel.R -gt ($pixel.G + 35) -and $pixel.R -gt ($pixel.B + 35)) {
                $warmPixels++
            }
        }
    }
    if ($visiblePixels -lt 20) { throw "software cursor is not visibly rendered" }
    if ($warmPixels -ne 0) { throw "software cursor contains red/orange pixels" }
} finally {
    $start.Dispose()
    $finish.Dispose()
    $form.Dispose()
}
Write-Output "OK"
`
	if err := os.WriteFile(harness, []byte(harnessScript), 0o600); err != nil {
		t.Fatal(err)
	}

	harnessCmd := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", harness,
	)
	harnessCmd.Dir = tempDir
	output, err := harnessCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("visual feedback harness failed: %v: %s", err, string(output))
	}
	if !strings.Contains(string(output), "OK") {
		t.Fatalf("visual feedback harness did not report OK: %s", string(output))
	}
}

func TestPSWorkerIdleWatchdogRunsWithStdinStillOpen(t *testing.T) {
	requirePowerShell(t)
	scriptPath := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", scriptPath, "-Worker", "-IdleTimeoutSeconds", "1")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer stdin.Close()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Process.Kill()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	// 不关闭 stdin、不发送下一行，watchdog 仍必须退出；旧 Console.In.ReadLineAsync 会卡住。
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("idle worker failed: %v: %s", err, stderr.String())
		}
	case <-time.After(20 * time.Second):
		t.Fatal("worker blocked on stdin instead of servicing the idle watchdog")
	}
}

func TestVisualCleanupFailureDiscardsWorkerAndRetainsSnapshot(t *testing.T) {
	cmd := exec.Command(os.Args[0], "-test.run=^TestVisualCleanupWorkerProcess$")
	cmd.Env = append(os.Environ(), "KAYING_CUA_CLEANUP_TEST_HELPER=1")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	worker := &psWorker{cmd: cmd, stdin: stdin, lines: make(chan workerLine, 1), scriptDir: t.TempDir()}
	defer worker.close()
	worker.lines <- workerLine{line: `{"ok":false,"error":"cleanup failed"}`}
	svc := newService()
	svc.worker = worker
	snapshot := &appSnapshot{WindowTitle: "retained"}
	svc.snapshots["fixture"] = snapshot
	svc.clearVisualFeedback()
	if svc.worker != nil {
		t.Fatal("failed cleanup retained the worker")
	}
	if svc.snapshots["fixture"] != snapshot {
		t.Fatal("failed cleanup discarded snapshot")
	}
}

func TestVisualCleanupWorkerProcess(t *testing.T) {
	if os.Getenv("KAYING_CUA_CLEANUP_TEST_HELPER") != "1" {
		return
	}
	_, _ = io.Copy(io.Discard, os.Stdin)
	os.Exit(0)
}

func TestPSWorkerTurnEndedKeepsWorkerUsable(t *testing.T) {
	requirePowerShell(t)
	worker, err := startPSWorker()
	if err != nil {
		t.Fatal(err)
	}
	defer worker.close()
	for _, tool := range []string{"turn_ended", "turn_ended", "list_apps"} {
		response, err := worker.run(psRequest{Tool: tool})
		if err != nil {
			t.Fatal(err)
		}
		if !response.OK {
			t.Fatalf("%s failed: %s", tool, response.Error)
		}
	}
}
