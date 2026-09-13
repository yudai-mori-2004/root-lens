#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "$0")" && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/rootlens-ego-oscar.XXXXXX")
oscar_commit=d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea
source_dir=firmware/esp32_coprocessor_led_watchdog
destination_dir="$root_dir/sensor-controller/esp32_coprocessor_led_watchdog"

trap 'rm -rf "$work_dir"' EXIT
git clone --quiet https://github.com/fpv-labs/ego-oscar.git "$work_dir/ego-oscar"
git -C "$work_dir/ego-oscar" checkout --quiet "$oscar_commit"
rm -rf "$root_dir/sensor-controller"
mkdir -p "$destination_dir"
cp "$work_dir/ego-oscar/$source_dir/esp32_coprocessor_led_watchdog.ino" "$destination_dir/"

sketch="$destination_dir/esp32_coprocessor_led_watchdog.ino"
patch --directory="$destination_dir" --strip=0 \
    < "$root_dir/patches/ego-oscar-one-status-led.patch"
grep -Eq '^#define USE_USB_SERIAL[[:space:]]+false$' "$sketch"
grep -Eq '^#define UART_BAUD_RATE[[:space:]]+921600$' "$sketch"
grep -Eq '^#define INTERRUPT_PIN[[:space:]]+D0' "$sketch"
grep -Eq '^#define UART_TX_PIN[[:space:]]+D6' "$sketch"
grep -Eq '^#define UART_RX_PIN[[:space:]]+D7' "$sketch"
grep -Eq '^#define NUM_LEDS[[:space:]]+1([[:space:]]|$)' "$sketch"

echo "Prepared Ego-OSCAR sensor controller $oscar_commit with one status LED"
