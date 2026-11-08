from __future__ import annotations

import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

from android_app_signature import extract_apk_signer_certificate
from common import certificate_chain, certificate_facts, select_leaf_certificate


def _lp(value: bytes) -> bytes:
    return struct.pack("<I", len(value)) + value


def _make_certificate(
    directory: Path, name: str, *, is_ca: bool, algorithm: str = "rsa"
) -> bytes:
    key = directory / f"{name}.key"
    cert = directory / f"{name}.pem"
    if algorithm == "rsa":
        create_key = ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key)]
    elif algorithm == "ec":
        create_key = ["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key)]
    else:
        raise ValueError(f"unsupported test key algorithm: {algorithm}")
    subprocess.run(create_key, check=True, capture_output=True)
    subprocess.run(
        [
            "openssl", "req", "-new", "-x509", "-key", str(key), "-out", str(cert),
            "-subj", f"/CN={name}", "-days", "1", "-sha256", "-addext",
            f"basicConstraints=critical,CA:{'TRUE' if is_ca else 'FALSE'}",
        ],
        check=True,
        capture_output=True,
    )
    return cert.read_bytes()


def _make_v2_signed_apk(certificate_der: bytes) -> bytes:
    digests = _lp(b"")
    certificates = _lp(certificate_der)
    attributes = _lp(b"")
    signed_data = _lp(digests) + _lp(certificates) + _lp(attributes)
    signer = _lp(signed_data) + _lp(b"") + _lp(b"")
    scheme_value = _lp(_lp(signer))
    pair = struct.pack("<Q", 4 + len(scheme_value)) + struct.pack("<I", 0x7109871A) + scheme_value
    block_size = len(pair) + 24
    signing_block = struct.pack("<Q", block_size) + pair + struct.pack("<Q", block_size) + b"APK Sig Block 42"
    prefix = b"apk-content"
    central_directory_offset = len(prefix) + len(signing_block)
    eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 0, 0, 0, central_directory_offset, 0)
    return prefix + signing_block + eocd


class SignatureInfoTests(unittest.TestCase):
    def test_harmony_certificate_chain_selects_signing_leaf(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            root = _make_certificate(directory, "Root", is_ca=True)
            leaf = _make_certificate(directory, "SigningLeaf", is_ca=False, algorithm="ec")
            chain = certificate_chain(root + leaf)
            selected, facts = select_leaf_certificate(chain)
            self.assertEqual(certificate_facts(leaf)["md5Fingerprint"], facts["md5Fingerprint"])
            self.assertIn("publicKeyHex", facts)
            self.assertTrue(facts["publicKeyHex"].startswith("04"))
            self.assertNotEqual(selected, root)

    def test_android_signing_block_yields_first_signer_certificate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            certificate = _make_certificate(directory, "AndroidSigner", is_ca=False)
            der = certificate_chain(certificate)[0]
            apk = directory / "test.apk"
            apk.write_bytes(_make_v2_signed_apk(der))
            self.assertEqual(der, extract_apk_signer_certificate(apk))


if __name__ == "__main__":
    unittest.main()
