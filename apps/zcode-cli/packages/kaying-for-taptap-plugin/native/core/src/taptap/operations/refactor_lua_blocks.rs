//! Lua block-matching helpers (find matching `end` for `function`/`if`/`for`/...).
//!
//! Kept in a separate file to keep `refactor_lua.rs` under the 500-line cap.
//! All offsets are UTF-8 byte offsets.

/// Find the matching `end` keyword for a Lua block opened at `body_start`.
///
/// `body_start` is the byte offset just past the opening `)` of a function
/// signature or the `do`/`then`/`repeat` keyword of a control-flow block.
pub fn find_matching_end(src: &str, body_start: usize) -> Option<usize> {
    let mut depth = 1usize;
    let bytes = src.as_bytes();
    let mut pos = body_start;

    while pos < bytes.len() && depth > 0 {
        let rest = &src[pos..];
        let next_open = find_block_open(rest).map(|(o, l)| (pos + o, l));
        let next_close = find_word(rest, "end").map(|o| pos + o);

        match (next_open, next_close) {
            (Some((open_abs, open_kw_len)), Some(close_abs)) => {
                if open_abs < close_abs {
                    depth += 1;
                    pos = open_abs + open_kw_len;
                } else {
                    depth -= 1;
                    if depth == 0 {
                        return Some(close_abs + 3);
                    }
                    pos = close_abs + 3;
                }
            }
            (Some((open_abs, open_kw_len)), None) => {
                depth += 1;
                pos = open_abs + open_kw_len;
            }
            (None, Some(close_abs)) => {
                depth -= 1;
                if depth == 0 {
                    return Some(close_abs + 3);
                }
                pos = close_abs + 3;
            }
            (None, None) => break,
        }
    }
    None
}

/// Locate the next block-opening keyword (`if`, `for`, `while`, `do`, `function`, `repeat`)
/// and return its byte offset + keyword length.
fn find_block_open(src: &str) -> Option<(usize, usize)> {
    let candidates = ["if", "for", "while", "do", "function", "repeat"];
    let mut best: Option<(usize, usize)> = None;
    for kw in candidates {
        let mut search_pos = 0;
        while let Some(rel) = src[search_pos..].find(kw) {
            let abs = search_pos + rel;
            if is_word_boundary_before(src, abs) && is_word_boundary_after(src, abs + kw.len()) {
                match best {
                    Some((b, _)) if b <= abs => {}
                    _ => best = Some((abs, kw.len())),
                }
                break;
            }
            search_pos = abs + kw.len();
        }
    }
    best
}

/// Word-boundary-aware `find`.
pub fn find_word(src: &str, word: &str) -> Option<usize> {
    let mut pos = 0;
    while let Some(rel) = src[pos..].find(word) {
        let abs = pos + rel;
        if is_word_boundary_before(src, abs) && is_word_boundary_after(src, abs + word.len()) {
            return Some(abs);
        }
        pos = abs + word.len();
    }
    None
}

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

/// Find the end offset of a `local NAME = VALUE` value expression.
///
/// Stops at the first unescaped newline or `;` outside of strings/parens.
pub fn find_value_end(src: &str, start: usize) -> Option<usize> {
    let bytes = src.as_bytes();
    let mut pos = start;
    while pos < bytes.len() && (bytes[pos] == b' ' || bytes[pos] == b'\t') {
        pos += 1;
    }
    let mut depth = 0i32;
    let mut string_quote: Option<u8> = None;
    while pos < bytes.len() {
        let b = bytes[pos];
        match string_quote {
            Some(q) => {
                if b == q {
                    string_quote = None;
                } else if b == b'\\' {
                    pos += 1;
                }
            }
            None => match b {
                b'"' | b'\'' => string_quote = Some(b),
                b'(' | b'[' | b'{' => depth += 1,
                b')' | b']' | b'}' => depth -= 1,
                b'\n' | b';' if depth <= 0 => return Some(pos),
                _ => {}
            },
        }
        pos += 1;
    }
    Some(pos)
}
