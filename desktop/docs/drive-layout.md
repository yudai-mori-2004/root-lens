# Google Drive の配置

協力先が所有・管理する事業所フォルダを原本の保存先とします。

```text
RootLens/
  <site_id>/
    現場合意書/
    スタッフ同意書/
    承認済みデータ/
      <unit_id>/
        rgb.mp4
        frames.jsonl
        imu.jsonl
        metadata.json
```

署名済み文書には安定した`agreement_record_id`を付け、ファイル名とDriveの`appProperties`へ記録します。
撮影データには`site_id`、`unit_id`、`source_manifest_sha256`を記録します。ファイル名やフォルダの位置が
変わっても記録IDから再発見し、保存済みSHA-256との一致を確認します。

DesktopアプリにはDriveのIDや認証情報を保存しません。RootLensサーバーが、ログインした担当者の
事業所所属を確認し、事業所に接続済みのDriveへ保存します。
