#!/usr/bin/env python3
"""Extract Android App filing information from a verified signed APK."""

from __future__ import annotations

import argparse
import re
import struct
import sys
import tempfile
import zipfile
from pathlib import Path

from common import BeianError, certificate_chain, certificate_facts, emit, find_android_tool, require_file, run, select_leaf_certificate


APK_SCHEMES = (0x1B93AD61, 0xF05368C0, 0x7109871A)  # v3.1, v3, v2
APK_EOCD = b"PK\x05\x06"
APK_SIGNING_BLOCK_MAGIC = b"APK Sig Block 42"


def _length_prefixed(data: bytes, offset: int) -> tuple[bytes, int]:
    if offset + 4 > len(data):
        raise BeianError("APK 签名块长度字段不完整。")
    length = struct.unpack_from("<I", data, offset)[0]
    start = offset + 4
    end = start + length
    if end > len(data):
        raise BeianError("APK 签名块字段超出文件范围。")
    return data[start:end], end


def _certificates_from_scheme_value(value: bytes) -> list[bytes]:
    signers, _ = _length_prefixed(value, 0)
    signer_list = []
    offset = 0
    while offset < len(signers):
        signer, offset = _length_prefixed(signers, offset)
        signer_list.append(signer)
    if len(signer_list) != 1:
        raise BeianError(
            f"APK 包含 {len(signer_list)} 个并行签名者；请逐个确认备案特征信息。"
        )

    signed_data, _ = _length_prefixed(signer_list[0], 0)
    _, offset = _length_prefixed(signed_data, 0)  # digests
    certificate_sequence, _ = _length_prefixed(signed_data, offset)
    certificates = []
    offset = 0
    while offset < len(certificate_sequence):
        certificate, offset = _length_prefixed(certificate_sequence, offset)
        certificates.append(certificate)
    if not certificates:
        raise BeianError("APK signer 中没有 X.509 证书。")
    return certificates


def extract_apk_signer_certificate(apk_path: Path) -> bytes:
    data = apk_path.read_bytes()
    eocd_offset = data.rfind(APK_EOCD, max(0, len(data) - 65_557))
    if eocd_offset < 0 or eocd_offset + 20 > len(data):
        raise BeianError("APK 中找不到有效的 ZIP 目录结尾。")
    central_directory_offset = struct.unpack_from("<I", data, eocd_offset + 16)[0]
    if central_directory_offset == 0xFFFFFFFF:
        locator = data.rfind(b"PK\x06\x07", max(0, eocd_offset - 64), eocd_offset)
        if locator < 0:
            raise BeianError("APK 使用 ZIP64，但缺少 ZIP64 目录定位器。")
        zip64_eocd_offset = struct.unpack_from("<Q", data, locator + 8)[0]
        central_directory_offset = struct.unpack_from("<Q", data, zip64_eocd_offset + 48)[0]

    footer_start = central_directory_offset - 24
    if footer_start < 0 or data[footer_start + 8 : central_directory_offset] != APK_SIGNING_BLOCK_MAGIC:
        return _extract_v1_certificate(apk_path)

    block_size = struct.unpack_from("<Q", data, footer_start)[0]
    block_start = central_directory_offset - block_size - 8
    if block_start < 0 or struct.unpack_from("<Q", data, block_start)[0] != block_size:
        raise BeianError("APK 签名块长度不一致。")

    pairs: dict[int, bytes] = {}
    offset = block_start + 8
    while offset < footer_start:
        pair_length = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        if pair_length < 4 or offset + pair_length > footer_start:
            raise BeianError("APK 签名块包含无效的方案条目。")
        scheme_id = struct.unpack_from("<I", data, offset)[0]
        pairs[scheme_id] = data[offset + 4 : offset + pair_length]
        offset += pair_length

    for scheme_id in APK_SCHEMES:
        if scheme_id in pairs:
            certificates = _certificates_from_scheme_value(pairs[scheme_id])
            # APK signer certificate lists place the leaf signing certificate first.
            return certificates[0]
    return _extract_v1_certificate(apk_path)


def _extract_v1_certificate(apk_path: Path) -> bytes:
    try:
        with zipfile.ZipFile(apk_path) as archive:
            signers = [
                name
                for name in archive.namelist()
                if name.upper().startswith("META-INF/")
                and name.upper().endswith((".RSA", ".DSA", ".EC"))
            ]
            if len(signers) != 1:
                raise BeianError(
                    f"未找到 APK v2/v3 签名块，且 v1 签名证书数量为 {len(signers)}。"
                )
            certificate_bytes = archive.read(signers[0])
    except zipfile.BadZipFile as error:
        raise BeianError("输入文件不是有效 APK/ZIP 文件。") from error

    certificates = certificate_chain(certificate_bytes)
    certificate, _ = select_leaf_certificate(certificates)
    return certificate


def _package_id(apk_path: Path) -> str:
    aapt = find_android_tool("aapt")
    output = run([aapt, "dump", "badging", str(apk_path)])
    match = re.search(r"^package: name='([^']+)'", output, re.MULTILINE)
    if not match:
        raise BeianError("aapt 未能从 APK 中读取 applicationId。")
    return match.group(1)


def inspect_apk(apk_path: Path) -> dict[str, object]:
    apksigner = find_android_tool("apksigner")
    run([apksigner, "verify", str(apk_path)])
    certificate = extract_apk_signer_certificate(apk_path)
    facts = certificate_facts(certificate)
    return {
        "platform": "Android",
        "packageId": _package_id(apk_path),
        "publicKeyAlgorithm": facts["publicKeyAlgorithm"],
        "publicKeyHex": facts["publicKeyHex"],
        "publicKeyDecimal": facts.get("publicKeyDecimal"),
        "md5Fingerprint": facts["md5Fingerprint"],
        "certificateSubject": facts["subject"],
        "signatureVerified": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path, help="已签名的 APK 文件")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出")
    args = parser.parse_args()
    try:
        result = inspect_apk(require_file(args.apk, "APK 文件"))
        emit(result, as_json=args.json)
        return 0
    except BeianError as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
