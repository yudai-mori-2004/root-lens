# Task 03: C2PA来歴チェーンの修正

## 問題の深刻度: 高

現在のC2PA署名フローは、撮影時の来歴情報を登録時に完全に破壊している。
RootLensの根幹機能（「本物のコンテンツであることの証明」）が正しく機能していない。

## 現状の問題

### 症状

- 一昨日撮影・編集なし（final:1）の写真を登録すると、TSAタイムスタンプが「登録時刻」になる
- 撮影時のC2PA署名（撮影時刻のTSA、デバイス証明書による署名）が完全に消失
- 来歴グラフが `final:1, ingredient:0` のみ — 元のマニフェストへの参照がない

### 根本原因

`EditScreen.tsx` の `handleRegister` と `handleDownload` が、全てのケースで `signContent()` を呼んでいる。`signContent()` は c2pa-rs の `Builder::from_json()` + `builder.sign()` で **新規マニフェストを作成** し、入力ファイルに既存のC2PAマニフェストがあっても完全に上書きする。

#### handleRegister（公開フロー）
```
generateFinalMedia() → signContent() → Title Protocol登録
```
- 編集なしの場合: `generateFinalMedia` は元ファイルURIをそのまま返す
- しかし `signContent` が呼ばれ、撮影時のC2PA署名が新しいマニフェストで上書きされる
- TSAは登録時刻のものに置き換わる
- 元の来歴ノード（撮影時のマニフェスト）は消失

#### handleDownload（保存フロー）
```
generateFinalMedia() → signContent() → ギャラリーに保存
```
- 編集ありの場合: 編集後のファイルに対して `signContent` で再署名
- c2pa.created アクションで署名 → 本来は c2pa.edited であるべき
- 元のマニフェストを ingredient として参照していない → 来歴チェーンが切れる

### 影響

1. **撮影時刻の証明が不可能** — TSAが登録時刻に上書きされるため、「いつ撮影されたか」の第三者証明が消失
2. **来歴グラフが単一ノード** — 「撮影→編集→公開」のチェーンが存在しない
3. **Title Protocol側の検証** — TEEがC2PAを検証する際、来歴グラフが1ノードのみになるため、コンテンツの完全な来歴を再構築できない
4. **公開ページの信頼性** — 「撮影時刻」として表示するものが実際には登録時刻であり、虚偽の表示になる

## 正しいフロー

### 撮影時（CameraScreen）
```
takePicture() → signContent(photoUri)
  → c2pa.created アクション
  → デバイス証明書で署名
  → TSA = 撮影時刻
  → ギャラリーに保存
```
これは現状で正しい。

### 編集・保存時（EditScreen → handleDownload）
```
generateFinalMedia(edits) → signContent(editedUri, parentUri)
  → c2pa.edited アクション（crop, mask, resize等を記録）
  → 元のマニフェストを ingredient として参照
  → デバイス証明書で署名
  → TSA = 編集時刻
  → ギャラリーに保存
```
元のマニフェストが ingredient として来歴グラフに残る。

### 登録時（EditScreen → handleRegister）

#### ケース1: 編集なし
```
generateFinalMedia() → 元ファイルURIをそのまま返す
  → signContent を呼ばない（既に署名済み）
  → そのまま Title Protocol に送信
```
撮影時のC2PA署名がそのまま保持される。

#### ケース2: 編集あり
```
generateFinalMedia(edits) → signContent(editedUri, parentUri)
  → c2pa.edited アクション
  → 元のマニフェストを ingredient として参照
  → Title Protocol に送信
```

## 実装方針

### 1. handleRegister: 編集なしの場合は再署名しない

```typescript
const handleRegister = async () => {
  for (let i = 0; i < editStates.length; i++) {
    const state = editStates[i];
    const activeActions = state.actions.slice(0, state.currentIndex + 1);

    if (activeActions.length === 0) {
      // 編集なし → 元ファイルをそのまま使用（再署名しない）
      signedUris.push(state.originalUri);
    } else {
      // 編集あり → 編集結果を生成し、親マニフェスト参照で再署名
      const finalUri = await generateFinalMedia(state, item);
      const signedPath = await signContentWithParent(finalUri, state.originalUri);
      signedUris.push(signedPath);
    }
  }
};
```

### 2. c2pa-bridge: ingredient対応

c2pa-rs の `Builder` は `add_ingredient()` メソッドで既存のマニフェストを参照できる。
`do_sign_tee` に `parent_path` パラメータを追加し、存在する場合は ingredient として追加する。

```rust
// 親マニフェストがある場合、ingredient として追加
if let Some(parent) = parent_path {
    let ingredient = Ingredient::from_file(parent)?;
    builder.add_ingredient(ingredient);
}

// アクションを c2pa.edited に変更
```

### 3. ネイティブモジュール: signContentWithParent

新しいネイティブ関数 `signContentWithParent(inputPath, parentPath)` を追加。
既存の `signContent` は撮影時の新規署名専用として残す。

### 4. handleDownload: 同様の修正

保存時も、編集ありの場合は `signContentWithParent` を使い、
元ファイルを ingredient として参照する。

## 仕様書参照

- §4.5 C2PAマニフェスト
- §4.5.3 RFC 3161 TSAタイムスタンプ
- C2PA仕様 §8.3 Ingredient handling

## 検証項目

- [ ] 撮影のみ（編集なし）→ 登録: 撮影時のTSAが保持されること
- [ ] 撮影 → 編集 → 登録: 来歴グラフに final:1 + ingredient:1 が含まれること
- [ ] 撮影 → 編集 → 保存: ギャラリー保存後のファイルに親マニフェスト参照があること
- [ ] 来歴グラフのノードタイプが正しいこと（created → edited の連鎖）
- [ ] TSAタイムスタンプが各段階の時刻を正しく反映していること
- [ ] Title Protocol TEE がC2PA来歴グラフを正しく検証・記録すること
