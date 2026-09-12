#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
build_dir=${ROOTLENS_PI5_BUILD_DIR:-$script_dir/build/ego-oscar-pi5}
sketch_dir="$build_dir/firmware/esp32_coprocessor_led_watchdog"

command -v arduino-cli >/dev/null || {
    echo "arduino-cli 1.5.1 or newer is required" >&2
    exit 1
}

if [[ ! -f "$sketch_dir/esp32_coprocessor_led_watchdog.ino" ]]; then
    "$script_dir/prepare_upstream.sh" --output "$build_dir"
fi

arduino-cli core install esp32:esp32@3.3.11
arduino-cli lib install \
    "SparkFun 9DoF IMU Breakout - ICM 20948 - Arduino Library@1.3.2" \
    "Adafruit NeoPixel@1.15.5"

arduino-cli compile \
    --fqbn esp32:esp32:XIAO_ESP32S3 \
    --export-binaries \
    "$sketch_dir"
