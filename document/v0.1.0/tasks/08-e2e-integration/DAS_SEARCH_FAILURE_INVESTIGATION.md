# DAS検索失敗の調査報告

**対象**: `https://www.rootlens.io/p/AFgjU3P5`
**調査日**: 2026-03-13
**ステータス**: 根本原因特定済み・未修正

---

## 症状

公開ページにアクセスすると「オンチェーン記録が見つかりません」と表示される。
アプリ側ではTitle Protocol登録が成功し、txSignatureも返却されている。

---

## 根本原因

**3つの問題が重なっている。**

### 原因1（致命的）: TEE環境変数の未設定

TEEノード (`54.250.99.105:3000`) に `CORE_COLLECTION_MINT` / `EXT_COLLECTION_MINT` 環境変数が設定されていない。

TEEの設定読み込み (`title-protocol/crates/tee/src/config.rs:43-48`):
```rust
pub core_collection_mint: Option<Pubkey>,
pub ext_collection_mint: Option<Pubkey>,
```

これらは `Option` 型であり、環境変数が未設定の場合 `None` になる。

mint処理 (`title-protocol/crates/tee/src/blockchain/solana_tx.rs:202-207`):
```rust
if let Some(collection) = core_collection {
    // collection関連の設定は全てこのブロック内
    builder
        .core_collection(Some(*collection))
        .collection_authority(Some(*tee_signing_pubkey))
        .mpl_core_cpi_signer(Some(mpl_core_cpi_signer));
}
```

`core_collection` が `None` の場合、このブロック全体がスキップされ、cNFTはコレクションなしでmintされる。

**証拠**: DAS APIで `ownerAddress` 検索すると35件のcNFTが見つかるが、全て `grouping: []` (コレクション未割当)。

### 原因2: RootLens側のコレクションアドレスが不正

`web/lib/config.ts` にハードコードされたアドレスがGlobalConfigと一致しない。

| 項目 | RootLens (config.ts) | GlobalConfig (on-chain) | network.json |
|------|---------------------|------------------------|--------------|
| core_collection_mint | `H51zy5FPdoePeV4CHgB724SiuoUMfaRnFgYtxCTni9xv` | `68uENeqyXuFmS3Mr4yqMuWoTB2AzG1QBVhfMxjUHq8Mt` | `68uENeqyXuFmS3Mr4yqMuWoTB2AzG1QBVhfMxjUHq8Mt` |
| ext_collection_mint | `5cJGwZXp3YRM22hqHRPYNTfA528rfMv9TNZL9mZJLXFY` | — | `3GJygRLkh2gvpjPDzeaCsHXoyBkngYHQ86MtLJCqW2cf` |

`H51zy5...` と `5cJGwZ...` の出所は不明。おそらく古い値か手動テスト時の値。

### 原因3（潜在的）: コレクション権限委譲

Bubblegum v2でコレクション付きmintを行うには、TEE署名鍵がMPL Coreコレクションに対する `collection_authority` を持つ必要がある。`build_mint_v2_tx` は `.collection_authority(Some(*tee_signing_pubkey))` を設定しているが、オンチェーンでこの委譲が事前に行われていない場合、トランザクションが失敗する可能性がある。

この権限委譲が完了しているかは未確認。

---

## 検索メカニズムの分析

### 公開ページの検索フロー

```
content_hash
  → DasContentResolver.resolveByContentHash()
    → searchAssets(CORE_COLLECTION_MINT)  ← コレクション全体をスキャン
      → items.find(item => getAttribute(item, "content_hash") === contentHash)
```

`web/lib/resolvers/helius.ts` の `searchAssets` は DAS RPC の `searchAssets` メソッドを使い、`grouping: ["collection", collectionMint]` でフィルタする。

cNFTにコレクションが割り当てられていないため、どのコレクションアドレスで検索しても0件になる。

### DAS検索の実行結果

```
searchAssets(grouping: ["collection", "H51zy5..."]) → total: 0  (config.tsの値)
searchAssets(grouping: ["collection", "68uENeq..."]) → total: 0  (GlobalConfigの値)
searchAssets(ownerAddress: operator_wallet)          → total: 35 (cNFT自体は存在)
```

### 対象cNFTの確認

asset ID `BuFimeh7VzZDKvZDKPLCbiDfU8xswziFWZeHoSZuoDpD` を直接取得 (`getAsset`) すると:

