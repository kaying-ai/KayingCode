//! Small helpers: paths, file IO, curl, text scanning.
//!
//! Everything here is std-only so the crate builds offline.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Pipe-safe printing: `t3m ... | head` closes the pipe early and plain
/// println! then panics with "failed printing to stdout". These macros swallow
/// that specific error, which is what a filter-friendly CLI should do.
#[macro_export]
macro_rules! outln {
    ($($arg:tt)*) => {{
        use std::io::Write as _;
        let _ = writeln!(std::io::stdout(), $($arg)*);
    }};
}

#[macro_export]
macro_rules! errln {
    ($($arg:tt)*) => {{
        use std::io::Write as _;
        let _ = writeln!(std::io::stderr(), $($arg)*);
    }};
}

#[macro_export]
macro_rules! out {
    ($($arg:tt)*) => {{
        use std::io::Write as _;
        let _ = write!(std::io::stdout(), $($arg)*);
    }};
}

#[derive(Debug)]
pub struct CliError(pub String);

impl std::fmt::Display for CliError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

pub type CliResult<T> = Result<T, CliError>;

pub fn err<T>(msg: impl Into<String>) -> CliResult<T> {
    Err(CliError(msg.into()))
}

pub fn read_text(path: &Path) -> CliResult<String> {
    fs::read_to_string(path).map_err(|e| CliError(format!("read {}: {e}", path.display())))
}

pub fn write_text(path: &Path, text: &str) -> CliResult<()> {
    if let Some(dir) = path.parent() {
        if !dir.as_os_str().is_empty() {
            fs::create_dir_all(dir)
                .map_err(|e| CliError(format!("mkdir {}: {e}", dir.display())))?;
        }
    }
    fs::write(path, text).map_err(|e| CliError(format!("write {}: {e}", path.display())))
}

pub fn ensure_dir(path: &Path) -> CliResult<()> {
    fs::create_dir_all(path).map_err(|e| CliError(format!("mkdir {}: {e}", path.display())))
}

/// The user's home directory, as a path this process can actually open.
///
/// On Windows `USERPROFILE` wins: shells such as Git Bash export `HOME` as a
/// POSIX path (`/c/Users/…`) that Windows file APIs cannot resolve.
pub fn home_dir() -> Option<PathBuf> {
    let keys: &[&str] = if cfg!(windows) {
        &["USERPROFILE", "HOME"]
    } else {
        &["HOME", "USERPROFILE"]
    };
    for k in keys {
        if let Some(v) = std::env::var_os(k) {
            let p = PathBuf::from(v);
            if p.is_dir() {
                return Some(p);
            }
        }
    }
    None
}

/// Recursively collect files whose extension matches `ext` (lowercase, no dot).
pub fn collect_files(root: &Path, ext: &str, out: &mut Vec<PathBuf>) -> CliResult<()> {
    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // skip VCS / build noise
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name == ".git" || name == "node_modules" || name == "target" || name == ".maker" {
                continue;
            }
            collect_files(&path, ext, out)?;
        } else if path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case(ext))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
    Ok(())
}

/// HTTP GET text through the system curl (see crate docs for the why).
///
/// `insecure` mirrors curl's `-k`; it is only for hosts whose certificate chain
/// cannot be verified and must be requested explicitly by the user.
pub fn curl_get(url: &str, insecure: bool) -> CliResult<String> {
    let tmp = std::env::temp_dir().join(format!(
        "t3m-{}.tmp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let attempts: Vec<Vec<&str>> = if insecure {
        vec![vec!["-k", "--ssl-no-revoke"], vec!["-k"]]
    } else {
        // Windows schannel often cannot reach the CRL server; --ssl-no-revoke
        // keeps verification on while tolerating an offline revocation check.
        vec![vec!["--ssl-no-revoke"], vec![]]
    };
    let mut last_err = String::new();
    for extra in attempts {
        let mut cmd = Command::new("curl");
        cmd.arg("-sSL")
            .arg("--fail")
            .arg("--max-time")
            .arg("60")
            .arg("-A")
            .arg("Mozilla/5.0 (compatible; t3m-forensics)")
            .arg("-o")
            .arg(&tmp);
        for a in &extra {
            cmd.arg(a);
        }
        cmd.arg(url);
        match cmd.output() {
            Ok(out) => {
                if out.status.success() {
                    let text = fs::read_to_string(&tmp).unwrap_or_default();
                    let _ = fs::remove_file(&tmp);
                    return Ok(text);
                }
                last_err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            }
            Err(e) => {
                return err(format!(
                    "curl could not be started ({e}). Install curl or fetch the sources manually."
                ))
            }
        }
    }
    let _ = fs::remove_file(&tmp);
    err(format!("curl failed for {url}: {last_err}"))
}

/// Count non-empty lines (a rough size proxy for reports).
pub fn line_count(text: &str) -> usize {
    text.lines().filter(|l| !l.trim().is_empty()).count()
}

/// Extract the `(r, g, b, a)` numbers that follow `needle` in `line`.
pub fn numbers_after(line: &str, needle: &str) -> Vec<f64> {
    let Some(pos) = line.find(needle) else {
        return Vec::new();
    };
    let rest = &line[pos + needle.len()..];
    let mut nums = Vec::new();
    let mut cur = String::new();
    let mut started = false;
    for ch in rest.chars() {
        if ch.is_ascii_digit() || ch == '.' || (ch == '-' && cur.is_empty()) {
            cur.push(ch);
            started = true;
        } else if started {
            if let Ok(v) = cur.parse::<f64>() {
                nums.push(v);
            }
            cur.clear();
            started = false;
            if nums.len() >= 4 {
                break;
            }
            if ch == ')' {
                break;
            }
        }
    }
    if started {
        if let Ok(v) = cur.parse::<f64>() {
            nums.push(v);
        }
    }
    nums
}
