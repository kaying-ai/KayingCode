#!/usr/bin/env python3
"""Three-way merge upstream ZCode packages into the current KayingCode tree.

The merge is performed per file with `git merge-file`:

    base   = file at --base (default: 872ad960, the ZCode 3.14.0 fork point)
    ours   = file in the current working tree
    theirs = file at --upstream (default: upstream/main)

Locally renamed upstream files are detected with `git diff --find-renames`
and merged into their local path. Upstream-only files are added. Local-only
files are left untouched.

Usage:
    python3 scripts/kaying/merge-upstream-package.py \
      --package packages/rpc \
      --package packages/client \
      --report /tmp/merge-report.md

    # Inspect without writing:
    python3 scripts/kaying/merge-upstream-package.py --package packages/rpc --dry-run

    # Skip test files until the vitest batch:
    python3 scripts/kaying/merge-upstream-package.py --package packages/rpc --skip-tests

    # Normalize upstream ZCode names to KayingCode before merging (for renamed files):
    python3 scripts/kaying/merge-upstream-package.py --package packages/services --normalize

    # Merge an upstream directory into a locally renamed directory:
    python3 scripts/kaying/merge-upstream-package.py \
      --package packages/shared \
      --map packages/shared/src/zcode-protocol=packages/shared/src/kayingcode-protocol

Exit code:
    0 = all files merged cleanly
    1 = conflicts or merge errors remain (conflict markers are written unless --dry-run)
    2 = invalid usage or dirty worktree without --allow-dirty
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass, field


def run(args: list[str], *, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, check=check)


def git_show(ref: str, path: str) -> bytes | None:
    result = run(["git", "show", f"{ref}:{path}"])
    return result.stdout if result.returncode == 0 else None


def git_ls(ref: str, path: str) -> list[str]:
    result = run(["git", "ls-tree", "-r", "--name-only", ref, "--", path])
    return [line for line in result.stdout.decode().splitlines() if line.strip()]


def is_binary(data: bytes) -> bool:
    return b"\x00" in data


def normalize_line_endings(data: bytes) -> bytes:
    """统一按 LF 比较/合并。

    修复原因：Windows 工作区（core.autocrlf=true）是 CRLF，而 git blob 是 LF。
    不统一行尾会把每个文件都判成“双方修改”，一次合并产生上百个整文件冲突。
    """
    return data.replace(b"\r\n", b"\n")


def normalize_zcode_names(data: bytes) -> bytes:
    """Rewrite upstream ZCode identifiers/paths to the local KayingCode names.

    This is useful for files that were mechanically renamed downstream before the
    migration. It leaves package scopes such as ``@zcode/shared`` untouched.
    """
    text = data.decode("utf-8")
    text = text.replace("ZCODE", "KAYINGCODE").replace("ZCode", "KayingCode")
    text = re.sub(r"(?<!@)zcode", "kayingcode", text)
    return text.encode("utf-8")


def is_test_file(path: str) -> bool:
    """Test files need vitest; skip them until the vitest batch."""
    parts = path.split("/")
    name = parts[-1]
    if any(part in {"test", "tests", "__tests__", "e2e"} for part in parts):
        return True
    return (
        name.endswith(".test.ts")
        or name.endswith(".test.tsx")
        or name.endswith(".spec.ts")
        or name.endswith(".spec.tsx")
        or name == "vitest.config.ts"
    )


def merge_three_way(ours: bytes, base: bytes, theirs: bytes) -> tuple[bytes, bool]:
    """Return (merged bytes, conflicted)."""
    with tempfile.TemporaryDirectory() as tmp:
        ours_path = os.path.join(tmp, "ours")
        base_path = os.path.join(tmp, "base")
        theirs_path = os.path.join(tmp, "theirs")
        with open(ours_path, "wb") as file:
            file.write(ours)
        with open(base_path, "wb") as file:
            file.write(base)
        with open(theirs_path, "wb") as file:
            file.write(theirs)
        result = run(["git", "merge-file", "-p", "--diff3", ours_path, base_path, theirs_path])
        # git merge-file exits with the number of conflicts (truncated to 127),
        # not just 0/1. Shell-visible 128..255 indicates an error.
        if result.returncode == 0:
            return result.stdout, False
        if 0 < result.returncode < 128:
            return result.stdout, True
        raise RuntimeError(result.stderr.decode(errors="replace") or "git merge-file failed")


@dataclass
class Report:
    packages: list[str]
    actions: Counter = field(default_factory=Counter)
    conflicts: list[str] = field(default_factory=list)
    merge_errors: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def apply_prefix_map(path: str, prefix_maps: list[tuple[str, str]]) -> str:
    for upstream_prefix, local_prefix in prefix_maps:
        if path == upstream_prefix or path.startswith(upstream_prefix + "/"):
            return local_prefix + path[len(upstream_prefix) :]
    return path


def merge_package(
    package: str,
    base_ref: str,
    upstream_ref: str,
    dry_run: bool,
    report: Report,
    rename: dict[str, str],
    prefix_maps: list[tuple[str, str]],
    skip_tests: bool,
    normalize: bool,
) -> None:
    upstream_files = git_ls(upstream_ref, package)
    base_files = git_ls(base_ref, package)
    upstream_set = set(upstream_files)

    for upstream_path in upstream_files:
        if skip_tests and is_test_file(upstream_path):
            report.actions["skipped-test"] += 1
            continue
        local_path = rename.get(upstream_path, apply_prefix_map(upstream_path, prefix_maps))
        ours = None
        if os.path.exists(local_path):
            with open(local_path, "rb") as file:
                ours = file.read()
        base = git_show(base_ref, upstream_path)
        theirs = git_show(upstream_ref, upstream_path)
        if theirs is None:
            continue

        # Windows 工作区 CRLF 与 git blob LF 先统一，否则整文件都会被判成双方修改。
        if ours is not None and not (
            is_binary(ours) or (base is not None and is_binary(base)) or is_binary(theirs)
        ):
            ours = normalize_line_endings(ours)
            if base is not None:
                base = normalize_line_endings(base)
            theirs = normalize_line_endings(theirs)

        if ours is None:
            if base is None:
                report.actions["add"] += 1
                report.notes.append(f"add {local_path}")
                if not dry_run:
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    with open(local_path, "wb") as file:
                        file.write(theirs)
            elif base != theirs:
                report.actions["local-deleted-upstream-modified"] += 1
                report.notes.append(f"kept local deletion (upstream modified): {local_path}")
            continue

        if base is None:
            if ours == theirs:
                continue
            base = b""

        if base == ours:
            if ours != theirs:
                report.actions["take-upstream"] += 1
                report.notes.append(f"take upstream {local_path}")
                if not dry_run:
                    with open(local_path, "wb") as file:
                        file.write(theirs)
            continue

        if base == theirs or ours == theirs:
            continue

        if is_binary(ours) or is_binary(base) or is_binary(theirs):
            report.actions["binary-differs-kept-ours"] += 1
            report.notes.append(f"binary differs, kept ours: {local_path}")
            continue

        if normalize and not (is_binary(base) or is_binary(theirs)):
            base = normalize_zcode_names(base)
            theirs = normalize_zcode_names(theirs)

        try:
            merged, conflicted = merge_three_way(ours, base, theirs)
        except RuntimeError as error:
            report.actions["merge-error"] += 1
            report.merge_errors.append(f"{local_path}: {error}")
            report.notes.append(f"merge error, kept ours: {local_path}")
            continue

        if not dry_run:
            with open(local_path, "wb") as file:
                file.write(merged)
        if conflicted:
            report.actions["conflict"] += 1
            report.conflicts.append(local_path)
            report.notes.append(f"CONFLICT {local_path}")
        else:
            report.actions["merged"] += 1
            report.notes.append(f"merged {local_path}")

    for base_path in base_files:
        if base_path in upstream_set:
            continue
        if skip_tests and is_test_file(base_path):
            continue
        local_path = rename.get(base_path, apply_prefix_map(base_path, prefix_maps))
        ours = None
        if os.path.exists(local_path):
            with open(local_path, "rb") as file:
                ours = file.read()
        if ours is None:
            continue
        base = git_show(base_ref, base_path)
        if base == ours:
            report.actions["delete"] += 1
            report.notes.append(f"delete {local_path}")
            if not dry_run:
                os.remove(local_path)
        else:
            report.actions["upstream-deleted-kept-ours"] += 1
            report.notes.append(f"kept ours (upstream deleted): {local_path}")


def rename_map(packages: list[str], base_ref: str) -> dict[str, str]:
    result = run(["git", "diff", "--find-renames", "--name-status", f"{base_ref}..HEAD", "--", *packages])
    mapping: dict[str, str] = {}
    for line in result.stdout.decode().splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[0].startswith("R"):
            mapping[parts[1]] = parts[2]
    return mapping


def render_report(report: Report, dry_run: bool) -> str:
    lines = [
        "# Upstream package merge report",
        "",
        f"- packages: {', '.join(report.packages)}",
        f"- dry run: {'yes' if dry_run else 'no'}",
        "",
        "## Actions",
        "",
    ]
    for action, count in sorted(report.actions.items()):
        lines.append(f"- {action}: {count}")
    lines.extend(["", "## Conflicts", ""])
    lines.extend(f"- {path}" for path in report.conflicts) if report.conflicts else lines.append("- none")
    lines.extend(["", "## Merge errors", ""])
    lines.extend(f"- {path}" for path in report.merge_errors) if report.merge_errors else lines.append("- none")
    lines.extend(["", "## Notes", ""])
    lines.extend(f"- {note}" for note in report.notes)
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Three-way merge upstream packages into the current tree.")
    parser.add_argument("--package", action="append", required=True, dest="packages", help="Repo-relative package path (repeatable).")
    parser.add_argument("--base", default="872ad960", help="Fork-point ref (default 872ad960).")
    parser.add_argument("--upstream", default="upstream/main", help="Upstream ref (default upstream/main).")
    parser.add_argument("--report", help="Write a Markdown report to this path.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files.")
    parser.add_argument("--skip-tests", action="store_true", help="Skip test files and vitest configs.")
    parser.add_argument(
        "--normalize",
        action="store_true",
        help="Rewrite upstream ZCode names to KayingCode before merging renamed files.",
    )
    parser.add_argument(
        "--map",
        action="append",
        default=[],
        dest="prefix_maps",
        metavar="UPSTREAM=LOCAL",
        help="Map an upstream path prefix to a local prefix (repeatable).",
    )
    parser.add_argument("--allow-dirty", action="store_true", help="Allow a dirty worktree.")
    args = parser.parse_args()

    if not args.allow_dirty:
        status = run(["git", "status", "--porcelain"]).stdout.decode().strip()
        if status:
            print("Worktree is dirty. Commit/stash first, or pass --allow-dirty.", file=sys.stderr)
            return 2

    if run(["git", "rev-parse", "-q", "--verify", args.base]).returncode != 0:
        print(f"Unknown base ref: {args.base}", file=sys.stderr)
        return 2
    if run(["git", "rev-parse", "-q", "--verify", args.upstream]).returncode != 0:
        print(f"Unknown upstream ref: {args.upstream}", file=sys.stderr)
        return 2

    prefix_maps: list[tuple[str, str]] = []
    for mapping in args.prefix_maps:
        if "=" not in mapping:
            print(f"Invalid --map {mapping!r}; expected UPSTREAM=LOCAL", file=sys.stderr)
            return 2
        upstream_prefix, local_prefix = mapping.split("=", 1)
        prefix_maps.append((upstream_prefix.rstrip("/"), local_prefix.rstrip("/")))

    rename = rename_map(args.packages, args.base)
    report = Report(packages=args.packages)
    for package in args.packages:
        merge_package(
            package,
            args.base,
            args.upstream,
            args.dry_run,
            report,
            rename,
            prefix_maps,
            args.skip_tests,
            args.normalize,
        )

    text = render_report(report, args.dry_run)
    print(text)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as file:
            file.write(text + "\n")
    return 1 if report.conflicts or report.merge_errors else 0


if __name__ == "__main__":
    sys.exit(main())
