//! Unified exit codes for all Kaying Rust CLIs.
//!
//! | Code | Meaning | Example |
//! |---|---|---|
//! | 0 | Success | Command completed normally |
//! | 1 | General error | Unhandled exception |
//! | 2 | Invalid arguments | Missing required flag, bad value |
//! | 3 | File not found / External dependency missing | Input path does not exist |
//! | 4 | Parse error | YAML/JSON/CSV malformed |
//! | 5 | External tool error | `flutter test` exited non-zero |
//! | 6 | Timeout | Operation exceeded time limit |
//! | 7 | Partial success | Some files processed, some failed |
//! | 130 | Interrupted (SIGINT) | User pressed Ctrl+C |
//!
//! See `packages/RUST-CLI-CONVENTIONS.md` §5 for the full specification.

/// Exit codes for Kaying Rust CLIs.
///
/// Cast to `i32` for `std::process::exit()`.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitCode {
    /// Command completed normally.
    Success = 0,
    /// General / unhandled error.
    GeneralError = 1,
    /// Invalid or missing arguments.
    InvalidArgs = 2,
    /// File not found or external dependency missing.
    FileNotFound = 3,
    /// Parse error (YAML/JSON/CSV malformed).
    ParseError = 4,
    /// External tool exited non-zero.
    ExternalToolError = 5,
    /// Operation exceeded time limit.
    Timeout = 6,
    /// Partial success (some files processed, some failed).
    PartialSuccess = 7,
    /// User interrupted with Ctrl+C (SIGINT).
    Interrupted = 130,
}

impl ExitCode {
    /// Convenience: returns `i32` for `std::process::exit()`.
    #[must_use]
    pub fn as_i32(self) -> i32 {
        self as i32
    }

    /// Map from the spec-compliant error code string to `ExitCode`.
    ///
    /// This bridges the gap between the spec's error code naming (e.g. `"INVALID_INPUT"`)
    /// and the implementation's enum variants.
    #[must_use]
    pub fn from_spec_code(code: &str) -> Self {
        match code {
            "INVALID_INPUT" | "FILE_NOT_FOUND" | "PERMISSION_DENIED" | "UNSUPPORTED_FORMAT" => {
                ExitCode::InvalidArgs
            }
            "INTERNAL_ERROR" | "SERIALIZATION_ERROR" => ExitCode::GeneralError,
            "EXTERNAL_DEPENDENCY_MISSING" | "EXTERNAL_DEPENDENCY_FAILED" | "TIMEOUT" => {
                ExitCode::ExternalToolError
            }
            "PARTIAL_FAILURE" => ExitCode::PartialSuccess,
            "INTERRUPTED" => ExitCode::Interrupted,
            _ => ExitCode::GeneralError,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_code_values() {
        assert_eq!(ExitCode::Success.as_i32(), 0);
        assert_eq!(ExitCode::GeneralError.as_i32(), 1);
        assert_eq!(ExitCode::InvalidArgs.as_i32(), 2);
        assert_eq!(ExitCode::FileNotFound.as_i32(), 3);
        assert_eq!(ExitCode::ParseError.as_i32(), 4);
        assert_eq!(ExitCode::ExternalToolError.as_i32(), 5);
        assert_eq!(ExitCode::Timeout.as_i32(), 6);
        assert_eq!(ExitCode::PartialSuccess.as_i32(), 7);
        assert_eq!(ExitCode::Interrupted.as_i32(), 130);
    }

    #[test]
    fn from_spec_code() {
        assert_eq!(
            ExitCode::from_spec_code("INVALID_INPUT"),
            ExitCode::InvalidArgs
        );
        assert_eq!(
            ExitCode::from_spec_code("FILE_NOT_FOUND"),
            ExitCode::InvalidArgs
        );
        assert_eq!(
            ExitCode::from_spec_code("EXTERNAL_DEPENDENCY_MISSING"),
            ExitCode::ExternalToolError
        );
        assert_eq!(
            ExitCode::from_spec_code("INTERRUPTED"),
            ExitCode::Interrupted
        );
        assert_eq!(ExitCode::from_spec_code("UNKNOWN"), ExitCode::GeneralError);
    }
}
