#!/usr/bin/env python3
"""List local KayingCode paths whose normalized name exists upstream.

The migration renamed many upstream-derived files and directories from
`zcode*` to `kayingcode*`. Git cannot follow those renames across a normal
merge, so every upstream file appears as an add/add collision. This script
finds the mechanical counterparts:

    local path  = .../kayingcodeX...
    upstream    = .../zcodeX...

Only paths present in both trees are reported. Brand-specific files with no
upstream counterpart are intentionally excluded; do not rename those.

Usage:
    python3 scripts/kaying/name-counterparts.py
    python3 scripts/kaying/name-counterparts.py --format tsv > /tmp/name-map.tsv
    python3 scripts/kaying/name-counterparts.py --area packages/shared
    python3 scripts/kaying/name-counterparts.py --output docs/kayingcode-v2/name-map.md

Exit code is 0 when the scan completes, regardless of the number of matches.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass


EXCLUDED_PARTS = {"node_modules", "dist", "out", "build", "coverage", ".turbo"}


def list_files(ref: str) -> list[str]:
    result = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", ref],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or f"cannot list {ref}")
    return [
        path
        for path in result.stdout.splitlines()
        if path.strip() and not (set(path.split("/")) & EXCLUDED_PARTS)
    ]


def normalize(path: str) -> str:
    return path.replace("kayingcode", "zcode").replace("KayingCode", "ZCode")


@dataclass(frozen=True)
class Counterpart:
    local: str
    upstream: str
    area: str


def build_counterparts(local_ref: str, upstream_ref: str) -> list[Counterpart]:
    upstream = set(list_files(upstream_ref))
    counterparts: list[Counterpart] = []
    for local in list_files(local_ref):
        normalized = normalize(local)
        if normalized == local or normalized not in upstream:
            continue
        parts = local.split("/")
        area = "/".join(parts[:3]) if parts[0] == "packages" else "/".join(parts[:4])
        counterparts.append(Counterpart(local, normalized, area))
    return sorted(counterparts, key=lambda item: item.local)


def render_markdown(items: list[Counterpart]) -> str:
    lines = [
        "# KayingCode → upstream name counterparts",
        "",
        f"- matches: {len(items)}",
        "- rule: local path with `kayingcode`/`KayingCode` normalized to `zcode`/`ZCode` exists upstream",
        "",
        "| local | upstream |",
        "| --- | --- |",
    ]
    lines.extend(f"| `{item.local}` | `{item.upstream}` |" for item in items)
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="List renamed upstream counterparts.")
    parser.add_argument("--local", default="HEAD", help="Local ref (default HEAD).")
    parser.add_argument("--upstream", default="upstream/main", help="Upstream ref (default upstream/main).")
    parser.add_argument("--area", help="Only paths starting with this prefix.")
    parser.add_argument("--format", choices=("markdown", "tsv"), default="markdown")
    parser.add_argument("--output", help="Write output to this path instead of stdout.")
    args = parser.parse_args()

    items = build_counterparts(args.local, args.upstream)
    if args.area:
        items = [item for item in items if item.local.startswith(args.area)]

    if args.format == "tsv":
        text = "\n".join(f"{item.local}\t{item.upstream}" for item in items) + "\n"
    else:
        text = render_markdown(items)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as file:
            file.write(text)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
