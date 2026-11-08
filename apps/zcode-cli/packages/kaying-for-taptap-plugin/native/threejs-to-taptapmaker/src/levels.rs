//! `t3m levels` — convert a JS/TS level or config module into a Lua table.
//!
//! Handles the shape web puzzle games actually ship: an exported array of object
//! literals with string/number/array fields, e.g.
//! `export default [{w:8,h:6,t:"###...",c:[19,28],p:34,par:13}, ...]`

use crate::util::{err, read_text, write_text, CliResult};
use std::fmt::Write as _;
use std::path::Path;

#[derive(Debug, Clone)]
enum Val {
    Num(String),
    Str(String),
    Bool(bool),
    Null,
    Arr(Vec<Val>),
    Obj(Vec<(String, Val)>),
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn new(s: &'a str) -> Self {
        Self {
            s: s.as_bytes(),
            i: 0,
        }
    }
    fn peek(&self) -> Option<u8> {
        self.s.get(self.i).copied()
    }
    fn skip_ws(&mut self) {
        while let Some(c) = self.peek() {
            match c {
                b' ' | b'\t' | b'\r' | b'\n' => self.i += 1,
                b'/' if self.s.get(self.i + 1) == Some(&b'/') => {
                    while let Some(c) = self.peek() {
                        self.i += 1;
                        if c == b'\n' {
                            break;
                        }
                    }
                }
                b'/' if self.s.get(self.i + 1) == Some(&b'*') => {
                    self.i += 2;
                    while self.i + 1 < self.s.len()
                        && !(self.s[self.i] == b'*' && self.s[self.i + 1] == b'/')
                    {
                        self.i += 1;
                    }
                    self.i += 2;
                }
                _ => break,
            }
        }
    }
    fn expect(&mut self, c: u8) -> CliResult<()> {
        self.skip_ws();
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            err(format!(
                "expected '{}' at byte {} (found {:?})",
                c as char,
                self.i,
                self.peek().map(|b| b as char)
            ))
        }
    }
    fn parse_string(&mut self) -> CliResult<String> {
        let quote = self
            .peek()
            .ok_or_else(|| crate::util::CliError("eof in string".into()))?;
        self.i += 1;
        let mut out = String::new();
        while let Some(c) = self.peek() {
            self.i += 1;
            match c {
                b'\\' => {
                    if let Some(esc) = self.peek() {
                        self.i += 1;
                        match esc {
                            b'n' => out.push('\n'),
                            b't' => out.push('\t'),
                            b'r' => out.push('\r'),
                            b'\\' => out.push('\\'),
                            b'"' => out.push('"'),
                            b'\'' => out.push('\''),
                            b'u' => {
                                // \uXXXX -> char (best effort)
                                let hex: String = (0..4)
                                    .filter_map(|_| {
                                        let d = self.peek()?;
                                        self.i += 1;
                                        Some(d as char)
                                    })
                                    .collect();
                                if let Ok(cp) = u32::from_str_radix(&hex, 16) {
                                    if let Some(ch) = char::from_u32(cp) {
                                        out.push(ch);
                                    }
                                }
                            }
                            other => out.push(other as char),
                        }
                    }
                }
                _ if c == quote => break,
                _ => {
                    // keep multibyte UTF-8 intact
                    let start = self.i - 1;
                    let mut end = self.i;
                    while end < self.s.len() && (self.s[end] & 0xC0) == 0x80 {
                        end += 1;
                    }
                    self.i = end;
                    out.push_str(&String::from_utf8_lossy(&self.s[start..end]));
                }
            }
        }
        Ok(out)
    }
    fn parse_ident(&mut self) -> String {
        let start = self.i;
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' || c == b'$' || c == b'-' {
                self.i += 1;
            } else {
                break;
            }
        }
        String::from_utf8_lossy(&self.s[start..self.i]).to_string()
    }
    fn parse_number(&mut self) -> String {
        let start = self.i;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit()
                || c == b'.'
                || c == b'-'
                || c == b'+'
                || c == b'e'
                || c == b'E'
                || c == b'x'
                || (c.is_ascii_hexdigit() && self.s[start] == b'0')
            {
                self.i += 1;
            } else {
                break;
            }
        }
        String::from_utf8_lossy(&self.s[start..self.i]).to_string()
    }
    fn parse_value(&mut self) -> CliResult<Val> {
        self.skip_ws();
        match self.peek() {
            Some(b'{') => self.parse_object(),
            Some(b'[') => self.parse_array(),
            Some(b'"') | Some(b'\'') | Some(b'`') => Ok(Val::Str(self.parse_string()?)),
            Some(c) if c.is_ascii_digit() || c == b'-' || c == b'+' || c == b'.' => {
                Ok(Val::Num(self.parse_number()))
            }
            Some(_) => {
                let id = self.parse_ident();
                match id.as_str() {
                    "true" => Ok(Val::Bool(true)),
                    "false" => Ok(Val::Bool(false)),
                    "null" | "undefined" | "None" => Ok(Val::Null),
                    _ => Ok(Val::Str(id)),
                }
            }
            None => Ok(Val::Null),
        }
    }
    fn parse_array(&mut self) -> CliResult<Val> {
        self.expect(b'[')?;
        let mut items = Vec::new();
        loop {
            self.skip_ws();
            match self.peek() {
                Some(b']') => {
                    self.i += 1;
                    break;
                }
                None => return err("unterminated array"),
                _ => {}
            }
            items.push(self.parse_value()?);
            self.skip_ws();
            if self.peek() == Some(b',') {
                self.i += 1;
            }
        }
        Ok(Val::Arr(items))
    }
    fn parse_object(&mut self) -> CliResult<Val> {
        self.expect(b'{')?;
        let mut fields = Vec::new();
        loop {
            self.skip_ws();
            match self.peek() {
                Some(b'}') => {
                    self.i += 1;
                    break;
                }
                None => return err("unterminated object"),
                _ => {}
            }
            let key = match self.peek() {
                Some(b'"') | Some(b'\'') | Some(b'`') => self.parse_string()?,
                _ => self.parse_ident(),
            };
            self.skip_ws();
            if self.peek() == Some(b':') {
                self.i += 1;
            }
            let value = self.parse_value()?;
            fields.push((key, value));
            self.skip_ws();
            if self.peek() == Some(b',') {
                self.i += 1;
            }
        }
        Ok(Val::Obj(fields))
    }
}

