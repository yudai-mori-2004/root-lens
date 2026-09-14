# 24. Consent evidence chain

## 目的

撮影前の二種類の合意、撮影後の現場監督者による承認、実際に承認された撮影データを、一つの連続した証跡として管理する。販売先へ渡す各撮影データには `rootlens-evidence.json` を同梱し、そのファイルから次の事実を確認できる状態を作る。

1. どの協力先との現場合意に基づく撮影か。
2. 撮影機材を装着した本人と、撮影中に映り込む可能性のあるスタッフから、どの文面で同意を得たか。
3. 誰が、いつ、どの撮影データを確認し、販売先への提供を承認したか。
4. 承認後に撮影データや証跡が変更されていないか。

販売先へ署名者の氏名、メールアドレス、署名画像、署名済みPDFを一律に渡すことは目的にしない。納品物には改変を検知できる識別子と参照情報を入れる。署名済み文書の原本は`rootlens.io` Workspaceが管理する共有ドライブを正本とし、Webアプリのデータベースには文書本体を複製せず、記録ID、ハッシュ、状態、Drive上の所在を示す索引を管理する。開示が必要な場合は、契約と権限に応じた経路で確認できるようにする。

## 読み手と判断

この仕様は、Web、現場PCアプリ、納品パイプラインを実装・運用する担当者と、同意・承認の証跡を確認する担当者が読む。署名サービス、現場監督者の承認方法、納品物へ含める情報と、その検証方法を一つの通常フローとして定める。

## 現在の状態

- Webの `consent_events` は、撮影端末上のクリックラップ同意をアカウント、文書版、文書ハッシュ、対象スコープと結び付けてappend-onlyで保存する。
- 撮影単位は`unit_id`で識別し、rawを構成する全ファイルは`source_manifest_sha256`で検証する。R2とDBも`unit_id`で参照する。
- 現場PCアプリは、招待された現場監督者がGoogleアカウントでRootLensへログインし、OSの資格情報ストアにRootLensセッションを保存する。Google Driveの認証情報はPCへ配布しない。
- 現場PCアプリは、録画を構成する4ファイルのSHA-256と`source_manifest_sha256`を計算する。RootLensサーバーがRootLens共有ドライブとの接続を使ってファイル単位の再開可能アップロードURLを発行し、PCはそのURLへファイル本体だけを送る。
- 現場PCアプリは対象データを確定してWebの承認画面を開き、現場監督者のパスキー署名が完了した場合だけアップロードへ進む。承認後にも4ファイルを再読込し、変更があればアップロードしない。
- Webは現場合意書と撮影参加に関する同意書の署名依頼をDocuSealへ作成し、完了したPDFと署名証明書をRootLens共有ドライブの当該事業所フォルダへ保存する。撮影ロットの承認時には、その時点の有効な記録を同意スナップショットとして固定する。
- 納品パイプラインはraw、同意スナップショット、現場監督者の承認receipt、納品ファイルを結ぶ`rootlens-evidence.json`を生成し、KMS鍵で署名する。検証ページとCLIは証跡署名と各ハッシュを検証する。

## 採用する構成

### 電子署名サービス

現場合意書と撮影参加に関する同意書の締結には、セルフホストしたDocuSealを使う。DocuSeal本体は `sign.rootlens.io` の独立したサービスとして動かし、RootLensの `web/` はAPIとwebhookを介して文書の作成、署名依頼、完了記録の取り込みを行う。

DocuSealをNext.jsのプロセスへ組み込まない。署名処理、メール送信、バックグラウンド処理を公開サイトから分離する。同じRootLensのドメインと管理下に置くことで、利用者から見た署名導線と運営責任はRootLensに統一する。

初期導入ではDocuSeal本体を改変せず、On-Premises版を利用する。DocuSealのオープンソース版はAGPL-3.0であるため、本体を変更する場合は変更部分の公開条件を確認する。本番環境でAPIと埋め込み機能を利用するにはOn-Premises Proの契約が必要になるため、Phase 1で費用と必要なAPIを確認する。コンテナのバージョンを固定し、署名処理に必要なデータベースとSMTPを設定する。署名完了後のPDFと署名証明書はRootLens共有ドライブへ保存し、保存と照合が完了した後は、署名サービス側に文書本体を継続保管しない運用が可能かPhase 1で確認する。

