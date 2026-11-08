//! Lightweight Lua source analysis helpers for the refactor operations.
//!
//! We deliberately avoid pulling in a full Lua parser dependency: TapTap Lua
//! scripts follow a constrained style (no metatable magic, no `loadstring`),
//! so a token-ish scanner built on top of `&str` is sufficient for the
//! rename / extract / inline / split / move primitives exposed by the
//! `refactor.*` operations.
//!
//! The helpers here operate on whole-file contents and return either updated
//! source strings or structured analysis results (function tables, reference
//! lists, line ranges). All offsets are UTF-8 byte offsets into the source.

use serde_json::json;

use super::refactor_lua_blocks::{find_matching_end, find_value_end};

// ============================================================
// Function discovery
// ============================================================

/// A Lua function declaration found by [`find_functions`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LuaFunction {
    /// Function name (without `M.` prefix qualifiers stripped).
    pub name: String,
    /// Byte offset of the `function` keyword in the source.
    pub start: usize,
    /// Byte offset just past the closing `end` keyword.
    pub end: usize,
    /// 1-based line number of the `function` keyword.
    pub start_line: usize,
    /// 1-based line number of the closing `end`.
    pub end_line: usize,
    /// Raw parameter list (between parentheses), e.g. `"self, dt"`.
    pub params: String,
    /// True for `function foo()` (global), false for `function M.foo()`.
    pub is_global: bool,
    /// Optional qualifier prefix (e.g. `M.` or `mod.`). Empty for globals.
    pub qualifier: String,
}

/// Find all top-level `function NAME(params) ... end` declarations in `src`.
///
/// Supports both `function foo()` (global) and `function M.foo()` (module
/// method) forms. Nested functions are absorbed into the parent's range.
pub fn find_functions(src: &str) -> Vec<LuaFunction> {
    let mut out = Vec::new();
    let bytes = src.as_bytes();
    let mut pos = 0;

    while pos < bytes.len() {
        let Some(rel) = src[pos..].find("function") else {
            break;
        };
        let abs = pos + rel;
        if !is_word_boundary_before(src, abs) || !is_word_boundary_after(src, abs + 8) {
            pos = abs + 8;
            continue;
        }

        let (name_end, full_name, qualifier, is_global) = match parse_function_name(src, abs + 8) {
            Some(v) => v,
            None => {
                pos = abs + 8;
                continue;
            }
        };

        let params_start = match src[name_end..].find('(') {
            Some(o) => name_end + o,
            None => {
                pos = name_end;
                continue;
            }
        };
        let params_end = match src[params_start..].find(')') {
            Some(o) => params_start + o,
            None => {
                pos = params_start;
                continue;
            }
        };
        let params = src[params_start + 1..params_end].trim().to_string();

        let body_start = params_end + 1;
        let end_pos = match find_matching_end(src, body_start) {
            Some(p) => p,
            None => {
                pos = body_start;
                continue;
            }
        };

        out.push(LuaFunction {
            name: full_name,
            start: abs,
            end: end_pos,
            start_line: count_lines(src, abs) + 1,
            end_line: count_lines(src, end_pos) + 1,
            params,
            is_global,
            qualifier,
        });

        pos = end_pos;
    }

    out
}

/// Parse the function name token (and optional `M.`-style qualifier).
/// Returns `(name_end_offset, name, qualifier, is_global)`.
fn parse_function_name(src: &str, after_kw: usize) -> Option<(usize, String, String, bool)> {
    let rest = src[after_kw..].trim_start();
    let leading_ws = src[after_kw..].len() - rest.len();
    let mut cursor = after_kw + leading_ws;

    let mut qualifier = String::new();
    let bytes = src.as_bytes();

    while cursor < bytes.len() {
        let b = bytes[cursor];
        if b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b':' {
            qualifier.push(b as char);
            cursor += 1;
        } else {
            break;
        }
    }

    if qualifier.is_empty() {
        return None;
    }

    let (prefix, name) = match qualifier.rfind('.') {
        Some(idx) => (
            qualifier[..=idx].to_string(),
            qualifier[idx + 1..].to_string(),
        ),
        None => (String::new(), qualifier.clone()),
    };

    let is_global = prefix.is_empty();
    Some((cursor, name, prefix, is_global))
}

// ============================================================
// Reference scanning
// ============================================================

/// A single reference occurrence of a symbol in the source.
#[derive(Debug, Clone)]
pub struct LuaReference {
    /// Byte offset of the reference start.
    pub offset: usize,
    /// 1-based line number.
    pub line: usize,
    /// True if the reference appears to be a definition (`function NAME`).
    pub is_definition: bool,
}

/// Find all textual references to `name` that look like a real symbol use.
pub fn find_references(src: &str, name: &str) -> Vec<LuaReference> {
    let mut out = Vec::new();
    if name.is_empty() {
        return out;
    }

    let needle = name.as_bytes();
    let bytes = src.as_bytes();
    let mut pos = 0;

    while pos + needle.len() <= bytes.len() {
        if let Some(rel) = src[pos..].find(name) {
            let abs = pos + rel;
            if is_word_boundary_before(src, abs) && is_word_boundary_after(src, abs + needle.len())
            {
                let line = count_lines(src, abs) + 1;
                let is_def = is_definition_context(src, abs);
                out.push(LuaReference {
                    offset: abs,
                    line,
                    is_definition: is_def,
                });
            }
            pos = abs + needle.len();
        } else {
            break;
        }
    }

    out
}