fn is_ident(key: &str) -> bool {
    let mut chars = key.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out
}

fn to_lua(v: &Val, indent: usize, out: &mut String) {
    let pad = "  ".repeat(indent);
    match v {
        Val::Num(n) => {
            // 1.0 -> 1 keeps the Lua tables compact
            let cleaned = if n.ends_with(".0") {
                n.trim_end_matches(".0").to_string()
            } else {
                n.clone()
            };
            let _ = write!(out, "{cleaned}");
        }
        Val::Str(s) => {
            let _ = write!(out, "\"{}\"", escape(s));
        }
        Val::Bool(b) => {
            let _ = write!(out, "{b}");
        }
        Val::Null => out.push_str("nil"),
        Val::Arr(items) => {
            if items.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push_str("{\n");
            for item in items {
                out.push_str(&format!("{pad}  "));
                to_lua(item, indent + 1, out);
                out.push_str(",\n");
            }
            let _ = write!(out, "{pad}}}");
        }
        Val::Obj(fields) => {
            if fields.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push_str("{\n");
            for (k, val) in fields {
                if matches!(val, Val::Null) {
                    continue;
                }
                out.push_str(&format!("{pad}  "));
                if is_ident(k) {
                    let _ = write!(out, "{k} = ");
                } else {
                    let _ = write!(out, "[\"{}\"] = ", escape(k));
                }
                to_lua(val, indent + 1, out);
                out.push_str(",\n");
            }
            let _ = write!(out, "{pad}}}");
        }
    }
}

fn find_array_start(src: &str) -> Option<usize> {
    // the first '[' whose next non-space char is '{' is the data array
    let bytes = src.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'[' {
            let mut j = i + 1;
            while j < bytes.len() && (bytes[j] as char).is_whitespace() {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'{' {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

/// Returns (lua_source, entry_count, field_names)
pub fn convert_file(
    path: &Path,
    name: Option<&str>,
    raw: bool,
) -> CliResult<(String, usize, Vec<String>)> {
    let src = read_text(path)?;
    let start = find_array_start(&src).ok_or_else(|| {
        crate::util::CliError(format!(
            "{}: no array-of-objects literal found (expects `export default [{{...}}]`)",
            path.display()
        ))
    })?;
    let mut p = Parser::new(&src);
    p.i = start;
    let val = p.parse_array()?;
    let (count, fields) = match &val {
        Val::Arr(items) => {
            let mut keys: Vec<String> = Vec::new();
            for it in items {
                if let Val::Obj(fs) = it {
                    for (k, _) in fs {
                        if !keys.contains(k) {
                            keys.push(k.clone());
                        }
                    }
                }
            }
            (items.len(), keys)
        }
        _ => (0, Vec::new()),
    };
    let mut body = String::new();
    to_lua(&val, 0, &mut body);
    let lua = if raw {
        body
    } else {
        let n = name.unwrap_or("DATA");
        // a dotted name is a field assignment (CKData.LEVELS = {...}), not a local
        let decl = if n.contains('.') {
            format!("{n} = {body}")
        } else {
            format!("local {n} = {body}")
        };
        format!(
            "-- converted from {} by t3m levels\n-- {} entries, fields: {}\n{decl}\n\nreturn {n}\n",
            path.display(),
            count,
            fields.join(", ")
        )
    };
    Ok((lua, count, fields))
}

pub fn run(input: &Path, out: Option<&Path>, name: Option<&str>, raw: bool) -> CliResult<String> {
    let (lua, count, fields) = convert_file(input, name, raw)?;
    if let Some(path) = out {
        write_text(path, &lua)?;
        crate::outln!(
            "{} entries -> {} (fields: {})",
            count,
            path.display(),
            fields.join(", ")
        );
    }
    Ok(lua)
}