### 署名原本の保存先

`rootlens.io` Workspaceが所有・管理するGoogle共有ドライブを正本の保存先とし、その中に協力先ごとの事業所フォルダを設ける。署名済み文書、署名証明書、承認済み撮影データは事業所フォルダ内で分離して管理する。RootLensサーバー専用のサービスアカウントを共有ドライブのメンバーとして登録し、現場監督者へDriveの認証情報やフォルダIDを配布しない。

```text
RootLens/
  <site_id>/
    現場合意書/
      site-agreement__<agreement_record_id>__<document_version>.pdf
      site-agreement-certificate__<agreement_record_id>.pdf
    スタッフ同意書/
      staff-consent__<agreement_record_id>__<document_version>.pdf
      staff-consent-certificate__<agreement_record_id>.pdf
    承認済みデータ/
      <unit_id>/
        approval-receipt.json
        ...撮影データ
```

`certificate`は電子署名サービスが出力する署名証明書であり、署名操作、署名者、完了時刻等を確認するための付属記録である。独自の`audit.json`は作らない。`record.json`も別ファイルとして置かず、`agreement_record_id`をファイル名とDriveの`appProperties`に記録する。RootLensの索引には、`agreement_record_id`、`site_id`、文書種別、文書版、署名完了時刻、PDFと署名証明書のSHA-256、DriveのファイルID、状態だけを保存する。

ファイル名は現場がDrive上で内容を識別するために使う。ファイル名は変更できるため、証跡の同一性はファイル名だけに依存せず、`agreement_record_id`、DriveファイルID、SHA-256の組で確認する。合意内容を変更する場合は既存PDFを上書きせず、新しい`agreement_record_id`で署名し、旧記録を`superseded`とする。

### 三種類の証跡を分ける

| 証跡 | 対象 | 取得方法 | 更新単位 |
| --- | --- | --- | --- |
| 現場合意 | 協力先とRootLensの継続的な関係 | DocuSealで電子署名 | 合意の締結・改定・終了 |
| スタッフ同意 | 撮影に参加する個人 | DocuSealで電子署名 | 同意・再同意・撤回 |
| 提供前承認 | 確定した一つの撮影ロット | PCアプリから開始するパスキー電子署名 | 撮影ロットごと |

提供前承認を毎回DocuSealで行わない。提供前承認は契約文書の締結ではなく、すでに合意した手順に従って、特定のデータを提供工程へ進める操作だからである。現場監督者はPCアプリで対象データを確認し、PCアプリから開始されるパスキー認証によって電子署名する。手書きの署名画像は必須にせず、承認者の個人認証、承認意思、対象データ、表示文面、時刻を暗号的に結び付ける。

### DesktopのログインとDrive操作

現場監督者はDesktopアプリの「Googleでログイン」からシステムブラウザを開く。DesktopはPKCEのchallengeとIPv4 loopback callbackをRootLensへ登録し、Googleログイン完了後に一回限りのRootLens認可コードをloopbackで受け取る。認可コードをPKCE verifierと交換して得る不透明なRootLensセッションだけを、macOS Keychain又はWindows Credential Managerへ保存する。

Googleログインは人と事業所所属の確認に使う。Googleが返す`sub`を変更されない外部IDとして保存し、メールアドレスは招待との初回照合にだけ使う。招待されていないGoogleアカウントや、対象事業所への有効な所属がない利用者は、事業所APIを利用できない。

RootLensサーバーは、RootLens共有ドライブのメンバーとして登録した専用サービスアカウントを使ってDriveを操作する。サービスアカウントの認証情報はサーバー環境だけに置く。Desktopへサービスアカウント鍵、共有ドライブID、フォルダIDを渡さない。

撮影データのアップロードでは、RootLensサーバーが所属、対象事業所、`unit_id`、source manifestを確認し、Drive上の保存先とファイルIDを作成する。サーバーは各ファイルについて単一ファイルにだけ使えるGoogleの再開可能アップロードURLをDesktopへ返す。Desktopは認証ヘッダーを付けずにファイル本体を送る。送信後、サーバーがDriveから親フォルダ、`appProperties`、サイズ、SHA-256を再取得して一致を確認した場合だけ完了とする。

## 当事者と識別子

RootLensのデータ面には氏名や署名画像を直接入れず、次の不透明な識別子を使う。

