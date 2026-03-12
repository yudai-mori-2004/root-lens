# Task 07: Title Protocol Devnet統合 — 公開ページのリアルデータ接続

## 目的

公開ページ（rootlens.io）のモックデータを、Title Protocol devnet上の実データに置き換える。
Helius DAS APIを使いcNFTをcontent_hashで検索し、Arweaveからオフチェーンデータを取得し、クライアントサイドでトラストレス検証を行う。
サーバーにはshortId → content_hash + asset_idの最小限のマッピングのみを持たせ、検証データは一切サーバーを経由しない（§7.4）。

**インデクサは不要。** content_hashを保持していれば、Helius DAS APIで直接cNFTを検索できる。自前インデクサは将来サービス間検索が必要になった段階で検討する。

## 仕様書参照

- §6.1 パイプラインA: Title Protocol登録（cNFT構造・Extension指定）
- §6.4 公開ページ生成・リンク発行
- §7.1 URL構造（`/p/{shortId}`）
- §7.2 コンテンツページの表示内容
- §7.4 クライアントサイド検証アーキテクチャ（**最重要**）
- §10.4 データベース設計（pagesテーブル・contentsテーブル）

## 前提

- Title Protocol devnetに稼働中のTEEノードが1台存在する（GlobalConfigから取得可能）
- `@title-protocol/sdk@0.1.0` がnpmに公開済み
- 公開ページのUI（ContentPage.tsx）はTask 06で実装済み（モックデータで動作）
- 既存の `integration-tests/register-photo.ts` でdevnetにC2PAコンテンツを登録できる

## 設計方針

### 検索レイヤーの抽象化

Helius DAS APIは現時点での実装手段の1つに過ぎない。将来的にインデクサや別のDASプロバイダに切り替える可能性があるため、`ContentResolver` インターフェースの背後にHelius実装を置く。

```typescript
// web/lib/content-resolver.ts
interface ContentResolver {
  /** content_hashからcNFTを検索し、オフチェーンデータを含む完全なレコードを返す */
  resolveByContentHash(contentHash: string): Promise<ResolvedContent | null>;
  /** asset_idから直接取得（shortId解決時にasset_idが分かっている場合の高速パス） */
  resolveByAssetId(assetId: string): Promise<ResolvedContent | null>;
}
```

### cNFT検索戦略（Helius実装）

1. **高速パス**: サーバーが `asset_id` を保持している場合、Helius `getAsset(assetId)` で直接取得
2. **フォールバック**: `searchAssets` でコレクションアドレスを指定し、結果をcontent_hash属性でクライアントサイドフィルタリング

Note: Helius DAS APIの `searchAssets` はメタデータ属性（trait_type/value）による直接フィルタリングをサポートしていないため、コレクション検索 + クライアントサイドフィルタの組み合わせを使う。devnet規模では十分実用的。

### データフローの原則（§7.4 厳守）

```
RootLens Server が提供:          クライアントが直接取得:
  - shortId → content_hash        - cNFT (Helius DAS API → Solana)
  - shortId → asset_id            - オフチェーンデータ (Arweave)
  - 表示用画像URL (R2)             - TEE署名検証 (Ed25519, ブラウザ内)
  - OGP画像URL (R2)               - pHash照合 (Canvas API, ブラウザ内)
```

---

## 実装内容

### Phase 1: 依存関係 + ContentResolver抽象化

#### 1a. npmパッケージインストール（web/）
```bash
npm install @title-protocol/sdk @solana/web3.js
```

#### 1b. ContentResolverインターフェース
- `web/lib/content-resolver.ts` に `ContentResolver` インターフェース定義
- `ResolvedContent` 型: cNFT情報 + Arweaveオフチェーンデータを統合した構造

#### 1c. Helius DAS実装
- `web/lib/resolvers/helius.ts` に `HeliusContentResolver` クラス
- `getAsset(assetId)`: asset_idによる直接取得
- `searchAssets` + コレクションフィルタ + content_hashクライアントサイドマッチング
- Arweaveオフチェーンデータのfetch + パース
- エラーハンドリング（ノード到達不可、データ不整合等）

