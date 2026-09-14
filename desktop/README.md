# RootLens Desktop

スマートグラスに残る録画をUSB経由で確認し、現場監督者が承認した録画を、RootLensが管理する共有ドライブ内の当該事業所用保存先へ送ります。

現場での操作は[アップロード手順](docs/field-guide.md)、導入は[PCの初回設定](docs/initial-setup.md)、
権限とDriveの管理は[管理者向け案内](docs/administrator-guide.md)を参照してください。

## 利用者の流れ

1. 設定画面から、事業所に登録された電話番号を使ってSMSでログインする。
2. スマートグラスをUSBで接続し、端末に残る未アップロードの録画を取得する。
3. 映像と音声を確認し、提供を認める録画をアップロードする。
4. RootLensサーバーがDrive上の4ファイルを照合した後、端末上の録画を削除する。

SMSログインは、利用者本人と所属事業所を確認するために使います。DesktopアプリはGoogle Driveの
認証情報やフォルダIDを保持しません。ログイン後に発行されたRootLensセッションだけを
アプリ専用の保存先へ保存し、ログアウト時に削除します。

## 録画と保存確認

一つの録画は次の4ファイルで構成します。

```text
<unit_id>/
  rgb.mp4
  frames.jsonl
  imu.jsonl
  metadata.json
```

Desktopアプリは各ファイルのサイズとSHA-256から`source_manifest_sha256`を作ります。RootLens APIは、
ログインした利用者の現場監督者権限と事業所所属を確認し、RootLens Submit内の当該事業所用保存先へ、一つのファイルにだけ使える
再開可能アップロードURLを発行します。DesktopアプリはそのURLへファイル本体だけを送ります。

RootLensサーバーは、Drive上の保存先、`site_id`、`unit_id`、`source_manifest_sha256`、各ファイルの
サイズとSHA-256を再確認します。すべて一致した録画だけを完了扱いにします。端末から削除する直前にも
現在のDriveを照合し、保存内容が変わっていれば削除を止めます。

## 実装の責務

| モジュール | 責務 |
| --- | --- |
| `rootlens_import/account.py` | ブラウザでのSMSログイン、RootLensセッション、事業所API |
| `rootlens_import/site.py` | ログイン後に選択した事業所のローカル保存 |
| `rootlens_import/core.py` | USB接続、4ファイルの取り込みと照合、中断処理 |
| `rootlens_import/device_sync.py` | 端末を起点としたDrive照合、取り込み、削除の連携 |
| `rootlens_import/device_cleanup.py` | Drive照合後の端末削除と再試行 |
| `rootlens_import/drive.py` | サーバー発行URLへの再開可能アップロードと完了確認 |
| `rootlens_import/upload_state.py` | 送信試行と再開位置の保存 |
| `rootlens_import/library.py` | 今回取り込んだ録画のプレビュー用読み出し |
| `rootlens_import/desktop.py` | ログイン、録画一覧、再生、アップロードの画面連携 |
| `rootlens_import/preview.py` | 映像・音声再生とプレイヤーの解放 |

送信履歴は再開にだけ使い、アップロード済みかどうかの正本にはしません。接続のたびに、現在端末にある
録画だけをRootLens API経由でDriveと照合します。Driveを確認できないときは未アップロードと推定しません。

## ローカル保存

アプリはログイン情報、選択中の事業所、プレビュー用録画、送信再開情報をアプリ専用の保存先へ保存します。

- Windows: `%LOCALAPPDATA%/RootLens Import/`
- macOS: `~/Library/Application Support/RootLens Import/`

選択中の事業所情報には`site_id`、表示名、RootLens APIの接続先だけを含めます。端末の録画から事業所は
自動判別できないため、別の現場で端末を使った場合は内容と選択中の事業所を確認します。

## 開発と検証

```bash
PYTHONPATH=desktop python3 -m rootlens_import
python3 desktop/scripts/test_import_recordings.py
PYTHONPATH=desktop python3 -m unittest discover -s desktop/tests -p 'test_*.py'
```

配布物の作成方法は[packaging](packaging/README.md)、合意から納品までの証跡設計は
[Consent evidence chain](../document/v0.1.4/tasks/24-consent-evidence-chain/README.md)を参照してください。
