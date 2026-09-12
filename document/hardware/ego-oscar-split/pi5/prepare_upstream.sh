#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
upstream_url=https://github.com/fpv-labs/ego-oscar.git
upstream_commit=d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea
recorder_path=radxa/fpv_recorder.py
xiao_path=firmware/esp32_coprocessor_led_watchdog/esp32_coprocessor_led_watchdog.ino
recorder_sha256=94b8a353caf42e64d7d5b844ccbcbf4998a4157930a9cf5a021e1bb80e59079b
xiao_sha256=dc4b04ccebb11201ae5727a9cd8cb3be2b9d81de45067125919337073d5d1856

source_repo=${EGO_OSCAR_SOURCE:-}
output_dir="$script_dir/build/ego-oscar-pi5"

usage() {
    cat <<'EOF'
Usage: prepare_upstream.sh [--source EGO_OSCAR_GIT_DIR] [--output NEW_DIR]

Materialize the two required files from the pinned Ego-OSCAR commit, verify
their SHA-256 values, and apply the RootLens Raspberry Pi 5 patches. NEW_DIR
must not already exist. EGO_OSCAR_SOURCE may also name a local git checkout.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source)
            [[ $# -ge 2 ]] || { usage >&2; exit 2; }
            source_repo=$2
            shift 2
            ;;
        --output)
            [[ $# -ge 2 ]] || { usage >&2; exit 2; }
            output_dir=$2
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v patch >/dev/null || { echo "patch is required" >&2; exit 1; }

if [[ -e "$output_dir" ]]; then
    echo "Output already exists: $output_dir" >&2
    echo "Choose a new --output directory or remove the generated directory." >&2
    exit 2
fi

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/rootlens-pi5-upstream.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

if [[ -z "$source_repo" ]]; then
    source_repo="$work_dir/ego-oscar"
    git clone --quiet --filter=blob:none "$upstream_url" "$source_repo"
fi

git -C "$source_repo" cat-file -e "${upstream_commit}^{commit}" 2>/dev/null || {
    echo "Pinned commit is not present in $source_repo: $upstream_commit" >&2
    exit 1
}

stage_dir="$work_dir/stage"
mkdir -p \
    "$stage_dir/$(dirname "$recorder_path")" \
    "$stage_dir/$(dirname "$xiao_path")"

git -C "$source_repo" show "$upstream_commit:$recorder_path" > "$stage_dir/$recorder_path"
git -C "$source_repo" show "$upstream_commit:$xiao_path" > "$stage_dir/$xiao_path"
git -C "$source_repo" show "$upstream_commit:LICENSE" > "$stage_dir/LICENSE.ego-oscar"

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

actual_recorder_sha256=$(sha256_file "$stage_dir/$recorder_path")
actual_xiao_sha256=$(sha256_file "$stage_dir/$xiao_path")

[[ "$actual_recorder_sha256" == "$recorder_sha256" ]] || {
    echo "Unexpected upstream SHA-256 for $recorder_path" >&2
    exit 1
}
[[ "$actual_xiao_sha256" == "$xiao_sha256" ]] || {
    echo "Unexpected upstream SHA-256 for $xiao_path" >&2
    exit 1
}

patch --batch --forward -d "$stage_dir" -p1 \
    < "$script_dir/patches/xiao-d8-record-button.patch"
patch --batch --forward -d "$stage_dir" -p1 \
    < "$script_dir/patches/raspberry-pi5-recorder.patch"

chmod +x "$stage_dir/$recorder_path"
cat > "$stage_dir/UPSTREAM.json" <<EOF
{
  "repository": "$upstream_url",
  "commit": "$upstream_commit",
  "source_sha256": {
    "$recorder_path": "$recorder_sha256",
    "$xiao_path": "$xiao_sha256"
  },
  "modifications": [
    "patches/xiao-d8-record-button.patch",
    "patches/raspberry-pi5-recorder.patch"
  ]
}
EOF

mkdir -p "$(dirname "$output_dir")"
mv "$stage_dir" "$output_dir"

echo "Prepared Ego-OSCAR $upstream_commit"
echo "Output: $output_dir"
