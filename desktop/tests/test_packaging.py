"""Check windowed diagnostic output and the RootLens runtime verifier."""

import importlib.util
import hashlib
import json
import os
from pathlib import Path
import subprocess
import plistlib
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch


PACKAGING = Path(__file__).resolve().parents[1] / "packaging"


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, PACKAGING / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PackagingTests(unittest.TestCase):
    def test_build_has_no_os_credential_store_dependency(self):
        build = load_module("build")
        requirements = build.build_requirements(PACKAGING / "requirements-build.txt")
        names = {name for name, _ in requirements}
        self.assertTrue(names.isdisjoint({"keyring", "pywin32-ctypes", "jaraco.classes",
                                          "jaraco.context", "jaraco.functools", "more-itertools"}))

    def test_windowed_cli_writes_utf8_diagnostic_without_standard_streams(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "診断.log"
            environment = dict(os.environ, PYTHONPATH=str(PACKAGING.parent))
            code = "import runpy,sys; launcher=sys.argv[1]; sys.argv=[launcher,*sys.argv[2:]]; sys.stdout=sys.stderr=None; runpy.run_path(launcher,run_name='__main__')"
            command = [sys.executable, "-c", code, str(PACKAGING / "launcher.py"),
                       "--diagnostic-output", str(output), "--cli", "--help"]
            result = subprocess.run(command, env=environment, capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("保存先", output.read_text(encoding="utf-8"))
            original = output.read_bytes()
            result = subprocess.run(command, env=environment, capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(output.read_bytes(), original)

    def test_diagnostic_output_allows_normal_gui_launch_without_subcommand(self):
        launcher = load_module("launcher")
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "gui.log"
            with patch.object(sys, "argv", ["app", "--diagnostic-output", str(output)]), \
                    patch.object(sys, "stdout"), patch.object(sys, "stderr"):
                self.assertTrue(launcher.configure_diagnostic_output())
                stream = sys.stdout
                self.assertEqual(sys.argv, ["app"])
                stream.close()

    def test_runtime_uses_bundled_adb_and_rootlens_https(self):
        check = load_module("runtime_check")
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary).resolve()
            certificates = directory / "ca.pem"
            certificates.write_text("test CA path")
            (directory / "runtime").mkdir()
            (directory / "runtime/runtime-manifest.json").write_text(json.dumps({
                "app_icon_sha256": hashlib.sha256(check.ICON_PATH.read_bytes()).hexdigest()}))
            response = Mock(status_code=401)
            session = Mock()
            session.get.return_value = response
            context = Mock()
            context.__enter__ = Mock(return_value=session)
            context.__exit__ = Mock(return_value=False)
            with patch.object(check.core, "__file__", str(directory / "core.py")), \
                    patch.object(check.core, "find_adb", return_value=str(directory / "runtime" / "adb.exe")), \
                    patch.object(check.subprocess, "run", return_value=Mock(stdout="Android Debug Bridge\nVersion 37.0.0-test\n")), \
                    patch.object(check.certifi, "where", return_value=str(certificates)), \
                    patch.object(check.requests, "Session", return_value=context), patch("builtins.print") as output:
                self.assertEqual(check.main([]), 0)
                report = json.loads(output.call_args.args[0])
                self.assertNotIn("credential_store_client", report)
                self.assertTrue(report["app_icon"])
            self.assertFalse(session.trust_env)
            session.get.assert_called_once_with("https://www.rootlens.io/api/v1/desktop-auth/session",
                                                timeout=(10, 20), allow_redirects=False, verify=str(certificates))

    def test_runtime_rejects_adb_from_outside_bundle_without_network(self):
        check = load_module("runtime_check")
        with patch.object(check.core, "find_adb", return_value="/external/adb.exe"), \
                patch.object(check.requests, "Session") as session, patch("builtins.print"):
            self.assertEqual(check.main([]), 1)
        session.assert_not_called()

    def test_icon_manifest_preserves_logo_and_detects_changed_icon(self):
        build = load_module("build")
        manifest = build.verify_icon_assets(PACKAGING.parent)
        self.assertEqual(manifest["source_sha256"], manifest["sha256"]["rootlens_import/assets/rootlens.png"])
        with tempfile.TemporaryDirectory() as temporary:
            pc = Path(temporary)
            for name in (*manifest["sha256"], "packaging/icons/manifest.json"):
                target = pc / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((PACKAGING.parent / name).read_bytes())
            (pc / "packaging/icons/rootlens.ico").write_bytes(b"unrelated icon")
            with self.assertRaisesRegex(RuntimeError, "differs from its manifest"):
                build.verify_icon_assets(pc)

    def test_macos_artifact_has_neutral_name_and_records_actual_signature(self):
        package = load_module("package-macos")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            app = root / "RootLens Import.app"
            (app / "Contents").mkdir(parents=True)
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps({
                "CFBundleShortVersionString": "0.4.2", "CFBundleExecutable": "RootLens Import"}))
            captured = {}

            def command(args, **kwargs):
                if args[0] == "hdiutil":
                    captured["instructions"] = (Path(args[args.index("-srcfolder") + 1]) / "はじめに.txt").read_text()
                    Path(args[-1]).write_bytes(b"mock disk image")
                return Mock(stderr="Signature=adhoc\n")

            with patch.object(package.subprocess, "run", side_effect=command) as run, \
                    patch.object(package.subprocess, "check_output", return_value="arm64\n"), patch("builtins.print"):
                package.main(["--app", str(app), "--output", str(root / "out")])
            image = root / "out/RootLens-Import-0.4.2-macOS-arm64.dmg"
            manifest = json.loads(image.with_suffix(".dmg.manifest.json").read_text())
            self.assertEqual(manifest["signing"]["kind"], "ad-hoc")
            self.assertEqual(manifest["signing"]["stapled_notarization"], "not-checked")
            self.assertIn("SMSでログイン", captured["instructions"])
            self.assertIn("スマートグラス", captured["instructions"])
            self.assertNotIn("動作確認用", captured["instructions"])
            self.assertFalse(any(call.args[0][0] == "spctl" for call in run.call_args_list))

    def test_macos_release_fails_before_packaging_when_gatekeeper_rejects(self):
        package = load_module("package-macos")
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "RootLens Import.app"
            app.mkdir()

            def command(args, **kwargs):
                if args[0] == "spctl":
                    raise subprocess.CalledProcessError(1, args)
                return Mock(stderr="Signature=adhoc\n")

            with patch.object(package.subprocess, "run", side_effect=command) as run:
                with self.assertRaises(subprocess.CalledProcessError):
                    package.main(["--app", str(app), "--output", str(app.parent / "out"), "--release"])
            self.assertFalse(any(call.args[0][0] == "hdiutil" for call in run.call_args_list))


if __name__ == "__main__":
    unittest.main()