| 識別子 | 意味 |
| --- | --- |
| `organization_id` | 協力先事業者 |
| `site_id` | 撮影場所・事業所 |
| `person_id` | 署名者又は現場監督者 |
| `agreement_record_id` | 完了した現場合意又はスタッフ同意の一版 |
| `unit_id` | 一つの撮影単位を継続して参照する識別子 |
| `source_manifest_sha256` | `unit_id`とraw全ファイルの名前、サイズ、SHA-256を正規化したmanifestのSHA-256 |
| `delivery_manifest_sha256` | 加工後の納品ファイル一覧を正規化したmanifestのSHA-256 |
| `approval_event_id` | 撮影ロットへの提供前承認イベント |
| `evidence_id` | 納品用証跡ファイルの識別子 |

氏名、メールアドレス、所属、署名済みPDFはRootLens共有ドライブの当該事業所フォルダ内で管理する。RootLensの索引と納品物には不透明な識別子、ハッシュ、時刻、状態だけを置く。販売先は記録の存在と整合性を検証できるが、通常の納品物から本人を直接特定できない構造にする。

## 通常フロー

### 1. 現場合意

1. RootLensが協力先、撮影場所、署名権限を持つ担当者を登録する。
2. 使用する現場合意書の版と原本文書のSHA-256を確定する。
3. `web/` からDocuSeal APIへ署名用submissionを作成し、担当者へ署名を依頼する。
4. DocuSealから完了webhookを受け、DocuSeal APIから署名済みPDFと署名証明書を取得する。
5. `agreement_record_id`を発行し、RootLens共有ドライブの当該事業所フォルダに規定のファイル名で保存する。各ファイルには`agreement_record_id`、`site_id`、文書種別、文書版を`appProperties`として付与する。
6. Driveから各ファイルを再取得してSHA-256を照合した後、RootLensの索引にDriveファイルID、SHA-256、署名完了時刻、状態を記録する。

webhookは完了を知る契機としてのみ使う。受信したリクエストのHMAC署名と時刻を検証し、DocuSeal APIから現在の完了状態と成果物を取り直してからRootLensの記録を確定する。

### 2. スタッフ同意

1. 協力先が撮影機材を装着する人と、撮影中に映り込む可能性のあるスタッフをRootLensへ伝える。
2. RootLensがスタッフごとに `person_id` を発行し、所属する `organization_id` と `site_id` に結び付ける。
3. RootLensが個人ごとにDocuSealの署名依頼を作成する。同じ署名URLや署名記録を複数人分として共有しない。
4. 本人が個別に送られた署名URLを開き、撮影参加に関する同意書を確認して署名する。
5. RootLensは署名完了webhookを受け、DocuSeal APIで完了状態を再確認する。`agreement_record_id`を発行し、署名済みPDFと署名証明書をRootLens共有ドライブの当該事業所フォルダへ保存する。
6. Driveから各ファイルを再取得してSHA-256を照合し、RootLensの索引に`agreement_record_id`、`person_id`、`site_id`、文書版、署名時刻、DriveファイルID、SHA-256、状態を記録する。
7. 撤回時は原記録を上書きせず、撤回イベントを追記する。以降の撮影ロットにも原記録と撤回後の状態を含める。

撮影ロットごとに全員が同じ文書へ署名し直す必要はない。撮影場所ごとに、事前に取得したスタッフ同意一式を管理し、撮影ロットの承認時にその一式への参照を自動で記録する。

### 事前同意と撮影ロットの対応

現場合意は `site_id`、スタッフ同意は `person_id` と `site_id` に結び付ける。同じ `site_id` で取得した全スタッフの同意記録をまとめて `staff_consent_set` として管理する。

PCアプリで、撮影者や映り込んだスタッフをクリップごとに選択する操作は設けない。現場監督者が行うのは、撮影データの内容確認と、そのクリップを販売先へ提供することへの電子署名だけとする。

署名セッションを作成するとき、Webは `site_id` から現場合意と、その現場で取得した全スタッフの同意記録を取得する。各記録には署名日時と承認時点の状態を含める。

