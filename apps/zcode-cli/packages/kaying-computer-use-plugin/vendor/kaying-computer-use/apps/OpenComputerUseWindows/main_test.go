package main

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"
)

func TestToolDefinitionCount(t *testing.T) {
	if got := len(toolDefinitions()); got != 9 {
		t.Fatalf("toolDefinitions() count = %d, want 9", got)
	}
}

func TestCallSequenceStopsAfterFirstToolError(t *testing.T) {
	output, hasError, err := runCallCommand([]string{
		"--calls",
		`[{"tool":"not_a_tool"},{"tool":"list_apps"}]`,
	}, newService())
	if err != nil {
		t.Fatal(err)
	}
	if !hasError {
		t.Fatal("expected hasError")
	}
	items, ok := output.([]map[string]any)
	if !ok {
		t.Fatalf("output type = %T", output)
	}
	if len(items) != 1 {
		t.Fatalf("sequence output count = %d, want 1", len(items))
	}
}

func TestReadArgumentsAcceptsJSONObject(t *testing.T) {
	args, err := readArguments(`{"app":"Notepad","pages":2}`, "")
	if err != nil {
		t.Fatal(err)
	}
	if args["app"] != "Notepad" {
		t.Fatalf("app = %v", args["app"])
	}
	if args["pages"].(json.Number).String() != "2" {
		t.Fatalf("pages = %v", args["pages"])
	}
}

func TestMCPInitializeResponseContainsToolsCapability(t *testing.T) {
	request := map[string]any{
		"jsonrpc": "2.0",
		"id":      float64(1),
		"method":  "initialize",
		"params":  map[string]any{},
	}
	response := handleMCPRequest(request, newService())
	result, ok := response["result"].(map[string]any)
	if !ok {
		t.Fatalf("missing result: %#v", response)
	}
	capabilities := result["capabilities"].(map[string]any)
	if _, ok := capabilities["tools"]; !ok {
		t.Fatalf("missing tools capability: %#v", capabilities)
	}
}

func TestCLIHelpMentionsWindowsRuntime(t *testing.T) {
	var out bytes.Buffer
	if err := runCLI([]string{"--help"}, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Kaying Computer Use for Windows") {
		t.Fatalf("help text did not mention Windows runtime:\n%s", out.String())
	}
}