#### 1d. 環境設定
- `web/.env.local` に Helius API Key、Solana RPCなどの設定
- `web/lib/config.ts` に設定値をまとめる

### Phase 2: サーバー — ページメタデータAPI

#### 2a. ページメタデータストレージ（Supabase）
- `supabase/migrations/001_pages.sql`: pages + contents テーブル作成
- `server/lib/page-store.ts`: Supabase クライアント (service_role) を使用した CRUD
- `web/lib/supabase.ts`: Supabase クライアント (anon key, 読み取り専用) — shortId 解決用
- RLS: anon は published のみ読み取り可能、service_role は全操作

#### 2b. ページ作成API
```
POST /api/v1/pages
Body: {
  contentHash: string,
  assetId: string,        // Title ProtocolのcNFT Asset ID
  thumbnailUrl: string,   // R2公開バケットのURL（devnetではモック）
  ogpImageUrl: string
}
Response: {
  shortId: string,
  pageUrl: string
}
```
- shortIdをランダム生成（7〜11文字、英数字）
- 一意制約の保証

#### 2c. ページ解決API
```
GET /api/v1/pages/:shortId
Response: {
  contentHash: string,
  assetId: string,
  thumbnailUrl: string,
  ogpImageUrl: string
}
```

#### 2d. web側のmock.ts更新
- `resolvePageMeta(shortId)` をサーバーAPI呼び出しに置き換え
- ContentResolverを使ったリアルデータ取得に切り替え
- モードスイッチ: 環境変数 `NEXT_PUBLIC_USE_MOCK=true` でモックに戻せるようにする

### Phase 3: クライアントサイド検証（§7.4）

#### 3a. コレクション検証
- cNFTの `grouping` からcollectionアドレスを取得
- GlobalConfigの `core_collection_mint` / `ext_collection_mint` と照合
- 不一致の場合は `collectionVerified: "failed"`

#### 3b. TEE署名検証（Ed25519）
- Arweaveオフチェーンデータの `tee_signature` を抽出
- `tee_pubkey` でEd25519署名を検証（Web Crypto API `crypto.subtle.verify`）
- 署名対象データの再構築 → 署名検証

#### 3c. pHash照合
- 表示画像からCanvas APIでpHashを再計算:
  1. 画像を32x32にリサイズ
  2. グレースケール変換
  3. DCT（離散コサイン変換）適用
  4. 左上8x8の低周波係数 → 64ビットハッシュ
- オンチェーンの `phash-image` Extension結果と比較
- ハミング距離算出 → 閾値5以内で一致判定

#### 3d. 検証ログ出力（§7.4 開発者向けトレーサビリティ）
- `console.group('[RootLens Verification]')` で構造化ログ
- 各ステップの入力・出力・判定結果をログ
- Network通信先がSolana RPC + Arweaveのみであることが確認できる

### Phase 4: ContentPage統合

#### 4a. データ取得フローの接続
- `ContentPage.tsx` の `useEffect` を更新
- `fetchContentRecord()` → `ContentResolver.resolveByAssetId()` に置き換え
- `verifyContent()` → Phase 3の検証ロジックに置き換え
- モックモードとの切り替えをサポート

#### 4b. cNFT情報の表示
- Asset ID表示（Solana Explorerへのリンク付き）
- Arweave URIの表示
- 技術詳細セクションに検証に使用したRPCエンドポイント情報を追加

### Phase 5: E2E動作確認

#### 5a. devnetテスト用コンテンツ登録
- 既存の `register-photo.ts` でC2PAコンテンツをdevnetに登録
- 登録結果（asset_id, content_hash）を記録

