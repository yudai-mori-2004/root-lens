# 24. Consent evidence chain

## 目的

撮影前の二種類の合意、撮影後の現場監督者による承認、実際に承認された撮影データを、一つの連続した証跡として管理する。販売先へ渡す各撮影データには `rootlens-evidence.json` を同梱し、そのファイルから次の事実を確認できる状態を作る。

1. どの協力先との現場合意に基づく撮影か。
2. 撮影機材を装着した本人と、撮影中に映り込む可能性のあるスタッフから、どの文面で同意を得たか。
3. 誰が、いつ、どの撮影データを確認し、販売先への提供を承認したか。
4. 承認後に撮影データや証跡が変更されていないか。

販売先へ署名者の氏名、メールアドレス、署名画像、署名済みPDFを一律に渡すことは目的にしない。納品物には改変を検知できる識別子と参照情報を入れ、原本と個人情報はRootLensが管理する。開示が必要な場合は、契約と権限に応じた経路で確認できるようにする。

## 読み手と判断

この仕様は、Web、現場PCアプリ、納品パイプラインを実装する担当者と、同意・承認の証跡を確認する担当者が読む。実装前に、署名サービスの導入範囲、現場監督者の承認方法、納品物へ含める情報を確定するための文書である。

## 現在の状態

- Webの `consent_events` は、撮影端末上のクリックラップ同意をアカウント、文書版、文書ハッシュ、対象スコープと結び付けてappend-onlyで保存する。
- 撮影単位は`unit_id`で識別し、rawを構成する全ファイルは`source_manifest_sha256`で検証する。R2とDBも`unit_id`で参照する。
- 現場PCアプリは、録画を構成する4ファイルのSHA-256と`source_manifest_sha256`を計算し、事業所専用のサービスアカウントでGoogle Driveの「承認済みデータ」へアップロードする。
- 現在のPCアプリから分かるのは事業所と対象データである。操作した現場監督者個人、表示した承認文、承認時刻を一体の記録として残していない。
- 現場合意書と撮影参加に関する同意書は、署名済みファイルを運営側で個別に管理している。

## 採用する構成

### 電子署名サービス

現場合意書と撮影参加に関する同意書の締結には、セルフホストしたDocuSealを使う。DocuSeal本体は `sign.rootlens.io` の独立したサービスとして動かし、RootLensの `web/` はAPIとwebhookを介して文書の作成、署名依頼、完了記録の取り込みを行う。

DocuSealをNext.jsのプロセスへ組み込まない。署名文書、監査証明書、メール送信、バックグラウンド処理を公開サイトから分離し、永続ストレージを持つ独立した実行環境で運用する。同じRootLensのドメインと管理下に置くことで、利用者から見た署名導線と運営責任はRootLensに統一する。

初期導入ではDocuSeal本体を改変せず、On-Premises版を利用する。DocuSealのオープンソース版はAGPL-3.0であるため、本体を変更する場合は変更部分の公開条件を確認する。本番環境でAPIと埋め込み機能を利用するにはOn-Premises Proの契約が必要になるため、Phase 1で費用と必要なAPIを確認する。コンテナのバージョンを固定し、データベース、ストレージ、SMTP、バックアップをRootLens側で管理する。

### 三種類の証跡を分ける

| 証跡 | 対象 | 取得方法 | 更新単位 |
| --- | --- | --- | --- |
| 現場合意 | 協力先とRootLensの継続的な関係 | DocuSealで電子署名 | 合意の締結・改定・終了 |
| スタッフ同意 | 撮影に参加する個人 | DocuSealで電子署名 | 同意・再同意・撤回 |
| 提供前承認 | 確定した一つの撮影ロット | PCアプリから開始するパスキー電子署名 | 撮影ロットごと |

提供前承認を毎回DocuSealで行わない。提供前承認は契約文書の締結ではなく、すでに合意した手順に従って、特定のデータを提供工程へ進める操作だからである。現場監督者はPCアプリで対象データを確認し、PCアプリから開始されるパスキー認証によって電子署名する。手書きの署名画像は必須にせず、承認者の個人認証、承認意思、対象データ、表示文面、時刻を暗号的に結び付ける。

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

氏名、メールアドレス、所属、署名済みPDFとの対応はアクセスを制限した証跡台帳に置く。納品物からは不透明な識別子を通して記録の存在と整合性を検証できるが、販売先が本人を直接特定できない構造にする。

## 通常フロー

### 1. 現場合意

1. RootLensが協力先、撮影場所、署名権限を持つ担当者を登録する。
2. 使用する現場合意書の版と原本文書のSHA-256を確定する。
3. `web/` からDocuSeal APIへ署名用submissionを作成し、担当者へ署名を依頼する。
4. DocuSealから完了webhookを受け、submission ID、署名者、完了時刻、文書版、完成PDFと監査証明書のSHA-256を記録する。
5. 完成PDFと監査情報を非公開ストレージへ保存し、協力先と `site_id` に結び付ける。