/// Replace all non-definition references to `old` with `new` in `src`.
pub fn replace_references(src: &str, old: &str, new: &str) -> (String, usize) {
    let refs = find_references(src, old);
    let mut out = String::with_capacity(src.len());
    let mut cursor = 0;
    let mut count = 0;

    for r in refs.iter() {
        if r.is_definition || r.offset < cursor {
            continue;
        }
        out.push_str(&src[cursor..r.offset]);
        out.push_str(new);
        cursor = r.offset + old.len();
        count += 1;
    }
    out.push_str(&src[cursor..]);
    (out, count)
}

/// Rename the function definition at `func.start` from `old` to `new`.
pub fn replace_function_definition(src: &str, func: &LuaFunction, new_name: &str) -> String {
    let mut out = String::with_capacity(src.len() + new_name.len());
    out.push_str(&src[..func.start]);
    let head = &src[func.start..func.end];
    let after_kw = head.find("function").map(|i| i + 8).unwrap_or(0);
    let params_open = head[after_kw..]
        .find('(')
        .map(|i| after_kw + i)
        .unwrap_or(head.len());
    let signature = &head[..params_open];
    // Find the last `.` / `:` / non-identifier separator so we keep the
    // qualifier (e.g. `M.`) and only replace the trailing name token.
    let last_ident_start = signature
        .rfind(|c: char| c == '.' || c == ':' || (!c.is_ascii_alphanumeric() && c != '_'))
        .map(|i| i + 1)
        .unwrap_or(0);
    let rebuilt = format!(
        "{}{}{}",
        &signature[..last_ident_start],
        new_name,
        &signature[params_open..]
    );
    out.push_str(&rebuilt);
    out.push_str(&head[params_open..]);
    out.push_str(&src[func.end..]);
    out
}

// ============================================================
// Block extraction (for extract_function)
// ============================================================

/// Extract a contiguous line range `[start_line, end_line]` (1-based, inclusive)
/// from `src`, returning `(extracted_text, remaining_text)`.
pub fn extract_line_range(src: &str, start_line: usize, end_line: usize) -> (String, String) {
    let lines: Vec<&str> = src.lines().collect();
    if start_line == 0 || end_line < start_line || start_line > lines.len() {
        return (String::new(), src.to_string());
    }
    let end = end_line.min(lines.len());

    let block: Vec<&str> = lines[start_line - 1..end].to_vec();
    let common = common_indent(&block);

    let mut extracted = String::new();
    for (i, line) in block.iter().enumerate() {
        if i > 0 {
            extracted.push('\n');
        }
        if line.len() >= common {
            extracted.push_str(&line[common..]);
        } else {
            extracted.push_str(line);
        }
    }

    let mut remaining = String::with_capacity(src.len());
    for (i, line) in lines.iter().enumerate() {
        if i + 1 >= start_line && i + 1 <= end {
            continue;
        }
        if !remaining.is_empty() {
            remaining.push('\n');
        }
        remaining.push_str(line);
    }
    if !src.is_empty() && src.ends_with('\n') && !remaining.is_empty() {
        remaining.push('\n');
    }

    (extracted, remaining)
}

/// Compute the common leading whitespace length shared by all non-empty lines.
pub fn common_indent(lines: &[&str]) -> usize {
    let mut min = usize::MAX;
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        if indent < min {
            min = indent;
        }
    }
    if min == usize::MAX { 0 } else { min }
}

// ============================================================
// require() dependency analysis (for move_module / split_file)
// ============================================================

/// A single `require "..."` occurrence in a Lua source.
#[derive(Debug, Clone)]
pub struct RequireRef {
    /// The require argument (e.g. `"scripts.lib.event"`).
    pub path: String,
    /// 1-based line number of the require call.
    pub line: usize,
    /// Byte offset of the require argument value.
    pub offset: usize,
}

/// Extract all `require "..."` / `require '...'` occurrences from a Lua source.
pub fn extract_requires(src: &str) -> Vec<RequireRef> {
    let mut out = Vec::new();
    let mut pos = 0;
    while let Some(rel) = src[pos..].find("require") {
        let abs = pos + rel;
        if !is_word_boundary_before(src, abs) || !is_word_boundary_after(src, abs + 7) {
            pos = abs + 7;
            continue;
        }
        let after = src[abs + 7..].trim_start();
        let leading_ws = src[abs + 7..].len() - after.len();
        let bytes = after.as_bytes();
        if bytes.is_empty() || (bytes[0] != b'"' && bytes[0] != b'\'') {
            pos = abs + 7;
            continue;
        }
        let quote = bytes[0];
        if let Some(end_rel) = after[1..].find(quote as char) {
            let path = &after[1..1 + end_rel];
            if !path.is_empty() {
                let arg_offset = abs + 7 + leading_ws + 1;
                out.push(RequireRef {
                    path: path.to_string(),
                    line: count_lines(src, abs) + 1,
                    offset: arg_offset,
                });
            }
            pos = abs + 7 + leading_ws + 1 + end_rel + 1;
            continue;
        }
        pos = abs + 7;
    }
    out
}

