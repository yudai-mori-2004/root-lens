# Task 19: Mentra USB import

## 目的

Mentra Liveの撮影データをUSB-CでPCへ取り込み、クリップフォルダをGoogle Driveへ
ドラッグ＆ドロップする手順を標準にする。撮影端末は収録と保存を担当し、データの受け渡しはPCで行う。
端末側のアップロード、アカウント設定、Wi-Fi判定、送信後削除の実装と案内を撤去する。
あわせて撮影開始・停止・確定の責務を整理し、長時間収録時のメモリ、確定用の空き容量、
サービス終了時のリソース解放を見直す。

## 読むべきファイル

- `mentra-os/README.md`（撮影とPC取り込みの現行手順）
- `mentra-os/scripts/import-recordings.py`（USB経由のコピーと整合性検証）
- `mentra-os/Import Recordings.command`（Macのダブルクリック入口）
- `mentra-os/app/src/main/java/io/rootlens/mentra/SessionArtifacts.java`（撮影データの確定と4ファイル契約）
- `mentra-os/app/src/main/java/io/rootlens/mentra/CaptureService.java`（撮影操作とサービスの終了）
- `mentra-os/app/src/main/java/io/rootlens/mentra/CaptureStorageBudget.java`（開始時と確定時の容量予約）
- `mentra-os/app/src/main/java/io/rootlens/mentra/FixedRecordStore.java`、`TimestampIndex.java`（端末内ファイルによる索引）
- `mentra-os/asg-fork/README.md`（アクションボタンと案内音声）

## スコープ

### やること

- MacではUSB接続後にランチャーをダブルクリックし、Finderで完成済みフォルダを受け取れるようにする
- Python 3.9以降とADBが使えるWindows/Linux向けにも同じ取り込みCLIを用意する
- 確定済みの`rec-*`クリップから`rgb.mp4`、`frames.jsonl`、`imu.jsonl`、`metadata.json`だけをコピーする
- 全4ファイルの端末側SHA-256とPC側SHA-256、および映像と`content_hash`の一致を検証する
- 取り込み途中のファイルを非表示の作業領域へ隔離し、取り込み済みデータを検証して重複を避ける
- 端末内の撮影データを保持する
- RootLens APKとASG forkから送信ボタン、送信コマンド、送信音声、認証・通信・送信後削除処理を撤去する
- 通常押しの撮影開始・停止と5回長押しのRGB/IMUキャリブレーションを維持する
- 1〜4回の長押しが期限切れになった場合は待機状態へ戻す
- camera/video/IMUの索引を固定長ファイルへ移し、長時間クリップのメモリ使用量を抑える
- 録画時間に応じて確定用の容量を予約し、予約を使い切る前に録画を停止する
- 停止・失敗・サービス終了でcamera、recorder、IMU、ファイル、wake lockを解放する責務を整理する
- 確定が完了するまで給電を保ち、長時間録画の確定時間を固定値で案内しない

### やらないこと

- Google Driveの保存先を自動選択したり、ユーザーの代わりにデータを送信したりすること
- PC取り込みの成功を理由に端末内の元データを削除すること
- iPhoneの撮影・アップロードやweb APIの既存契約を変更すること
- Task 16の実施時点の記録を書き換えること

## 成功基準

- [x] RootLens APKとASG forkの関連テスト・lint・buildが通る
- [x] ホスト上の5時間相当の合成データで、制限したheap内で索引とフレーム対応付けを処理できる
- [x] 容量予約が録画時間に応じて増え、容量不足時に確定の余地を残して停止することをテストで確認する
- [x] 開始拒否、停止、失敗、サービス終了時のリソース解放をテストで確認する
- [x] 不完全クリップの除外、ハッシュ不一致、取り込み中断、重複、端末データ保持を取り込みテストで確認する
- [x] MacのランチャーからUSB取り込みを開始できる
- [x] 新しいRootLens APKとASG forkを実機へ導入する
- [x] 実機で撮影を停止し、USB-Cで接続してPCへ4ファイルを取り込み、元データとの一致を確認する
- [ ] 取り込んだフォルダをGoogle Driveへドラッグ＆ドロップして保存できることを確認する
- [ ] 外部給電で5時間の実機連続録画から停止・確定・PC取り込みまでを確認する

## 進捗

- RootLens APK、ASG fork、PC取り込みツール、現行手順書を実装した。
- `python3 mentra-os/scripts/test_import_recordings.py`の24件が成功。不完全データ・切断・照合失敗を
  公開先へ出さないこと、既存データを上書きしないこと、USB接続の固定、パッケージ選択、
  シンボリックリンクの拒否、重複取り込み、同時実行防止を確認した。
- 実機のUSB接続を確認し、新版RootLens APKの導入後に開始・停止競合、重複command、camera解放を確認した。
  実機で生成した確定クリップを4ファイル単位でPCへコピーし、端末側SHA-256と`metadata.json`の
  `content_hash`を照合した。同じクリップを再実行した場合も全4ファイルを再検証してスキップする。
  元データは端末に保持している。
- Macの`Import Recordings.command`を実機接続状態で実行し、取り込み済みクリップの再照合とFinder起動まで確認した。
- 長時間収録に向け、索引のファイル化、録画時間に応じた確定用容量の予約、停止・失敗・サービス終了時の
  リソース解放、Camera2開始待ちのタイムアウト、完成ファイルの原子確定を実装した。5時間相当の
  合成データによるホスト検証は完了し、5時間の実機連続試験は未完了。
- Google Driveへの送信操作は未実施。
