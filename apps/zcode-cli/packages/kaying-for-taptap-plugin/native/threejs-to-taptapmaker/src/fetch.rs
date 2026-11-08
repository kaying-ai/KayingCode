//! `t3m fetch` — pull a web game's own sources (page, module graph, CSS) so the
//! transcription works from real code instead of a screenshot.
//!
//! Library bundles (three.module.min.js, vendor/*, *.min.js) are recorded but not
//! downloaded: they would drown the analysis in false positives.

use crate::util::{curl_get, ensure_dir, err, write_text, CliResult};
use std::collections::{BTreeMap, VecDeque};
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct Entry {
    pub url: String,
    pub local: PathBuf,
    pub kind: &'static str,
    pub bytes: usize,
    pub skipped: bool,
}

pub struct FetchReport {
    pub entries: Vec<Entry>,
    pub externals: Vec<String>,
    pub importmap: BTreeMap<String, String>,
    /// Player wrapper pages discovered while looking for the real game entry.
    pub iframe_hops: Vec<String>,
    /// URLs that look like the game's own entry document.
    pub game_entries: Vec<String>,
}

fn host_of(url: &str) -> String {
    let without_scheme = url.splitn(2, "://").nth(1).unwrap_or(url);
    let host = without_scheme.split('/').next().unwrap_or("");
    let scheme = url.splitn(2, "://").next().unwrap_or("https");
    format!("{scheme}://{host}")
}

fn strip_query(url: &str) -> String {
    url.split(['?', '#']).next().unwrap_or(url).to_string()
}

/// Resolve `rel` against `base` (an absolute URL), normalising `.` and `..`.
fn join_url(base: &str, rel: &str) -> String {
    if rel.starts_with("http://") || rel.starts_with("https://") {
        return rel.to_string();
    }
    let host = host_of(base);
    let base_path = strip_query(base);
    let base_path = base_path
        .strip_prefix(&host)
        .unwrap_or(&base_path)
        .to_string();
    let rel_clean = strip_query(rel);
    let combined = if rel_clean.starts_with('/') {
        rel_clean
    } else {
        let dir = match base_path.rfind('/') {
            Some(i) => &base_path[..=i],
            None => "/",
        };
        format!("{dir}{rel_clean}")
    };
    // normalise segments
    let mut out: Vec<&str> = Vec::new();
    for seg in combined.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    format!("{host}/{}", out.join("/"))
}

