#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "$0")" && pwd)
sketch_dir="$root_dir/sensor-controller/esp32_coprocessor_led_watchdog"

command -v arduino-cli >/dev/null || {
    echo "arduino-cli is required" >&2
    exit 1
}

arduino-cli core install esp32:esp32@3.3.11
arduino-cli lib install \
    "SparkFun 9DoF IMU Breakout - ICM 20948 - Arduino Library@1.3.2" \
    "Adafruit NeoPixel@1.15.5"

if [[ ! -f "$sketch_dir/esp32_coprocessor_led_watchdog.ino" ]]; then
    "$root_dir/prepare_sensor_controller.sh"
fi

arduino-cli compile \
    --fqbn esp32:esp32:XIAO_ESP32S3 \
    --export-binaries \
    "$sketch_dir"