webhookは完了を知る契機としてのみ使う。受信したリクエストのHMAC署名と時刻を検証し、DocuSeal APIから現在の完了状態と成果物を取り直してからRootLensの記録を確定する。

### 2. スタッフ同意

1. 協力先が撮影機材を装着する人と、撮影中に映り込む可能性のあるスタッフをRootLensへ伝える。
2. RootLensがスタッフごとに `person_id` を発行し、所属する `organization_id` と `site_id` に結び付ける。
3. RootLensが個人ごとにDocuSealの署名依頼を作成する。同じ署名URLや署名記録を複数人分として共有しない。
4. 本人が個別に送られた署名URLを開き、撮影参加に関する同意書を確認して署名する。
5. RootLensは署名完了webhookを受け、DocuSeal APIで完了状態を再確認する。`agreement_record_id` を発行し、`person_id`、`site_id`、文書版、署名時刻、完成PDFと監査証明書のSHA-256を保存する。
6. 撤回時は原記録を上書きせず、撤回イベントを追記する。以降の撮影ロットにも原記録と撤回後の状態を含める。

撮影ロットごとに全員が同じ文書へ署名し直す必要はない。撮影場所ごとに、事前に取得したスタッフ同意一式を管理し、撮影ロットの承認時にその一式への参照を自動で記録する。

### 事前同意と撮影ロットの対応

現場合意は `site_id`、スタッフ同意は `person_id` と `site_id` に結び付ける。同じ `site_id` で取得した全スタッフの同意記録をまとめて `staff_consent_set` として管理する。

PCアプリで、撮影者や映り込んだスタッフをクリップごとに選択する操作は設けない。現場監督者が行うのは、撮影データの内容確認と、そのクリップを販売先へ提供することへの電子署名だけとする。

署名セッションを作成するとき、Webは `site_id` から現場合意と、その現場で取得した全スタッフの同意記録を取得する。各記録には署名日時と承認時点の状態を含める。

Webは、適用する現場合意の `agreement_record_id` と、スタッフ同意一式の `agreement_record_id` を安定した順序で並べ、`consent_snapshot` として固定する。そのSHA-256を `consent_snapshot_sha256` として保存し、現場合意と全スタッフの同意記録を確認できる権限制御付きURLも発行する。これにより、撮影ロットから現場合意、全スタッフの同意一式、クリップごとの承認記録をたどることができる。

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
8. Webは承認内容とWebAuthn署名のハッシュを含むreceiptを生成し、RootLensの証跡署名鍵で署名する。
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

