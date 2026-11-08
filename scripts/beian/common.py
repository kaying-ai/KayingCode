#!/usr/bin/env python3
"""Shared certificate parsing and output helpers for App filing scripts."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


class BeianError(RuntimeError):
    """An actionable input or tooling error."""


def run(command: list[str], *, input_text: str | None = None) -> str:
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            input=input_text,
        )
    except FileNotFoundError as error:
        raise BeianError(f"找不到所需命令：{command[0]}") from error
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "").strip()
        raise BeianError(f"命令执行失败：{' '.join(command[:3])}\n{detail}") from error
    return result.stdout


def require_file(path: Path, description: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise BeianError(f"{description}不存在或不是文件：{resolved}")
    return resolved


def find_android_tool(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found

    sdk_roots = [
        os.environ.get("ANDROID_SDK_ROOT"),
        os.environ.get("ANDROID_HOME"),
        str(Path.home() / "Library/Android/sdk"),
        str(Path.home() / "Android/Sdk"),
    ]
    for root in filter(None, sdk_roots):
        build_tools = Path(root) / "build-tools"
        if not build_tools.is_dir():
            continue
        for version in sorted(build_tools.iterdir(), reverse=True):
            candidate = version / name
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
    raise BeianError(
        f"找不到 Android SDK 工具 {name}。请安装 Android SDK Build-Tools，"
        "并将其目录加入 PATH，或设置 ANDROID_SDK_ROOT。"
    )


def _normalize_certificate(certificate: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix="kayingcode-beian-cert-") as temp_dir:
        source = Path(temp_dir) / "input.cer"
        output = Path(temp_dir) / "certificate.pem"
        source.write_bytes(certificate)
        for options in (["-inform", "DER"], []):
            command = ["openssl", "x509", *options, "-in", str(source), "-out", str(output)]
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode == 0:
                return output.read_bytes()
        raise BeianError("无法解析 X.509 证书；请提供 PEM 或 DER 格式的证书。")


def split_pem_certificates(data: bytes) -> list[bytes]:
    pattern = re.compile(
        rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
        re.DOTALL,
    )
    return pattern.findall(data)


def certificate_chain(data: bytes, *, allow_pkcs7: bool = True) -> list[bytes]:
    pem_certificates = split_pem_certificates(data)
    if pem_certificates:
        return [_normalize_certificate(certificate) for certificate in pem_certificates]

    try:
        return [_normalize_certificate(data)]
    except BeianError:
        if not allow_pkcs7:
            raise

    with tempfile.TemporaryDirectory(prefix="kayingcode-beian-chain-") as temp_dir:
        source = Path(temp_dir) / "input.p7b"
        output = Path(temp_dir) / "certificates.pem"
        source.write_bytes(data)
        errors = []
        for encoding in ("DER", "PEM"):
            result = subprocess.run(
                [
                    "openssl",
                    "pkcs7",
                    "-inform",
                    encoding,
                    "-in",
                    str(source),
                    "-print_certs",
                    "-out",
                    str(output),
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                certs = split_pem_certificates(output.read_bytes())
                if certs:
                    return [_normalize_certificate(cert) for cert in certs]
            errors.append((result.stderr or "").strip())
        raise BeianError("无法解析证书或 PKCS#7 证书链。\n" + "\n".join(filter(None, errors)))


def certificate_facts(certificate_pem: bytes) -> dict[str, Any]:
    normalized = _normalize_certificate(certificate_pem)
    with tempfile.TemporaryDirectory(prefix="kayingcode-beian-facts-") as temp_dir:
        cert_path = Path(temp_dir) / "certificate.pem"
        cert_path.write_bytes(normalized)

        text = run(["openssl", "x509", "-in", str(cert_path), "-noout", "-text"])
        subject = run(["openssl", "x509", "-in", str(cert_path), "-noout", "-subject"]).strip()
        ca_match = re.search(r"CA:(TRUE|FALSE)", text)
        public_key_pem = run(
            ["openssl", "x509", "-in", str(cert_path), "-pubkey", "-noout"]
        )
        public_key = run(
            ["openssl", "pkey", "-pubin", "-text", "-noout"],
            input_text=public_key_pem,
        )
        sha1 = _fingerprint(cert_path, "sha1")
        md5 = _fingerprint(cert_path, "md5")

    algorithm_match = re.search(r"Public Key Algorithm:\s*(.+)", text)
    algorithm = algorithm_match.group(1).strip() if algorithm_match else "unknown"
    facts: dict[str, Any] = {
        "subject": subject.removeprefix("subject="),
        "isCa": bool(ca_match and ca_match.group(1) == "TRUE"),
        "publicKeyAlgorithm": algorithm,
        "md5Fingerprint": md5,
        "sha1Fingerprint": sha1,
    }

    if "Modulus:" in public_key:
        modulus = public_key.split("Modulus:", 1)[1].split("Exponent:", 1)[0]
        key_hex = "".join(re.findall(r"\b[0-9a-fA-F]{2}\b", modulus)).lstrip("0").upper()
        if not key_hex:
            raise BeianError("无法从 RSA 证书读取公钥模数。")
        facts["publicKeyHex"] = key_hex
        facts["publicKeyDecimal"] = str(int(key_hex, 16))
    elif "pub:" in public_key:
        point = public_key.split("pub:", 1)[1]
        point = point.split("ASN1 OID:", 1)[0].split("NIST CURVE:", 1)[0]
        key_hex = "".join(re.findall(r"\b[0-9a-fA-F]{2}\b", point)).upper()
        if not key_hex:
            raise BeianError("无法从椭圆曲线证书读取公钥点。")
        facts["publicKeyHex"] = key_hex
    else:
        raise BeianError(f"暂不支持此证书公钥类型：{algorithm}")
    return facts


def _fingerprint(cert_path: Path, algorithm: str) -> str:
    output = run(
        ["openssl", "x509", "-in", str(cert_path), "-noout", "-fingerprint", f"-{algorithm}"]
    ).strip()
    if "=" not in output:
        raise BeianError(f"OpenSSL 未返回 {algorithm.upper()} 证书指纹。")
    fingerprint = output.rsplit("=", 1)[1].replace(":", "").strip().upper()
    expected_length = 32 if algorithm == "md5" else 40
    if len(fingerprint) != expected_length:
        raise BeianError(f"{algorithm.upper()} 证书指纹长度异常：{len(fingerprint)}")
    return fingerprint


def select_leaf_certificate(certificates: list[bytes]) -> tuple[bytes, dict[str, Any]]:
    facts = [(certificate, certificate_facts(certificate)) for certificate in certificates]
    leaves = [(certificate, info) for certificate, info in facts if not info["isCa"]]
    if len(leaves) != 1:
        raise BeianError(
            f"证书链中应有且仅有一个非 CA 签名证书，实际找到 {len(leaves)} 个。"
        )
    return leaves[0]


def emit(result: dict[str, Any], *, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    labels = {
        "platform": "平台",
        "packageId": "包名 / Bundle ID",
        "signingIdentity": "签名身份",
        "publicKeyAlgorithm": "公钥算法",
        "publicKeyHex": "公钥（十六进制）",
        "publicKeyDecimal": "公钥（十进制）",
        "md5Fingerprint": "证书 MD5",
        "sha1Fingerprint": "证书 SHA-1",
        "certificateSubject": "签名证书主体",
        "signatureVerified": "签名校验",
    }
    for key, label in labels.items():
        if key in result and result[key] is not None:
            print(f"{label}: {result[key]}")

