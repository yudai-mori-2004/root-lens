#!/usr/bin/env python3
"""Exercise installer refusal without connecting to or changing a device."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parent
FAKE_ADB = r'''
import json, os, sys
args = sys.argv[1:]
with open(os.environ["FAKE_ADB_LOG"], "a") as output:
    output.write(json.dumps(args) + "\n")
scenario = os.environ["FAKE_ADB_SCENARIO"]
if args == ["devices"]:
    print("List of devices attached\nserial\tdevice")
elif args == ["get-state"]:
    print("device")
elif args[:4] == ["shell", "dumpsys", "activity", "services"]:
    if "com.mentra.asg_client.thirdparty/" in args[-1]:
        print("ACTIVITY MANAGER SERVICES\nServiceRecord{asg}")
    elif scenario == "query_failure":
        sys.exit(1)
    elif scenario == "unreadable":
        print("Permission Denial: cannot dump services")
    elif scenario == "empty":
        pass
    elif scenario in {"recording", "finalizing", "opening", "calibrating"}:
        service = "CalibrationService" if scenario == "calibrating" else "CaptureService"
        print("ACTIVITY MANAGER SERVICES\nServiceRecord{123 " + service + "}")
    else:
        print("ACTIVITY MANAGER SERVICES\n  (nothing)")
elif args[:3] == ["shell", "pm", "path"]:
    print("package:/data/app/base.apk")
elif args[:3] == ["shell", "dumpsys", "package"]:
    print("android.permission.CAMERA: granted=true")
    print("android.permission.RECORD_AUDIO: granted=true")
elif args[:3] == ["shell", "appops", "get"]:
    print("SYSTEM_ALERT_WINDOW: allow")
elif args[:1] == ["install"]:
    print("Success")
'''


class InstallerGuardsTest(unittest.TestCase):
    def run_installer(self, scenario, asg=False):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            adb = root / "adb"
            adb.write_text("#!" + sys.executable + "\n" + FAKE_ADB, encoding="utf-8")
            adb.chmod(0o700)
            apk = root / "capture.apk"
            apk.write_bytes(b"test fixture")
            log = root / "commands.jsonl"
            environment = dict(os.environ, ROOTLENS_ADB=str(adb), ADB_BIN=str(adb),
                               FAKE_ADB_LOG=str(log), FAKE_ADB_SCENARIO=scenario,
                               ROOTLENS_MENTRA_PACKAGE="io.rootlens.mentra.debug")
            installer = "install-asg-fork.sh" if asg else "install-field-capture.sh"
            result = subprocess.run(["bash", str(SCRIPTS / installer), str(apk)],
                                    env=environment, capture_output=True, text=True, timeout=10)
            commands = [json.loads(line) for line in log.read_text().splitlines()]
            return result, commands

    def assert_no_mutation(self, commands):
        for args in commands:
            self.assertNotEqual(args[0], "install")
            self.assertNotIn("force-stop", args)
            self.assertNotIn("disable-user", args)
            self.assertNotIn("grant", args)
            self.assertNotIn("start", args)

    def test_active_capture_or_calibration_refuses_package_replacement(self):
        for scenario in ["opening", "recording", "finalizing", "calibrating"]:
            with self.subTest(scenario=scenario):
                result, commands = self.run_installer(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("更新を中止", result.stderr)
                self.assert_no_mutation(commands)

    def test_unreadable_state_refuses_package_replacement(self):
        for scenario in ["query_failure", "unreadable", "empty"]:
            with self.subTest(scenario=scenario):
                result, commands = self.run_installer(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assert_no_mutation(commands)

    def test_idle_installs_after_state_check(self):
        result, commands = self.run_installer("idle")
        self.assertEqual(result.returncode, 0, result.stderr)
        install = next(i for i, args in enumerate(commands) if args[0] == "install")
        check = next(i for i, args in enumerate(commands) if "services" in args)
        self.assertLess(check, install)

    def test_asg_update_preserves_active_capture_and_control_plane(self):
        result, commands = self.run_installer("recording", asg=True)
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_mutation(commands)

    def test_asg_idle_checks_both_capture_packages_before_installing(self):
        result, commands = self.run_installer("idle", asg=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        install = next(i for i, args in enumerate(commands) if args[0] == "install")
        checked = [args[-1] for args in commands[:install] if "services" in args]
        self.assertEqual(checked, ["io.rootlens.mentra", "io.rootlens.mentra.debug"])


if __name__ == "__main__":
    unittest.main()
