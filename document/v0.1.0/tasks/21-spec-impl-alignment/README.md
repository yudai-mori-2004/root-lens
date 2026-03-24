# Task 21: 仕様・実装アラインメントとガバナンスAPI

## 目的

仕様書 (SPECS_JA.md) と実装の乖離を解消し、ガバナンスAPI・URL構造・検証フロー分離を実装する。
COVERAGE.md の記載精度も合わせて是正する。

## 背景

仕様書と実装の網羅的な突合調査により、以下のカテゴリで乖離が確認された:

1. データベーススキーマの構造差異（カラム名・欠落・追加）
2. RLS方針の矛盾（仕様: 不使用、実装: 有効化）
3. URL構造の未実装（正規URL・クリエイターページ）
4. セクション参照の誤り（§5.2→§7.4）
5. コンソールログ形式の不足
6. pHash実装方式の仕様未反映（JS→WASM）
7. ホワイトリスト/ガバナンスAPIの未実装
8. 検証フローのサーバー依存分離が不明確
9. PKI構造の見直し（プラットフォーム別中間CA）

## 実施内容

### Phase 1: バグ修正・参照是正

#### 1-1. セクション参照の修正

`verify.ts` および `ContentPage.tsx` 内の `§5.2` 参照を正しい `§7.4` に修正する。
console.group のラベルも `[RootLens Verification] §7.4` に修正。

対象ファイル:
- `web/lib/verify.ts` L2, L50
- `web/components/ContentPage.tsx` L883, L886-889

#### 1-2. COVERAGE.md の精度是正

- §7.1: 「実装済み」→「一部実装（短縮URLのみ。正規URL・クリエイターページは未実装）」
- §7.4: 検証ロジックは実装済みだが §7.4.4 のコンソールログ形式は未達である旨を追記

---

### Phase 2: 仕様書更新（実装先行分の追認）

以下の項目は実装が仕様に先行して設計変更された箇所であり、仕様側を実装に合わせて更新する。

#### 2-1. §10.4 データベース設計

**`users` テーブル:**
- `privy_user_id` → 削除。Privy統合が進んだ段階で再設計する。現時点では `address` (Solanaウォレットアドレス) を唯一の外部キーとする
- `wallet_address` → `address` にリネーム
- `username` → 将来実装として残す（Phase 3のURL構造で必要）
- `display_name`, `bio`, `avatar_url`, `device_name` を追加

**`contents` テーブル:**
- `r2_original_key`, `r2_public_key`, `r2_ogp_key` → `thumbnail_url`, `ogp_image_url`, `media_url` に変更。R2キーではなく完全URLを格納する設計に変更した理由: アプリが presigned URL 経由で直接R2にアップロードし、公開URLをそのまま保存するフローが実装されたため
- `user_id` → 将来的に追加予定（Phase 3でクリエイターページ実装時）
- `edit_operations` → 将来的に追加予定
- `media_url` を追加（動画本体URL）

**`pages.user_id`:**
- NOT NULL制約の追加を将来マイグレーションで対応。既存データのuser_id埋め戻し後に制約追加する手順を記載

#### 2-2. §10.4 Row Level Security

仕様の「RLSは使用しない」を以下に更新:

> 公開ページのサーバーコンポーネント（Next.js RSC）から公開状態のページを取得する際は、Supabase anon keyによる直接読み取りを使用する。RLSポリシーにより `status = 'published'` のページのみが読み取り可能。書き込み操作はサーバー（Next.js API Routes）がservice_roleキーで実行し、RLSをバイパスする。

#### 2-3. §6.3.3 pHash実装方式

「外部ライブラリやWASMは不要である」を以下に更新:

> pHashのDCT計算にはTitle Protocolノード内のTEEと同一のWASMバイナリを使用する。GlobalConfigの `trusted_wasm_modules` から動的に取得し、SHA-256ハッシュをオンチェーンの `wasm_hash` と照合してから実行する。これにより、TEEとブラウザで浮動小数点演算の精度差によるpHash不一致が発生しないことを保証する。Canvas APIによるリサイズ・グレースケール変換はホスト関数としてJS側で実行し、DCT計算のみWASMが担う。

---

### Phase 3: 新規実装

#### 3-1. URL構造の拡張 (§7.1)

既存の `/p/[shortId]` は維持したまま、以下のルートを追加:

| URL | 内容 |
|-----|------|
| `/{walletAddress}` | クリエイターページ（コンテンツ一覧、インスタ風グリッド） |
| `/@{username}` | 同上（username設定済みの場合） |
| `/{walletAddress}/{pageId}` | 個別コンテンツ検証ページ（既存の検証UIを使用） |
| `/@{username}/{pageId}` | 同上 |
| `/p/{shortId}` | 既存の短縮URL（動作変更なし） |

**クリエイターページのレイアウト:**
- ユーザーヘッダー: アバター、表示名、ウォレットアドレス（短縮+コピー）
- 3列グリッド: 公開済みコンテンツのサムネイル一覧（アプリのホーム画面と同じレイアウト）
- 各サムネイルをタップ → `/{walletAddress}/{pageId}` に遷移

**DB変更:**
- `users` テーブルに `username TEXT UNIQUE` カラムを追加（マイグレーション）
- `contents` テーブルに `user_id` を追加（将来マイグレーション、Phase実行時）

**Next.js ルーティング:**
- `web/app/[addressOrUsername]/page.tsx` — クリエイターページ
- `web/app/[addressOrUsername]/[pageId]/page.tsx` — 個別検証ページ
- `@username` のルーティング: addressOrUsername が `@` で始まる場合は username で解決

#### 3-2. ガバナンスAPI (§8 ホワイトリスト管理)

`GET /api/v1/governance/:network`

ネットワーク別（`devnet` / `mainnet`）のRootLensガバナンス情報を返すAPI。

```typescript
// GET /api/v1/governance/devnet
// GET /api/v1/governance/mainnet
{
  "network": "devnet",
  "version": "0.1.0",

  // 信頼するExtension ID（ホワイトリスト）
  "trusted_extensions": [
    { "extension_id": "hardware-google", "label": "Google Pixel", "category": "hardware" },
    { "extension_id": "hardware-nikon",  "label": "Nikon",        "category": "hardware" },
    { "extension_id": "hardware-canon",  "label": "Canon",        "category": "hardware" },
    { "extension_id": "hardware-sony",   "label": "Sony",         "category": "hardware" },
    { "extension_id": "rootlens-app",    "label": "RootLens",     "category": "app" }
  ],

  // pHash Extension（常時要求、ホワイトリストとは独立）
  "phash_extensions": [
    { "extension_id": "image-phash", "version": "1.0" },
    { "extension_id": "video-phash", "version": "1.0" }
  ],

  // TSAポリシー
  "tsa_policy": {
    "required": true,
    "trusted_providers": [
      { "url": "http://timestamp.digicert.com", "label": "DigiCert" }
    ]
  },

  // PKI情報
  "pki": {
    "root_ca_fingerprint": "<SHA-256 of Root CA cert DER>",
    "intermediate_cas": [
      {
        "platform": "ios",
        "fingerprint": "<SHA-256>",
        "status": "active"
      },
      {
        "platform": "android",
        "fingerprint": "<SHA-256>",
        "status": "active"
      }
    ]
  },

  // Title Protocol接続先
  "solana": {
    "cluster": "devnet",
    "rpc_url": "https://api.devnet.solana.com"
  }
}
```

**設計判断:**
- ネットワーク指定はpathパラメータ (`/governance/devnet`) で分離。クエリパラメータよりキャッシュが効きやすく、CDNフレンドリー
- レスポンスはJSON。アプリ起動時にフェッチしてローカルキャッシュ
- 認証不要（公開情報）
- ガバナンスデータはサーバー側の設定ファイル or 環境変数から読み込み

#### 3-3. 検証フローのサーバー独立分離

公開ページのクライアントサイド検証ロジックを、RootLensサーバーに依存しないスタンドアロンモジュールとして切り出す。

**目的:** OSSとしてリポジトリを見た開発者が「この検証ロジックはRootLensサーバーを一切信頼していない」ことを構造的に理解できるようにする。

**具体的な分離:**

```
web/lib/
  ├── verify/                    ← 新ディレクトリ: サーバー非依存の検証モジュール
  │   ├── index.ts               ← 公開エントリポイント
  │   ├── verify-content.ts      ← verifyContentOnChain (既存 verify.ts から移動)
  │   ├── phash-wasm.ts          ← pHash WASM ランナー (既存から移動)
  │   ├── content-resolver.ts    ← ContentResolver インターフェース (既存から移動)
  │   ├── resolvers/
  │   │   └── helius.ts          ← DAS API実装 (既存から移動)
  │   ├── config.ts              ← GlobalConfig取得 (Solana RPC直接)
  │   └── README.md              ← このモジュールの独立性を説明
  ├── server/                    ← サーバー側ロジック (CA, CRL, page-store, r2)
  │   └── ...
  ├── data.ts                    ← ページメタ取得 (Supabase経由、サーバー依存OK)
  ├── supabase.ts                ← Supabase クライアント
  └── types.ts                   ← 共有型定義
```