このファイルは、署名済み契約書を集めたファイルではない。納品された撮影データと、RootLensが保管する同意・承認原本を結ぶ、機械可読な索引兼改変検知記録である。

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
      "audit_log_sha256": "...",
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
    "event_id": "apv_...",
    "approver_id": "person_...",
    "approver_authority_record_id": "auth_...",
    "approved_at": "...",
    "statement": "この撮影データの内容を確認し、現場合意書および撮影参加に関する同意の取得状況に基づき、販売先への提供を承認します。",
    "statement_version": "lot-approval-ja-1",
    "signature_method": "webauthn",
    "approved_source_manifest_sha256": "...",
    "approved_consent_snapshot_sha256": "...",
    "signed_payload_sha256": "...",
    "webauthn_assertion_sha256": "...",
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
    "algorithm": "Ed25519",
    "key_id": "rootlens-evidence-2026-01",
    "payload_sha256": "...",
    "signature": "<base64url>"
  }
}
```

`attestation` を除くpayloadをJSON Canonicalization Schemeに従って正規化し、そのSHA-256へ署名する。検証用公開鍵と失効・更新履歴はRootLensが公開する。証跡署名鍵はWebアプリやPCアプリの環境変数へ直接置かず、クラウドKMS等の非エクスポート鍵で管理する。

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
| `agreement_records` | 文書種別・版・ハッシュ、DocuSeal submission ID、監査証明書、完了時刻、状態 |
| `agreement_participants` | 合意記録と署名者の対応 |
| `approval_signatures` | 有効期限付きの一回限り電子署名セッション |
| `approval_events` | 撮影ロット、承認者、承認文、認証情報を含むappend-only記録 |
| `consent_snapshots` | 承認時点で対象となったスタッフ同意記録の集合 |
| `evidence_bundles` | 発行した証跡ファイル、そのpayload hash、署名、納品日時 |

本人情報と署名済み文書は、これらの索引テーブルとは分離した非公開ストレージに置く。DBの権限は、公開API、運営画面、納品パイプラインで分ける。

## Web API

| API | 用途 |
| --- | --- |
| `POST /api/internal/signing/submissions` | DocuSealへ現場合意・スタッフ同意の署名依頼を作る |
| `POST /api/webhooks/docuseal` | 署名ライフサイクルの通知を受け、完了状態を照合する |
| `POST /api/v1/approval-signatures` | PCアプリが撮影ロットの電子署名セッションを作る |
| `GET /approve/{token}` | 現場監督者が内容を確認し、パスキーで電子署名するWeb画面 |
| `GET /api/v1/approval-signatures/{id}` | PCアプリが署名状態とreceiptを取得する |
| `POST /api/internal/evidence` | 納品パイプラインが証跡ファイルを発行する |
| `GET /verify/{evidence_id}` | 権限に応じて整合性と各記録の状態を確認する |

電子署名セッションのtokenとchallengeは短時間で失効し、一回の署名後に再利用できないようにする。token自体をログ、URL解析、外部サービスへ送らない。

## 本人認証と権限

- 現場合意の署名権限者と、撮影データの承認権限者は分けて登録できる。
- 協力先が承認権限者を指定し、RootLensが招待する。招待されていない人は承認者になれない。
- 初回ログインは有効期限付きメールリンクで開始し、承認操作にはパスキーを登録する。
- 共有メールしかない現場では、招待時に本人名と役割を確認し、個人ごとに別のパスキーを登録する。共有パスワードによる承認は認めない。
- 権限の付与、変更、失効もappend-onlyの管理記録へ残す。
- DocuSealの署名済み文書と監査証明書は、文書、署名操作、署名者の認証情報、時刻を一体で保存する。実際に操作した人の特定は、宛先、認証、操作ログ等を合わせて判断するため、監査証明書だけを本人確認の根拠にしない。

## 失敗時の扱い

- 現場合意が未完了の場合、又は現場監督者が現場合意とスタッフ同意一式を確認できない場合、電子署名セッションを完了できない。
- パスキー署名の検証に失敗した場合、承認イベントを作らない。
- 電子署名後にローカルファイルのハッシュが変わった場合、アップロードせず再署名する。
- webhookのHMAC検証又はDocuSeal APIとの再照合に失敗した場合、合意を完了扱いにしない。
- `rootlens-evidence.json` の生成又は署名に失敗した場合、その撮影データを納品対象にしない。
- 撤回・削除申出は過去の証跡を消さず、新しい状態イベントとして記録する。提供可否の判定は最新状態と提供時点の状態を両方参照する。

## 運用と保存

- 署名済み文書、監査情報、承認receipt、証跡ファイルは保存時と通信時に暗号化する。
- DocuSealの署名文書・監査証明書とRootLensの証跡署名鍵は別の用途として管理する。
- DocuSealのDB、署名済み文書、監査証明書、証跡台帳は定期バックアップし、復元試験を行う。
- 署名文書の版を変えた場合、過去の版とハッシュを保持する。
- 販売先へ提供する検証画面は、記録の有効性、文書版、時刻、ハッシュ一致だけを表示し、本人情報の表示には追加権限を必要とする。
- 監査ログには署名用URL、パスキー秘密情報、サービスアカウント鍵を記録しない。

## 実装順序

### Phase 1: 署名原本

- DocuSealを固定バージョンで検証環境へセルフホストする。
- 永続データベース、文書ストレージ、SMTP、バックアップを設定する。
- 現場合意書と撮影参加に関する同意書をテンプレート化する。
- APIによるsubmission作成、署名完了webhook、署名済み文書と監査証明書の取得、ハッシュ保存を一往復させる。

### Phase 2: 現場監督者の承認

- 協力先、事業所、個人、承認権限を登録する。
- Webの電子署名セッション、パスキー署名、append-only承認イベントを実装する。
- PCアプリに「署名して承認」を設け、ブラウザでの署名完了を待ってからアップロードする。
- 現在のGoogle Driveアップロードと再開・照合処理は維持する。

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

- 二種類の署名文書について、署名者、文書版、完了時刻、完成PDFのハッシュを取得できる。
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
3. DocuSealのセルフホスト先、メール送信元、On-Premises Proの契約範囲、AGPL-3.0への対応。
4. 販売先へ通常表示する証跡項目と、請求時に追加開示する原本・本人情報の範囲。
5. Nextremerその他の販売経路が求めるファイル名、スキーマ、署名方式との照合。

## 参考資料

- [DocuSeal On-Premises](https://www.docuseal.com/on-premises)
- [DocuSeal API Reference](https://www.docuseal.com/docs/api)
- [DocuSeal Webhooks](https://www.docuseal.com/resources/use-webhooks)
- [DocuSeal Certificate of Signature](https://www.docuseal.com/faq/what-is-the-certificate-of-signature-audit-log)
- [デジタル庁 電子署名](https://www.digital.go.jp/policies/digitalsign)
- [電子契約サービスに関するQ&A（電子署名法第3条関係）](https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/517ca59b-6ea4-4179-a338-8d1b51a4d40b/4ae659c2/20240109_digitalsign_qa_01.pdf)
