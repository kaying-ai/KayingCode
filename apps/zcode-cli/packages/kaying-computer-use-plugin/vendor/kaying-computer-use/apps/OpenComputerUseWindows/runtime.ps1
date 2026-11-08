param(
    [string]$OperationPath,
    [switch]$Worker,
    [int]$IdleTimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class OCUWin32 {
    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    public static void EnableDpiAwareness() {
        // 在第一次快照前统一物理像素坐标，避免观察后再切 DPI 模式导致点击偏移。
        if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware();
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool PostMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, string lParam);
}
"@
[OCUWin32]::EnableDpiAwareness()

$WM_SETTEXT = 0x000C
$WM_MOUSEMOVE = 0x0200
$WM_LBUTTONDOWN = 0x0201
$WM_LBUTTONUP = 0x0202
$WM_RBUTTONDOWN = 0x0204
$WM_RBUTTONUP = 0x0205
$WM_MBUTTONDOWN = 0x0207
$WM_MBUTTONUP = 0x0208
$WM_MOUSEWHEEL = 0x020A
$WM_MOUSEHWHEEL = 0x020E
$WM_KEYDOWN = 0x0100
$WM_KEYUP = 0x0101
$WM_CHAR = 0x0102
$EM_SETSEL = 0x00B1
$EM_REPLACESEL = 0x00C2

function Test-EnvFlagEnabled([string]$name) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $false
    }
    $normalized = $value.Trim().ToLowerInvariant()
    return @("1", "true", "yes", "on") -contains $normalized
}

function Get-EnvNumber([string]$name, [double]$default, [double]$minimum, [double]$maximum) {
    $value = [Environment]::GetEnvironmentVariable($name)
    $parsed = 0.0
    if ([string]::IsNullOrWhiteSpace($value) -or -not [double]::TryParse($value.Trim(), [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
        return $default
    }
    if ($parsed -lt $minimum -or $parsed -gt $maximum) {
        return $default
    }
    return $parsed
}

function New-Frame($x, $y, $width, $height) {
    if ($width -lt 0 -or $height -lt 0) {
        return $null
    }
    [pscustomobject]@{
        x = [double]$x
        y = [double]$y
        width = [double]$width
        height = [double]$height
    }
}

function ConvertTo-LParam([int]$x, [int]$y) {
    $packed = (($y -band 0xffff) -shl 16) -bor ($x -band 0xffff)
    [IntPtr]$packed
}

function ConvertTo-WheelWParam([int]$delta) {
    $packed = (($delta -band 0xffff) -shl 16)
    [IntPtr]$packed
}

function Get-WindowRectFrame([IntPtr]$hwnd) {
    $rect = New-Object OCUWin32+RECT
    if ([OCUWin32]::GetWindowRect($hwnd, [ref]$rect)) {
        return New-Frame $rect.Left $rect.Top ($rect.Right - $rect.Left) ($rect.Bottom - $rect.Top)
    }
    return $null
}

function Get-ElementFrame($element, $windowBounds) {
    try {
        $rect = $element.Current.BoundingRectangle
        if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) {
            return $null
        }
        if ($null -ne $windowBounds) {
            return New-Frame ($rect.X - $windowBounds.x) ($rect.Y - $windowBounds.y) $rect.Width $rect.Height
        }
        return New-Frame $rect.X $rect.Y $rect.Width $rect.Height
    } catch {
        return $null
    }
}

function Get-ScreenPoint($localFrame, $windowBounds) {
    if ($null -eq $localFrame -or $null -eq $windowBounds) {
        return $null
    }
    [pscustomobject]@{
        x = [int][math]::Round($windowBounds.x + $localFrame.x + ($localFrame.width / 2))
        y = [int][math]::Round($windowBounds.y + $localFrame.y + ($localFrame.height / 2))
    }
}

function Send-MouseClick([IntPtr]$hwnd, [int]$screenX, [int]$screenY, [string]$button, [int]$count) {
    $point = New-Object OCUWin32+POINT
    $point.X = $screenX
    $point.Y = $screenY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$point)
    $lParam = ConvertTo-LParam $point.X $point.Y

    $down = $WM_LBUTTONDOWN
    $up = $WM_LBUTTONUP
    $downFlag = 0x0001
    if ($button -eq "right") {
        $down = $WM_RBUTTONDOWN
        $up = $WM_RBUTTONUP
        $downFlag = 0x0002
    } elseif ($button -eq "middle") {
        $down = $WM_MBUTTONDOWN
        $up = $WM_MBUTTONUP
        $downFlag = 0x0010
    }

    $repeat = [math]::Max(1, $count)
    for ($i = 0; $i -lt $repeat; $i++) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]::Zero, $lParam)
        [void][OCUWin32]::PostMessage($hwnd, $down, [IntPtr]$downFlag, $lParam)
        Start-Sleep -Milliseconds 35
        [void][OCUWin32]::PostMessage($hwnd, $up, [IntPtr]::Zero, $lParam)
        Start-Sleep -Milliseconds 50
    }
}

function Send-Drag([IntPtr]$hwnd, [int]$fromX, [int]$fromY, [int]$toX, [int]$toY) {
    $start = New-Object OCUWin32+POINT
    $start.X = $fromX
    $start.Y = $fromY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$start)
    $end = New-Object OCUWin32+POINT
    $end.X = $toX
    $end.Y = $toY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$end)

    $steps = 12
    $startParam = ConvertTo-LParam $start.X $start.Y
    [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]::Zero, $startParam)
    [void][OCUWin32]::PostMessage($hwnd, $WM_LBUTTONDOWN, [IntPtr]1, $startParam)
    for ($i = 1; $i -le $steps; $i++) {
        $x = [int][math]::Round($start.X + (($end.X - $start.X) * $i / $steps))
        $y = [int][math]::Round($start.Y + (($end.Y - $start.Y) * $i / $steps))
        [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]1, (ConvertTo-LParam $x $y))
        Start-Sleep -Milliseconds 20
    }
    [void][OCUWin32]::PostMessage($hwnd, $WM_LBUTTONUP, [IntPtr]::Zero, (ConvertTo-LParam $end.X $end.Y))
}

function Send-Scroll([IntPtr]$hwnd, [int]$screenX, [int]$screenY, [string]$direction, [double]$pages) {
    $point = New-Object OCUWin32+POINT
    $point.X = $screenX
    $point.Y = $screenY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$point)
    $lParam = ConvertTo-LParam $point.X $point.Y
    $delta = [int][math]::Round(120 * $pages)
    $message = $WM_MOUSEWHEEL
    if ($direction -eq "down" -or $direction -eq "right") {
        $delta = -1 * $delta
    }
    if ($direction -eq "left" -or $direction -eq "right") {
        $message = $WM_MOUSEHWHEEL
    }
    [void][OCUWin32]::PostMessage($hwnd, $message, (ConvertTo-WheelWParam $delta), $lParam)
}

function Send-Text([IntPtr]$hwnd, [string]$text) {
    foreach ($char in $text.ToCharArray()) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_CHAR, [IntPtr][int][char]$char, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 8
    }
}

function Send-TextToEditHandle([IntPtr]$hwnd, [string]$text, $element) {
    if ($hwnd -eq [IntPtr]::Zero) {
        return $false
    }

    try {
        [void][OCUWin32]::SendMessage($hwnd, $EM_SETSEL, [IntPtr](-1), [IntPtr](-1))
        [void][OCUWin32]::SendMessage($hwnd, $EM_REPLACESEL, [IntPtr]1, $text)
        return $true
    } catch {
    }

    try {
        $current = ""
        if ($null -ne $element) {
            $current = Get-ElementValue $element
        }
        [void][OCUWin32]::SendMessage($hwnd, $WM_SETTEXT, [IntPtr]::Zero, ($current + $text))
        return $true
    } catch {
        return $false
    }
}