Webは、適用する現場合意の `agreement_record_id` と、スタッフ同意一式の `agreement_record_id` を安定した順序で並べ、`consent_snapshot` として固定する。そのSHA-256を `consent_snapshot_sha256` として保存する。`/evidence/sites/<site_id>/site-agreements`と`/evidence/sites/<site_id>/staff-consents`は現在の各Driveフォルダを開く導線とし、`/evidence/agreements/<agreement_record_id>`は特定の署名記録を開く導線とする。納品物は後者の記録IDを参照し、現在のフォルダURLだけには依存しない。

フォルダが移動又は再作成された場合は、Driveの`appProperties`又はファイル名に含まれる`agreement_record_id`から原本を再発見し、RootLensの索引を更新する。別のファイルへ置き換える場合は、保存済みSHA-256との一致を必須とする。完全に削除された文書を識別子やハッシュから復元することはできないため、削除制限、ゴミ箱からの復元、保持又はバックアップは原本を管理する協力先の運用として定める。

この対応は、クリップ内の人物と個々の同意者を一人ずつ対応付けるものではない。撮影前に現場単位で必要な同意を取得したことと、現場監督者が当該クリップを確認して提供を承認したことを記録する。

### 3. PCアプリでの撮影ロット確認と電子署名

現場監督者はPCアプリで撮影ロットを確認し、そのロットに対して電子署名する。PCアプリへ現場監督者の長期秘密鍵を保存する方式は採らず、本人だけが利用できるパスキーを署名鍵として使う。PCアプリは対象データの確定と署名画面への橋渡しを行い、パスキーによる署名検証と証跡の確定はWeb側で行う。

1. PCアプリが `rgb.mp4`、`frames.jsonl`、`imu.jsonl`、`metadata.json` を再読込し、各ファイルのサイズとSHA-256を算出する。
2. `unit_id`とファイル名、サイズ、SHA-256を正規化した`source_manifest`を作り、そのSHA-256を`source_manifest_sha256`とする。
3. PCアプリがWeb APIへ署名セッションを作成する。Webは `site_id` から現場合意とスタッフ同意一式への参照を取得して `consent_snapshot` を確定し、`source_manifest_sha256`、`consent_snapshot_sha256`、承認文のSHA-256、事業所、ランダムなnonceを一回限りのchallengeに結び付ける。PCアプリへは署名URLを返す。
4. PCアプリが既定ブラウザで署名URLを開く。画面には撮影日時、尺、対象ファイル、適用される現場合意とスタッフ同意一式の状態を表示する。
5. 現場監督者は個人アカウントでログインし、次の承認文を確認して「署名して承認」を押す。

   `この撮影データの内容を確認し、現場合意書および撮影参加に関する同意の取得状況に基づき、販売先への提供を承認します。`

6. ブラウザはパスキーを呼び出し、challengeへWebAuthn署名を行う。challengeはサーバ側で `source_manifest_sha256` と `consent_snapshot_sha256` に対応するため、署名者、承認文、対象データ、現場合意、スタッフ同意一式が一つの電子署名記録として結び付く。
7. WebはWebAuthn署名を検証し、`person_id`、`site_id`、`source_manifest_sha256`、`consent_snapshot_sha256`、承認文の版、承認時刻、credential ID、認証器のsign count、challengeのSHA-256をappend-onlyの承認イベントとして保存する。
8. Webは、署名対象の承認payload、パスキー公開鍵、WebAuthn assertion、検証前後のcounterを含むreceiptを生成する。最終納品時に、このreceiptを含む証跡全体をRootLensの証跡署名鍵で署名する。
9. PCアプリは署名済みreceiptをAPIから取得し、receipt内の `source_manifest_sha256` が現在のローカルファイルと一致する場合だけアップロードを開始する。
10. 一つでもファイル又は同意スナップショットが変わった場合は電子署名を無効とし、新しい撮影ロットとして再署名を求める。

利用者から見ると、電子署名はPCアプリの「署名して承認」操作から始まり、完了後は同じPCアプリへ戻る。システムブラウザを使うのは、Qt製PCアプリへWebAuthnと秘密鍵管理を独自実装しないためである。パスキーの秘密鍵は認証器から取り出さない。承認者の権限は、RootLensが協力先との合意時に登録する。一般の自己登録や、事業所で共有するアカウントは使わない。

### 4. 匿名化と納品

