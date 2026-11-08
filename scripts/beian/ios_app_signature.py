#!/usr/bin/env python3
"""Extract iOS App filing information from a signed IPA or app bundle."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from common import BeianError, certificate_facts, emit, run


def _app_from_ipa(ipa_path: Path, destination: Path) -> Path:
    try:
        with zipfile.ZipFile(ipa_path) as archive:
            app_roots = sorted(
                {
                    "/".join(PurePosixPath(name).parts[:2])
                    for name in archive.namelist()
                    if len(PurePosixPath(name).parts) >= 3
                    and PurePosixPath(name).parts[0] == "Payload"
                    and PurePosixPath(name).parts[1].endswith(".app")
                }
            )
            if len(app_roots) != 1:
                raise BeianError(f"IPA 中應有一個 Payload/*.app，實際找到 {len(app_roots)} 個。")

            app_relative = PurePosixPath(app_roots[0])
            app_destination = destination.joinpath(*app_relative.parts)
            root_resolved = destination.resolve()
            for item in archive.infolist():
                relative = PurePosixPath(item.filename)
                if relative.parts[: len(app_relative.parts)] != app_relative.parts:
                    continue
                if ".." in relative.parts or relative.is_absolute():
                    raise BeianError("IPA 中包含不安全的路徑。")
                target = destination.joinpath(*relative.parts)
                if root_resolved not in target.resolve().parents and target.resolve() != root_resolved:
                    raise BeianError("IPA 中的路徑超出暫存目錄。")
                if item.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(item) as source, target.open("wb") as output:
                        shutil.copyfileobj(source, output)
            return app_destination
    except zipfile.BadZipFile as error:
        raise BeianError("輸入文件不是有效 IPA/ZIP 文件。") from error


def _find_app(path: Path, temp_root: Path) -> Path:
    if path.suffix.lower() == ".ipa":
        return _app_from_ipa(path, temp_root)
    if path.suffix.lower() == ".xcarchive":
        candidates = sorted((path / "Products/Applications").glob("*.app"))
        if len(candidates) != 1:
            raise BeianError(f"xcarchive 中應有一個 App，實際找到 {len(candidates)} 個。")
        return candidates[0]
    if path.suffix.lower() == ".app" and path.is_dir():
        return path
    raise BeianError("請提供已簽名的 .ipa、.app 或 .xcarchive。")


def inspect_ios_artifact(path: Path) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="kayingcode-beian-ios-") as temp_dir:
        app = _find_app(path, Path(temp_dir))
        run(["codesign", "--verify", "--deep", "--strict", str(app)])
        signature = subprocess.run(
            ["codesign", "-dv", "--verbose=4", str(app)],
            capture_output=True,
            text=True,
            check=False,
        )
        details = signature.stderr + signature.stdout
        if signature.returncode != 0:
            raise BeianError(f"codesign 無法讀取 App 簽名：{details.strip()}")
        bundle_match = re.search(r"^Identifier=(.+)$", details, re.MULTILINE)
        authorities = re.findall(r"^Authority=(.+)$", details, re.MULTILINE)
        if not bundle_match:
            raise BeianError("codesign 未返回 Bundle ID。")
        identity = authorities[0] if authorities else "未知簽名身份"

        cert_dir = Path(temp_dir) / "certs"
        cert_dir.mkdir()
        subprocess.run(
            ["codesign", "-d", "--extract-certificates", str(app)],
            cwd=cert_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        leaf = cert_dir / "codesign0"
        if not leaf.is_file():
            raise BeianError("codesign 未能提取 App 簽名證書。")
        facts = certificate_facts(leaf.read_bytes())

    return {
        "platform": "iOS",
        "packageId": bundle_match.group(1),
        "signingIdentity": identity,
        "publicKeyAlgorithm": facts["publicKeyAlgorithm"],
        "publicKeyHex": facts["publicKeyHex"],
        "publicKeyDecimal": facts.get("publicKeyDecimal"),
        "sha1Fingerprint": facts["sha1Fingerprint"],
        "certificateSubject": facts["subject"],
        "signatureVerified": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="已簽名的 IPA、.app 或 .xcarchive")
    parser.add_argument("--json", action="store_true", help="以 JSON 輸出")
    args = parser.parse_args()
    try:
        artifact = args.artifact.expanduser().resolve()
        if not artifact.exists():
            raise BeianError(f"iOS 產物不存在：{artifact}")
        result = inspect_ios_artifact(artifact)
        emit(result, as_json=args.json)
        return 0
    except BeianError as error:
        print(f"錯誤：{error}", file=sys.stderr)
        return 1
    except FileNotFoundError as error:
        print(f"錯誤：找不到所需命令：{error.filename}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