function Get-VirtualKey([string]$key) {
    $normalized = $key.Trim().ToLowerInvariant()
    $map = @{
        "return" = 0x0D; "enter" = 0x0D; "tab" = 0x09; "escape" = 0x1B; "esc" = 0x1B
        "backspace" = 0x08; "back_space" = 0x08; "delete" = 0x2E; "space" = 0x20
        "left" = 0x25; "up" = 0x26; "right" = 0x27; "down" = 0x28
        "home" = 0x24; "end" = 0x23; "insert" = 0x2D
        "page_up" = 0x21; "pageup" = 0x21; "prior" = 0x21
        "page_down" = 0x22; "pagedown" = 0x22; "next" = 0x22
        "period" = 0xBE; "decimal" = 0xBE; "comma" = 0xBC; "slash" = 0xBF
        "semicolon" = 0xBA; "apostrophe" = 0xDE; "minus" = 0xBD; "equal" = 0xBB
        "bracketleft" = 0xDB; "bracketright" = 0xDD; "backslash" = 0xDC; "grave" = 0xC0
        "kp_add" = 0x6B; "numpad_add" = 0x6B; "kp_subtract" = 0x6D; "numpad_subtract" = 0x6D
        "kp_multiply" = 0x6A; "numpad_multiply" = 0x6A; "kp_divide" = 0x6F; "numpad_divide" = 0x6F
        "kp_decimal" = 0x6E; "numpad_decimal" = 0x6E; "kp_enter" = 0x0D; "numpad_enter" = 0x0D
    }
    if ($map.ContainsKey($normalized)) {
        return $map[$normalized]
    }
    if ($normalized -match "^f([1-9]|1[0-2])$") {
        return 0x70 + [int]$Matches[1] - 1
    }
    if ($normalized -match "^(?:kp_|numpad_?)([0-9])$") {
        return 0x60 + [int]$Matches[1]
    }
    if ($normalized.Length -eq 1) {
        $code = [int][char]$normalized.ToUpperInvariant()[0]
        if (($code -ge 0x30 -and $code -le 0x39) -or ($code -ge 0x41 -and $code -le 0x5A)) {
            return $code
        }
    }
    throw "Unsupported key: $key"
}

function Test-ExtendedVirtualKey([string]$key, [int]$virtualKey) {
    $normalized = $key.Trim().ToLowerInvariant()
    if ($normalized -in @("kp_enter", "numpad_enter", "kp_divide", "numpad_divide")) {
        return $true
    }
    return $virtualKey -in @(0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B, 0x5C, 0xA3, 0xA5)
}

function Get-ModifierKeySpec([string]$key) {
    $normalized = $key.Trim().ToLowerInvariant()
    switch ($normalized) {
        { $_ -in @("ctrl", "control", "ctrl_l", "control_l") } { return [pscustomobject]@{ virtualKey = 0xA2; extended = $false } }
        { $_ -in @("ctrl_r", "control_r") } { return [pscustomobject]@{ virtualKey = 0xA3; extended = $true } }
        { $_ -in @("shift", "shift_l") } { return [pscustomobject]@{ virtualKey = 0xA0; extended = $false } }
        "shift_r" { return [pscustomobject]@{ virtualKey = 0xA1; extended = $false } }
        { $_ -in @("alt", "alt_l", "menu", "menu_l") } { return [pscustomobject]@{ virtualKey = 0xA4; extended = $false } }
        { $_ -in @("alt_r", "menu_r") } { return [pscustomobject]@{ virtualKey = 0xA5; extended = $true } }
        { $_ -in @("super", "win", "cmd", "super_l", "win_l") } { return [pscustomobject]@{ virtualKey = 0x5B; extended = $true } }
        { $_ -in @("super_r", "win_r") } { return [pscustomobject]@{ virtualKey = 0x5C; extended = $true } }
        default { throw "Unsupported modifier key: $key" }
    }
}

function Send-Key([IntPtr]$hwnd, [string]$key) {
    $parts = $key -split "\+"
    $main = $parts[$parts.Length - 1]
    $modifiers = @()
    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
        $modifiers += (Get-ModifierKeySpec $parts[$i]).virtualKey
    }
    foreach ($modifier in $modifiers) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$modifier, [IntPtr]::Zero)
    }
    $vk = Get-VirtualKey $main
    [void][OCUWin32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$vk, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 25
    [void][OCUWin32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$vk, [IntPtr]::Zero)
    [array]::Reverse($modifiers)
    foreach ($modifier in $modifiers) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$modifier, [IntPtr]::Zero)
    }
}

function Test-ForegroundInputEnabled {
    # Background window-message delivery (PostMessage) is ignored by raw-input apps
    # such as Blender; the foreground policy restores/focuses the target window and
    # delivers real SendInput mouse/keyboard events instead.
    $value = [Environment]::GetEnvironmentVariable("KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $false
    }
    return ("foreground" -ieq $value.Trim())
}

$script:RealInputLoaded = $false
$script:RealInputLastError = ""
$script:VisualFeedback = $null