`web/lib/verify/README.md`:
```markdown
# RootLens Trustless Verification Module

This module performs content verification entirely client-side.
It connects ONLY to:
- Solana RPC (for on-chain cNFT data)
- Arweave (for off-chain metadata)
- WASM binary source (for pHash computation)

It does NOT connect to any RootLens server endpoint.
All verification can be independently reproduced by anyone
with access to the content_hash and a Solana RPC endpoint.
```

**ContentPage.tsx の変更:**
- ページメタ（ユーザー名、サムネイルURL等）: `data.ts` 経由 → Supabase (サーバー依存、OK)
- 検証ロジック（TEE署名、pHash、コレクション確認）: `verify/` 経由 → Solana/Arweave直接 (サーバー非依存)

この2つの依存関係が構造的に分離されていることが、ディレクトリ構成から明らかになる。

#### 3-4. コンソールログの仕様準拠 (§7.4.4)

`verify/verify-content.ts` 内の console 出力を仕様のフォーマットに合わせる:

```
[RootLens Verification]
Step 1: Fetching cNFT from Solana...
  → RPC: {actual RPC URL}
  → Asset ID: {asset ID}
  → Collection: verified ✓ (matches GlobalConfig.core_collection_mint)

Step 2: Fetching off-chain data from Arweave...
  → URI: {arweave URI}
  → TEE signature: valid ✓ (Ed25519, pubkey: {pubkey prefix}...)

Step 3: Verifying content identity via pHash...
  → On-chain pHash: {hash} (from phash-image extension)
  → Computed pHash: {hash} (from displayed image)
  → Hamming distance: {N} ✓ (threshold: 5)

Step 4: Content hash matches on-chain record ✓

All verification performed client-side. No RootLens server involved.
```

---

### Phase 4: PKI構造の見直し（仕様更新 + 実装）

#### 4-1. プラットフォーム別中間CAの導入

**§4.3 PKI構造を3層に変更:**

```
Root CA (pathLenConstraint:1, 20年)
  ├── iOS Intermediate CA (5年, pathLenConstraint:0)
  │     └── iOS Device Certificate (90日)
  └── Android Intermediate CA (5年, pathLenConstraint:0)
        └── Android Device Certificate (90日)
```

**Intermediate CA プロファイル:**
```
X.509 v3 Certificate
  Serial Number: ランダム生成（20バイト）
  Signature Algorithm: ecdsa-with-SHA256（Root CA署名）
  Issuer: CN=RootLens Root CA, O=<法人名>, C=JP
  Validity: 5年
  Subject: CN=RootLens iOS CA (or Android CA), O=<法人名>, C=JP
  Extensions:
    Basic Constraints: critical, CA:TRUE, pathLenConstraint:0
    Key Usage: critical, keyCertSign, cRLSign
    Subject Key Identifier: <公開鍵のSHA-1>
    Authority Key Identifier: <Root CAのSKI>
```

**変更理由:** Apple/Google のAttestation機構は根本的に異なるため、一方のプラットフォームで不正が発覚した場合に他方に波及しないよう、暗号的に分離する。Intermediate CAの失効により、当該プラットフォームの全Device Certificateを即座に無効化できる。

**C2PA署名チェーンの変更:**

現在: `Root CA → Device Certificate` (x5chain に2証明書)
変更: `Root CA → iOS/Android Intermediate CA → Device Certificate` (x5chain に3証明書)

c2pa-rs は `cert_count` + `cert_sizes` で任意数の証明書を受け付ける設計のため、
**Rust側のコード変更は不要**。影響は以下の各レイヤーの証明書連結部分のみ:

