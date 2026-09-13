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
- `clips.content_hash` はrawの `rgb.mp4` のSHA-256であり、R2とDBで使う撮影データの主識別子である。この意味は変更しない。
- 現場PCアプリは、録画を構成する4ファイルのSHA-256を計算し、事業所専用のサービスアカウントでGoogle Driveの「承認済みデータ」へアップロードする。
- 現在のPCアプリから分かるのは事業所と対象データである。操作した現場監督者個人、表示した承認文、承認時刻を一体の記録として残していない。
- 現場合意書と撮影参加に関する同意書は、署名済みファイルを運営側で個別に管理している。

## 採用する構成

### 電子署名サービス

現場合意書と撮影参加に関する同意書の締結には、セルフホストしたDocumenso Community Editionを使う。Documenso本体は `sign.rootlens.io` の独立したサービスとして動かし、RootLensの `web/` はAPIとwebhookを介して文書の作成、署名依頼、完了記録の取り込みを行う。

DocumensoをNext.jsのプロセスへ組み込まない。DocumensoはPostgreSQL、オブジェクトストレージ、メール送信、バックグラウンド処理、署名証明書を必要とするため、公開サイトとは実行環境を分離する。同じRootLensのドメインと管理下に置くことで、利用者から見た署名導線と運営責任はRootLensに統一する。

初期導入ではDocumenso本体を改変せず、APIのみから利用する。Community EditionはAGPL-3.0であるため、本体を変更する場合は変更部分の公開条件を確認する。コンテナのバージョンを固定し、署名証明書、データベース、ストレージ、SMTP、バックアップをRootLens側で管理する。

### 三種類の証跡を分ける

| 証跡 | 対象 | 取得方法 | 更新単位 |
| --- | --- | --- | --- |
| 現場合意 | 協力先とRootLensの継続的な関係 | Documensoで電子署名 | 合意の締結・改定・終了 |
| スタッフ同意 | 撮影に参加する個人 | Documensoで電子署名 | 同意・再同意・撤回 |
| 提供前承認 | 確定した一つの撮影ロット | RootLensの承認画面で明示的に承認 | 撮影ロットごと |

提供前承認を毎回Documensoで行わない。提供前承認は契約文書の締結ではなく、すでに合意した手順に従って、特定のデータを提供工程へ進める操作だからである。署名画像も必須にしない。承認者の個人認証、承認意思、対象データ、表示文面、時刻を一体で記録する。

## 当事者と識別子

RootLensのデータ面には氏名や署名画像を直接入れず、次の不透明な識別子を使う。

| 識別子 | 意味 |
| --- | --- |
| `organization_id` | 協力先事業者 |
| `site_id` | 撮影場所・事業所 |
| `person_id` | 署名者又は現場監督者 |
| `agreement_record_id` | 完了した現場合意又はスタッフ同意の一版 |
| `content_hash` | raw `rgb.mp4` のSHA-256。既存仕様を維持 |
| `capture_manifest_hash` | 一つの撮影ロットを構成する全ファイル情報のハッシュ |
| `approval_event_id` | 撮影ロットへの提供前承認イベント |
| `evidence_id` | 納品用証跡ファイルの識別子 |

氏名、メールアドレス、所属、署名済みPDFとの対応はアクセスを制限した証跡台帳に置く。納品物からは不透明な識別子を通して記録の存在と整合性を検証できるが、販売先が本人を直接特定できない構造にする。

## 通常フロー

### 1. 現場合意

1. RootLensが協力先、撮影場所、署名権限を持つ担当者を登録する。
2. 使用する現場合意書の版と原本文書のSHA-256を確定する。
3. `web/` からDocumenso APIへ署名用envelopeを作成し、担当者へ署名を依頼する。
4. Documensoから完了webhookを受け、envelope ID、署名者、完了時刻、文書版、完成PDFのSHA-256を記録する。
5. 完成PDFと監査情報を非公開ストレージへ保存し、協力先と `site_id` に結び付ける。

