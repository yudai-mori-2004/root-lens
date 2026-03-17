# Task 11: 公開ページ検証ロジックの堅牢化

## 目的

Title Protocol v0.1.1 の3-cNFT構造に完全対応し、公開ページの検証ロジックを堅牢にする。
現状は core cNFT + 1つの extension cNFT（image-phash）のみ対応しているが、
ハードウェア署名（hardware-google等）やソフトウェア署名の検証、複数extension対応、
attestation document検証等を段階的に追加する。

## 背景: 3-cNFT構造

Title Protocol では1つのコンテンツに対して最大3層のcNFTが付与される:

| 層 | Collection | Processor ID | 目的 |
|----|-----------|-------------|------|
| Core | core_collection_mint | core-c2pa | C2PA署名チェーン検証、来歴グラフ |
| Extension 1 | ext_collection_mint | hardware-google / (将来: hardware-canon等) | ハードウェアキャプチャ証明 |
| Extension 2 | ext_collection_mint | image-phash / (将来: video-phash) | 知覚ハッシュによる同一性検証 |

- 全てのcNFTは同一の `content_hash` で紐付けられる
- Core cNFTは `core_collection_mint`、Extension cNFTは `ext_collection_mint` に属する
- TEE署名はそれぞれ独立に検証可能

## 仕様書参照

- Title Protocol v0.1.1 SPECS_JA.md
  - §2: コンテンツアイデンティティ（来歴グラフ、遅延解決）
  - §3: Extension（WASM, 属性構造）
  - §5: 検証フロー（Resolve）
  - §6: 登録フロー
  - §7: Global Config

## 現状の検証ステップと課題

### 実装済み ✓
1. **コレクション検証**: core_collection_mint に属するか（SDKから動的取得）
2. **TEE署名検証**: `{payload, attributes}` に対するEd25519検証
3. **C2PAチェーン**: nodes の存在確認
4. **pHash同一性**: image-phash extension から取得、WASMで再計算

### 未実装 / 要改善
1. **ext_collection_mint のコレクション検証**: extension cNFT が正規コレクションに属するか未検証
2. **Extension TEE署名検証**: extension signed_json の TEE署名を個別に検証していない
3. **wasm_hash 検証**: extension の wasm_hash が Global Config の trusted_wasm_ids に含まれるか未検証
4. **ハードウェア署名検証**: hardware-google extension の表示・検証が未対応
5. **Attestation Document 検証**: TEE attestation の証明書チェーン検証が未実装
6. **来歴グラフの表示**: Core の nodes/links を可視化していない（ingredient関係）
7. **重複解決**: 同一 content_hash の複数cNFT がある場合の canonical 選択
8. **TSA タイムスタンプ**: trusted_tsa_keys による信頼判定
9. **動画pHash**: video-phash processor への対応
10. **所有者表示**: creator_wallet と現在のcNFT所有者の区別

## 実装方針

段階的に進める。各サブタスクは独立してコミット可能。

### Phase 1: 既存検証の堅牢化
- [ ] ext_collection_mint のコレクション検証追加
- [ ] extension signed_json の TEE署名を個別検証
- [ ] wasm_hash を Global Config と照合
- [ ] 検証結果UIの改善（各extensionの結果を個別表示）

### Phase 2: ハードウェア署名対応
- [ ] hardware-google extension の検出と表示
- [ ] ハードウェア署名あり → 「Shot on [デバイス名]」の信頼レベル向上
- [ ] ハードウェア署名なし（RootLensソフトウェア署名のみ）→ 現状と同じ表示

### Phase 3: Attestation & 高度な検証
- [ ] TEE attestation document のパース（AWS Nitro CBOR）
- [ ] PCR値の Global Config expected_measurements との照合
- [ ] 検証結果に attestation 情報を追加

### Phase 4: 来歴グラフ & 高度な表示
- [ ] 来歴グラフの可視化（ingredient関係のツリー表示）
- [ ] 重複解決ロジック（TSA timestamp vs Solana block time）
- [ ] 所有者表示（creator_wallet + 現在の所有者）

## スコープ外

- 動画pHash（video-phash processor が未実装のため）
- 来歴グラフの再帰的解決（ingredient の ingredient を辿る）
- マーケットプレイス・ライセンス関連

## ディレクトリ

主な変更対象:
- `web/lib/verify.ts` — 検証ロジック
- `web/lib/resolvers/helius.ts` — DAS検索（複数extension対応）
- `web/lib/config.ts` — Global Config 取得
- `web/lib/types.ts` — 型定義拡張
- `web/components/ContentPage.tsx` — 検証結果の表示
- `web/lib/content-resolver.ts` — ResolvedContent の拡張