- `content_hash` attribute: `0x98e5a35cd2367ca158faad924943361ce79b5721f9526781dc822377ddf0d2a1` — ページのcontent_hashと一致
- `grouping`: `[]` — コレクション未割当
- `json_uri`: R2上の signed_json を指す有効なURL
- signed_json の中身: `protocol: "Title-v1"`, `tee_type: "aws_nitro"`, nodes/links あり

cNFT自体は正常にmintされ、メタデータも正しい。コレクションの欠如のみが問題。

---

## Bubblegum v2のコレクション機構

### MetadataArgsV2

Bubblegum v2 (mpl-bubblegum 2.1) では、コレクションはツリー単位ではなくmint単位で指定する:

```rust
let metadata = MetadataArgsV2 {
    // ...
    collection: core_collection.copied(),  // Option<Pubkey>
};
```

`collection` が `None` の場合、cNFTはどのコレクションにも属さずにmintされる。

### MintV2Builder

コレクション付きmintの場合、追加で3つのアカウントが必要:

1. `core_collection` — MPL Coreコレクションのアドレス
2. `collection_authority` — コレクションに対するmint権限を持つ署名鍵
3. `mpl_core_cpi_signer` — PDAベースのCPI署名者

Title Protocolの実装 (`solana_tx.rs:202-207`) はこれらを正しく設定しているが、環境変数が `None` のためこのコードパスに到達していない。

---

## 影響範囲

- **既存の全cNFT (35件)**: コレクションなしでmintされている。DASのコレクション検索では発見不可。
- **公開ページ**: content_hashベースの検索が全て失敗する。
- **検証フロー**: cNFTが見つからないため、全ステップが `failed` になる。

---

## 修正方針

### 必須（フォワードフィックス）

1. **TEE環境変数の設定**: `CORE_COLLECTION_MINT=68uENeqyXuFmS3Mr4yqMuWoTB2AzG1QBVhfMxjUHq8Mt` と `EXT_COLLECTION_MINT=3GJygRLkh2gvpjPDzeaCsHXoyBkngYHQ86MtLJCqW2cf` をTEEノードに設定

2. **コレクション権限委譲の確認**: TEE署名鍵が `68uENeq...` コレクションに対する authority を持っているか確認。未設定なら delegate する

3. **RootLens config.tsの修正**: ハードコードされたコレクションアドレスを正しい値に更新
   - `CORE_COLLECTION_MINT` → `68uENeqyXuFmS3Mr4yqMuWoTB2AzG1QBVhfMxjUHq8Mt`
   - `EXT_COLLECTION_MINT` → `3GJygRLkh2gvpjPDzeaCsHXoyBkngYHQ86MtLJCqW2cf`

### 検討事項

- **既存cNFTのマイグレーション**: 35件の既存cNFTにコレクションを後付けできるかの調査が必要。Bubblegum v2に `setAndVerifyCollection` 相当の命令があるか
- **検索フォールバック**: コレクション検索が失敗した場合、`ownerAddress` + `content_hash` trait で検索するフォールバックパスの追加を検討
- **コレクションアドレスの動的取得**: GlobalConfig PDAからコレクションアドレスを取得する方式への移行。ハードコードの排除

---

## 関連ファイル

### RootLens

| ファイル | 役割 |
|---------|------|
| `web/lib/config.ts` | コレクションアドレスのハードコード（不正値） |
| `web/lib/resolvers/helius.ts` | DAS searchAssets によるコレクション検索 |
| `web/lib/content-resolver.ts` | ContentResolver インターフェース |
| `web/lib/data.ts` | content_hash → DAS → ContentRecord 変換 |
| `web/lib/verify.ts` | クライアントサイド検証ロジック |
| `web/components/ContentPage.tsx` | 公開ページUI |
| `app/src/services/titleProtocol.ts` | アプリ側 Title Protocol SDK 呼び出し |
| `app/src/screens/PublishingScreen.tsx` | 公開パイプラインオーケストレーション |

### Title Protocol

| ファイル | 役割 |
|---------|------|
| `network.json` | 正しいdevnetコレクションアドレス |
| `crates/tee/src/config.rs:43-48` | コレクション環境変数の読み込み |
| `crates/tee/src/blockchain/solana_tx.rs:163-207` | MintV2Builder でのコレクション設定 |
| `crates/tee/src/endpoints/sign/handler.rs` | TEE署名エンドポイント（stateからcollection取得） |
| `sdk/ts/src/client.ts:132-227` | SDK register() フロー |