function Initialize-RealInputTypes {
    if ($script:RealInputLoaded) {
        return $true
    }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class OCUInput {
    // Self-contained POINT: this Add-Type block compiles into its own assembly and
    // cannot reference OCUWin32 types from the earlier block.
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const uint MOUSEEVENTF_HWHEEL = 0x1000;
    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;
    public const uint KEYEVENTF_SCANCODE = 0x0008;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint keyCode, uint mapType);

    public static POINT CursorPosition() {
        POINT p;
        GetCursorPos(out p);
        return p;
    }

    private static void SendChecked(INPUT[] inputs, string action) {
        uint inserted = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (inserted != (uint)inputs.Length) {
            int error = Marshal.GetLastWin32Error();
            throw new InvalidOperationException(
                action + " SendInput inserted " + inserted + "/" + inputs.Length + " events (Win32 error " + error + ")."
            );
        }
    }

    public static void SendMouse(uint flags, uint wheelDelta) {
        var input = new INPUT[1];
        input[0].type = 0;
        input[0].u.mi.dwFlags = flags;
        input[0].u.mi.mouseData = wheelDelta;
        SendChecked(input, "mouse");
    }

    public static void SendChar(char c) {
        var pair = new INPUT[2];
        pair[0].type = 1;
        pair[0].u.ki.wScan = c;
        pair[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
        pair[1].type = 1;
        pair[1].u.ki.wScan = c;
        pair[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        SendChecked(pair, "unicode keyboard");
    }

    public static void SendKeyFull(ushort vk, bool up, bool extended) {
        var input = new INPUT[1];
        input[0].type = 1;
        input[0].u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        input[0].u.ki.dwFlags = KEYEVENTF_SCANCODE;
        if (up) input[0].u.ki.dwFlags |= KEYEVENTF_KEYUP;
        if (extended) input[0].u.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
        SendChecked(input, "scan-code keyboard");
    }
}

public static class OCUWindow {
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    // SetForegroundWindow alone fails when the caller does not own the foreground;
    // attaching the input queues of both threads mirrors what window managers do.
    public static bool EnsureForeground(IntPtr hwnd) {
        if (hwnd == IntPtr.Zero) {
            return false;
        }
        if (IsIconic(hwnd)) {
            ShowWindow(hwnd, 9);
        }
        IntPtr fg = GetForegroundWindow();
        if (fg == hwnd) {
            return true;
        }
        uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, IntPtr.Zero) : 0;
        uint thisThread = GetCurrentThreadId();
        uint targetThread = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
        if (fgThread != 0 && fgThread != thisThread) {
            AttachThreadInput(thisThread, fgThread, true);
        }
        if (targetThread != 0 && targetThread != thisThread) {
            AttachThreadInput(thisThread, targetThread, true);
        }
        BringWindowToTop(hwnd);
        bool attached = SetForegroundWindow(hwnd);
        if (fgThread != 0 && fgThread != thisThread) {
            AttachThreadInput(thisThread, fgThread, false);
        }
        if (targetThread != 0 && targetThread != thisThread) {
            AttachThreadInput(thisThread, targetThread, false);
        }
        return attached;
    }
}

public class OCUOverlayForm : Form {
    private const int WM_NCHITTEST = 0x0084;
    private const uint ULW_ALPHA = 0x00000002;
    private const byte AC_SRC_OVER = 0x00;
    private const byte AC_SRC_ALPHA = 0x01;
    private static readonly IntPtr HTTRANSPARENT = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential)]
    private struct LayeredPoint {
        public int X;
        public int Y;
        public LayeredPoint(int x, int y) { X = x; Y = y; }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LayeredSize {
        public int Width;
        public int Height;
        public LayeredSize(int width, int height) { Width = width; Height = height; }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct BlendFunction {
        public byte BlendOp;
        public byte BlendFlags;
        public byte SourceConstantAlpha;
        public byte AlphaFormat;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UpdateLayeredWindow(
        IntPtr hwnd,
        IntPtr destinationDC,
        ref LayeredPoint destination,
        ref LayeredSize size,
        IntPtr sourceDC,
        ref LayeredPoint source,
        uint colorKey,
        ref BlendFunction blend,
        uint flags
    );
    [DllImport("user32.dll")]
    private static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr dc, IntPtr value);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr value);

    public OCUOverlayForm() {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        // 不设置 Form.TopMost：WinForms 在创建同线程句柄时会用激活式 SetWindowPos。
        // 置顶只由 CreateParams 与 Present 的 SWP_NOACTIVATE 原生路径负责。
        Size = new Size(96, 96);
    }

    protected override bool ShowWithoutActivation {
        get { return true; }
    }

    protected override CreateParams CreateParams {
        get {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x8 | 0x20 | 0x80 | 0x00080000 | 0x08000000; // TOPMOST | TRANSPARENT | TOOLWINDOW | LAYERED | NOACTIVATE
            return cp;
        }
    }

    protected override void WndProc(ref Message message) {
        if (message.Msg == WM_NCHITTEST) {
            // 可视光标只做展示。显式返回 HTTRANSPARENT，避免目标点正下方的浮层
            // 截走 Blender 等应用必须收到的真实 mouse-down。
            message.Result = HTTRANSPARENT;
            return;
        }
        base.WndProc(ref message);
    }

    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        // 原生截图由屏幕像素采集，排除展示窗口可避免指针/高亮污染后续观察。
        SetWindowDisplayAffinity(Handle, 0x11);
    }

    [DllImport("user32.dll")]
    private static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);
    [DllImport("dwmapi.dll")]
    public static extern int DwmFlush();
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    public bool IsPresented { get { return IsHandleCreated && IsWindowVisible(Handle); } }

    public void Present() {
        // Form.Show 首次显示时仍可能激活同线程窗口；原生 SWP_NOACTIVATE 保证焦点不变。
        SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x53); // NOSIZE | NOMOVE | NOACTIVATE | SHOWWINDOW
    }

    public void Conceal() {
        if (IsHandleCreated) SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x97); // NOSIZE | NOMOVE | NOZORDER | NOACTIVATE | HIDEWINDOW
    }

    public static readonly Color Accent = Color.FromArgb(83, 157, 255);
    public static readonly Color AccentEnd = Color.FromArgb(150, 123, 247);
    public float VisualScale = 1;
    public int Hotspot { get { return (int)Math.Round(40 * VisualScale); } }

    public Bitmap CreateFeedbackFrame(double progress) {
        int side = (int)Math.Ceiling(96 * VisualScale);
        var bitmap = new Bitmap(side, side, PixelFormat.Format32bppPArgb);
        progress = Math.Max(0, Math.Min(1, progress));
        using (var graphics = Graphics.FromImage(bitmap)) {
            graphics.Clear(Color.Transparent);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.ScaleTransform(VisualScale, VisualScale);
            // 静止时仍保留可辨认的箭头与柔光；旧实现只显示短环，移动阶段不可见。
            using (var fogPath = new GraphicsPath()) {
                fogPath.AddEllipse(6, 6, 80, 80);
                using (var fog = new PathGradientBrush(fogPath)) {
                    fog.CenterColor = Color.FromArgb(104, Accent);
                    fog.SurroundColors = new Color[] { Color.Transparent };
                    graphics.FillPath(fog, fogPath);
                }
            }
            if (progress < 1) {
                float eased = 1f - (float)Math.Pow(1 - progress, 3);
                float radius = 9f + 16f * eased;
                int alpha = (int)Math.Round(210 * Math.Pow(1 - progress, 1.55));
                using (var accent = new Pen(Color.FromArgb(alpha, Accent), 2f)) {
                    graphics.DrawEllipse(accent, 40 - radius, 40 - radius, radius * 2, radius * 2);
                }
            }
            // 路径首点就是注入坐标；点击脉冲不缩放或平移热点。
            using (var pointer = new GraphicsPath()) {
                pointer.AddPolygon(new PointF[] {
                    new PointF(40, 40), new PointF(46, 59), new PointF(50, 52),
                    new PointF(58, 49), new PointF(40, 40)
                });
                using (var outline = new Pen(Color.FromArgb(245, 248, 250, 255), 2.2f))
                using (var fill = new SolidBrush(Color.FromArgb(255, 38, 42, 49))) {
                    outline.LineJoin = LineJoin.Round;
                    graphics.DrawPath(outline, pointer);
                    graphics.FillPath(fill, pointer);
                }
            }
        }
        return bitmap;
    }

    public void RenderFeedback(double progress) {
        using (var bitmap = CreateFeedbackFrame(progress)) {
            UpdateSurface(bitmap);
        }
    }

    public void ClearFeedback() {
        RenderFeedback(1);
    }

    public Bitmap CreateTargetFrame(int width, int height) {
        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppPArgb);
        float inset = 7 * VisualScale;
        float radius = Math.Min(10 * VisualScale, Math.Min(width, height) / 4f);
        var rect = new RectangleF(inset, inset, width - 2 * inset - 1, height - 2 * inset - 1);
        using (var graphics = Graphics.FromImage(bitmap))
        using (var path = new GraphicsPath()) {
            graphics.Clear(Color.Transparent);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            path.AddArc(rect.Left, rect.Top, radius * 2, radius * 2, 180, 90);
            path.AddArc(rect.Right - radius * 2, rect.Top, radius * 2, radius * 2, 270, 90);
            path.AddArc(rect.Right - radius * 2, rect.Bottom - radius * 2, radius * 2, radius * 2, 0, 90);
            path.AddArc(rect.Left, rect.Bottom - radius * 2, radius * 2, radius * 2, 90, 90);
            path.CloseFigure();
            // 中心完全透明；宽而低透明度的描边提供柔光，细描边界定工作区域。
            for (int spread = 6; spread >= 2; spread -= 2) {
                using (var glow = new Pen(Color.FromArgb(12, Accent), spread * 2 * VisualScale)) {
                    graphics.DrawPath(glow, path);
                }
            }
            using (var gradient = new LinearGradientBrush(rect, Accent, AccentEnd, 35f))
            using (var edge = new Pen(gradient, 2 * VisualScale)) {
                graphics.DrawPath(edge, path);
            }
        }
        return bitmap;
    }

    public void RenderTarget(int width, int height) {
        using (var bitmap = CreateTargetFrame(width, height)) { UpdateSurface(bitmap); }
    }

    private void UpdateSurface(Bitmap bitmap) {
        Size = bitmap.Size;
        IntPtr screenDC = GetDC(IntPtr.Zero);
        IntPtr memoryDC = CreateCompatibleDC(screenDC);
        IntPtr bitmapHandle = IntPtr.Zero;
        IntPtr previousBitmap = IntPtr.Zero;
        try {
            bitmapHandle = bitmap.GetHbitmap(Color.FromArgb(0));
            previousBitmap = SelectObject(memoryDC, bitmapHandle);
            var destination = new LayeredPoint(Left, Top);
            var source = new LayeredPoint(0, 0);
            var size = new LayeredSize(bitmap.Width, bitmap.Height);
            var blend = new BlendFunction {
                BlendOp = AC_SRC_OVER,
                BlendFlags = 0,
                SourceConstantAlpha = 255,
                AlphaFormat = AC_SRC_ALPHA
            };
            if (!UpdateLayeredWindow(Handle, screenDC, ref destination, ref size, memoryDC, ref source, 0, ref blend, ULW_ALPHA)) {
                throw new InvalidOperationException("visual feedback UpdateLayeredWindow failed with Win32 error " + Marshal.GetLastWin32Error() + ".");
            }
        } finally {
            if (previousBitmap != IntPtr.Zero) SelectObject(memoryDC, previousBitmap);
            if (bitmapHandle != IntPtr.Zero) DeleteObject(bitmapHandle);
            if (memoryDC != IntPtr.Zero) DeleteDC(memoryDC);
            if (screenDC != IntPtr.Zero) ReleaseDC(IntPtr.Zero, screenDC);
        }
    }
}