func TestWindowsRuntimeForegroundActionsRequireOptIn(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "KAYING_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH") {
		t.Fatal("Windows app launch fallback must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "KAYING_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS") {
		t.Fatal("Windows SetFocus action must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "KAYING_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK") {
		t.Fatal("Windows UIA text fallback must remain opt-in")
	}
	if !strings.Contains(serverInstructions, "does not auto-launch apps, perform SetFocus, or use UIA text fallback by default") {
		t.Fatal("MCP instructions must document the Windows background-focus policy")
	}
}

func TestWindowsRuntimeImplementsImageBoundingContract(t *testing.T) {
	// docs/IMAGE_CAPTURE.md: the KAYING_COMPUTER_USE_IMAGE_* contract is shared with
	// the macOS runtime; Windows must honor the same variables and map screenshot
	// coordinates back through screenshotWidth/screenshotHeight.
	for _, name := range []string{
		"KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION",
		"KAYING_COMPUTER_USE_IMAGE_MAX_BYTES",
		"KAYING_COMPUTER_USE_IMAGE_MIN_SCALE",
	} {
		if !strings.Contains(windowsRuntimeScript, name) {
			t.Fatalf("Windows runtime is missing the macOS image contract variable %s", name)
		}
	}
	if !strings.Contains(windowsRuntimeScript, "screenshotWidth") || !strings.Contains(windowsRuntimeScript, "screenshotHeight") {
		t.Fatal("Windows runtime must plumb screenshot dimensions for coordinate mapping")
	}
}

func TestWindowsRuntimeForegroundInputPolicy(t *testing.T) {
	for _, marker := range []string{
		"KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY",
		"KAYING_COMPUTER_USE_WINDOWS_DISABLE_VISUAL_CURSOR",
		"SendInput",
		"EnsureForeground",
		"OCUOverlayForm",
	} {
		if !strings.Contains(windowsRuntimeScript, marker) {
			t.Fatalf("Windows runtime script is missing foreground-input marker %s", marker)
		}
	}
	if !strings.Contains(serverInstructions, "KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY=foreground") {
		t.Fatal("MCP instructions must document the foreground input policy")
	}
}

func TestWindowsRuntimeForegroundInputUsesExactWin32Events(t *testing.T) {
	for _, declaration := range []string{
		"MOUSEEVENTF_LEFTDOWN = 0x0002",
		"MOUSEEVENTF_LEFTUP = 0x0004",
		"MOUSEEVENTF_RIGHTDOWN = 0x0008",
		"MOUSEEVENTF_RIGHTUP = 0x0010",
		"MOUSEEVENTF_MIDDLEDOWN = 0x0020",
		"MOUSEEVENTF_MIDDLEUP = 0x0040",
		"KEYEVENTF_EXTENDEDKEY = 0x0001",
		"KEYEVENTF_SCANCODE = 0x0008",
	} {
		if !strings.Contains(windowsRuntimeScript, declaration) {
			t.Fatalf("Windows runtime is missing exact Win32 input declaration %q", declaration)
		}
	}
	for _, marker := range []string{
		"SendChecked",
		"current foreground window is",
		"HTTRANSPARENT",
		"control_l",
		"shift_l",
		"alt_l",
	} {
		if !strings.Contains(windowsRuntimeScript, marker) {
			t.Fatalf("Windows runtime is missing fail-closed input marker %q", marker)
		}
	}
}

func TestWindowsRuntimeVisualFeedbackUsesPerPixelAlpha(t *testing.T) {
	for _, marker := range []string{
		"UpdateLayeredWindow",
		"Format32bppPArgb",
		"CreateFeedbackFrame",
		"ClearFeedback",
		"CreateTargetFrame",
	} {
		if !strings.Contains(windowsRuntimeScript, marker) {
			t.Fatalf("Windows runtime is missing native visual-feedback marker %q", marker)
		}
	}
	for _, legacyMarker := range []string{
		"TransparencyKey = Color.Magenta",
		"FillEllipse(fill",
		"public double PulseLevel",
	} {
		if strings.Contains(windowsRuntimeScript, legacyMarker) {
			t.Fatalf("Windows runtime still contains legacy visual-feedback marker %q", legacyMarker)
		}
	}
}

func TestTurnEndedClearsExistingWorkerWithoutDiscardingSnapshots(t *testing.T) {
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	worker := &psWorker{stdin: writer, lines: make(chan workerLine, 1)}
	svc := newService()
	svc.worker = worker
	snapshot := &appSnapshot{WindowTitle: "retained"}
	svc.snapshots["fixture"] = snapshot
	requests := make(chan psRequest, 2)
	go func() {
		decoder := json.NewDecoder(reader)
		for {
			var request psRequest
			if decoder.Decode(&request) != nil {
				return
			}
			requests <- request
			worker.lines <- workerLine{line: `{"ok":true}`}
		}
	}()
	notification := map[string]any{"method": "notifications/turn-ended"}
	for i := 0; i < 2; i++ {
		if response := handleMCPRequest(notification, svc); response != nil {
			t.Fatalf("notification must not produce a JSON-RPC response: %v", response)
		}
		select {
		case request := <-requests:
			if request.Tool != "turn_ended" {
				t.Fatalf("cleanup operation = %q", request.Tool)
			}
		case <-time.After(time.Second):
			t.Fatal("turn-ended was ignored instead of clearing the resident worker")
		}
		if svc.worker != worker || svc.snapshots["fixture"] != snapshot {
			t.Fatal("cleanup must retain the worker and cached snapshot")
		}
	}
}

func TestTurnEndedWithoutWorkerDoesNotStartOne(t *testing.T) {
	svc := newService()
	response := handleMCPRequest(map[string]any{"method": "notifications/turn-ended"}, svc)
	if response != nil || svc.worker != nil {
		t.Fatal("idle cleanup started a worker or emitted a response")
	}
}