/// Replace every `require "<old>"` with `require "<new>"` in `src`.
pub fn replace_require_path(src: &str, old: &str, new: &str) -> (String, usize) {
    let refs = extract_requires(src);
    let mut out = String::with_capacity(src.len());
    let mut cursor = 0;
    let mut count = 0;
    for r in refs {
        if r.path != old || r.offset < cursor {
            continue;
        }
        let value_start = r.offset;
        let value_end = r.offset + old.len();
        out.push_str(&src[cursor..value_start]);
        out.push_str(new);
        cursor = value_end;
        count += 1;
    }
    out.push_str(&src[cursor..]);
    (out, count)
}

// ============================================================
// Local variable analysis (for inline_local)
// ============================================================

/// A local variable declaration found by [`find_local_declarations`].
#[derive(Debug, Clone)]
pub struct LuaLocal {
    pub name: String,
    pub start: usize,
    pub end: usize,
    pub start_line: usize,
    pub end_line: usize,
    pub value: String,
}

/// Find `local NAME = VALUE` declarations in `src`. Only single-name locals.
pub fn find_local_declarations(src: &str) -> Vec<LuaLocal> {
    let mut out = Vec::new();
    let bytes = src.as_bytes();
    let mut pos = 0;

    while pos < bytes.len() {
        let Some(rel) = src[pos..].find("local ") else {
            break;
        };
        let abs = pos + rel;
        if !is_word_boundary_before(src, abs) {
            pos = abs + 6;
            continue;
        }

        let after = &src[abs + 6..];
        let name_end_rel = after
            .find(|c: char| c.is_ascii_whitespace() || c == '=' || c == ';' || c == '\n')
            .unwrap_or(after.len());
        let name = after[..name_end_rel].trim();
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            pos = abs + 6 + name_end_rel;
            continue;
        }

        let rest_start = abs + 6 + name_end_rel;
        let rest = &src[rest_start..];
        let eq_rel = match rest.find('=') {
            Some(o) => o,
            None => {
                pos = rest_start;
                continue;
            }
        };
        let value_start = rest_start + eq_rel + 1;
        let value_end = match find_value_end(src, value_start) {
            Some(e) => e,
            None => {
                pos = value_start;
                continue;
            }
        };
        let value = src[value_start..value_end].trim().to_string();

        out.push(LuaLocal {
            name: name.to_string(),
            start: abs,
            end: value_end,
            start_line: count_lines(src, abs) + 1,
            end_line: count_lines(src, value_end) + 1,
            value,
        });
        pos = value_end;
    }

    out
}

/// Remove the declaration line(s) for a local from `src`.
pub fn remove_local_declaration(src: &str, local: &LuaLocal) -> String {
    let line_start = src[..local.start].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_end = src[local.end..]
        .find('\n')
        .map(|i| local.end + i + 1)
        .unwrap_or(src.len());
    let mut out = String::with_capacity(src.len());
    out.push_str(&src[..line_start]);
    out.push_str(&src[line_end..]);
    out
}

// ============================================================
// JSON builders
// ============================================================

pub fn function_to_json(f: &LuaFunction) -> serde_json::Value {
    json!({
        "name": f.name,
        "qualifier": f.qualifier,
        "is_global": f.is_global,
        "params": f.params,
        "start_line": f.start_line,
        "end_line": f.end_line,
        "start_offset": f.start,
        "end_offset": f.end,
    })
}

pub fn reference_to_json(r: &LuaReference) -> serde_json::Value {
    json!({
        "line": r.line,
        "offset": r.offset,
        "is_definition": r.is_definition,
    })
}

// ============================================================
// Internal byte-level helpers
// ============================================================

fn is_word_boundary_before(src: &str, offset: usize) -> bool {
    if offset == 0 {
        return true;
    }
    let b = src.as_bytes()[offset - 1];
    !(b.is_ascii_alphanumeric() || b == b'_')
}

fn is_word_boundary_after(src: &str, offset: usize) -> bool {
    let bytes = src.as_bytes();
    if offset >= bytes.len() {
        return true;
    }
    let b = bytes[offset];
    !(b.is_ascii_alphanumeric() || b == b'_')
}

fn is_definition_context(src: &str, offset: usize) -> bool {
    let lookback = 64.min(offset);
    let window = &src[offset - lookback..offset];
    if let Some(idx) = window.rfind("function") {
        let between = &window[idx + 8..];
        if between.matches('(').count() == 0 && between.matches(')').count() == 0 {
            return true;
        }
    }
    false
}

fn count_lines(src: &str, offset: usize) -> usize {
    src[..offset.min(src.len())].matches('\n').count()
}

// `find_value_end` is in `refactor_lua_blocks.rs`.