// 仅持有派生展示状态；不参与输入 admission、窗口路由或重试。
public sealed class OCUVisualFeedback : IDisposable {
    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT rect, int size);
    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    public readonly OCUOverlayForm Cursor = new OCUOverlayForm();
    public readonly OCUOverlayForm Target = new OCUOverlayForm();
    private IntPtr target;
    private Rectangle bounds;
    private OCUInput.POINT hotspot;
    private bool hasCursor;
    private bool suspended;
    private long lastActivity;
    public bool IsActive { get { return target != IntPtr.Zero; } }
    public string LastDismissalReason { get; private set; }

    public void Begin(IntPtr hwnd) {
        if (target != hwnd) { Reset(); target = hwnd; }
        LastDismissalReason = null;
        lastActivity = System.Diagnostics.Stopwatch.GetTimestamp();
        RefreshTarget();
        Tick();
    }

    private void RefreshTarget() {
        RECT rect;
        // 新创建的窗口在首个合成帧前可能返回空的 DWM 边界，原生窗口矩形仍然有效。
        int result = DwmGetWindowAttribute(target, 9, out rect, Marshal.SizeOf(typeof(RECT)));
        if (result != 0 || rect.Right <= rect.Left || rect.Bottom <= rect.Top) {
            if (!GetWindowRect(target, out rect)) { Reset(); return; }
        }
        float scale = Math.Max(1, GetDpiForWindow(target) / 96f);
        int inset = (int)Math.Ceiling(7 * scale);
        var next = Rectangle.FromLTRB(rect.Left - inset, rect.Top - inset, rect.Right + inset, rect.Bottom + inset);
        if (next.Width <= inset * 2 || next.Height <= inset * 2) { Reset(); return; }
        if (next != bounds || Target.VisualScale != scale) {
            bounds = next;
            Target.VisualScale = scale;
            Cursor.VisualScale = scale;
            Target.Location = bounds.Location;
            Target.RenderTarget(bounds.Width, bounds.Height);
            if (hasCursor) Move(hotspot.X, hotspot.Y);
        }
        if (!suspended && !Target.IsPresented) Target.Present();
    }

    public void Move(int x, int y) {
        if (!IsActive) return;
        hotspot.X = x; hotspot.Y = y;
        hasCursor = true;
        Cursor.Location = new Point(x - Cursor.Hotspot, y - Cursor.Hotspot);
        Cursor.ClearFeedback();
        if (!suspended) Cursor.Present();
    }

    public void Pulse(double progress) {
        if (IsActive && hasCursor && !suspended) Cursor.RenderFeedback(progress);
    }

    public void Tick() {
        if (!IsActive) return;
        double elapsed = (System.Diagnostics.Stopwatch.GetTimestamp() - lastActivity) / (double)System.Diagnostics.Stopwatch.Frequency;
        var actual = OCUInput.CursorPosition();
        string reason = elapsed >= 30 ? "expired"
            : !IsWindow(target) || !IsWindowVisible(target) || OCUWindow.IsIconic(target) ? "window"
            : OCUWindow.GetForegroundWindow() != target ? "focus"
            : hasCursor && (Math.Abs(actual.X - hotspot.X) > 3 || Math.Abs(actual.Y - hotspot.Y) > 3) ? "pointer" : null;
        if (reason != null) {
            Reset(); LastDismissalReason = reason; return;
        }
        RefreshTarget();
    }

    public void Suspend() {
        suspended = true;
        Cursor.Conceal(); Target.Conceal();
        // 等合成器提交隐藏帧再读取屏幕，不用固定延时猜测截图时序。
        OCUOverlayForm.DwmFlush();
    }

    public void Resume() {
        suspended = false;
        Tick();
        if (IsActive && hasCursor) Cursor.Present();
    }

    public void Reset() {
        target = IntPtr.Zero; hasCursor = false; bounds = Rectangle.Empty;
        Cursor.Conceal(); Target.Conceal();
    }

    public void Dispose() { Reset(); Cursor.Dispose(); Target.Dispose(); }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing
        $script:RealInputLoaded = $true
    } catch {
        $script:RealInputLastError = $_.Exception.Message
        $script:RealInputLoaded = $false
    }
    return $script:RealInputLoaded
}

function Initialize-RealInputSupport {
    if (-not (Initialize-RealInputTypes)) {
        # foreground 策略是用户/插件显式选择的真实输入模式：支持代码加载失败时必须
        # 报错而不是静默降级——PostMessage 回退在 Blender 类 app 上等于什么都不做。
        throw "Windows foreground input support failed to load: $script:RealInputLastError"
    }
    return $true
}

function Enable-WindowForInput([IntPtr]$hwnd) {
    if (-not (Initialize-RealInputSupport)) {
        return $false
    }
    [void][OCUWindow]::EnsureForeground($hwnd)
    Start-Sleep -Milliseconds 120
    $foreground = [OCUWindow]::GetForegroundWindow()
    if ($foreground -ne $hwnd) {
        # Blender 等 raw-input app 只消费真正前台窗口的键鼠事件。校验失败时继续
        # SendInput 会把动作送给别的应用，因此这里必须 fail closed。
        throw "Unable to foreground target window $hwnd; current foreground window is $foreground."
    }
    if (Test-VisualCursorEnabled) {
        try {
            if ($null -eq $script:VisualFeedback) { $script:VisualFeedback = New-Object OCUVisualFeedback }
            $script:VisualFeedback.Begin($hwnd)
        } catch {
            # 展示不能改变已验证的输入路由，也不能触发真实动作重放。
            Close-VisualFeedback
        }
    } else {
        Close-VisualFeedback
    }
    return $true
}

function Test-VisualCursorEnabled {
    return (-not (Test-EnvFlagEnabled "KAYING_COMPUTER_USE_WINDOWS_DISABLE_VISUAL_CURSOR"))
}

function Show-VisualCursor([int]$x, [int]$y) {
    if ($null -ne $script:VisualFeedback) {
        try { $script:VisualFeedback.Move($x, $y) } catch { Close-VisualFeedback }
    }
}

function Close-VisualFeedback {
    if ($null -ne $script:VisualFeedback) {
        try { $script:VisualFeedback.Dispose() } catch {}
        $script:VisualFeedback = $null
    }
}

function Update-VisualFeedback {
    if ($null -ne $script:VisualFeedback) {
        try {
            if (-not (Test-VisualCursorEnabled)) { Close-VisualFeedback; return }
            $script:VisualFeedback.Tick()
            [System.Windows.Forms.Application]::DoEvents()
        } catch { Close-VisualFeedback }
    }
}

function Move-VisualCursorTo([int]$x, [int]$y) {
    $from = [OCUInput]::CursorPosition()
    $distance = [math]::Sqrt([math]::Pow($x - $from.X, 2) + [math]::Pow($y - $from.Y, 2))
    if ($distance -lt 2 -or -not [System.Windows.Forms.SystemInformation]::IsClientAreaAnimationEnabled) {
        Show-VisualCursor $x $y
        [void][OCUInput]::SetCursorPos($x, $y)
        return
    }
    Show-VisualCursor $from.X $from.Y
    $steps = [math]::Min(24, [math]::Max(6, [int]($distance / 40)))
    for ($i = 1; $i -le $steps; $i++) {
        $t = $i / $steps
        $eased = 1 - [math]::Pow(1 - $t, 3)
        $cx = [int][math]::Round($from.X + ($x - $from.X) * $eased)
        $cy = [int][math]::Round($from.Y + ($y - $from.Y) * $eased)
        [void][OCUInput]::SetCursorPos($cx, $cy)
        Show-VisualCursor $cx $cy
        Start-Sleep -Milliseconds 14
    }
}

function Pulse-VisualCursor {
    if ($null -eq $script:VisualFeedback) {
        return
    }
    try {
        # 尊重系统减少动画偏好；动作完成后保留静态指针，而不是隐藏全部反馈。
        if ([System.Windows.Forms.SystemInformation]::IsClientAreaAnimationEnabled) {
            for ($i = 0; $i -le 9; $i++) {
                $script:VisualFeedback.Pulse($i / 9.0)
                [System.Windows.Forms.Application]::DoEvents()
                Start-Sleep -Milliseconds 20
            }
        }
        $script:VisualFeedback.Pulse(1)
    } catch {
        Close-VisualFeedback
    }
    Update-VisualFeedback
}

function Invoke-RealMouseClick([int]$screenX, [int]$screenY, [string]$button, [int]$count) {
    Move-VisualCursorTo $screenX $screenY
    $down = [OCUInput]::MOUSEEVENTF_LEFTDOWN
    $up = [OCUInput]::MOUSEEVENTF_LEFTUP
    if ($button -eq "right") {
        $down = [OCUInput]::MOUSEEVENTF_RIGHTDOWN
        $up = [OCUInput]::MOUSEEVENTF_RIGHTUP
    } elseif ($button -eq "middle") {
        $down = [OCUInput]::MOUSEEVENTF_MIDDLEDOWN
        $up = [OCUInput]::MOUSEEVENTF_MIDDLEUP
    }
    $repeat = [math]::Max(1, $count)
    for ($i = 0; $i -lt $repeat; $i++) {
        $buttonDown = $false
        try {
            [OCUInput]::SendMouse($down, 0)
            $buttonDown = $true
            Start-Sleep -Milliseconds 35
            [OCUInput]::SendMouse($up, 0)
            $buttonDown = $false
            Start-Sleep -Milliseconds 50
        } finally {
            if ($buttonDown) {
                try { [OCUInput]::SendMouse($up, 0) } catch {}
            }
        }
    }
    Pulse-VisualCursor
}