1. 承認済みrawに匿名化処理を行う。
2. 現場合意で定めた確認期間と削除申出の状態を確認する。
3. 納品形式へ変換した各ファイルのSHA-256を計算する。
4. rawの証跡と納品ファイルを結ぶ `rootlens-evidence.json` を生成する。
5. `rootlens-evidence.json` のpayloadを正規化し、RootLensの証跡署名鍵で署名する。
6. 納品データと `rootlens-evidence.json` を同じ撮影データのディレクトリへ格納する。

加工や切り出しを行った場合も、元となった`unit_id`と`source_manifest_sha256`を残し、納品ファイル一覧を`delivery_manifest_sha256`で別に記録する。これにより、加工済みデータから承認対象だったrawへ戻れる。

## `rootlens-evidence.json`

### 役割

このファイルは、署名済み契約書を集めたファイルではない。納品された撮影データと、RootLens共有ドライブに保存された事前同意原本及びRootLensが発行した承認記録を結ぶ、機械可読な索引兼改変検知記録である。

### 初版スキーマ

```json
{
  "schema": "io.rootlens.evidence.v1",
  "evidence_id": "evd_...",
  "issued_at": "2026-09-13T09:00:00Z",
  "source": {
    "unit_id": "unit_bakery-01_20260913T073000000Z_7K2M9Q4R",
    "source_manifest_sha256": "<sha256 of canonical source manifest>",
    "recorded_at": "2026-09-13T07:30:00Z",
    "recording_config": "mentra",
    "site_id": "site_...",
    "files": [
      {"path": "rgb.mp4", "size": 123, "sha256": "..."},
      {"path": "frames.jsonl", "size": 123, "sha256": "..."},
      {"path": "imu.jsonl", "size": 123, "sha256": "..."},
      {"path": "metadata.json", "size": 123, "sha256": "..."}
    ]
  },
  "agreements": {
    "site": {
      "record_id": "agr_...",
      "record_url": "https://rootlens.io/verify/agr_...",
      "document_version": "site-agreement-...",
      "template_sha256": "...",
      "signed_pdf_sha256": "...",
      "signature_certificate_sha256": "...",
      "signed_at": "...",
      "status_at_approval": "active"
    },
    "staff_consent_snapshot": {
      "snapshot_id": "csp_...",
      "snapshot_sha256": "...",
      "records_url": "https://rootlens.io/verify/csp_...",
      "record_count": 2,
      "records": [
        {
          "record_id": "agr_...",
          "document_version": "staff-consent-...",
          "signed_pdf_sha256": "...",
          "signed_at": "...",
          "status_at_approval": "active"
        }
      ],
      "status_at_approval": "active"
    }
  },
  "approval": {
    "schema": "io.rootlens.approval-receipt.v1",
    "event_id": "apv_...",
    "signed_payload": {
      "schema": "io.rootlens.approval-challenge.v1",
      "signature_id": "approval_...",
      "person_id": "person_...",
      "site_id": "site_...",
      "unit_id": "unit_bakery-01_20260913T073000000Z_7K2M9Q4R",
      "source_manifest_sha256": "...",
      "source_files": [
        {"name": "rgb.mp4", "bytes": 123, "sha256": "..."}
      ],
      "consent_snapshot_id": "csp_...",
      "consent_snapshot_sha256": "...",
      "statement": "この撮影データの内容を確認し、現場合意書および撮影参加に関する同意の取得状況に基づき、販売先への提供を承認します。",
      "statement_version": "lot-approval-ja-1",
      "issued_at": "...",
      "expires_at": "..."
    },
    "signed_payload_sha256": "...",
    "signature_method": "webauthn",
    "webauthn": {
      "credential_id": "...",
      "credential_public_key": "...",
      "credential_counter_before": 3,
      "credential_counter_after": 4,
      "rp_id": "rootlens.io",
      "origin": "https://www.rootlens.io",
      "challenge": "...",
      "assertion": {},
      "assertion_sha256": "..."
    },
    "approved_at": "...",
    "receipt_sha256": "..."
  },
  "delivery": {
    "delivery_manifest_sha256": "...",
    "files": [
      {"path": "session.mcap", "size": 123, "sha256": "..."}
    ],
    "privacy_processing_completed_at": "...",
    "provided_at": "..."
  },
  "verification": {
    "url": "https://rootlens.io/verify/evd_..."
  },
  "attestation": {
    "algorithm": "ECDSA_P256_SHA256",
    "key_id": "rootlens-evidence-2026-01",
    "payload_sha256": "...",
    "signature": "<base64url>"
  }
}
```

