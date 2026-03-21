# Task 20: 検証ページのオーバーホール

## 目的

公開ページ (`/p/[shortId]`) の検証詳細セクションを、Title Protocol仕様書 §5.2 の検証フローに準拠した形に全面改修する。
技術者が各検証ステップの意味・根拠・比較対象を理解でき、生データのダウンロードにより独立検証を再現できる状態にする。

## 背景

Task 11 で公開ページの基本UIを実装し、Task 19 でLPを作成した。
しかし検証詳細セクションは以下の問題を抱えていた:

- 検証結果が「何と何を比較して」「どの条件でpass/failなのか」を伝えていない
- GlobalConfigのフィールドが不完全（コレクション以外が未表示）
- 説明文のフィールド名と表のラベルが不統一
- ダウンロードが平文txtでspecフィールドパスなし
- verify.tsの検証ロジックが仕様§5.2と乖離

## 実施内容

### 1. 検証ロジック刷新 (verify.ts)

- §5.2 Step 1-6 に準拠した検証フローに書き換え
- Core NFT: コレクション所属 → TEE署名(Ed25519) → C2PA来歴チェーン → Content Hash一致 → 重複解決
- Extension NFT: コレクション所属 → TEE署名 → WASMハッシュ検証 → pHash同一性 → ハードウェア撮影証明
- NftVerification 統一型（共通2ステップ + specificChecks）
- CheckTranslator による i18n 対応
- pHash CORS エラーハンドリング追加

### 2. 型定義リファクタ (types.ts)

- `NftVerification` 型: Core/Extension統一（id, collectionVerified, teeSignatureVerified, specificChecks[]）
- `SpecificCheck` 型: label + status + detail
- `VerificationResult.nfts: NftVerification[]` に統合（phashDistance, duplicateCount等の個別フィールド廃止）

### 3. データ解決層拡張 (content-resolver.ts, resolvers/helius.ts)

- `ExtensionNft` 型追加（per-NFT assetId, collectionAddress, arweaveUri, ownerWallet, signedJson）
- `ResolvedContent.extensionNfts: ExtensionNft[]` で拡張NFT情報を保持
- `resolveAllByContentHash` 追加（重複解決用、軽量実装）

### 4. GlobalConfig完全取得 (config.ts)

- SDK 0.1.6 → 0.1.10 更新（trusted_wasm_modules フルオブジェクト対応）
- `GlobalConfigData` に authority, trustedTeeNodes, trustedTsaKeys, trustedWasmModules を追加
- 表示: プログラム, PDA, ネットワーク, 管理者, Core/Extコレクション, 信頼済みTEEノード数, 信頼済みTSA鍵数, 信頼済みWASMモジュール一覧

### 5. 検証ステップの説明文改善 (en.json, ja.json)

- 全検証ステップで「何と何を比較」「どの条件でpass/fail」を1文で伝える記述に
- コレクション所属: Core→core_collection_mint / Extension→ext_collection_mint と明記
- TEE署名: 「ペイロードと属性をシリアライズした値に対するEd25519署名をTEE公開鍵で検証」
- WASMハッシュ: 「TEEがWASMバイナリ実行直前に計算したSHA-256ハッシュをGlobalConfigの信頼済みリストと照合」
- pHash: 「オンチェーンpHash（TEEが原画像から算出した64bit DCTハッシュ）とブラウザ再計算pHashのハミング距離。N以下で同一判定（0が完全一致、距離が小さいほど類似）」

### 6. 用語統一

- 表（field.*）のフレンドリーラベルを基準とし、説明文をそれに合わせる
- specフィールド名（tee_pubkey等）は説明文から排除し、フレンドリー名（TEE公開鍵等）に統一
- specフィールドパスはCSVダウンロードの2列目で提供（表示名/フィールドパス/値の3列構成）

### 7. CSVダウンロード

- txt → CSV 3列構成（Display Name, Field Path, Value）
- GlobalConfig全フィールド（authority, trusted_tee_nodes詳細, trusted_wasm_modules詳細含む）
- Core/Extension NFTの全オフチェーンデータ
- BOM付きUTF-8（Excel互換）
- specフィールドパスにより独立検証の再現が可能

### 8. UI構造 (ContentPage.tsx)

- Trust row（検証結果サマリー）を画像直下に配置
- NFTトグル: Core/Extension統一構造（共通2ステップ + specificChecks + 生データフィールド）
- Core/Extension別のコレクション説明文（collectionPass/Fail）
- 未使用コンポーネント整理（ExtensionBlock, RefRow, VerifySummaryRow, nodeBreakdown）

## 完了条件

- [x] verify.ts が §5.2 Step 1-6 に準拠
- [x] 全検証ステップの説明文が「何と何を比較」「pass/fail条件」を伝えている
- [x] GlobalConfigの全フィールドが表に表示されている
- [x] 表のラベルと説明文の用語が統一されている
- [x] CSVダウンロードが3列構成（表示名/フィールドパス/値）
- [x] i18n (en/ja) 全キー対応
- [x] @title-protocol/sdk 0.1.10 (trusted_wasm_modules フルオブジェクト)
- [x] TypeScript型チェック通過
- [ ] 実画像での検証表示確認（pHash CORSはR2設定待ち）
