#!/usr/bin/env python3
"""Create a drag-to-Applications disk image from a completed Mac app bundle."""

import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--release", action="store_true",
                        help="Require Gatekeeper acceptance and a stapled notarization ticket")
    args = parser.parse_args(arguments)
    application = args.app.expanduser().resolve(strict=True)
    if application.suffix != ".app" or not application.is_dir():
        parser.error("--app must be the completed .app bundle")
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(application)], check=True)
    signature = subprocess.run(["codesign", "--display", "--verbose=4", str(application)],
                               check=True, capture_output=True, text=True).stderr
    authorities = [line.removeprefix("Authority=") for line in signature.splitlines()
                   if line.startswith("Authority=")]
    if args.release:
        subprocess.run(["spctl", "--assess", "--type", "execute", str(application)], check=True)
        subprocess.run(["xcrun", "stapler", "validate", str(application)], check=True)
    output = args.output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    with (application / "Contents/Info.plist").open("rb") as source:
        info = plistlib.load(source)
    binary = application / "Contents/MacOS" / info["CFBundleExecutable"]
    architectures = subprocess.check_output(["lipo", "-archs", str(binary)], text=True).strip().split()
    architecture = "universal2" if set(architectures) == {"arm64", "x86_64"} else "-".join(architectures)
    image = output / f"RootLens-Import-{info['CFBundleShortVersionString']}-macOS-{architecture}.dmg"
    for artifact in (image, image.with_suffix(".dmg.sha256"), image.with_suffix(".dmg.manifest.json")):
        if artifact.exists():
            parser.error(f"An artifact already exists: {artifact}")
    with tempfile.TemporaryDirectory(prefix="rootlens-install-image-") as temporary:
        stage = Path(temporary)
        shutil.copytree(application, stage / application.name, symlinks=True)
        (stage / "アプリケーション").symlink_to("/Applications", target_is_directory=True)
        (stage / "はじめに.txt").write_text(
            "RootLens Import.app を「アプリケーション」にドラッグしてください。\n"
            "アプリの「設定」を開き、「事業所の設定を読み込む」から、事業所のDriveにある rootlens-site.json を選びます。\n"
            "設定済みの場合は、そのまま使えます。\n"
            "スマートグラスをUSBケーブルでつなぎ、「接続」を押してください。\n"
            "録画の映像と音声を確認したら、「アップロード」を押します。\n"
            "保存を確認できた録画は、スマートグラスから削除されます。\n"
            "詳しい手順は、事業所のDriveにある「アップロード手順説明.pdf」をご覧ください。\n", encoding="utf-8",
        )
        subprocess.run(["hdiutil", "create", "-volname", "RootLens", "-srcfolder", str(stage),
                        "-format", "UDZO", str(image)], check=True)
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    image.with_suffix(".dmg.sha256").write_text(f"{digest}  {image.name}\n", encoding="ascii")
    manifest = {
        "version": info["CFBundleShortVersionString"], "architecture": architecture,
        "artifact": image.name, "bytes": image.stat().st_size, "sha256": digest,
        "signing": {
            "integrity_verified": True,
            "kind": "ad-hoc" if "Signature=adhoc" in signature else
                    "developer-id" if any(a.startswith("Developer ID Application:") for a in authorities) else "other",
            "authorities": authorities,
            "gatekeeper": "accepted" if args.release else "not-checked",
            "stapled_notarization": "verified" if args.release else "not-checked",
        },
    }
    image.with_suffix(".dmg.manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(image)


if __name__ == "__main__":
    main()
