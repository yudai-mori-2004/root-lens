# Google Drive の配置

`rootlens.io` Workspaceが所有・管理する共有ドライブ「RootLens Submit」を原本の保存先とします。

```text
RootLens Submit/
  アプリ配布/
    RootLens-Import-<version>-macOS-arm64.dmg
    RootLens-Import-Setup-<version>-windows-x64.exe
  現場データ収集/
    <事業所名>/
      RootLens-Import-<version>-macOS-arm64.dmg
      RootLens-Import-Setup-<version>-windows-x64.exe
      現場合意書/
      スタッフ同意書/
      承認済みデータ/
        <unit_id>/
          ...承認された任意形式のファイル
```

署名済み文書には安定した`agreement_record_id`を付け、ファイル名とDriveの`appProperties`へ記録します。
撮影データには`site_id`、`unit_id`、`files_sha256`を記録します。`files_sha256`は、承認対象となった
全ファイルの相対パス、サイズ、SHA-256から算出します。ファイル形式と個数は限定しません。ファイル名やフォルダの位置が
変わっても記録IDから再発見し、保存済みSHA-256との一致を確認します。

DesktopアプリにはDriveのIDや認証情報を保存しません。RootLensサーバーが、ログインした担当者の
事業所所属とSMS認証を経た承認記録を確認し、すべて一致した場合にだけ「RootLens Submit」内の対応する事業所フォルダへ保存します。