function Invoke-RealDrag([int]$fromX, [int]$fromY, [int]$toX, [int]$toY) {
    Move-VisualCursorTo $fromX $fromY
    $buttonDown = $false
    try {
        [OCUInput]::SendMouse([OCUInput]::MOUSEEVENTF_LEFTDOWN, 0)
        $buttonDown = $true
        Start-Sleep -Milliseconds 90
        $steps = 14
        for ($i = 1; $i -le $steps; $i++) {
            $t = $i / $steps
            $cx = [int][math]::Round($fromX + ($toX - $fromX) * $t)
            $cy = [int][math]::Round($fromY + ($toY - $fromY) * $t)
            [void][OCUInput]::SetCursorPos($cx, $cy)
            Show-VisualCursor $cx $cy
            Start-Sleep -Milliseconds 24
        }
        Start-Sleep -Milliseconds 60
        [OCUInput]::SendMouse([OCUInput]::MOUSEEVENTF_LEFTUP, 0)
        $buttonDown = $false
    } finally {
        if ($buttonDown) {
            try { [OCUInput]::SendMouse([OCUInput]::MOUSEEVENTF_LEFTUP, 0) } catch {}
        }
    }
    Pulse-VisualCursor
}

function Invoke-RealWheel([int]$screenX, [int]$screenY, [string]$direction, [double]$pages) {
    Move-VisualCursorTo $screenX $screenY
    $flags = [OCUInput]::MOUSEEVENTF_WHEEL
    if ($direction -eq "left" -or $direction -eq "right") {
        $flags = [OCUInput]::MOUSEEVENTF_HWHEEL
    }
    $delta = [int][math]::Round(120 * $pages)
    if ($direction -eq "down" -or $direction -eq "right") {
        $delta = -$delta
    }
    [void][OCUInput]::SendMouse($flags, [uint32]($delta -band 0xFFFFFFFF))
    Pulse-VisualCursor
}

function Invoke-RealTypeText([string]$text) {
    foreach ($char in $text.ToCharArray()) {
        if ($char -eq [char]10 -or $char -eq [char]13) {
            $enterDown = $false
            try {
                [OCUInput]::SendKeyFull(0x0D, $false, $false)
                $enterDown = $true
                Start-Sleep -Milliseconds 8
                [OCUInput]::SendKeyFull(0x0D, $true, $false)
                $enterDown = $false
            } finally {
                if ($enterDown) {
                    try { [OCUInput]::SendKeyFull(0x0D, $true, $false) } catch {}
                }
            }
        } else {
            [OCUInput]::SendChar($char)
        }
        Start-Sleep -Milliseconds 5
    }
}

function Invoke-RealKey([string]$key) {
    $parts = $key -split "\+"
    $main = $parts[$parts.Length - 1].Trim()
    $modifiers = @()
    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
        $modifiers += (Get-ModifierKeySpec $parts[$i])
    }
    $vk = Get-VirtualKey $main
    $mainExtended = Test-ExtendedVirtualKey $main $vk
    $pressedModifiers = New-Object System.Collections.Generic.List[object]
    $mainDown = $false
    try {
        foreach ($modifier in $modifiers) {
            [OCUInput]::SendKeyFull([int]$modifier.virtualKey, $false, [bool]$modifier.extended)
            $pressedModifiers.Add($modifier)
        }
        [OCUInput]::SendKeyFull($vk, $false, $mainExtended)
        $mainDown = $true
        Start-Sleep -Milliseconds 25
        [OCUInput]::SendKeyFull($vk, $true, $mainExtended)
        $mainDown = $false
    } finally {
        if ($mainDown) {
            try { [OCUInput]::SendKeyFull($vk, $true, $mainExtended) } catch {}
        }
        $pressed = $pressedModifiers.ToArray()
        [array]::Reverse($pressed)
        foreach ($modifier in $pressed) {
            try { [OCUInput]::SendKeyFull([int]$modifier.virtualKey, $true, [bool]$modifier.extended) } catch {}
        }
    }
}

function Resolve-App([string]$query) {
    $normalized = $query.Trim()
    $processQuery = $normalized
    if ($processQuery.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
        $processQuery = $processQuery.Substring(0, $processQuery.Length - 4)
    }
    $processes = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
    $pidValue = 0
    if ([int]::TryParse($normalized, [ref]$pidValue)) {
        $match = $processes | Where-Object { $_.Id -eq $pidValue } | Select-Object -First 1
        if ($null -ne $match) {
            return $match
        }
    }

    $match = $processes | Where-Object {
        $_.ProcessName -ieq $processQuery -or
        "$($_.ProcessName).exe" -ieq $normalized -or
        $_.MainWindowTitle -ieq $normalized -or
        $_.MainWindowTitle -ilike "*$normalized*"
    } | Select-Object -First 1
    if ($null -ne $match) {
        return $match
    }

    if (Test-EnvFlagEnabled "KAYING_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH") {
        try {
            $started = Start-Process -FilePath $normalized -PassThru
            for ($i = 0; $i -lt 20; $i++) {
                Start-Sleep -Milliseconds 250
                $candidate = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
                if ($null -ne $candidate -and $candidate.MainWindowHandle -ne 0) {
                    return $candidate
                }
            }
        } catch {
        }
    }

    throw "appNotFound(`"$query`")"
}

function Get-MainElement($process) {
    if ($process.MainWindowHandle -ne 0) {
        return [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$process.MainWindowHandle)
    }
    $condition = New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ProcessIdProperty), $process.Id
    $children = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, $condition)
    if ($children.Count -gt 0) {
        return $children.Item(0)
    }
    throw "No top-level UI Automation window is available for $($process.ProcessName). Run the Windows runtime in the signed-in desktop session."
}

function Get-WindowBounds($process, $element) {
    $hwnd = [IntPtr]$process.MainWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
        $fromWin32 = Get-WindowRectFrame $hwnd
        if ($null -ne $fromWin32) {
            return $fromWin32
        }
    }
    try {
        $rect = $element.Current.BoundingRectangle
        if (-not $rect.IsEmpty -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
            return New-Frame $rect.X $rect.Y $rect.Width $rect.Height
        }
    } catch {
    }
    return $null
}

function Get-PatternNames($element) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($pattern in $element.GetSupportedPatterns()) {
        $programmatic = $pattern.ProgrammaticName
        if ($programmatic -like "InvokePatternIdentifiers.Pattern") { $names.Add("Invoke") }
        elseif ($programmatic -like "TogglePatternIdentifiers.Pattern") { $names.Add("Toggle") }
        elseif ($programmatic -like "SelectionItemPatternIdentifiers.Pattern") { $names.Add("Select") }
        elseif ($programmatic -like "ExpandCollapsePatternIdentifiers.Pattern") {
            try {
                $state = $element.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Current.ExpandCollapseState
                if ($state -eq [Windows.Automation.ExpandCollapseState]::Collapsed) { $names.Add("Expand") }
                elseif ($state -eq [Windows.Automation.ExpandCollapseState]::Expanded) { $names.Add("Collapse") }
            } catch {
                $names.Add("Expand")
                $names.Add("Collapse")
            }
        }
        elseif ($programmatic -like "ScrollItemPatternIdentifiers.Pattern") { $names.Add("ScrollIntoView") }
        elseif ($programmatic -like "ScrollPatternIdentifiers.Pattern") { $names.Add("Scroll") }
        elseif ($programmatic -like "ValuePatternIdentifiers.Pattern") { $names.Add("SetValue") }
    }
    if ($names.Count -gt 0) {
        return @($names | Select-Object -Unique)
    }
    return @()
}

function Get-ElementString($element, [string]$propertyName) {
    try {
        $value = $element.Current.$propertyName
        if ($null -eq $value) {
            return ""
        }
        return [string]$value
    } catch {
        return ""
    }
}

function Get-ElementInt64($element, [string]$propertyName) {
    try {
        return [int64]$element.Current.$propertyName
    } catch {
        return 0
    }
}

function Get-ElementControlTypeName($element) {
    try {
        $controlType = $element.Current.ControlType
        if ($null -eq $controlType) {
            return ""
        }
        return [string]$controlType.ProgrammaticName
    } catch {
        return ""
    }
}

function Get-ElementValue($element) {
    try {
        $valuePattern = $element.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
        $value = $valuePattern.Current.Value
        if ($null -eq $value) {
            return ""
        }
        $text = [string]$value
        if ($text.Length -gt 500) {
            return $text.Substring(0, 500)
        }
        return $text
    } catch {
        return ""
    }
}

function Get-ElementRecord($element, [int]$index, $windowBounds) {
    $frame = Get-ElementFrame $element $windowBounds
    $runtimeId = @()
    try { $runtimeId = @($element.GetRuntimeId()) } catch {}
    [pscustomobject]@{
        index = $index
        runtimeId = $runtimeId
        automationId = Get-ElementString $element "AutomationId"
        name = Get-ElementString $element "Name"
        controlType = Get-ElementControlTypeName $element
        localizedControlType = Get-ElementString $element "LocalizedControlType"
        className = Get-ElementString $element "ClassName"
        value = Get-ElementValue $element
        nativeWindowHandle = Get-ElementInt64 $element "NativeWindowHandle"
        frame = $frame
        actions = @(Get-PatternNames $element)
    }
}

function Get-ElementTitle($record) {
    if (-not [string]::IsNullOrWhiteSpace($record.name)) {
        return $record.name
    }
    if (-not [string]::IsNullOrWhiteSpace($record.automationId)) {
        return "ID: $($record.automationId)"
    }
    return ""
}

function Render-Tree($element, $windowBounds) {
    $records = New-Object System.Collections.Generic.List[object]
    $lines = New-Object System.Collections.Generic.List[string]
    $visited = New-Object System.Collections.Generic.HashSet[string]
    $nextIndex = 0

    function Visit($node, [int]$depth) {
        if ($script:nextIndex -ge 500 -or $depth -gt 16) {
            return
        }
        $runtime = ""
        try { $runtime = (@($node.GetRuntimeId()) -join ".") } catch { $runtime = [guid]::NewGuid().ToString() }
        if (-not $script:visited.Add($runtime)) {
            return
        }

        $index = $script:nextIndex
        $script:nextIndex++
        $record = Get-ElementRecord $node $index $script:windowBounds
        $script:records.Add($record)

        $role = $record.localizedControlType
        if ([string]::IsNullOrWhiteSpace($role)) {
            $role = $record.controlType
        }
        $title = Get-ElementTitle $record
        $actionsSegment = ""
        if ($record.actions.Count -gt 0) {
            $actionsSegment = " Secondary Actions: " + ($record.actions -join ", ")
        }
        $valueSegment = ""
        if (-not [string]::IsNullOrWhiteSpace($record.value) -and $record.value -ne $title) {
            $safeValue = (($record.value -replace "`r", "\\r") -replace "`n", "\\n")
            $valueSegment = " Value: $safeValue"
        }
        $frameSegment = ""
        if ($null -ne $record.frame) {
            $frameSegment = " Frame: {{x: {0}, y: {1}, width: {2}, height: {3}}}" -f [int][math]::Round($record.frame.x), [int][math]::Round($record.frame.y), [int][math]::Round($record.frame.width), [int][math]::Round($record.frame.height)
        }
        $script:lines.Add(("`t" * ($depth + 1)) + "$index $role $title$valueSegment$actionsSegment$frameSegment")

        try {
            $children = $node.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
            for ($i = 0; $i -lt $children.Count; $i++) {
                Visit $children.Item($i) ($depth + 1)
            }
        } catch {
        }
    }

    $script:records = $records
    $script:lines = $lines
    $script:visited = $visited
    $script:nextIndex = $nextIndex
    $script:windowBounds = $windowBounds
    Visit $element 0

    [pscustomobject]@{
        records = $records.ToArray()
        lines = $lines.ToArray()
    }
}