`attestation` を除くpayloadをキー順が安定したJSONへ正規化し、SHA-256を算出する。AWS KMSの非エクスポートP-256鍵は、そのdigestへ`ECDSA_SHA_256`で署名する。検証用公開鍵と失効・更新履歴はRootLensが公開する。秘密鍵はWebアプリやPCアプリへ置かない。

### 含めない情報

- 氏名、メールアドレス、住所、口座情報
- 手書き署名画像
- DocuSealの署名用URL
- 署名済みPDFの公開URL
- PCアプリ又はサービスアカウントの秘密情報

## Webの記録モデル

既存の `consent_events` は撮影端末のクリックラップ証跡として維持する。契約署名と現場監督者の承認は意味と本人確認方法が異なるため、同じテーブルへ押し込まない。

| 記録 | 主な内容 |
| --- | --- |
| `organizations` | 協力先の不透明IDと状態 |
| `sites` | 事業所、所属する協力先 |
| `people` | 署名者・承認者の不透明ID、所属、役割、状態 |
| `agreement_records` | 文書種別・版・ハッシュ、DriveファイルID、DocuSeal submission ID、完了時刻、状態 |
| `approval_signatures` | 有効期限付きの一回限り電子署名セッション |
| `approval_events` | 撮影ロット、承認者、承認文、認証情報を含むappend-only記録 |
| `consent_snapshots` | 承認時点で対象となったスタッフ同意記録の集合 |
| `evidence_bundles` | 発行した証跡ファイル、そのpayload hash、署名、納品日時 |

本人情報と署名済み文書はRootLens共有ドライブの当該事業所フォルダに置き、RootLensのDBには文書の索引と検証情報だけを置く。DBの権限は、公開API、運営画面、納品パイプラインで分ける。

## Web API

| API | 用途 |
| --- | --- |
| `POST /api/internal/sites/{site_id}/supervisors` | 現場監督者のGoogleアカウントを事業所へ招待する |
| `POST /api/v1/desktop-auth/start` | DesktopのPKCEログインを開始する |
| `GET /api/oauth/google/login/callback` | Google本人確認後、Desktop用の一回限り認可コードを発行する |
| `POST /api/v1/desktop-auth/token` | 認可コードとPKCE verifierをRootLensセッションへ交換する |
| `GET /api/v1/desktop-auth/session` | 保存済みセッションと所属事業所を確認する |
| `POST /api/v1/drive-uploads` | RootLens共有ドライブの事業所フォルダへ送るファイルと再開可能アップロードURLを準備する |
| `POST /api/v1/drive-uploads/{attempt_id}/verify` | Drive上の保存先、属性、サイズ、SHA-256を検証する |
| `POST /api/v1/drive-recordings` | 端末削除前に現在のDrive上の録画を再検証する |
| `POST /api/internal/signing/submissions` | DocuSealへ現場合意・スタッフ同意の署名依頼を作る |
| `POST /api/webhooks/docuseal` | 署名ライフサイクルの通知を受け、完了状態を照合する |
| `POST /api/v1/approval-signatures` | PCアプリが撮影ロットの電子署名セッションを作る |
| `GET /approve/{approval_id}#token=...` | 現場監督者が内容を確認し、パスキーで電子署名するWeb画面。tokenはサーバーログへ送られないfragmentに置く |
| `GET /api/v1/approval-signatures/{id}` | PCアプリが署名状態とreceiptを取得する |
| `POST /api/internal/evidence` | 納品パイプラインが証跡ファイルを発行する |
| `GET /api/v1/evidence-keys/{key_id}` | 証跡署名の検証用公開鍵を取得する |
| `GET /verify/{evidence_id}` | 権限に応じて整合性と各記録の状態を確認する |
| `GET /evidence/sites/{site_id}/site-agreements` | 事業所の現在の現場合意書フォルダへ案内する |
| `GET /evidence/sites/{site_id}/staff-consents` | 事業所の現在のスタッフ同意書フォルダへ案内する |
| `GET /evidence/sites/{site_id}/approved-data` | 事業所の承認済みデータフォルダへ案内する |
| `GET /evidence/agreements/{agreement_record_id}` | 特定の署名記録をDrive上の原本へ案内する |

