# Task 15: 重複コンテンツの登録前警告

## 目的

登録時に、同一の content_hash を持つコンテンツが既にTitle Protocol上に存在する場合、
ユーザーに対して帰属に関する警告を表示する。

## 仕様書参照

- TP仕様 §2.4 重複の解決
- TP仕様 §5.3.3 重複解決（検証フロー）

## 背景

Title Protocolは同一 content_hash の重複登録を許容する（防止しない）。
ただし、検証時には**最古のトークンが正当な権利トークン**として一意に決定される（§2.4）。

これは設計上の意図的な判断である:
- 登録時の全cNFTとの重複チェックはスケーラビリティを損なう
- 分散ノード構成では各ノードが独自のMerkle Treeを持つため、ノード間重複検知は困難
- 意図的な重複登録にも正当なユースケースがある（例: 素材の再利用を来歴に記録）

しかし、**アプリケーションレベル**では、ユーザーが知らずに重複登録して
帰属が自分に紐づかないことを理解せずに進むのは問題である。

## 実装方針

### RegistrationScreen での事前チェック

公開ボタンを押す前（または RegistrationScreen 表示時）に、
署名済みファイルから content_hash を算出し、DAS API で既存 cNFT を検索する。

#### content_hash の算出

content_hash = SHA-256(Active Manifest の COSE 署名)。
これはTEEが算出するものと同一であり、クライアントでも再現可能。
c2pa-rs の Reader で Active Manifest の signature bytes を取得し、SHA-256 をかける。

あるいは、RegistrationScreen に来る前の段階で readManifest() の結果から
署名情報を取得できるか検討する。

#### DAS API 検索

```typescript
// content_hash trait で core collection 内を検索
const coreResult = await searchAssetsByCollection(collections.core);
const existing = coreResult.items.find(
  item => getAttribute(item, "content_hash") === contentHash
);
```

既存のcNFTが見つかった場合:
- `ownership.owner` から現在の所有者ウォレットアドレスを取得
- 自分のアドレスと比較

#### 警告UI

```
⚠ このコンテンツは既にTitle Protocolに登録されています

所有者: 0xABC...DEF
登録日時: 2025/3/15

このまま登録すると、新しいcNFTが発行されますが、
帰属（所有権）はこの所有者に紐づいたままです。
（Title Protocol §2.4: 先に登録した者が優先される）

[それでも登録する]  [キャンセル]
```

### 考慮事項

- DAS APIの検索はベストエフォート。検索に失敗しても登録はブロックしない
- 自分自身が所有者の場合は警告不要（再登録の意図的なケース）
- content_hash のクライアント側算出方法の実装コストを検討
  - 最もシンプル: Title Protocol登録後に返る contentHash と照合（ただし登録後では遅い）
  - 理想: 登録前にクライアントで算出して事前検索