fn local_path_for(out: &Path, url: &str) -> PathBuf {
    let host = host_of(url);
    let rel = strip_query(url)
        .strip_prefix(&host)
        .unwrap_or("/")
        .to_string();
    let mut clean = rel.trim_start_matches('/').to_string();
    if clean.is_empty() || clean.ends_with('/') {
        clean.push_str("index.html");
    }
    // percent-decode the few characters that show up in game URLs
    let decoded = clean
        .replace("%20", " ")
        .replace("%5B", "[")
        .replace("%5D", "]");
    // keep Windows-legal file names
    let safe: String = decoded
        .chars()
        .map(|c| match c {
            ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect();
    out.join(safe)
}

fn is_vendor(url: &str) -> bool {
    let p = strip_query(url).to_lowercase();
    p.contains("three.module") || p.contains("/vendor/") || p.contains(".min.js")
}

/// `import x from "y"` / `import "y"` / `export ... from "y"` / `import("y")`
fn js_specifiers(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = src.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        let rest = &src[i..];
        let hit = [
            "from \"",
            "from '",
            "import \"",
            "import '",
            "import(\"",
            "import('",
        ]
        .iter()
        .filter_map(|n| rest.find(n).map(|p| (p, *n)))
        .min_by_key(|(p, _)| *p);
        let Some((pos, needle)) = hit else { break };
        let start = i + pos + needle.len() - 1;
        let quote = needle.chars().last().unwrap();
        if let Some(end) = src[start + 1..].find(quote) {
            out.push(src[start + 1..start + 1 + end].to_string());
        }
        i = start + 1;
    }
    out.dedup();
    out
}

/// `<script src>`, `<link href>` refs from the page HTML
fn html_refs(html: &str) -> Vec<String> {
    let mut refs = Vec::new();
    let lower = html.to_lowercase();
    for key in ["src=\"", "src='", "href=\"", "href='"] {
        let mut i = 0usize;
        while let Some(pos) = lower[i..].find(key) {
            let abs = i + pos + key.len();
            let quote = key.chars().last().unwrap();
            if let Some(end) = html[abs..].find(quote) {
                refs.push(html[abs..abs + end].to_string());
            }
            i = abs;
        }
    }
    // Pages are often served with escaped quotes (`<iframe src=&quot;…&quot;>`).
    for key in ["src=&quot;", "src=&#34;"] {
        let mut i = 0usize;
        while let Some(pos) = lower[i..].find(key) {
            let abs = i + pos + key.len();
            if let Some(end) = html[abs..].find('&') {
                refs.push(html[abs..abs + end].to_string());
            }
            i = abs;
        }
    }
    refs.retain(|r| !r.is_empty() && !r.starts_with("data:") && !r.starts_with('#'));
    refs
}

/// Does the URL look like a player wrapper page (portal → `/embed/…` → game)?
fn looks_like_wrapper(url: &str) -> bool {
    let u = url.to_lowercase();
    u.contains("/embed/")
        || u.contains("/embed?")
        || u.ends_with("/embed")
        || u.contains("embed=true")
}

/// Does the URL look like a game's own entry document?
fn looks_like_game_entry(url: &str) -> bool {
    let u = url.to_lowercase();
    if !u.ends_with(".html") {
        return false;
    }
    u.contains("/v/") || u.contains("/g/") || u.contains("/game") || u.contains("/build/")
}

/// URLs worth showing as "the real game probably lives here": iframes found in
/// the downloaded sources plus `.html` entries on another host.
fn entry_candidates(text: &str, root_host: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for r in html_refs(text).into_iter().chain(js_string_urls(text)) {
        if !(r.starts_with("http://") || r.starts_with("https://")) {
            continue;
        }
        let url = strip_query(&r);
        if looks_like_wrapper(&url) || (looks_like_game_entry(&url) && host_of(&url) != root_host) {
            out.push(url);
        }
    }
    out.dedup();
    out
}

/// Absolute URLs sitting in arbitrary text (wrappers usually inject the iframe
/// from script, so the `src` never appears in the HTML itself).
fn js_string_urls(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < src.len() {
        let rest = &src[i..];
        let Some(pos) = rest.find("https://") else {
            break;
        };
        let start = i + pos;
        let tail = &src[start..];
        let end = tail
            .find(|c: char| {
                c == '"' || c == '\'' || c == '`' || c.is_whitespace() || c == '<' || c == '\\'
            })
            .unwrap_or(tail.len());
        if end > 0 && end < 300 {
            out.push(tail[..end].to_string());
        }
        i = start + end.max(1);
    }
    out.dedup();
    out
}

/// `"alias": "target"` pairs from a `<script type="importmap">` block
fn parse_importmap(html: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    let Some(pos) = html.find("importmap") else {
        return map;
    };
    let Some(open) = html[pos..].find('{') else {
        return map;
    };
    let body = &html[pos + open..];
    let bytes = body.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] != b'"' {
            i += 1;
            continue;
        }
        let kstart = i + 1;
        let Some(kend_rel) = body[kstart..].find('"') else {
            break;
        };
        let key = &body[kstart..kstart + kend_rel];
        let mut j = kstart + kend_rel + 1;
        while j < bytes.len() && (bytes[j] as char).is_whitespace() {
            j += 1;
        }
        let mut advanced = false;
        if j < bytes.len() && bytes[j] == b':' {
            j += 1;
            while j < bytes.len() && (bytes[j] as char).is_whitespace() {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'"' {
                let vstart = j + 1;
                if let Some(vend_rel) = body[vstart..].find('"') {
                    let value = &body[vstart..vstart + vend_rel];
                    if !key.is_empty() && !key.contains(' ') && !value.is_empty() {
                        map.insert(key.to_string(), value.to_string());
                    }
                    i = vstart + vend_rel + 1;
                    advanced = true;
                }
            }
        }
        if !advanced {
            i = kstart + kend_rel + 1;
        }
    }
    map
}