| レイヤー | 変更内容 | 規模 |
|---------|---------|------|
| c2pa-rs (Rust) | **変更不要** | 0行 |
| Android C2paBridgeModule.kt | 証明書連結に intermediate_ca を追加 + SharedPreferences 1フィールド追加 | ~10行 |
| iOS C2paBridgeModule.swift | 同上 (UserDefaults) | ~10行 |
| JS Bridge (c2paBridge.ts) | `storeDeviceCertificate` 引数を3つに変更 | ~5行 |
| useCertificateProvisioning.ts | レスポンスの `intermediate_ca_certificate` フィールド対応 | ~3行 |
| Server ca.ts | Intermediate CA鍵の読み込み + platform分岐で署名 | ~30行 |
| Server device-certificate/route.ts | レスポンスに `intermediate_ca_certificate` 追加 | ~2行 |
| Dev scripts | Intermediate CA生成スクリプト新規作成 | 新規 |

**サーバーレスポンス変更:**
```json
{
  "device_certificate": "<Base64 DER>",
  "intermediate_ca_certificate": "<Base64 DER>",
  "root_ca_certificate": "<Base64 DER>",
  "device_id": "<hex>"
}
```

**Root CA の pathLenConstraint 変更:**
現在: `pathLenConstraint:0` (中間CAを発行できない)
変更: `pathLenConstraint:1` (1層の中間CAを許容)
※ 本番Root CAは未生成のため、生成時に正しい値で作成する。Dev Root CAは再生成。

**その他の実装変更:**
- CRL: Intermediate CA 単位での失効をサポート
- `certs/dev/`: 中間CA生成スクリプトを追加
- ガバナンスAPI: 中間CAのフィンガープリントとステータスを公開

---

### Phase 5: 残課題（本タスクのスコープ外、記録のみ）

以下は本タスクでは実施しないが、乖離調査で判明した要対応事項:
- `subscriptions` テーブルの実装 (§9 全体が未着手)
- R2非公開バケットの実装 (§6.2)
- Device Certificate API のレート制限 (§4.4.3)
- Solana `'devnet'` ハードコードの環境変数化
- Platform Attestation 検証の本番実装 (§4.4.2)

---

## 完了条件

- [x] verify.ts, ContentPage.tsx の §5.2 参照を §7.4 に修正
- [x] COVERAGE.md の §7.1, §7.4 の状態を正確に記載
- [x] SPECS_JA.md §10.4 のDB設計を実装に合わせて更新
- [x] SPECS_JA.md §10.4 RLS方針を実態に合わせて更新
- [x] SPECS_JA.md §6.3.3 pHash方式をWASM利用に更新
- [x] `/{addressOrUsername}` クリエイターページが動作する
- [x] `/@{username}` が username で解決される
- [x] `/p/{shortId}` が従来通り動作する
- [x] `GET /api/v1/governance/:network` がdevnet/mainnetのガバナンス情報を返す
- [x] 検証ロジックが `web/lib/verify/` に分離され、サーバー依存が構造的にない
- [x] `verify/README.md` がモジュールの独立性を説明している
- [x] コンソールログが §7.4.4 のフォーマットに準拠（ASCIIアート + groupCollapsed）
- [x] §4.3 PKI構造を3層に更新（仕様書 + Dev CA生成スクリプト + ca.ts）
- [x] ガバナンスAPIに中間CAフィンガープリント・ステータスを含む

### セッション中の追加変更

- [x] API/アプリから userId を排除。全て address (wallet) ベースに統一
- [x] `GET /api/v1/pages?address=xxx` に変更（旧: `?user_id=xxx`）
- [x] `syncUserToSupabase` の戻り値を void に変更
- [x] Navigation types から userId を削除
- [x] URL構造をフラット化: `/{addressOrUsername}/{pageId}` を廃止し `/p/{shortId}` に統一
- [x] ContentPage.tsx: ownerWallet をヘッダーからコンテンツ単位（Device/TSA下）に移動
- [x] DAS searchAssets に `sortBy: { sortBy: "id", sortDirection: "asc" }` 追加（最古のcNFT保証）
- [x] `verifyContentOnChain` の第2引数を `PerceptualInputs` 型に抽象化（信頼境界の明示）
- [x] コンソールログをASCIIアート + console.groupCollapsed で複数コンテンツ対応

### 未実施（当初計画にあったが方針変更で不要になったもの）

- ~~`/{addressOrUsername}/{pageId}` 検証ページ~~ → フラットURL方針により廃止

## 依存関係

- Title Protocol SDK: 現行バージョンで対応可能（x5chain は任意長の証明書チェーンをサポート）
- Supabase: `users` テーブルに `username` カラム追加のマイグレーション作成済み（20260324_add_username.sql）
