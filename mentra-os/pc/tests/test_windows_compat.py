"""Windows branches plus filesystem tests that also run natively in Windows CI."""

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from rootlens_import import core, library, site, upload_state


class FileAdb(core.Adb):
    """A portable device double, without /bin/sh or host-specific stat commands."""
    def __init__(self):
        super().__init__("unused")
        self.pulled = []
        self.cancel_after_pull = False

    def complete(self, remote):
        root = Path(remote)
        return all((root / name).is_file() and (root / name).stat().st_size for name in core.FILES)

    def metadata(self, remote):
        return core.validate_metadata(json.loads((Path(remote) / "metadata.json").read_text(encoding="utf-8")))

    def sizes(self, remote):
        return {name: (Path(remote) / name).stat().st_size for name in core.FILES}

    def checksums(self, remote):
        return {name: core.checksum(Path(remote) / name) for name in core.FILES}

    def pull(self, remote, local):
        self.pulled.append(Path(remote).name)
        shutil.copyfile(remote, local)
        if self.cancel_after_pull:
            self.cancel_event.set()


class RuntimePortabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / "現場 日本語の PC"
        self.root.mkdir()

    def test_windows_android_sdk_environment_finds_exe_with_unicode_path(self):
        sdk = self.root / "Android SDK"
        tools = sdk / "platform-tools"
        tools.mkdir(parents=True)
        executable = tools / "adb.exe"
        executable.write_bytes(b"fixture executable")
        executable.chmod(0o700)
        for variable in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
            windows_os = SimpleNamespace(name="nt", environ={variable: str(sdk)}, access=os.access, X_OK=os.X_OK)
            with self.subTest(variable=variable), patch.object(core, "os", windows_os), \
                    patch.object(core.shutil, "which", return_value=None), \
                    patch.object(core, "__file__", str(self.root / "core.py")):
                self.assertEqual(core.find_adb(), str(executable.resolve()))

    def test_windows_adb_has_no_console_and_preserves_unicode_arguments(self):
        child = Mock(returncode=0)
        child.communicate.return_value = ("撮影データ".encode("utf-8"), b"")
        child.poll.return_value = 0
        executable = str(self.root / "adb.exe")
        target = str(self.root / "録画フォルダ" / "rgb.mp4")
        adb = core.Adb(executable)
        with patch.object(core, "os", SimpleNamespace(name="nt")), \
                patch.object(core.subprocess, "CREATE_NO_WINDOW", 0x08000000, create=True), \
                patch.object(core.subprocess, "Popen", return_value=child) as popen:
            self.assertEqual(adb.run("pull", "/sdcard/rgb.mp4", target), "撮影データ")
        self.assertEqual(popen.call_args.kwargs["creationflags"], 0x08000000)
        self.assertEqual(popen.call_args.args[0][-1], target)
        self.assertEqual(popen.call_args.args[0][0], executable)
        self.assertNotIn("shell", popen.call_args.kwargs)

    def test_windows_lock_keeps_one_byte_and_unlocks_when_operation_fails(self):
        locks = []
        def locking(fd, mode, size):
            locks.append((mode, size, os.lseek(fd, 0, os.SEEK_CUR)))
        msvcrt = SimpleNamespace(locking=locking, LK_NBLCK=1, LK_UNLCK=2)
        windows_os = SimpleNamespace(name="nt", SEEK_END=os.SEEK_END)
        with patch.object(core, "os", windows_os), patch.dict(sys.modules, {"msvcrt": msvcrt}):
            for _ in range(10):
                with core.import_lock(self.root):
                    pass
            with self.assertRaisesRegex(ValueError, "operation failed"):
                with core.import_lock(self.root):
                    raise ValueError("operation failed")
        self.assertEqual((self.root / "import.lock").stat().st_size, 1)
        self.assertEqual(locks, [(mode, 1, 0) for _ in range(11) for mode in (1, 2)])

    def test_real_lock_excludes_other_process_then_releases(self):
        script = '''from pathlib import Path
import sys
from rootlens_import.core import import_lock, ImportFailure
try:
    with import_lock(Path(sys.argv[1])):
        pass
except ImportFailure:
    raise SystemExit(2)
'''
        environment = dict(os.environ)
        environment["PYTHONPATH"] = str(Path(core.__file__).resolve().parents[1])
        def attempt():
            return subprocess.run([sys.executable, "-c", script, str(self.root)], env=environment,
                                  capture_output=True, timeout=10, check=False).returncode
        with core.import_lock(self.root):
            self.assertEqual(attempt(), 2)
        self.assertEqual(attempt(), 0)

    def test_junction_reparse_tag_is_not_treated_as_a_regular_directory(self):
        candidate = Mock()
        candidate.is_symlink.return_value = False
        candidate.lstat.return_value = SimpleNamespace(st_reparse_tag=0xA0000003)
        self.assertTrue(core.is_link(candidate))
        candidate.lstat.return_value = SimpleNamespace(st_reparse_tag=0)
        self.assertFalse(core.is_link(candidate))
        self.assertFalse(core.is_link(self.root / "not-created"))

    def fixture(self):
        remote_root = self.root / "device"
        output = self.root / "recordings"
        staging = self.root / ".recordings-importing"
        name = "rec-20260911T083000.000Z"
        source = remote_root / name
        for directory in (source, output, staging):
            directory.mkdir(parents=True)
        for filename in core.FILES:
            (source / filename).write_bytes(b"synthetic fixture\n")
        metadata = {"schema": "rootlens.mentra.raw.v1", "files": list(core.FILES),
                    "content_hash": core.checksum(source / "rgb.mp4"), "description": "Windowsの合成データ"}
        (source / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
        destination = output / (name + "-" + metadata["content_hash"][:12])
        return remote_root, name, source, output, staging, destination

    def test_import_atomic_publish_reconnect_and_unicode_files_on_native_filesystem(self):
        remote, name, source, output, staging, destination = self.fixture()
        original = {p.name: p.read_bytes() for p in source.iterdir()}
        adb = FileAdb()
        states = []
        def progress(event):
            states.append(event.state)
            if event.state == "ready":
                self.assertEqual({p.name: p.read_bytes() for p in destination.iterdir()}, original)
            else:
                self.assertFalse(destination.exists())
        self.assertEqual(core.import_clip(adb, str(remote), name, output, staging,
                                         log=lambda _: None, on_clip=progress), "imported")
        self.assertEqual(core.import_clip(adb, str(remote), name, output, staging,
                                         log=lambda _: None), "existing")
        self.assertEqual(adb.pulled, list(core.FILES))
        self.assertEqual(states[-1], "ready")
        self.assertEqual(list(staging.iterdir()), [])
        self.assertEqual({p.name: p.read_bytes() for p in source.iterdir()}, original)

    def test_cancelled_native_copy_never_publishes_partial_files_and_can_retry(self):
        remote, name, source, output, staging, destination = self.fixture()
        adb = FileAdb()
        adb.cancel_event = threading.Event()
        adb.cancel_after_pull = True
        with self.assertRaises(core.ImportCancelled):
            core.import_clip(adb, str(remote), name, output, staging, log=lambda _: None)
        self.assertFalse(destination.exists())
        self.assertEqual(list(staging.iterdir()), [])
        self.assertTrue(all((source / name).is_file() for name in core.FILES))
        adb.cancel_after_pull = False
        adb.cancel_event.clear()
        self.assertEqual(core.import_clip(adb, str(remote), name, output, staging,
                                         log=lambda _: None), "imported")

    @unittest.skipUnless(os.name == "nt", "native Windows junction test")
    def test_native_junction_cannot_redirect_site_or_staging_cleanup(self):
        target = self.root / "other-site"
        target.mkdir()
        kept = target / "keep.txt"
        kept.write_text("synthetic data", encoding="utf-8")
        junction = self.root / "site-junction"
        result = subprocess.run([os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", "mklink", "/J",
                                 str(junction), str(target)], capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, "The native Windows junction fixture could not be created")
        self.addCleanup(lambda: junction.rmdir() if junction.exists() else None)
        self.assertTrue(core.is_link(junction))
        self.assertFalse(junction.is_symlink())
        with self.assertRaises(core.ImportFailure):
            library.recordings_directory("fixture", junction)
        profile = site.SiteProfile("fixture", "試験", "https://drive.google.com/drive/folders/TESTFOLDER00000")
        with self.assertRaises(core.ImportFailure):
            site.save_site_profile(profile, junction / "site.json")
        with self.assertRaises(core.ImportFailure):
            upload_state.state_directory(profile, junction)
        with self.assertRaises(core.ImportFailure):
            with core.import_lock(junction):
                pass
        stale = self.root / "rec-20260911T083000.000Z-abcdefgh"
        result = subprocess.run([os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", "mklink", "/J",
                                 str(stale), str(target)], capture_output=True, check=False)
        self.assertEqual(result.returncode, 0)
        self.addCleanup(lambda: stale.rmdir() if stale.exists() else None)
        core.recover_staging(self.root)
        self.assertTrue(stale.exists())
        self.assertEqual(kept.read_text(encoding="utf-8"), "synthetic data")
