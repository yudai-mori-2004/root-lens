"""Validate packaged ADB, HTTPS trust, and key signing without a site credential."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import certifi
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from google.oauth2.service_account import Credentials
import requests

from rootlens_import import core
from rootlens_import.branding import ICON_PATH
from PySide6.QtGui import QImage


def main(arguments=None):
    argparse.ArgumentParser(description=__doc__).parse_args(arguments)
    try:
        adb = Path(core.find_adb())
        if adb.parent.resolve() != Path(core.__file__).with_name("runtime").resolve():
            raise RuntimeError("ADB was not loaded from the application bundle")
        manifest = json.loads((adb.parent / "runtime-manifest.json").read_text(encoding="utf-8"))
        logo = QImage(str(ICON_PATH))
        if (logo.width(), logo.height()) != (1024, 1024) or \
                hashlib.sha256(ICON_PATH.read_bytes()).hexdigest() != manifest["app_icon_sha256"]:
            raise RuntimeError("The bundled RootLens icon is missing or differs from the build input")
        result = subprocess.run([str(adb), "version"], check=True, capture_output=True,
                                text=True, timeout=15,
                                creationflags=subprocess.CREATE_NO_WINDOW if core.os.name == "nt" else 0)
        if "Version 37.0.0" not in result.stdout:
            raise RuntimeError("Unexpected bundled ADB version")
        certificates = Path(certifi.where())
        if not certificates.is_file():
            raise RuntimeError("Bundled TLS certificates are missing")
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption()).decode()
        credentials = Credentials.from_service_account_info({
            "type": "service_account", "project_id": "rootlens-runtime-check",
            "private_key_id": "ephemeral", "private_key": pem,
            "client_email": "test@rootlens-runtime-check.iam.gserviceaccount.com",
            "token_uri": "https://oauth2.googleapis.com/token",
        }, scopes=["https://www.googleapis.com/auth/drive"])
        message = b"RootLens local runtime verification; this is not an upload"
        signature = credentials.sign_bytes(message)
        key.public_key().verify(signature, message, padding.PKCS1v15(), hashes.SHA256())
        with requests.Session() as session:
            session.trust_env = False
            response = session.get("https://www.googleapis.com/drive/v3/about?fields=kind",
                                   timeout=(10, 20), allow_redirects=False, verify=str(certificates))
            try:
                if response.status_code != 401:
                    raise RuntimeError("Expected an unauthenticated Drive response")
            finally:
                response.close()
        print(json.dumps({"ok": True, "bundled_adb": True, "adb_version": "37.0.0", "app_icon": True,
                          "certificate_bundle": True, "rsa_signing": True,
                          "drive_https_status": 401, "site_credentials_used": False}))
        return 0
    except Exception:
        print(json.dumps({"ok": False, "error": "Bundled runtime or unauthenticated HTTPS verification failed."}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