販売先は納品ディレクトリで次を実行すると、公開鍵、最終証跡署名、納品ファイル、raw manifest、同意スナップショット、現場監督者のパスキー署名を一括検証できる。公開鍵を明示しない場合は、証跡に記録されたRootLensの検証URLと鍵IDから取得する。

```bash
cd web
npm run verify:evidence -- /path/to/delivery
npm run verify:evidence -- /path/to/delivery --public-key /path/to/rootlens-evidence.pem
```

電子署名セッションのtokenとchallengeは短時間で失効し、一回の署名後に再利用できないようにする。token自体をログ、URL解析、外部サービスへ送らない。

## 本人認証と権限

- 現場合意の署名権限者と、撮影データの承認権限者は分けて登録できる。
- 協力先が承認権限者を指定し、RootLensが招待する。招待されていない人は承認者になれない。
- 初回ログインは招待されたGoogleアカウントで行い、Googleの`sub`をRootLens上の個人と結び付ける。DesktopはPKCEとloopback callbackを使い、RootLensセッションをOSの資格情報ストアへ保存する。
- Googleログインは承認者のアカウントと事業所所属を確認する。撮影ロットへの明示的な承認操作には、別途登録したパスキーを使う。
- 共有メールしかない現場では、招待時に本人名と役割を確認し、個人ごとに別のパスキーを登録する。共有パスワードによる承認は認めない。
- 権限の付与、変更、失効もappend-onlyの管理記録へ残す。
- DocuSealの署名済み文書と署名証明書は、文書、署名操作、署名者の認証情報、時刻を一体としてRootLens共有ドライブの当該事業所フォルダへ保存する。実際に操作した人の特定は、宛先、認証、操作ログ等を合わせて判断するため、署名証明書だけを本人確認の根拠にしない。

## 失敗時の扱い

- 現場合意が未完了の場合、又は現場監督者が現場合意とスタッフ同意一式を確認できない場合、電子署名セッションを完了できない。
- パスキー署名の検証に失敗した場合、承認イベントを作らない。
- 電子署名後にローカルファイルのハッシュが変わった場合、アップロードせず再署名する。
- webhookのHMAC検証又はDocuSeal APIとの再照合に失敗した場合、合意を完了扱いにしない。
- 署名済みPDFと署名証明書をRootLens共有ドライブの当該事業所フォルダへ保存して再取得・照合できない場合、合意を完了扱いにしない。
- Driveのフォルダが移動又は再作成された場合、`agreement_record_id`から原本を再発見して索引を更新する。保存済みSHA-256と一致しないファイルへは結び直さない。
- 原本が完全に削除され復元できない場合、その合意記録を`unavailable`として扱い、新しい提供前承認には使用しない。過去に発行した証跡から記録IDとハッシュは確認できるが、原本文書の復元は保証しない。
- `rootlens-evidence.json` の生成又は署名に失敗した場合、その撮影データを納品対象にしない。
- 撤回・削除申出は過去の証跡を消さず、新しい状態イベントとして記録する。提供可否の判定は最新状態と提供時点の状態を両方参照する。

## 運用と保存

- RootLens共有ドライブの当該事業所フォルダに置く署名済み文書と署名証明書、RootLensが扱う承認receiptと証跡ファイルは、保存時と通信時に暗号化する。
- DocuSealの署名文書・署名証明書とRootLensの証跡署名鍵は別の用途として管理する。
- 署名済み文書の削除制限、保持、バックアップ、復元は、RootLens共有ドライブの管理規則として定める。RootLensは索引から原本の所在とハッシュ一致を定期確認する。
- 署名文書の版を変えた場合、過去の版とハッシュを保持する。
- 販売先へ提供する検証画面は、記録の有効性、文書版、時刻、ハッシュ一致だけを表示し、本人情報の表示には追加権限を必要とする。
- 監査ログには署名用URL、パスキー秘密情報、RootLensセッション、Googleサービスアカウントの認証情報、再開可能アップロードURLを記録しない。

## 実装順序

### Phase 1: 署名原本

- DocuSealを固定バージョンで検証環境へセルフホストする。
- 署名処理に必要なデータベースとSMTPを設定する。
- 現場合意書と撮影参加に関する同意書をテンプレート化する。
- RootLens共有ドライブに、協力先ごとの現場合意書、スタッフ同意書、承認済みデータの各フォルダを用意する。
- APIによるsubmission作成、署名完了webhook、署名済み文書と署名証明書の取得、Driveへの保存、再取得とハッシュ照合を一往復させる。
- `agreement_record_id`を含むファイル名と`appProperties`から、移動後の原本を再発見できることを確認する。