webhookは完了を知る契機としてのみ使う。受信したイベントの秘密値を検証し、Documenso APIから現在の完了状態と成果物を取り直してからRootLensの記録を確定する。

### 2. スタッフ同意

1. 協力先が撮影機材を装着する人と、撮影中に映り込む可能性のあるスタッフを特定する。
2. RootLensが個人ごとの署名依頼を作成する。同じ人の署名を複数人分として共有しない。
3. 本人が撮影参加に関する同意書を確認し、署名する。
4. 現場合意と同じ方法で、完了記録、文書版、完成PDFのSHA-256を保存する。
5. 撤回時は原記録を上書きせず、撤回イベントを追記する。以降の撮影ロットには有効な同意だけを関連付ける。

撮影ロットごとに全員が同じ文書へ署名し直す必要はない。承認時点で、そのロットを撮影した本人と、映り込む可能性があったスタッフに有効な同意記録があることを、同意スナップショットとして確定する。

### 3. 撮影ロットの確認と承認

PCアプリには電子署名用の長期秘密鍵を保存しない。PCアプリは対象データの確定と承認画面への橋渡しを行い、本人認証と証跡の確定はWeb側で行う。

1. PCアプリが `rgb.mp4`、`frames.jsonl`、`imu.jsonl`、`metadata.json` を再読込し、各ファイルのサイズとSHA-256を算出する。
2. ファイル名、サイズ、SHA-256、`content_hash` を正規化した `capture_manifest` を作り、そのSHA-256を `capture_manifest_hash` とする。
3. PCアプリがWeb APIへ承認セッションを作成し、一回限りの承認URLを受け取る。
4. PCアプリが既定ブラウザで承認URLを開く。画面には撮影日時、尺、対象ファイル、映像・音声の確認結果、適用される現場合意とスタッフ同意の状態を表示する。
5. 現場監督者は個人アカウントでログインし、パスキーで本人認証した上で、次の承認文に同意する。

   `この撮影データの内容を確認し、現場合意書に基づき、販売先への提供を承認します。`

6. Webは `person_id`、`site_id`、`capture_manifest_hash`、承認文の版、承認時刻、認証方式、現場合意記録、スタッフ同意スナップショットをappend-onlyの承認イベントとして保存する。
7. Webは承認内容を含むreceiptを生成し、RootLensの証跡署名鍵で署名する。
8. PCアプリは承認済みreceiptをAPIから取得し、receipt内の `capture_manifest_hash` が現在のローカルファイルと一致する場合だけアップロードを開始する。
9. 一つでもファイルが変わった場合は承認を無効とし、新しい撮影ロットとして再承認を求める。

ブラウザを使うのは、Qt製PCアプリへパスキー処理と秘密鍵管理を独自実装しないためである。承認者の権限は、RootLensが協力先との合意時に登録する。一般の自己登録や、事業所で共有するアカウントは使わない。

### 4. 匿名化と納品

1. 承認済みrawに匿名化処理を行う。
2. 現場合意で定めた確認期間と削除申出の状態を確認する。
3. 納品形式へ変換した各ファイルのSHA-256を計算する。
4. rawの証跡と納品ファイルを結ぶ `rootlens-evidence.json` を生成する。
5. `rootlens-evidence.json` のpayloadを正規化し、RootLensの証跡署名鍵で署名する。
6. 納品データと `rootlens-evidence.json` を同じ撮影データのディレクトリへ格納する。

