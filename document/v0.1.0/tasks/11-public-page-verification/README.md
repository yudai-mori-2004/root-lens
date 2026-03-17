# Task 11: 公開ページ検証ロジックの堅牢化 & デザインブラッシュアップ

## 目的

Title Protocol の Core + Extension cNFT 構造に完全対応し、公開ページの検証ロジックを堅牢にする。
同時に、一般ユーザーと技術者の両方が満足するデザイン・UXにブラッシュアップする。

## 背景: Core / Extension 構造

Title Protocol では1つのコンテンツに対して、Core cNFT と任意の数の Extension cNFT が発行される:

| 種別 | Collection | Processor ID 例 | 目的 |
|------|-----------|----------------|------|
| Core | core_collection_mint | core-c2pa | C2PA署名チェーン検証、来歴グラフ |
| Extension | ext_collection_mint | image-phash | 知覚ハッシュによる同一性検証 |
| Extension | ext_collection_mint | hardware-google 等 | ハードウェアキャプチャ証明 |
| Extension | ext_collection_mint | (将来追加) | 任意のWASMモジュールで拡張可能 |

- 全てのcNFTは同一の `content_hash` で紐付けられる
- Core cNFTは `core_collection_mint`、Extension cNFTは `ext_collection_mint` に属する
- TEE署名はそれぞれ独立に検証可能
- Extensionの数に上限はない（WASMモジュールの追加で自由に拡張）

## 仕様書参照

- Title Protocol SPECS_JA.md
  - §1.2: 検証モデル（Resolve）— 信頼の連鎖
  - §2: Core（来歴グラフ、content_hash定義）
  - §3: Extension（WASM, 属性構造）
  - §5: データ構造（signed_json）
  - §7: Global Config
- RootLens SPECS_JA.md
  - §7.4: クライアントサイド検証アーキテクチャ

## 完了した作業

### 検証ロジック（verify.ts — 既存コミットで完了）
- [x] コレクション検証: core_collection_mint / ext_collection_mint（SDKから動的取得）
- [x] Core TEE署名検証 (Ed25519)
- [x] C2PAチェーン: nodes の存在確認
- [x] pHash同一性: image-phash extension から取得、WASMで再計算
- [x] Extension TEE署名: 各extension signed_json の TEE署名を個別検証
- [x] ハードウェア署名extension の検出
- [x] 全extension動的対応（verification.extensions配列）

### 公開ページデザイン・UXブラッシュアップ（本タスク）

#### 一般向け（技術用語ゼロ）
- [x] 極限にシンプルな構成: 画像 → デバイス名・日時 → 信頼バッジ（1行）
- [x] シールドアイコン付き信頼バッジ（verified / failed + スコア）

#### 技術者向け（初見でもゼロから理解できるガイドツアー）
- [x] Title Protocol導入説明（TEE、C2PA、Core/Extensionの関係）
- [x] 信頼の連鎖の説明（Global Config → Collection → cNFT → Off-chain Data）
- [x] Core cNFT セクション
  - 検証結果3項目（コレクション所属、TEE署名、C2PA来歴チェーン）
  - オフチェーンデータ構造（signed_jsonの実データ表示）
  - 来歴グラフ（nodes/links件数）
  - 所有者情報（登録者ウォレット + 現在の所有者、譲渡有無の表示）
- [x] Extension cNFT セクション（動的レンダリング）
  - image-phash: 説明 + 検証結果 + ハミング距離 + オンチェーンpHash表示
  - hardware-*: 説明 + 準備中バッジ（WASM未完成）
  - 未知のextension: 汎用表示（将来のextension追加に自動対応）
- [x] オンチェーン参照（Content Hash, Asset ID → Solana Explorer, オフチェーンストレージURI → リンク, TEE Type, 署名アルゴリズム, 解像度, TSA）
- [x] 「なぜ信頼できるのか」セクション
  - トラストレス検証の仕組み（元C2PAデータ不要の理由）
  - TSAタイムスタンプの意味
  - RootLensサーバー非関与の説明
  - ソースコード全公開（Title Protocol / RootLens GitHubリンク）

#### i18n・その他
- [x] next-intl で日英両対応（messages/ja.json, en.json 全面刷新）
- [x] ブランドカラー #1E3A5F 維持、ダークモード対応
- [x] オフチェーンストレージの記述をプロトコル仕様に準拠（Arweaveは推奨であり強制ではない旨を明記）
- [x] TP仕様書との整合性ファクトチェック実施・修正済み

## 未実装（将来タスク）

- ext_collection_mint のコレクション検証（ResolvedContentにext個別のcollectionAddress未保持）
- wasm_hash を Global Config の trusted_wasm_modules と照合
- TEE attestation document のパース（AWS Nitro CBOR）・PCR値検証
- 来歴グラフの可視化（ingredient関係のツリー表示）
- 重複解決ロジック（TSA timestamp vs Solana block time）
- 動画pHash（video-phash processor 未実装）

## スコープ外

- 来歴グラフの再帰的解決（ingredient の ingredient を辿る）
- マーケットプレイス・ライセンス関連
- 検証ロジック（verify.ts等）の変更（表示側のみ）

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `web/components/ContentPage.tsx` | 全面書き換え — 一般向け/技術者向け二層構造、動的extension表示 |
| `web/components/ContentPage.module.css` | 技術セクション用スタイル追加 |
| `web/messages/ja.json` | 技術者向け解説文を全面刷新 |
| `web/messages/en.json` | 同上の英語版 |