### Phase 2: 現場監督者の承認

- 協力先、事業所、個人、承認権限を登録する。
- DesktopのブラウザGoogleログイン、PKCE、loopback callback、OS資格情報ストアへのRootLensセッション保存を実装する。
- RootLens共有ドライブの認証情報をサーバーへ限定し、サーバー発行の再開可能URLによる送信とDrive再検証へ移行する。
- Webの電子署名セッション、パスキー署名、append-only承認イベントを実装する。
- PCアプリに「署名して承認」を設け、ブラウザでの署名完了を待ってからアップロードする。
- 現在の再開・照合要件を、サーバー管理のDrive認証とファイル単位アップロードURLで維持する。

### Phase 3: 証跡ファイル

- `source_manifest_sha256` と同意スナップショットを確定する。
- 納品パイプラインで `rootlens-evidence.json` を生成し、KMS鍵で署名する。
- rawから切り出し・加工済み納品物までのハッシュ関係を保存する。
- 検証CLIと権限制御された検証ページを作る。

### Phase 4: 実運用確認

- 一つのテスト事業所、一人の撮影者、一人の現場監督者で全工程を通す。
- 署名文書の改定、同意撤回、承認後のファイル変更、再アップロード、削除申出を確認する。
- 実際の納品ディレクトリだけから証跡ファイルの署名と全ハッシュを検証する。
- 販売先が必要とする証跡項目と開示範囲を確認し、過不足を反映する。

## 成功条件

- 二種類の署名文書について、署名者、文書版、完了時刻、完成PDFのハッシュを取得し、RootLens共有ドライブの当該事業所フォルダへ保存できる。
- Webアプリのデータベースに署名済み文書本体を複製せず、索引からRootLens共有ドライブ上の原本を特定してハッシュ一致を確認できる。
- `site_id` から現場合意とスタッフ同意一式を自動的に取得し、撮影ロットごとの同意スナップショットを作成できる。
- 現場監督者がPCアプリから撮影ロットへ電子署名し、全ファイルが署名対象のハッシュで固定される。
- 電子署名されていない撮影ロット、又は署名後にファイル若しくは同意スナップショットが変更された撮影ロットはアップロードできない。
- 納品される撮影データごとに `rootlens-evidence.json` が一つ存在する。
- 証跡ファイルから、現場合意、スタッフ同意の集合、現場監督者の承認、raw、加工後の納品ファイルを追跡できる。
- 販売先へ個人情報や署名済みPDFを直接渡さず、記録の存在と完全性を検証できる。
- 署名サービス、Web、PCアプリ、納品パイプラインのいずれかが失敗した場合、証跡のないデータを提供工程へ進めない。

## 実装前に確定する事項

1. 協力先が指定する現場監督者の登録方法と、共有メールしかない現場での本人確認手順。
2. 現場監督者に現場合意とスタッフ同意一式を表示する方法と、各記録の状態の示し方。
3. DocuSealのセルフホスト先、メール送信元、On-Premises Proの契約範囲、AGPL-3.0への対応、Drive保存後に文書本体を署名サービスから削除できる範囲。
4. 協力先が共有ドライブを利用できない場合の所有者、削除制限、保持、バックアップと復元手順。
5. 販売先へ通常表示する証跡項目と、請求時に追加開示する原本・本人情報の範囲。
6. Nextremerその他の販売経路が求めるファイル名、スキーマ、署名方式との照合。

## 参考資料

- [DocuSeal On-Premises](https://www.docuseal.com/on-premises)
- [DocuSeal API Reference](https://www.docuseal.com/docs/api)
- [DocuSeal Webhooks](https://www.docuseal.com/resources/use-webhooks)
- [DocuSeal Certificate of Signature](https://www.docuseal.com/faq/what-is-the-certificate-of-signature-audit-log)
- [デジタル庁 電子署名](https://www.digital.go.jp/policies/digitalsign)
- [電子契約サービスに関するQ&A（電子署名法第3条関係）](https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/517ca59b-6ea4-4179-a338-8d1b51a4d40b/4ae659c2/20240109_digitalsign_qa_01.pdf)
