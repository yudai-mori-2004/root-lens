# 25. Unit identity

## 目的

撮影データの識別子としてraw動画のSHA-256を使う構成を廃止し、撮影単位ごとに発行する`unit_id`へ置き換える。ファイルの完全性は識別子から分離し、撮影単位を構成する全ファイルのSHA-256と、それらをまとめた`source_manifest_sha256`で確認する。

## 契約

- `unit_id`は`unit_<匿名site_id>_<録画開始UTC>_<ランダム8文字>`とする。
- 例は`unit_bakery-01_20260930T044055123Z_7K2M9Q4R`。
- `unit_id`は撮影単位の識別と参照にだけ使い、内容の同一性や改変の有無を意味しない。
- 各rawファイルについて、ファイル名、バイト数、SHA-256を記録する。
- ファイル一覧を名前順に正規化した`source_manifest`のSHA-256を`source_manifest_sha256`とする。
- rawの保存先は`raw/<unit_id>/<filename>`、DBの主キーは`unit_id`、加工後の保存先は`<unit_id>/session.mcap`とする。
- 納品形式ごとのファイル一覧は`delivery_manifest`として別に管理し、`delivery_manifest_sha256`を発行する。

## 発行

### iPhoneアプリ

アップロード開始時、認証済みアカウントでWeb APIへ発行を依頼する。Webはアカウントに登録された匿名`site_id`と録画開始時刻を使って`unit_id`を返す。アプリは`metadata.json`へ`unit_id`を書き込んだ後、送信対象となる全ファイルのSHA-256を計算する。

### Mentraと現場PCアプリ

撮影端末は撮影ファイルと録画開始時刻を保存する。現場PCアプリは事業所設定の`site_id`、`metadata.json`の録画開始時刻、暗号学的乱数を使って`unit_id`を発行し、`metadata.json`へ保存する。再試行時は保存済みの同じ値を使う。

## source manifest

```json
{
  "schema": "io.rootlens.source-manifest.v1",
  "unit_id": "unit_bakery-01_20260930T044055123Z_7K2M9Q4R",
  "files": [
    {"name": "frames.jsonl", "bytes": 123, "sha256": "..."},
    {"name": "imu.jsonl", "bytes": 123, "sha256": "..."},
    {"name": "metadata.json", "bytes": 123, "sha256": "..."},
    {"name": "rgb.mp4", "bytes": 123, "sha256": "..."}
  ]
}
```

JSONは上記のプロパティ順、ファイル名の昇順、空白なしUTF-8で直列化する。`source_manifest_sha256`はそのバイト列のSHA-256とする。

アップロードURLには各ファイルのSHA-256と`source_manifest_sha256`を署名対象のメタデータとして含める。Webは登録時に各オブジェクトの存在、バイト数、署名済みメタデータを確認する。加工パイプラインはrawファイルを全て読み、各ファイルのSHA-256と正規化した`source_manifest_sha256`を再計算する。一致しない撮影単位は納品処理へ進めない。

## 移行範囲

- 撮影端末アプリのローカル状態、アップロード段階、API型
- Web API、DBスキーマ、R2キー
- Mentra撮影アプリ、現場PCアプリ、Drive属性と再開記録
- FPV Labs、公開サンプル、選定、切り出しを含む運用ツール
- v0.1.4の現行運用文書と証跡仕様

過去バージョンの完了済み文書と適用済みSQLマイグレーションは、当時の記録として書き換えない。新しいマイグレーションで現行スキーマを変更する。

## 成功条件

- 現行ソースに、raw動画のSHA-256を撮影単位の識別子として扱う処理が残っていない。
- 対応する全経路が`unit_id`で撮影単位を参照する。
- rawファイルの完全性を`source_manifest_sha256`で検証できる。
- 配布形式の完全性を`delivery_manifest_sha256`で検証できる。
- iPhone、Mentra、Web、PCアプリ、納品ツールの関連テストとビルドが通る。

## 進捗

- [x] 識別子と完全性の契約を確定
- [x] WebとDB
- [x] iPhoneアプリ
- [x] Mentraと現場PCアプリ
- [x] 加工・納品ツール
- [x] 現行文書
- [x] 全体検証