function Save-PngBytes($bitmap) {
    $stream = New-Object System.IO.MemoryStream
    try {
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return $stream.ToArray()
    } finally {
        $stream.Dispose()
    }
}

function Capture-BoundedScreenshot($bounds) {
    # Mirrors the macOS constraint pipeline in docs/IMAGE_CAPTURE.md: clamp the long
    # edge to KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION, iterate x0.85 until the PNG
    # fits KAYING_COMPUTER_USE_IMAGE_MAX_BYTES, and never scale below
    # KAYING_COMPUTER_USE_IMAGE_MIN_SCALE. Coordinate actions divide by the returned
    # pixel size (screenshotWidth/screenshotHeight in the snapshot), so downscaling
    # never shifts screenshot-pixel coordinates.
    if ($null -eq $bounds -or $bounds.width -le 0 -or $bounds.height -le 0) {
        return $null
    }
    try {
        if ($null -ne $script:VisualFeedback) { $script:VisualFeedback.Suspend() }
        $maxDimension = Get-EnvNumber "KAYING_COMPUTER_USE_IMAGE_MAX_DIMENSION" 1280 1 ([double]::MaxValue)
        $maxBytes = Get-EnvNumber "KAYING_COMPUTER_USE_IMAGE_MAX_BYTES" 900000 1 ([double]::MaxValue)
        $minScale = Get-EnvNumber "KAYING_COMPUTER_USE_IMAGE_MIN_SCALE" 0.25 0.0001 1

        $source = New-Object System.Drawing.Bitmap ([int][math]::Round($bounds.width)), ([int][math]::Round($bounds.height))
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($source)
            $graphics.CopyFromScreen([int][math]::Round($bounds.x), [int][math]::Round($bounds.y), 0, 0, $source.Size)
            $graphics.Dispose()

            $largestDimension = [math]::Max($source.Width, $source.Height)
            # [double]1 matters: [math]::Min(1, ...) would coerce both arguments to
            # Int32 and turn any fractional scale into 0.
            $scale = [math]::Max([math]::Min([double]1, $maxDimension / $largestDimension), $minScale)
            $best = $null
            while ($true) {
                $candidate = $source
                $width = $source.Width
                $height = $source.Height
                if ($scale -lt 1) {
                    $width = [math]::Max(1, [int][math]::Round($source.Width * $scale))
                    $height = [math]::Max(1, [int][math]::Round($source.Height * $scale))
                    $candidate = New-Object System.Drawing.Bitmap $width, $height
                    $resized = [System.Drawing.Graphics]::FromImage($candidate)
                    $resized.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $resized.DrawImage($source, 0, 0, $width, $height)
                    $resized.Dispose()
                }
                try {
                    $bytes = Save-PngBytes $candidate
                } finally {
                    if ($scale -lt 1) {
                        $candidate.Dispose()
                    }
                }
                $best = [pscustomobject]@{
                    base64 = [Convert]::ToBase64String($bytes)
                    width = $width
                    height = $height
                }
                if ($bytes.Length -le $maxBytes -or $scale -le $minScale) {
                    return $best
                }
                $scale = [math]::Max($scale * 0.85, $minScale)
            }
        } finally {
            $source.Dispose()
        }
    } catch {
        return $null
    } finally {
        if ($null -ne $script:VisualFeedback) {
            try { $script:VisualFeedback.Resume() } catch { Close-VisualFeedback }
        }
    }
}

function ConvertFrom-ScreenshotPoint($x, $y, $screenshotWidth, $screenshotHeight, $windowBounds) {
    # Map screenshot-pixel coordinates (what the model reads off the returned image)
    # back to window-local pixels. With no bounded screenshot (width/height = 0) the
    # mapping is 1:1, matching the pre-bounding behavior.
    $scaleX = 1.0
    $scaleY = 1.0
    if ($screenshotWidth -gt 0 -and $windowBounds.width -gt 0) {
        $scaleX = [double]$screenshotWidth / [double]$windowBounds.width
    }
    if ($screenshotHeight -gt 0 -and $windowBounds.height -gt 0) {
        $scaleY = [double]$screenshotHeight / [double]$windowBounds.height
    }
    [pscustomobject]@{
        x = [double]$x / $scaleX
        y = [double]$y / $scaleY
    }
}

function Get-FocusedSummary($processId) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused -and $focused.Current.ProcessId -eq $processId) {
            $role = $focused.Current.LocalizedControlType
            $name = $focused.Current.Name
            if ([string]::IsNullOrWhiteSpace($name)) {
                return $role
            }
            return "$role $name"
        }
    } catch {
    }
    return $null
}

function Get-SelectedText($processId) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -eq $focused -or $focused.Current.ProcessId -ne $processId) {
            return $null
        }
        $textPattern = $focused.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern)
        $selection = $textPattern.GetSelection()
        if ($selection.Count -gt 0) {
            return $selection.Item(0).GetText(2048)
        }
    } catch {
    }
    return $null
}

