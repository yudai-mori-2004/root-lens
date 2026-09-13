#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <adb executable> <capture package>" >&2
  exit 2
fi

adb_bin=$1
package_name=$2
if ! service_state=$("$adb_bin" shell dumpsys activity services "$package_name"); then
  echo "端末の撮影状態を確認できないため、更新を中止しました。USB接続を確認してください。" >&2
  exit 1
fi
if [[ "$service_state" != *"ACTIVITY MANAGER SERVICES"* ]]; then
  echo "端末の撮影状態を確認できないため、更新を中止しました。" >&2
  exit 1
fi
if [[ "$service_state" == *"ServiceRecord{"* ]]; then
  echo "端末の処理が続いているため、更新を中止しました。録画や保存、キャリブレーションが終わってから実行してください。" >&2
  exit 1
fi
