#!/usr/bin/env python3
"""Extract HarmonyOS App filing information from a release certificate chain."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from common import BeianError, certificate_chain, emit, require_file, select_leaf_certificate


def inspect_harmony_certificate(path: Path, package_id: str | None = None) -> dict[str, object]:
    certificates = certificate_chain(path.read_bytes())
    certificate, facts = select_leaf_certificate(certificates)
    # Keep this digest check tied to the selected leaf certificate; never use a CA in the chain.
    del certificate
    return {
        "platform": "HarmonyOS",
        "packageId": package_id,
        "publicKeyAlgorithm": facts["publicKeyAlgorithm"],
        "publicKeyHex": facts["publicKeyHex"],
        "publicKeyDecimal": facts.get("publicKeyDecimal"),
        "md5Fingerprint": facts["md5Fingerprint"],
        "sha1Fingerprint": facts["sha1Fingerprint"],
        "certificateSubject": facts["subject"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("certificate", type=Path, help="AppGallery Connect 的发行证书链 .cer")
    parser.add_argument("--package-id", help="鸿蒙包名，可选；填写后随结果输出")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出")
    args = parser.parse_args()
    try:
        result = inspect_harmony_certificate(
            require_file(args.certificate, "鸿蒙签名证书"), args.package_id
        )
        emit(result, as_json=args.json)
        return 0
    except BeianError as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