function Build-Snapshot([string]$query) {
    $process = Resolve-App $query
    $element = Get-MainElement $process
    $bounds = Get-WindowBounds $process $element
    $rendered = Render-Tree $element $bounds
    $screenshot = Capture-BoundedScreenshot $bounds
    $screenshotBase64 = $null
    $screenshotWidth = 0
    $screenshotHeight = 0
    if ($null -ne $screenshot) {
        $screenshotBase64 = $screenshot.base64
        $screenshotWidth = $screenshot.width
        $screenshotHeight = $screenshot.height
    }
    [pscustomobject]@{
        app = [pscustomobject]@{
            name = $process.ProcessName
            bundleIdentifier = $process.ProcessName
            pid = [int]$process.Id
        }
        windowTitle = $process.MainWindowTitle
        windowBounds = $bounds
        screenshotPngBase64 = $screenshotBase64
        screenshotWidth = $screenshotWidth
        screenshotHeight = $screenshotHeight
        treeLines = @($rendered.lines)
        focusedSummary = Get-FocusedSummary $process.Id
        selectedText = Get-SelectedText $process.Id
        elements = @($rendered.records)
    }
}

function List-Apps {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($process in (Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object ProcessName, Id)) {
        $title = $process.MainWindowTitle
        if ([string]::IsNullOrWhiteSpace($title)) {
            $title = "untitled"
        }
        $lines.Add(("{0} -- {1} [running, pid={2}, window={3}]" -f $process.ProcessName, $process.ProcessName, $process.Id, $title))
    }
    return ($lines -join "`n")
}

function Same-RuntimeId($left, $right) {
    if ($null -eq $left -or $null -eq $right -or $left.Count -ne $right.Count) {
        return $false
    }
    for ($i = 0; $i -lt $left.Count; $i++) {
        if ([int]$left[$i] -ne [int]$right[$i]) {
            return $false
        }
    }
    return $true
}

function Get-AllElements($root) {
    $items = New-Object System.Collections.Generic.List[object]
    $items.Add($root)
    try {
        $descendants = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
        for ($i = 0; $i -lt $descendants.Count; $i++) {
            $items.Add($descendants.Item($i))
        }
    } catch {
    }
    return $items.ToArray()
}

function Find-Element($process, $record) {
    if ($null -eq $record) {
        return $null
    }
    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        try {
            if (Same-RuntimeId @($element.GetRuntimeId()) @($record.runtimeId)) {
                return $element
            }
        } catch {
        }
    }
    foreach ($element in (Get-AllElements $root)) {
        try {
            $sameAutomationId = -not [string]::IsNullOrWhiteSpace($record.automationId) -and $element.Current.AutomationId -eq $record.automationId
            $sameName = -not [string]::IsNullOrWhiteSpace($record.name) -and $element.Current.Name -eq $record.name
            $sameType = $element.Current.ControlType.ProgrammaticName -eq $record.controlType
            if (($sameAutomationId -or $sameName) -and $sameType) {
                return $element
            }
        } catch {
        }
    }
    return $null
}

function Get-CurrentPatternOrNull($element, $pattern) {
    try {
        return $element.GetCurrentPattern($pattern)
    } catch {
        return $null
    }
}

function Invoke-PreferredClick($element) {
    $invoke = Get-CurrentPatternOrNull $element ([Windows.Automation.InvokePattern]::Pattern)
    if ($null -ne $invoke) {
        $invoke.Invoke()
        return $true
    }
    $selection = Get-CurrentPatternOrNull $element ([Windows.Automation.SelectionItemPattern]::Pattern)
    if ($null -ne $selection) {
        $selection.Select()
        return $true
    }
    $toggle = Get-CurrentPatternOrNull $element ([Windows.Automation.TogglePattern]::Pattern)
    if ($null -ne $toggle) {
        $toggle.Toggle()
        return $true
    }
    return $false
}

function Invoke-SecondaryAction($element, [string]$action, [int]$elementIndex) {
    switch ($action.ToLowerInvariant()) {
        "invoke" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.InvokePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Invoke(); return }
        }
        "toggle" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.TogglePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Toggle(); return }
        }
        "select" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.SelectionItemPattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Select(); return }
        }
        "expand" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Expand(); return }
        }
        "collapse" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Collapse(); return }
        }
        "scrollintoview" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ScrollItemPattern]::Pattern)
            if ($null -ne $pattern) { $pattern.ScrollIntoView(); return }
        }
        "setfocus" {
            if (-not (Test-EnvFlagEnabled "KAYING_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS")) {
                throw "SetFocus is disabled by default to avoid stealing user focus; set KAYING_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS=1 to enable it."
            }
            $element.SetFocus()
            return
        }
    }
    throw "$action is not a valid secondary action for $elementIndex"
}

function Invoke-Scroll($element, [string]$direction, [double]$pages) {
    $scroll = Get-CurrentPatternOrNull $element ([Windows.Automation.ScrollPattern]::Pattern)
    if ($null -eq $scroll) {
        return $false
    }
    $horizontal = [Windows.Automation.ScrollAmount]::NoAmount
    $vertical = [Windows.Automation.ScrollAmount]::NoAmount
    if ($direction -eq "up") { $vertical = [Windows.Automation.ScrollAmount]::LargeDecrement }
    elseif ($direction -eq "down") { $vertical = [Windows.Automation.ScrollAmount]::LargeIncrement }
    elseif ($direction -eq "left") { $horizontal = [Windows.Automation.ScrollAmount]::LargeDecrement }
    elseif ($direction -eq "right") { $horizontal = [Windows.Automation.ScrollAmount]::LargeIncrement }
    $repeat = [math]::Max(1, [int][math]::Ceiling($pages))
    for ($i = 0; $i -lt $repeat; $i++) {
        $scroll.Scroll($horizontal, $vertical)
        Start-Sleep -Milliseconds 40
    }
    return $true
}

function Find-TextEntryElement($process) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused -and $focused.Current.ProcessId -eq $process.Id) {
            $focusedValue = Get-CurrentPatternOrNull $focused ([Windows.Automation.ValuePattern]::Pattern)
            if ($null -ne $focusedValue -and -not $focusedValue.Current.IsReadOnly) {
                return $focused
            }
        }
    } catch {
    }

    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -eq $valuePattern -or $valuePattern.Current.IsReadOnly) {
            continue
        }
        $controlType = Get-ElementControlTypeName $element
        if ($controlType -like "*Edit*" -or $controlType -like "*Document*") {
            return $element
        }
    }

    foreach ($element in (Get-AllElements $root)) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            return $element
        }
    }

    return $null
}

function Get-NativeWindowHandle($element) {
    $handle = Get-ElementInt64 $element "NativeWindowHandle"
    if ($handle -le 0) {
        return [IntPtr]::Zero
    }
    return [IntPtr]$handle
}

function Test-TextWindowHandleCandidate($process, $element) {
    if ($null -eq $element) {
        return $false
    }
    $handle = Get-NativeWindowHandle $element
    if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr]$process.MainWindowHandle) {
        return $false
    }
    $controlType = Get-ElementControlTypeName $element
    $className = Get-ElementString $element "ClassName"
    return (
        $controlType -like "*Edit*" -or
        $controlType -like "*Document*" -or
        $className -like "*Edit*" -or
        $className -like "*Rich*" -or
        $className -like "*Text*"
    )
}

function Find-TextEntryWindowHandle($process, $preferredElement) {
    if (Test-TextWindowHandleCandidate $process $preferredElement) {
        return Get-NativeWindowHandle $preferredElement
    }

    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        if (-not (Test-TextWindowHandleCandidate $process $element)) {
            continue
        }
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            return Get-NativeWindowHandle $element
        }
    }

    foreach ($element in (Get-AllElements $root)) {
        if (Test-TextWindowHandleCandidate $process $element) {
            return Get-NativeWindowHandle $element
        }
    }

    return [IntPtr]::Zero
}

function Invoke-TypeText($process, [string]$text) {
    $element = Find-TextEntryElement $process
    $targetHwnd = Find-TextEntryWindowHandle $process $element
    if ($targetHwnd -ne [IntPtr]::Zero -and (Send-TextToEditHandle $targetHwnd $text $element)) {
        return $true
    }

    if ($null -ne $element) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            if (-not (Test-EnvFlagEnabled "KAYING_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK")) {
                throw "UIA ValuePattern text fallback is disabled by default because it may bring the target app to the foreground; set KAYING_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK=1 to enable it."
            }
            $current = ""
            try { $current = [string]$valuePattern.Current.Value } catch {}
            $valuePattern.SetValue($current + $text)
            return $true
        }
    }
    return $false
}