pub fn run(
    url: &str,
    out: &Path,
    insecure: bool,
    max_files: usize,
    verbose: bool,
) -> CliResult<FetchReport> {
    ensure_dir(out)?;
    let root_host = host_of(url);
    let mut queue: VecDeque<(String, &'static str)> = VecDeque::new();
    queue.push_back((strip_query(url), "page"));
    let mut entries: Vec<Entry> = Vec::new();
    let mut externals: Vec<String> = Vec::new();
    let mut importmap: BTreeMap<String, String> = BTreeMap::new();
    let mut seen: BTreeMap<String, ()> = BTreeMap::new();

    while let Some((cur, kind)) = queue.pop_front() {
        if seen.contains_key(&cur) {
            continue;
        }
        seen.insert(cur.clone(), ());
        if entries.len() >= max_files {
            if verbose {
                println!("  reached --max-files ({max_files}), stopping crawl");
            }
            break;
        }
        let host = host_of(&cur);
        if host != root_host {
            externals.push(cur.clone());
            continue;
        }
        if is_vendor(&cur) {
            entries.push(Entry {
                url: cur.clone(),
                local: local_path_for(out, &cur),
                kind: "vendor-skipped",
                bytes: 0,
                skipped: true,
            });
            if verbose {
                println!("  vendor (not downloaded): {cur}");
            }
            continue;
        }
        let body = match curl_get(&cur, insecure) {
            Ok(b) => b,
            Err(e) => {
                if verbose {
                    println!("  ! {e}");
                }
                continue;
            }
        };
        let local = local_path_for(out, &cur);
        write_text(&local, &body)?;
        entries.push(Entry {
            url: cur.clone(),
            local: local.clone(),
            kind,
            bytes: body.len(),
            skipped: false,
        });
        if verbose {
            println!("  {} ({} bytes) -> {}", kind, body.len(), local.display());
        }

        let refs: Vec<String> = if kind == "page" {
            importmap.extend(parse_importmap(&body));
            html_refs(&body)
        } else {
            js_specifiers(&body)
        };

        for r in refs {
            // strip hash fragments; keep query for the fetch, drop it for storage
            let mut resolved = if r.starts_with("http://") || r.starts_with("https://") {
                r.clone()
            } else if let Some(target) = importmap.get(&r) {
                join_url(&cur, target)
            } else if r.starts_with('/') || r.starts_with('.') {
                join_url(&cur, &r)
            } else {
                // bare specifier without an importmap entry: likely a CDN package
                format!("bare:{r}")
            };
            if resolved.starts_with("bare:") {
                externals.push(resolved.clone());
                continue;
            }
            resolved = strip_query(&resolved);
            let next_kind = if resolved.ends_with(".css") {
                "css"
            } else if resolved.ends_with(".json") {
                "json"
            } else if resolved.ends_with(".js") || resolved.ends_with(".mjs") {
                "js"
            } else {
                "asset-skipped"
            };
            if next_kind == "asset-skipped" {
                externals.push(resolved);
                continue;
            }
            if !seen.contains_key(&resolved) {
                queue.push_back((resolved, next_kind));
            }
        }
    }

    // ---- the game is often one or two iframes deep (portal → /embed/… → game) ----
    let mut iframe_hops: Vec<String> = Vec::new();
    let mut candidates: Vec<String> = Vec::new();
    for e in entries.iter().filter(|e| !e.skipped) {
        let body = crate::util::read_text(&e.local).unwrap_or_default();
        for c in entry_candidates(&body, &root_host) {
            if looks_like_wrapper(&c) {
                iframe_hops.push(c.clone());
            }
            candidates.push(c);
        }
    }
    // follow same-host wrapper pages once: that is where the game URL usually is
    for w in iframe_hops.clone() {
        if seen.contains_key(&w) || host_of(&w) != root_host {
            continue;
        }
        seen.insert(w.clone(), ());
        let Ok(body) = curl_get(&w, insecure) else {
            continue;
        };
        let local = local_path_for(out, &w);
        write_text(&local, &body)?;
        entries.push(Entry {
            url: w.clone(),
            local,
            kind: "wrapper",
            bytes: body.len(),
            skipped: false,
        });
        println!("  wrapper page ({} bytes) -> {}", body.len(), w);
        for c in entry_candidates(&body, &root_host) {
            candidates.push(c);
        }
    }
    iframe_hops.sort();
    iframe_hops.dedup();
    let mut game_entries: Vec<String> = Vec::new();
    for c in candidates {
        if seen.contains_key(&c) || game_entries.contains(&c) || !looks_like_game_entry(&c) {
            continue;
        }
        game_entries.push(c);
    }

    // manifest
    let mut man = String::new();
    man.push_str("# t3m fetch manifest\n");
    man.push_str(&format!("# entry: {}\n", strip_query(url)));
    man.push_str(&format!("# files: {}\n\n", entries.len()));
    for e in &entries {
        man.push_str(&format!(
            "{:<14} {:>9} bytes  {}\n                      {}\n",
            e.kind,
            e.bytes,
            e.url,
            e.local.display()
        ));
    }
    if !iframe_hops.is_empty() {
        man.push_str("\n# iframe / wrapper hops（门户页外壳，真正的游戏在下一跳）\n");
        for u in &iframe_hops {
            man.push_str(&format!("  iframe: {u}\n"));
        }
    }
    if !game_entries.is_empty() {
        man.push_str("\n# game entry candidates（真正的游戏入口通常在这里）\n");
        for u in &game_entries {
            man.push_str(&format!("  game: {u}\n"));
        }
        man.push_str(&format!(
            "  next: t3m fetch \"{}\" --out source/game/\n",
            game_entries[0]
        ));
        man.push_str("  然后：t3m analyze source/game/ --out source/report.md\n");
    }
    if !externals.is_empty() {
        man.push_str("\n# external / skipped references\n");
        for e in &externals {
            man.push_str(&format!("  {e}\n"));
        }
    }
    if !importmap.is_empty() {
        man.push_str("\n# importmap\n");
        for (k, v) in &importmap {
            man.push_str(&format!("  {k} -> {v}\n"));
        }
    }
    write_text(&out.join("FETCH_MANIFEST.txt"), &man)?;

    if entries.iter().filter(|e| !e.skipped).count() == 0 {
        return err("nothing was downloaded (check the URL, or pass --insecure for a broken certificate chain)");
    }
    Ok(FetchReport {
        entries,
        externals,
        importmap,
        iframe_hops,
        game_entries,
    })
}