#### 5b. ページ作成 → 公開ページ表示
- サーバーAPI `/api/v1/pages` でページレコード作成
- `/p/{shortId}` にアクセスし、以下を確認:
  - Helius DAS API経由でcNFTが取得できること
  - Arweaveからオフチェーンデータが取得できること
  - 検証ステップが全てverifiedになること
  - ブラウザの開発者ツールでSolana/Arweaveへの直接通信が確認できること
  - コンソールに検証ログが出力されること

---

## スコープ外

- **アプリ側のTitle Protocol SDK統合**（別タスク。登録は既存のCLIスクリプトで行う）
- **Privy認証**（§5。アカウント管理は別タスク）
- **R2ストレージ統合**（表示用画像のアップロード。devnetではモックURL）
- **Supabase追加テーブル**（users, subscriptions 等。§10.4 の残りのテーブル）
- **動画のpHash検証**（`phash-video`。画像のみ先行）
- **本番Solana RPC / Helius API Key管理**（devnet APIキーのみ）
- **rootlens.ioへの本番デプロイ**

---

## 完了条件

- [ ] `@title-protocol/sdk` と `@solana/web3.js` が web/ にインストールされている
- [ ] `ContentResolver` インターフェースが定義され、Helius DAS実装が動作する
- [ ] サーバーにページ作成・解決APIが存在する（devnet用簡易ストレージ）
- [ ] 公開ページがHelius DAS API経由でdevnet上のcNFTを取得・表示できる
- [ ] クライアントサイドでコレクション検証が動作する
- [ ] クライアントサイドでTEE署名検証（Ed25519）が動作する
- [ ] クライアントサイドでpHash照合が動作する（画像のみ）
- [ ] ブラウザコンソールに §7.4 形式の検証ログが出力される
- [ ] Network通信にRootLensサーバーへの検証データリクエストが含まれないことが確認できる
- [ ] devnetで登録済みコンテンツの公開ページがend-to-endで表示・検証される
- [ ] `NEXT_PUBLIC_USE_MOCK=true` でモックモードに戻せる
- [ ] COVERAGE.md が更新されている

---

## 技術的メモ

### Helius DAS API

- エンドポイント: `https://devnet.helius-rpc.com/?api-key={KEY}`
- `getAsset(assetId)`: asset_idで直接取得。レスポンスに `content.metadata.attributes` が含まれる
- `searchAssets`: コレクション指定 (`grouping: ["collection", addr]`) + `tokenType: "compressedNft"` でフィルタ。属性のtrait_type/value直接フィルタは非対応のため、レスポンスをクライアントサイドでフィルタする
- 無料枠: 1M credits/month, DAS API 2req/sec

### cNFT attributes構造（Title Protocol）

```json
{
  "attributes": [
    { "trait_type": "protocol", "value": "Title-v1" },
    { "trait_type": "content_hash", "value": "0xABC123..." },
    { "trait_type": "content_type", "value": "image/jpeg" }
  ]
}
```

content_hashはcNFTの属性として記録されているため、コレクション内のcNFTを取得後、`content_hash` 属性値でマッチングできる。

### Ed25519署名検証（ブラウザ内）

```typescript
const isValid = await crypto.subtle.verify(
  { name: "Ed25519" },
  publicKey,  // CryptoKey (Ed25519)
  signature,  // ArrayBuffer
  data        // ArrayBuffer (署名対象)
);
```

Web Crypto API の Ed25519 は Chrome 113+, Safari 17+, Firefox 未対応。
Firefox非対応の場合は `@noble/ed25519` をフォールバックとして使用する。

### pHash (DCT 64-bit) ブラウザ内計算

1. `<canvas>` で画像を 32x32 にリサイズ
2. `getImageData()` でピクセルデータ取得 → グレースケール化
3. 32x32 DCT適用（type-II DCT、JavaScript実装）
4. 左上 8x8 係数を取り出し、中央値で閾値処理 → 64ビットハッシュ
5. ハミング距離: XOR → popcount

Canvas + 純JavaScript で 10ms以下で計算可能。外部ライブラリ不要。
