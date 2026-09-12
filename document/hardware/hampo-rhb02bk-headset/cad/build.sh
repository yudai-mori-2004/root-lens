#!/usr/bin/env bash
set -euo pipefail

CAD_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_FILE="$CAD_DIR/hampo_rhb02bk_mount.scad"
OUT_DIR="$(cd "$CAD_DIR/.." && pwd)"
STL_DIR="$OUT_DIR/stl"
ASSET_DIR="$OUT_DIR/assets"
OPENSCAD_BIN="${OPENSCAD_BIN:-/opt/homebrew/bin/openscad}"

mkdir -p "$STL_DIR" "$ASSET_DIR"
rm -f "$STL_DIR"/*.stl

front_parts=(
  front_case
  front_cover
  board_carrier
  board_gauge
  front_yoke
)

common_parts=(
  rear_cradle
  rear_retainer
  pivot_washer
  band_coupon
  band_pull_coupon
  insert_coupon
  insert_coupon_horizontal
  rear_screw_coupon
  cable_clip
)

for module_profile in 3290 3372_fit; do
  for model_part in "${front_parts[@]}"; do
    "$OPENSCAD_BIN" \
      --hardwarnings \
      --export-format=binstl \
      -D "module_profile=\"$module_profile\"" \
      -D "part=\"$model_part\"" \
      -o "$STL_DIR/${model_part}_${module_profile}.stl" \
      "$MODEL_FILE"
  done
done

for model_part in "${common_parts[@]}"; do
  "$OPENSCAD_BIN" \
      --hardwarnings \
      --export-format=binstl \
      -D "module_profile=\"3290\"" \
      -D "part=\"$model_part\"" \
      -o "$STL_DIR/$model_part.stl" \
      "$MODEL_FILE"
done

"$OPENSCAD_BIN" \
  --hardwarnings \
  -D 'module_profile="3290"' \
  -D 'part="front_preview"' \
  --imgsize=1600,1000 \
  --viewall --autocenter --render=true \
  --projection=perspective \
  --colorscheme='Tomorrow Night' \
  -o "$ASSET_DIR/front_preview.png" \
  "$MODEL_FILE"

"$OPENSCAD_BIN" \
  --hardwarnings \
  -D 'module_profile="3372_fit"' \
  -D 'part="front_preview"' \
  --imgsize=1600,1000 \
  --viewall --autocenter --render=true \
  --projection=perspective \
  --colorscheme='Tomorrow Night' \
  -o "$ASSET_DIR/front_preview_3372_fit.png" \
  "$MODEL_FILE"

"$OPENSCAD_BIN" \
  --hardwarnings \
  -D 'module_profile="3290"' \
  -D 'part="front_exploded"' \
  --imgsize=1600,1100 \
  --viewall --autocenter --render=true \
  --projection=perspective \
  --colorscheme='Tomorrow Night' \
  -o "$ASSET_DIR/front_exploded.png" \
  "$MODEL_FILE"

"$OPENSCAD_BIN" \
  --hardwarnings \
  -D 'part="rear_preview"' \
  --imgsize=1400,1000 \
  --viewall --autocenter --render=true \
  --projection=perspective \
  --colorscheme='Tomorrow Night' \
  -o "$ASSET_DIR/rear_preview.png" \
  "$MODEL_FILE"

"$OPENSCAD_BIN" \
  --hardwarnings \
  -D 'part="rear_exploded"' \
  --imgsize=1400,1100 \
  --viewall --autocenter --render=true \
  --projection=perspective \
  --colorscheme='Tomorrow Night' \
  -o "$ASSET_DIR/rear_exploded.png" \
  "$MODEL_FILE"

COLLISION_DIR="$(mktemp -d /tmp/hampo-rhb02bk-collision.XXXXXX)"
trap 'rm -rf "$COLLISION_DIR"' EXIT

check_no_collision() {
  local module_profile="$1"
  local probe_part="$2"
  local probe_angle="${3:-}"
  local probe_suffix="${probe_angle:+-deg${probe_angle}}"
  local probe_log="$COLLISION_DIR/${module_profile}-${probe_part}${probe_suffix}.log"
  local probe_stl="$COLLISION_DIR/${module_profile}-${probe_part}${probe_suffix}.stl"
  local probe_status
  local -a angle_arg=()

  if [[ -n "$probe_angle" ]]; then
    angle_arg=(-D "camera_down_angle=$probe_angle")
  fi

  set +e
  "$OPENSCAD_BIN" \
    --export-format=binstl \
    -D "module_profile=\"$module_profile\"" \
    -D "part=\"$probe_part\"" \
    "${angle_arg[@]}" \
    -o "$probe_stl" \
    "$MODEL_FILE" >"$probe_log" 2>&1
  probe_status=$?
  set -e

  if [[ $probe_status -ne 1 ]] ||
     ! grep -q "Current top level object is empty" "$probe_log"; then
    cat "$probe_log" >&2
    echo "collision check failed: $module_profile / $probe_part" >&2
    exit 1
  fi
  echo "collision\t$module_profile/$probe_part${probe_angle:+@$probe_angle deg}\tPASS (empty intersection)"
}

{
  python3 "$CAD_DIR/check_stl.py" "$STL_DIR"/*.stl
  for module_profile in 3290 3372_fit; do
    check_no_collision "$module_profile" debug_case_carrier_overlap
    check_no_collision "$module_profile" debug_cover_carrier_overlap
    check_no_collision "$module_profile" debug_case_board_overlap
    for probe_angle in 0 5 10 15 20 25; do
      check_no_collision "$module_profile" debug_yoke_overlap_angle "$probe_angle"
    done
  done
  check_no_collision 3290 debug_rear_retainer_overlap
  check_no_collision 3290 debug_rear_battery_overlap
} | tee "$OUT_DIR/STL-CHECK.txt"
