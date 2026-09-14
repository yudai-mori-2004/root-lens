# RootLens signing service

`sign.rootlens.io`でDocumenso Community Editionを動かす構成である。署名ソフトウェアに有償ライセンスは使わない。RootLens WebはDocumensoのEnvelope APIと`DOCUMENT_COMPLETED` webhookを使い、署名済みPDFと完了証明書をRootLens Submitへ保存する。

## 構成

- Documenso Community Edition 2.16.0（AGPL-3.0）
- PostgreSQL 15
- CaddyによるTLS終端
- RootLens管理のSMTP
- RootLensが保管する`.p12`署名証明書

サーバーは2GB以上のRAMと20GB以上のディスクを持つLinuxホストを使う。公開するポートは80と443だけとし、PostgreSQLとDocumensoのポートはDockerネットワーク内に閉じる。

## 初期化

1. `.env.example`を`.env`へコピーし、全ての秘密値とSMTP設定を入力する。データベースのパスワードは接続URLを壊さない16進文字列とし、その他の秘密値は32文字以上にする。
2. `secrets/cert.p12`を作成し、コンテナのUID 1001が読める権限にする。
3. `sign.rootlens.io`をサーバーの固定IPへ向ける。
4. `docker compose --env-file .env up -d`を実行する。
5. `https://sign.rootlens.io/api/health`と`/api/certificate-status`が正常であることを確認する。
6. RootLens管理者アカウントとチームを作成した後、`.env`の`NEXT_PUBLIC_DISABLE_SIGNUP`を`true`にして再起動する。
7. チームでAPI tokenを発行し、`DOCUMENT_COMPLETED`だけを送るwebhookを`https://www.rootlens.io/api/webhooks/documenso`へ登録する。
8. Web側へ`DOCUMENSO_URL`、`DOCUMENSO_API_TOKEN`、`DOCUMENSO_WEBHOOK_SECRET`を設定する。

秘密値、SMTP認証情報、証明書をGitへ追加しない。

## テンプレート

現場合意書と撮影参加に関する同意書を別々のtemplate envelopeとして登録する。RootLensの署名依頼APIにはtemplate envelope IDと、テンプレート上の各recipient IDを渡す。文面を変更した場合は既存テンプレートを上書きせず、新しい文書版とtemplate envelopeを作る。

## バックアップ

アップグレード前と日次でPostgreSQLをバックアップする。

```sh
mkdir -p backups
docker compose --env-file .env exec -T database \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/documenso-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

復元は停止時間を確保し、対象バックアップを確認してから行う。

```sh
docker compose --env-file .env exec -T database \
  sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backups/documenso.sql
```

Documensoは署名処理の正本を保持する。RootLens Submitには署名済みPDFと完了証明書を保存し、RootLens DBにはそのDriveファイルIDとSHA-256だけを記録する。

## 更新

Documensoのリリース、セキュリティ情報、DB移行手順を確認し、`compose.yml`のタグとdigestを同時に更新する。更新前にDBをバックアップし、検証環境で署名、webhook、証明書取得までを通してから本番へ反映する。
