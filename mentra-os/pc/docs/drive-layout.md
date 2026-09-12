# Google Drive の配置

共有ドライブ **RootLens** の [撮影協力](https://drive.google.com/drive/folders/1C1RL-vTUHOhLqWY18crUPIbDn1FK_V4L) に事業所ごとのフォルダを置き、アクセス権を分けます。

```text
RootLens/
  撮影協力/
    ［事業所名］/
      アップロード手順説明.pdf
      Windows用アプリ（.exe）
      Mac用アプリ（.dmg）
      rootlens-site.json
      承認済みデータ/
```

| 事業所のフォルダ | アップロード先 |
|---|---|
| [BB SHEEP](https://drive.google.com/drive/folders/1Or4LVy8zSmdyUy8U4_oXD8uKEiTf_UTU) | [承認済みデータ](https://drive.google.com/drive/folders/1c1hsF74tWcxgQryAU3raqBPqaUO27riO) |
| [サトウカエデ](https://drive.google.com/drive/folders/1xx-EIPLVJjfjrAlrs_s61EZQ3Ny5a8-k) | [承認済みデータ](https://drive.google.com/drive/folders/18shZR2j-8eGGjJq0nSInhNBqa5jjEepl) |

アプリの **アップロード** で、その事業所の「承認済みデータ」に撮影データを保存します。
設定ファイルには、事業所名、アップロード先、その事業所専用のサービスアカウント情報をまとめます。

各録画フォルダには撮影アプリが作成した4ファイルが入ります。

```text
承認済みデータ/
  rec-<撮影日時>-<hash12>/
    rgb.mp4
    frames.jsonl
    imu.jsonl
    metadata.json
```

アップロードの進み具合と完了はアプリで確認します。事業所から承認を任された担当者がこの操作を行うことで、
現場合意書第5条第3項に基づき、撮影データを「承認済」として販売先への提供を認めます。
撮影場所の許可と署名済みの本人同意書は、撮影データとは別に管理します。

事業所フォルダと設定ファイルの共有先を担当者に限定し、サービスアカウントの権限もその事業所のフォルダ内に限定します。
詳しくは[管理者向け案内](administrator-guide.md)を参照してください。

共有ドライブ [RootLens Datasets](https://drive.google.com/drive/folders/0AH8NmEoJp1PmUk9PVA) には、実際に外部へ共有しているデータセットを置きます。
既存の `commercial-kitchen-validation`、`samples`、`site-screening` の場所と共有リンクを維持します。
