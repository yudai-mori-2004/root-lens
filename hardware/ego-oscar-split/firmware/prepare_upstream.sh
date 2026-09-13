#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "$0")" && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/rootlens-ego-upstream.XXXXXX")
video_commit=50389db65d56b12d4b59fcbb69c68d6e7154a318
h264_commit=6fc011d98649c1c04b4c97b41748f7ce45de1e71

git clone --quiet https://github.com/espressif/esp-video-components.git "$work_dir/video"
git -C "$work_dir/video" checkout --quiet "$video_commit"
git -C "$work_dir/video" apply "$root_dir/patches/esp-video-double-buffer.patch"
mkdir -p "$root_dir/main/upstream" "$root_dir/components"
cp "$work_dir/video/esp_video/examples/m2m/main/example_v4l2.c" "$root_dir/main/upstream/"
cp "$work_dir/video/esp_video/examples/m2m/main/example_v4l2.h" "$root_dir/main/upstream/"
cp -R "$work_dir/video/esp_video/examples/common_components/example_video_common" "$root_dir/components/"

git clone --quiet https://github.com/espressif/esp-h264-component.git "$work_dir/h264"
git -C "$work_dir/h264" checkout --quiet "$h264_commit"
git -C "$work_dir/h264" apply "$root_dir/patches/esp-h264-input-stride.patch"
mkdir -p "$root_dir/components/esp_h264"
cp -R "$work_dir/h264/esp_h264/." "$root_dir/components/esp_h264/"

echo "Prepared and patched esp-video-components $video_commit and esp-h264-component $h264_commit"
