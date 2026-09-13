import hashlib
import importlib.util
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import types
import unittest


PI5_DIR = Path(__file__).resolve().parents[1]
UPSTREAM_COMMIT = "d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea"
VSYNC_ISR_SHA256 = "37fba33ae0f48144f0123622ead2ee25df65e3b8e010e735569817b2898d1f49"
RESET_INTERRUPT_SHA256 = "cee3d2dd2e5833f259f32044dae3f469651f90003f9cacb4b55e9c45a472fd67"


def extract_c_function(source: str, signature: str) -> str:
    start = source.index(signature)
    brace = source.index("{", start)
    depth = 0
    for index in range(brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise AssertionError(f"unterminated function: {signature}")


def contains_subsequence(values, expected):
    for start in range(len(values) - len(expected) + 1):
        if values[start:start + len(expected)] == expected:
            return True
    return False


class Pi5GeneratedSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory(prefix="rootlens-pi5-test-")
        cls.generated = Path(cls.tempdir.name) / "generated"
        command = [
            "bash",
            str(PI5_DIR / "prepare_upstream.sh"),
            "--output",
            str(cls.generated),
        ]
        source_repo = os.environ.get("EGO_OSCAR_SOURCE")
        if source_repo:
            command.extend(["--source", source_repo])
        subprocess.run(command, check=True, capture_output=True, text=True)

        cls.xiao_source = (
            cls.generated
            / "firmware/esp32_coprocessor_led_watchdog/esp32_coprocessor_led_watchdog.ino"
        ).read_text()
        cls.host_path = cls.generated / "radxa/fpv_recorder.py"
        cls.host_source = cls.host_path.read_text()

        serial_stub = types.ModuleType("serial")
        previous_serial = sys.modules.get("serial")
        sys.modules["serial"] = serial_stub
        try:
            spec = importlib.util.spec_from_file_location(
                "rootlens_pi5_generated_recorder", cls.host_path
            )
            cls.host_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.host_module)
        finally:
            if previous_serial is None:
                del sys.modules["serial"]
            else:
                sys.modules["serial"] = previous_serial

    @classmethod
    def tearDownClass(cls):
        cls.tempdir.cleanup()

    def test_manifest_pins_exact_upstream_commit_and_hashes(self):
        manifest = json.loads((self.generated / "UPSTREAM.json").read_text())
        self.assertEqual(manifest["commit"], UPSTREAM_COMMIT)
        self.assertEqual(
            manifest["source_sha256"]["radxa/fpv_recorder.py"],
            "94b8a353caf42e64d7d5b844ccbcbf4998a4157930a9cf5a021e1bb80e59079b",
        )
        self.assertEqual(
            manifest["source_sha256"][
                "firmware/esp32_coprocessor_led_watchdog/esp32_coprocessor_led_watchdog.ino"
            ],
            "dc4b04ccebb11201ae5727a9cd8cb3be2b9d81de45067125919337073d5d1856",
        )
        self.assertTrue((self.generated / "LICENSE.ego-oscar").is_file())

    def test_xiao_d8_long_press_is_nonblocking_and_one_shot(self):
        source = self.xiao_source
        self.assertIn("#define RECORD_BUTTON_PIN D8", source)
        self.assertIn("#define RECORD_BUTTON_LONG_PRESS_MS 1500", source)
        self.assertIn("#define RECORD_BUTTON_DEBOUNCE_MS      30", source)
        self.assertIn("pinMode(RECORD_BUTTON_PIN, INPUT_PULLUP);", source)
        self.assertEqual(source.count('RadxaSerial.println("B0,LONG;");'), 1)

        handler = extract_c_function(source, "void handleRecordButton()")
        self.assertNotIn("delay(", handler)
        self.assertIn("!recordButtonLongSent", handler)
        self.assertIn("recordButtonLongSent = true;", handler)
        self.assertIn("recordButtonStableState == LOW", handler)
        self.assertIn("handleRecordButton();", source)

    def test_xiao_d2_sync_functions_are_byte_identical_to_upstream(self):
        source = self.xiao_source
        self.assertIn("#define SYNC_LED_PIN    D2", source)
        self.assertIn("#define INTERRUPT_PIN   D0", source)
        self.assertIn("interruptCount % ledTriggerFrame", source)
        self.assertEqual(self.host_module.ESP_LED_FRAME, 60)

        vsync = extract_c_function(source, "void IRAM_ATTR vsyncISR()")
        reset = extract_c_function(source, "void resetInterruptData()")
        self.assertEqual(hashlib.sha256(vsync.encode()).hexdigest(), VSYNC_ISR_SHA256)
        self.assertEqual(
            hashlib.sha256(reset.encode()).hexdigest(), RESET_INTERRUPT_SHA256
        )

    def test_pi5_recorder_uses_uart_and_software_h264_path(self):
        module = self.host_module
        command = module.FFMPEG_BASE_CMD
        self.assertEqual(module.ESP_UART_PORT, "/dev/ttyAMA0")
        self.assertTrue(
            contains_subsequence(command, ["-c:v", "mjpeg", "-i", "/dev/video0"])
        )
        self.assertTrue(
            contains_subsequence(
                command,
                ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency"],
            )
        )
        self.assertTrue(
            contains_subsequence(
                command,
                ["-g", "60", "-keyint_min", "60", "-sc_threshold", "0"],
            )
        )
        self.assertTrue(
            contains_subsequence(command, ["-f", "segment", "-segment_time", "300"])
        )
        self.assertNotIn("gpiod", self.host_source)
        self.assertNotIn("gpiochip1", self.host_source)
        self.assertNotIn("mjpeg_rkmpp", self.host_source)
        self.assertNotIn("h264_rkmpp", self.host_source)
        compile(self.host_source, str(self.host_path), "exec")

    def test_b0_long_is_queued_and_toggles_start_then_stop(self):
        module = self.host_module
        link = object.__new__(module.EspLink)
        link._button_events = queue.Queue()
        link._handle_message("B0,LONG;")
        self.assertEqual(link.wait_button_event(timeout=0), "LONG")

        actions = []

        class FakeEsp:
            def __init__(self):
                self.events = iter(["LONG", "LONG"])

            def sys_ready(self):
                return True

            def wait_button_event(self, timeout=0.1):
                try:
                    return next(self.events)
                except StopIteration:
                    raise KeyboardInterrupt

        def fake_start():
            actions.append("start")
            module.ffmpeg_proc = object()

        def fake_stop():
            actions.append("stop")
            module.ffmpeg_proc = None

        original_esp = module.esp
        original_start = module.start_recording
        original_stop = module.stop_recording
        original_proc = module.ffmpeg_proc
        try:
            module.esp = FakeEsp()
            module.start_recording = fake_start
            module.stop_recording = fake_stop
            module.ffmpeg_proc = None
            module.ffmpeg_error_event.clear()
            module.main_recording_mode()
        finally:
            module.esp = original_esp
            module.start_recording = original_start
            module.stop_recording = original_stop
            module.ffmpeg_proc = original_proc

        self.assertEqual(actions, ["start", "stop"])


class Pi5ConfigurationTests(unittest.TestCase):
    def test_uart_overlay_and_device_are_fixed(self):
        fragment = (PI5_DIR / "config/config.txt.fragment").read_text()
        environment = (PI5_DIR / "config/rootlens-recorder.env").read_text()
        self.assertIn("dtoverlay=uart0-pi5", fragment)
        self.assertIn("ROOTLENS_ESP_UART_PORT=/dev/ttyAMA0", environment)

    def test_wiring_documents_separate_camera_power_from_usb_vbus(self):
        readme = (PI5_DIR / "config/README.md").read_text()
        self.assertIn("camera VBUS", readme)
        self.assertIn("Pi側USB VBUSへ接続しない", readme)
        self.assertIn("camera D+ / D- / GND", readme)
        self.assertIn("camera GND", readme)
        self.assertIn("Pi/XIAO共通GND", readme)
        self.assertIn("XIAO D6 / GPIO43 / TX", readme)
        self.assertIn("Pi pin 10 / GPIO15 / RXD0", readme)
        self.assertIn("XIAO D2 / GPIO3", readme)
        self.assertIn("XIAO D8 / GPIO7", readme)


if __name__ == "__main__":
    unittest.main()
