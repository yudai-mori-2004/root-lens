# sample-select

サンプル選定の検分ツール 2 本。納品物は作らない (統計とサムネを見て人が選ぶための材料出し)。

## stats.py

- 入力: `rootlens-raw-arkit` の `raw/<unit_id>/frames.jsonl` (旧録画は realtime_handpose.jsonl) + `metadata.json`
- 出力: stdout に JSON (尺 / 手検出率 / トラッキング正常率 / 歩行距離 / カバー面積)
- 実行: `modal run tools/sample-select/stats.py --unit-ids <unitA,unitB,...>` (結果が stdout なので --detach しない)

## thumbs.py

- 入力: `rootlens-raw-arkit` の `raw/<unit_id>/rgb.mp4`
- 出力: `rootlens-public` の `lp-sample/preview/<unit_id>_00..04.jpg` (尺の 15/35/55/75/95% 地点の 5 枚)
- 実行: `modal run tools/sample-select/thumbs.py --unit-id <unit_id>`
