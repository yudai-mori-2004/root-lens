# fpvlabs

- 入力: `rootlens-raw-arkit` の `raw/<unit_id>/` (rgb.mp4 + frames.jsonl + metadata.json、あれば imu.jsonl / depth.tar) + DB `clips` 行 (ドメイン解決。未登録は実行拒否)
- 出力: `rootlens-fpvlabs` の `<unit_id>/session.mcap` (EgoBlur 顔ぼかし + ぼかしマーカー (ArUco) の実寸ゾーンぼかし適用済み、ROS2 メッセージの MCAP) + `manifest.jsonl` 再生成 (バケット直下の属性表。DB + R2 から毎回全再生成)
- 実行: `modal run --detach tools/modal/fpvlabs/fpvlabs.py --unit-id <unit_id>`
- 検証: `--target-bucket <bucket>` で本番バケットに触れず出力先を切り替える
- 注意 (Starter プラン運用): 一斉投入しない。3〜4 本ずつ投入し、完了を確認してから次を出す。利用上限に達すると走行中タスクが即殺され、消費済み GPU 時間だけ課金されて成果物はゼロになる
