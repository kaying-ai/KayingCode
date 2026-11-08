package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	psOperationTimeout  = 30 * time.Second
	psWorkerIdleSeconds = 600
	psWorkerStopGrace   = 2 * time.Second
	psWorkerStderrLimit = 8 * 1024
)

// errWorkerNotAccepting marks a failure where the request was never consumed by the
// PowerShell worker, so retrying it on a fresh worker cannot double-execute an action.
var errWorkerNotAccepting = errors.New("Windows runtime is not accepting requests")

// psWorker is a resident runtime.ps1 -Worker process. Keeping it alive across tool
// calls avoids re-paying PowerShell startup, UIA assembly loads, and inline C#
// compilation for every operation. The worker is stateless per request: all element
// state stays in service.snapshots, so restarting one is always safe.
type psWorker struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	lines     chan workerLine
	scriptDir string

	stderrMutex sync.Mutex
	stderr      bytes.Buffer

	closeOnce sync.Once
}

type workerLine struct {
	line string
	err  error
}

func startPSWorker() (*psWorker, error) {
	if runtime.GOOS != "windows" {
		return nil, errors.New("Windows Computer Use runtime requires powershell.exe on Windows")
	}

	tempDir, err := os.MkdirTemp("", "kaying-computer-use-windows-*")
	if err != nil {
		return nil, err
	}
	scriptPath := filepath.Join(tempDir, "runtime.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsRuntimeScript), 0o600); err != nil {
		os.RemoveAll(tempDir)
		return nil, err
	}

	cmd := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", scriptPath,
		"-Worker",
		"-IdleTimeoutSeconds", strconv.Itoa(psWorkerIdleSeconds),
	)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		os.RemoveAll(tempDir)
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		os.RemoveAll(tempDir)
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdin.Close()
		os.RemoveAll(tempDir)
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		stdin.Close()
		os.RemoveAll(tempDir)
		return nil, fmt.Errorf("Windows runtime failed to start: %w", err)
	}

	worker := &psWorker{
		cmd:       cmd,
		stdin:     stdin,
		lines:     make(chan workerLine, 4),
		scriptDir: tempDir,
	}
	go worker.drainStderr(stderr)
	go worker.readLines(stdout)
	return worker, nil
}

func (w *psWorker) readLines(stdout io.Reader) {
	reader := bufio.NewReader(stdout)
	for {
		line, err := reader.ReadString('\n')
		if line != "" {
			w.lines <- workerLine{line: line}
		}
		if err != nil {
			w.lines <- workerLine{err: err}
			return
		}
	}
}

func (w *psWorker) drainStderr(stderr io.Reader) {
	buffer := make([]byte, 1024)
	for {
		n, err := stderr.Read(buffer)
		if n > 0 {
			w.appendStderr(buffer[:n])
		}
		if err != nil {
			return
		}
	}
}

func (w *psWorker) appendStderr(chunk []byte) {
	w.stderrMutex.Lock()
	defer w.stderrMutex.Unlock()
	w.stderr.Write(chunk)
	if w.stderr.Len() > psWorkerStderrLimit {
		// Keep only the tail so a chatty worker cannot grow this buffer unbounded.
		tail := w.stderr.Bytes()[w.stderr.Len()-psWorkerStderrLimit/2:]
		w.stderr.Reset()
		w.stderr.Write(tail)
	}
}

func (w *psWorker) stderrTail() string {
	w.stderrMutex.Lock()
	defer w.stderrMutex.Unlock()
	return strings.TrimSpace(w.stderr.String())
}

func (w *psWorker) run(request psRequest) (*psResponse, error) {
	payload, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	if _, err := w.stdin.Write(append(payload, '\n')); err != nil {
		return nil, fmt.Errorf("%w: %v", errWorkerNotAccepting, err)
	}

	deadline := time.After(psOperationTimeout)
	for {
		select {
		case message := <-w.lines:
			if message.err != nil {
				return nil, w.fail("Windows runtime exited before responding")
			}
			line := strings.TrimSpace(message.line)
			if line == "" {
				continue
			}
			var response psResponse
			if err := json.Unmarshal([]byte(line), &response); err != nil {
				// Stray stdout noise is not a response; keep waiting for the JSON line.
				continue
			}
			return &response, nil
		case <-deadline:
			return nil, errors.New("Windows runtime timed out after 30s")
		}
	}
}

func (w *psWorker) fail(message string) error {
	w.close()
	if tail := w.stderrTail(); tail != "" {
		return fmt.Errorf("%s: %s", message, tail)
	}
	return errors.New(message)
}

func (w *psWorker) close() {
	w.closeOnce.Do(func() {
		// Closing stdin lets the worker exit on EOF; kill it only if it lingers.
		_ = w.stdin.Close()
		done := make(chan struct{})
		go func() {
			_ = w.cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(psWorkerStopGrace):
			_ = w.cmd.Process.Kill()
			<-done
		}
		os.RemoveAll(w.scriptDir)
	})
}

func (s *service) runOperation(request psRequest) (*psResponse, error) {
	response, err := s.runWithWorker(request)
	if err != nil && errors.Is(err, errWorkerNotAccepting) {
		// The resident worker may have exited on its idle watchdog while no request
		// was in flight; the request was never consumed, so one retry is safe.
		s.closeWorker()
		response, err = s.runWithWorker(request)
	}
	if err != nil {
		// The request outcome is unknown (timeout/crash): discard this worker so the
		// next call starts fresh. Never silently retry an action that may have run.
		s.closeWorker()
	}
	return response, err
}

func (s *service) runWithWorker(request psRequest) (*psResponse, error) {
	if s.worker == nil {
		worker, err := startPSWorker()
		if err != nil {
			return nil, err
		}
		s.worker = worker
	}
	return s.worker.run(request)
}

func (s *service) closeWorker() {
	if s.worker != nil {
		s.worker.close()
		s.worker = nil
	}
}

// 结束通知不能启动新的桌面 worker，也不能清空仍供后续工具使用的 snapshot。
// MCP 串行处理通知与工具，沿用同一 worker 通道确认清理后才处理下一条请求。
func (s *service) clearVisualFeedback() {
	if s.worker == nil {
		return
	}
	response, err := s.worker.run(psRequest{Tool: "turn_ended"})
	if err != nil || !response.OK {
		// 清理失败时销毁 worker；不能让残留叠层等到整个 KayingCode 退出才释放。
		s.closeWorker()
		fmt.Fprintln(os.Stderr, "Windows visual feedback cleanup failed; resident worker closed")
	}
}

func (s *service) Close() {
	s.closeWorker()
}