function Invoke-Operation($operation) {
    try {
        if ($operation.tool -eq "turn_ended") {
            Close-VisualFeedback
            return [pscustomobject]@{ ok = $true }
        }
        if (-not (Test-ForegroundInputEnabled)) { Close-VisualFeedback }
        if ($operation.tool -eq "list_apps") {
            return [pscustomobject]@{ ok = $true; text = (List-Apps) }
        } elseif ($operation.tool -eq "get_app_state") {
            return [pscustomobject]@{ ok = $true; snapshot = (Build-Snapshot $operation.app) }
        } else {
            $process = Resolve-App $operation.app
            $hwnd = [IntPtr]$process.MainWindowHandle
            $windowBounds = $operation.windowBounds
            $element = Find-Element $process $operation.element

            switch ($operation.tool) {
                "click" {
                    $useForeground = Test-ForegroundInputEnabled
                    $handled = $false
                    if (-not $useForeground -and $null -ne $element -and $operation.mouse_button -ne "right" -and $operation.mouse_button -ne "middle") {
                        # background 模式保持 UIA Invoke 优先（不打扰前台）；foreground 模式
                        # 必须走真实输入路径，否则用户全程看不到 agent 在操作什么。
                        $handled = Invoke-PreferredClick $element
                    }
                    if (-not $handled) {
                        if ($null -ne $operation.element -and $null -ne $operation.element.frame) {
                            $point = Get-ScreenPoint $operation.element.frame $windowBounds
                        } elseif ($null -ne $operation.x -and $null -ne $operation.y) {
                            $local = ConvertFrom-ScreenshotPoint $operation.x $operation.y $operation.screenshotWidth $operation.screenshotHeight $windowBounds
                            $point = [pscustomobject]@{
                                x = [int][math]::Round($windowBounds.x + $local.x)
                                y = [int][math]::Round($windowBounds.y + $local.y)
                            }
                        } else {
                            $point = $null
                        }
                        if ($null -eq $point) {
                            # 没有可点击坐标（元素无 frame 且未给 x/y）：UIA Invoke 是唯一手段
                            if ($null -ne $element) {
                                $handled = Invoke-PreferredClick $element
                            }
                            if (-not $handled) {
                                throw "click target has no frame and no x/y coordinates"
                            }
                        } elseif ($useForeground -and (Enable-WindowForInput $hwnd)) {
                            Invoke-RealMouseClick $point.x $point.y $operation.mouse_button ([int]$operation.click_count)
                        } else {
                            Send-MouseClick $hwnd $point.x $point.y $operation.mouse_button ([int]$operation.click_count)
                        }
                    }
                }
                "perform_secondary_action" {
                    if ($null -eq $element) { throw "unknown element_index '$($operation.element.index)'" }
                    Invoke-SecondaryAction $element $operation.action $operation.element.index
                }
                "scroll" {
                    $useForeground = Test-ForegroundInputEnabled
                    $handled = $false
                    if (-not $useForeground -and $null -ne $element) {
                        # background 模式 UIA Scroll 优先；foreground 模式真实滚轮优先（可见）
                        $handled = Invoke-Scroll $element $operation.direction ([double]$operation.pages)
                    }
                    if (-not $handled) {
                        $point = Get-ScreenPoint $operation.element.frame $windowBounds
                        if ($null -ne $point -and $useForeground -and (Enable-WindowForInput $hwnd)) {
                            Invoke-RealWheel $point.x $point.y $operation.direction ([double]$operation.pages)
                        } elseif ($null -eq $point -and $null -ne $element) {
                            $handled = Invoke-Scroll $element $operation.direction ([double]$operation.pages)
                            if (-not $handled) {
                                throw "scroll target has no frame and exposes no UIA scroll pattern"
                            }
                        } else {
                            Send-Scroll $hwnd $point.x $point.y $operation.direction ([double]$operation.pages)
                        }
                    }
                }
                "drag" {
                    $from = ConvertFrom-ScreenshotPoint $operation.from_x $operation.from_y $operation.screenshotWidth $operation.screenshotHeight $windowBounds
                    $to = ConvertFrom-ScreenshotPoint $operation.to_x $operation.to_y $operation.screenshotWidth $operation.screenshotHeight $windowBounds
                    $fromX = [int][math]::Round($windowBounds.x + $from.x)
                    $fromY = [int][math]::Round($windowBounds.y + $from.y)
                    $toX = [int][math]::Round($windowBounds.x + $to.x)
                    $toY = [int][math]::Round($windowBounds.y + $to.y)
                    if ((Test-ForegroundInputEnabled) -and (Enable-WindowForInput $hwnd)) {
                        Invoke-RealDrag $fromX $fromY $toX $toY
                    } else {
                        Send-Drag $hwnd $fromX $fromY $toX $toY
                    }
                }
                "type_text" {
                    $useRealInput = (Test-ForegroundInputEnabled) -and (Enable-WindowForInput $hwnd)
                    $typedViaHandles = $false
                    try {
                        $typedViaHandles = Invoke-TypeText $process $operation.text
                    } catch {
                        if (-not $useRealInput) {
                            throw
                        }
                    }
                    if (-not $typedViaHandles) {
                        if ($useRealInput) {
                            Invoke-RealTypeText $operation.text
                        } else {
                            Send-Text $hwnd $operation.text
                        }
                    }
                }
                "press_key" {
                    if ((Test-ForegroundInputEnabled) -and (Enable-WindowForInput $hwnd)) {
                        Invoke-RealKey $operation.key
                    } else {
                        Send-Key $hwnd $operation.key
                    }
                }
                "set_value" {
                    if ($null -eq $element) { throw "unknown element_index '$($operation.element.index)'" }
                    $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
                    if ($null -eq $valuePattern) {
                        throw "Cannot set a value for an element that is not settable"
                    }
                    $valuePattern.SetValue($operation.value)
                }
                default {
                    throw "unsupportedTool(`"$($operation.tool)`")"
                }
            }

            Start-Sleep -Milliseconds 120
            return [pscustomobject]@{ ok = $true; snapshot = (Build-Snapshot $operation.app) }
        }
    } catch {
        Close-VisualFeedback
        $message = $_.Exception.Message
        if (-not [string]::IsNullOrWhiteSpace($_.ScriptStackTrace)) {
            $message = "$message at $($_.ScriptStackTrace)"
        }
        return [pscustomobject]@{ ok = $false; error = $message }
    } finally {
        # 工具成功/失败都在响应返回前释放两张叠层，不能依赖宿主一定发送结束通知。
        Close-VisualFeedback
    }
}

function Write-ResponseLine($response) {
    [Console]::Out.WriteLine(($response | ConvertTo-Json -Depth 50 -Compress))
    [Console]::Out.Flush()
}

if ($Worker) {
    # Resident mode: one request line in, one response line out. Reusing the process avoids
    # re-paying PowerShell startup, UIA assembly loads, and inline C# compilation per tool call.
    # The idle watchdog also bounds this process's lifetime if the Go host dies without cleanup.
    # Console.In 的同步包装器会让 ReadLineAsync 也阻塞，导致 Tick/watchdog 永远等不到执行。
    # 独立 StreamReader 才能在等待 JSON 行时把主线程让给展示生命周期；Go stdin 使用 UTF-8。
    $requestReader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    try {
        while ($true) {
            $task = $requestReader.ReadLineAsync()
            $idle = [System.Diagnostics.Stopwatch]::StartNew()
            # 等待请求时仍处理展示生命周期；否则阻塞 ReadLine 会让失焦后的框停留十分钟。
            while (-not $task.Wait(33) -and $idle.Elapsed.TotalSeconds -lt $IdleTimeoutSeconds) {
                Update-VisualFeedback
            }
            if (-not $task.IsCompleted) {
                break
            }
            $line = $task.Result
            if ($null -eq $line) {
                break
            }
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }
            try {
                $operation = $line | ConvertFrom-Json
            } catch {
                Write-ResponseLine ([pscustomobject]@{ ok = $false; error = "invalid request JSON: $($_.Exception.Message)" })
                continue
            }
            Write-ResponseLine (Invoke-Operation $operation)
        }
    } finally {
        Close-VisualFeedback
        $requestReader.Dispose()
    }
    exit 0
}

if ([string]::IsNullOrWhiteSpace($OperationPath)) {
    throw "Either -Worker or -OperationPath must be provided."
}

$operation = Get-Content -Raw -Path $OperationPath | ConvertFrom-Json
try { Write-ResponseLine (Invoke-Operation $operation) } finally { Close-VisualFeedback }