加工や切り出しを行った場合も、元となった `content_hash` と `capture_manifest_hash` を残し、納品ファイルのハッシュを別に記録する。これにより、加工済みデータから承認対象だったrawへ戻れる。

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
    "content_hash": "<sha256 of raw rgb.mp4>",
    "capture_manifest_hash": "<sha256 of canonical capture manifest>",
    "recorded_at": "2026-09-13T07:30:00Z",
    "recording_config": "mentra",
    "site_id": "site_..."
  },
  "agreements": {
    "site": {
      "record_id": "agr_...",
      "document_version": "site-agreement-...",
      "document_sha256": "...",
      "completed_at": "...",
      "status_at_approval": "active"
    },
    "staff_consent_snapshot": {
      "snapshot_id": "csp_...",
      "snapshot_sha256": "...",
      "record_ids": ["agr_..."],
      "status_at_approval": "active"
    }
  },
  "approval": {
    "event_id": "apv_...",
    "approver_id": "person_...",
    "approved_at": "...",
    "statement_version": "lot-approval-ja-1",
    "authentication": "webauthn",
    "approved_capture_manifest_hash": "...",
    "receipt_sha256": "..."
  },
  "delivery": {
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
- Documensoの署名用URL
- 署名済みPDFの公開URL
- PCアプリ又はサービスアカウントの秘密情報

## Webの記録モデル

既存の `consent_events` は撮影端末のクリックラップ証跡として維持する。契約署名と現場監督者の承認は意味と本人確認方法が異なるため、同じテーブルへ押し込まない。

| 記録 | 主な内容 |
| --- | --- |
| `organizations` | 協力先の不透明IDと状態 |
| `sites` | 事業所、所属する協力先 |
| `people` | 署名者・承認者の不透明ID、所属、役割、状態 |
| `agreement_records` | 文書種別・版・ハッシュ、Documenso envelope ID、完了時刻、状態 |
| `agreement_participants` | 合意記録と署名者の対応 |
| `approval_sessions` | 有効期限付きの一回限り承認セッション |
| `approval_events` | 撮影ロット、承認者、承認文、認証情報を含むappend-only記録 |
| `consent_snapshots` | 承認時点で対象となったスタッフ同意記録の集合 |
| `evidence_bundles` | 発行した証跡ファイル、そのpayload hash、署名、納品日時 |

本人情報と署名済み文書は、これらの索引テーブルとは分離した非公開ストレージに置く。DBの権限は、公開API、運営画面、納品パイプラインで分ける。

## Web API

| API | 用途 |
| --- | --- |
| `POST /api/internal/signing/envelopes` | Documensoへ現場合意・スタッフ同意の署名依頼を作る |
| `POST /api/webhooks/documenso` | 署名ライフサイクルの通知を受け、完了状態を照合する |
| `POST /api/v1/approval-sessions` | PCアプリが撮影ロットの承認セッションを作る |
| `GET /approve/{token}` | 現場監督者が確認・本人認証・承認を行うWeb画面 |
| `GET /api/v1/approval-sessions/{id}` | PCアプリが承認状態とreceiptを取得する |
| `POST /api/internal/evidence` | 納品パイプラインが証跡ファイルを発行する |
| `GET /verify/{evidence_id}` | 権限に応じて整合性と各記録の状態を確認する |

承認セッションのtokenは短時間で失効し、一回の承認後に再利用できないようにする。token自体をログ、URL解析、外部サービスへ送らない。

## 本人認証と権限

- 現場合意の署名権限者と、撮影データの承認権限者は分けて登録できる。
- 協力先が承認権限者を指定し、RootLensが招待する。招待されていない人は承認者になれない。
- 初回ログインは有効期限付きメールリンクで開始し、承認操作にはパスキーを登録する。
- 共有メールしかない現場では、招待時に本人名と役割を確認し、個人ごとに別のパスキーを登録する。共有パスワードによる承認は認めない。
- 権限の付与、変更、失効もappend-onlyの管理記録へ残す。
- Documensoのプラットフォーム署名は完成PDFの完全性を示す。実際に操作した人の特定は、宛先、認証、操作ログ等を合わせて判断するため、Documensoの署名証明書だけを本人確認の根拠にしない。

## 失敗時の扱い

- 現場合意又は必要なスタッフ同意が未完了・撤回済みの場合、承認セッションを完了できない。
- パスキー認証に失敗した場合、承認イベントを作らない。
- 承認後にローカルファイルのハッシュが変わった場合、アップロードせず再承認する。
- webhookの検証又はDocumenso APIとの再照合に失敗した場合、合意を完了扱いにしない。
- `rootlens-evidence.json` の生成又は署名に失敗した場合、その撮影データを納品対象にしない。
- 撤回・削除申出は過去の証跡を消さず、新しい状態イベントとして記録する。提供可否の判定は最新状態と提供時点の状態を両方参照する。

## 運用と保存

- 署名済み文書、監査情報、承認receipt、証跡ファイルは保存時と通信時に暗号化する。
- Documensoの署名証明書とRootLensの証跡署名鍵は別の用途・鍵として管理する。
- DocumensoのDB、署名済み文書、証跡台帳は定期バックアップし、復元試験を行う。
- 署名文書の版を変えた場合、過去の版とハッシュを保持する。
- 販売先へ提供する検証画面は、記録の有効性、文書版、時刻、ハッシュ一致だけを表示し、本人情報の表示には追加権限を必要とする。
- 監査ログには署名用URL、パスキー秘密情報、サービスアカウント鍵を記録しない。

## 実装順序

### Phase 1: 署名原本

- Documensoを固定バージョンで検証環境へセルフホストする。
- PostgreSQL、S3互換ストレージ、SMTP、署名証明書、バックアップを設定する。
- 現場合意書と撮影参加に関する同意書をテンプレート化する。
- APIによるenvelope作成、署名完了webhook、成果物取得、ハッシュ保存を一往復させる。

### Phase 2: 現場監督者の承認

- 協力先、事業所、個人、承認権限を登録する。
- Webの承認セッション、パスキー認証、append-only承認イベントを実装する。
- PCアプリからブラウザを開き、承認完了を待ってからアップロードする。
- 現在のGoogle Driveアップロードと再開・照合処理は維持する。

### Phase 3: 証跡ファイル

- `capture_manifest_hash` と同意スナップショットを確定する。
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
- 現場監督者が個人として認証され、承認した撮影ロットの全ファイルがハッシュで固定される。
- 承認されていない撮影ロット、又は承認後に変更された撮影ロットはアップロードできない。
- 納品される撮影データごとに `rootlens-evidence.json` が一つ存在する。
- 証跡ファイルから、現場合意、スタッフ同意の集合、現場監督者の承認、raw、加工後の納品ファイルを追跡できる。
- 販売先へ個人情報や署名済みPDFを直接渡さず、記録の存在と完全性を検証できる。
- 署名サービス、Web、PCアプリ、納品パイプラインのいずれかが失敗した場合、証跡のないデータを提供工程へ進めない。

## 実装前に確定する事項

1. 協力先が指定する現場監督者の登録方法と、共有メールしかない現場での本人確認手順。
2. 撮影ロットに紐付けるスタッフ同意者の範囲と、現場監督者が確認する同意スナップショットの表示方法。
3. Documensoのセルフホスト先、メール送信元、署名証明書の種類、AGPL-3.0への対応。
4. 販売先へ通常表示する証跡項目と、請求時に追加開示する原本・本人情報の範囲。
5. Nextremerその他の販売経路が求めるファイル名、スキーマ、署名方式との照合。

## 参考資料

- [Documenso Self-Hosting](https://docs.documenso.com/docs/self-hosting)
- [Documenso Developer Guide](https://docs.documenso.com/docs/developers)
- [Documenso Webhooks](https://docs.documenso.com/docs/developers/webhooks)
- [Documenso Signing Certificates](https://docs.documenso.com/docs/concepts/signing-certificates)
- [デジタル庁 電子署名](https://www.digital.go.jp/policies/digitalsign)
- [電子契約サービスに関するQ&A（電子署名法第3条関係）](https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/517ca59b-6ea4-4179-a338-8d1b51a4d40b/4ae659c2/20240109_digitalsign_qa_01.pdf)
