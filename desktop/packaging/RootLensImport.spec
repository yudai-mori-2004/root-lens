# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path
import sys

packaging = Path(SPECPATH)
pc = packaging.parent
sys.path.insert(0, str(pc))
from rootlens_import import __version__
runtime = Path(os.environ["ROOTLENS_PACKAGING_RUNTIME"])
names = ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"] if sys.platform == "win32" else ["adb"]
identity = os.environ.get("ROOTLENS_CODESIGN_IDENTITY") or None

analysis = Analysis(
    [str(packaging / "launcher.py")],
    pathex=[str(pc), str(packaging)],
    binaries=[(str(runtime / name), "rootlens_import/runtime") for name in names],
    datas=[(str(runtime / name), "rootlens_import/runtime")
           for name in ("NOTICE.txt", "runtime-manifest.json")]
          + [(os.environ["ROOTLENS_RUNTIME_NOTICES"], "THIRD-PARTY-NOTICES"),
             (str(pc / "rootlens_import/assets/rootlens.png"), "rootlens_import/assets")],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "_tkinter"],
    noarchive=False,
)
archive = PYZ(analysis.pure)
executable = EXE(
    archive, analysis.scripts, [],
    exclude_binaries=True,
    name="RootLens Import",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    icon=str(packaging / "icons/rootlens.ico") if sys.platform == "win32" else None,
    version=os.environ.get("ROOTLENS_WINDOWS_VERSION_INFO") if sys.platform == "win32" else None,
    codesign_identity=identity,
    entitlements_file=None,
)
collection = COLLECT(
    executable, analysis.binaries, analysis.datas,
    strip=False, upx=False, name="RootLens Import",
)
if sys.platform == "darwin":
    application = BUNDLE(
        collection,
        name="RootLens Import.app",
        icon=str(packaging / "icons/rootlens.icns"),
        bundle_identifier="io.rootlens.import",
        info_plist={
            "CFBundleDisplayName": "RootLens",
            "CFBundleShortVersionString": __version__,
            "CFBundleVersion": __version__,
            "CFBundleDevelopmentRegion": "ja",
            "CFBundleLocalizations": ["ja"],
            "NSHighResolutionCapable": True,
        },
    )
