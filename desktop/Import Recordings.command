#!/bin/bash
set -u

script_directory=$(cd "$(dirname "$0")" && pwd)
printf 'RootLens USB Import\n\nMentra Live を USB-C で接続してください。\n録画を PC に取り込み、完了後に Finder を開きます。\n\n'
if command -v python3 >/dev/null 2>&1; then
  python3 "$script_directory/scripts/import-recordings.py" --open "$@"
  result=$?
else
  printf 'Python 3.9 以降が必要です。PC の初回セットアップを確認してください。\n'
  result=1
fi
printf '\nEnter キーで終了します。'
read -r _
exit "$result"
