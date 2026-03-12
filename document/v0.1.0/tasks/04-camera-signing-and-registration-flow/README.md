# Task 04: カメラ即時署名 + 登録フロー（C2PA読み取り・ギャラリーフィルタ・編集ドラフト）

## 目的

カメラアプリとして撮影即時にC2PA署名を付与し、登録フロー（ギャラリー選択 → 編集 → 署名 → 登録準備）を
実際の仕様に沿って実装する。プロトコルへの登録処理自体はスコープ外。

## 仕様書参照

- §3.3 撮影フロー（カメラ → 即時署名 → デバイス保存）
- §3.5 コンテンツ選択（C2PA付き + 信頼署名者のみ選択可能）
- §3.6 編集画面（情報を減らす操作のみ、undo/redo、ドラフト自動保存）
- §4.5 C2PAマニフェスト（読み取り・検証）
- §4.6 C2PA SDK統合（署名 + マニフェスト読み取りFFI追加）

## 実装内容

### Phase 1: C2PAマニフェスト読み取りFFI

`native/c2pa-bridge/src/lib.rs` に読み取り関数を追加:

```
c2pa_read_manifest(input_path) -> JSON string (マニフェスト情報)
```

返却するJSON:
- `has_manifest`: bool
- `signer_common_name`: string (署名者のCN)
- `signer_org`: string (署名者のO)
- `claim_generator`: string
- `validation_status`: array (検証結果)

ネイティブモジュール（Android Kotlin / iOS Expo Module）にも `readManifest(imagePath)` を追加。

### Phase 2: カメラ撮影 → 即時C2PA署名

現状: カメラ撮影 → MediaLibraryに未署名で保存

変更後:
1. シャッター → JPEG生成
2. バックグラウンドキューでC2PA署名を実行
3. 署名済みJPEGをMediaLibraryに保存（未署名版は保存しない）
4. 連写対応: キューイングして順次署名。UIはブロックしない

Google Pixel のデフォルトカメラと同様の挙動。

### Phase 3: ギャラリーのC2PAフィルタリング

現状: デバイスのすべての写真を表示、すべて選択可能

変更後:
- ギャラリー表示時に各画像のC2PAマニフェストを読み取る
- **選択可能**: C2PA署名付き かつ 署名者がRootLensまたは信頼ハードウェアベンダー
- **選択不可（暗くグレーアウト）**: C2PA署名なし、または署名者が信頼リスト外
- バッジ表示: 選択可能な画像にはC2PA認証済みバッジを表示

信頼リスト（開発時点）:
- `O=RootLens` — RootLens自身の署名
- 将来: ハードウェアベンダーのCA証明書を追加

パフォーマンス考慮:
- C2PA読み取りはネイティブ側で高速に実行
- サムネイル表示時にバックグラウンドで順次読み取り、結果をキャッシュ

### Phase 4: 編集フロー改修

#### 4a: ドラフト自動保存（永続化）

- 編集中の状態をディスクに永続化（アプリ再起動後も復元可能）
- 保存対象:
  - 元画像のURI（無加工状態）
  - 編集履歴（各操作後のURI配列）
  - 現在のundo位置
  - 各画像のページインデックス
- ストレージ: AsyncStorage（メタデータ） + アプリ内temp（編集済み画像ファイル）
- 操作するたびに自動保存
- 常に最初の無加工状態に遡れること

#### 4b: メディア保存の変更

現状: 証明ボタンで署名 → MediaLibraryに保存

変更後:
- 編集済みコンテンツはMediaLibraryに自動保存**しない**（temp保持のみ）
- 各編集ページに**ダウンロードボタン**を設置:
  - 押下時: 現在の編集状態でC2PA署名 → MediaLibraryに保存
  - ユーザーが任意に保存を選択できる
- 「登録」ボタン押下時:
  - 全画像を現在の編集状態でC2PA署名
  - tempに保存（MediaLibraryには入れない）
  - 登録準備完了状態へ遷移

#### 4c: 未署名フォールバックの削除

現状: C2PA署名失敗時に未署名で保存するフォールバックがある

変更後:
- 署名失敗時はエラーを表示し、保存しない
- フォールバック保存のコードを削除

### Phase 5: 登録準備画面

- 登録ボタン押下後の遷移先
- 署名済みコンテンツのサマリー表示（枚数、サムネイル）
- 「登録する」ボタン（現時点ではプレースホルダー。プロトコル登録は次タスク以降）
- 登録完了後の導線は次タスクで設計

## スコープ外（後続タスク）

- Title Protocolへの実際の登録処理（Solana/Arweave）
- サーバーへのアップロード
- 公開ページの生成
- 動画のC2PA署名・読み取り
- 信頼リストのサーバー管理（現時点はハードコード）
- 編集ツールの追加（マスク、サイズ変更等）

## ディレクトリ変更

```
native/c2pa-bridge/src/lib.rs          # c2pa_read_manifest() 追加
app/modules/c2pa-bridge/ios/           # readManifest() 追加
app/android/.../C2paBridgeModule.kt    # readManifest() 追加
app/src/native/c2paBridge.ts           # readManifest() JS wrapper追加
app/src/screens/CameraScreen.tsx       # 撮影即時署名
app/src/screens/DeviceGalleryScreen.tsx # C2PAフィルタリング + バッジ
app/src/screens/EditScreen.tsx         # ドラフト永続化、DLボタン、フォールバック削除
app/src/store/draftStore.ts            # ドラフト永続化ストア（新規）
```

## 完了条件

- [x] C2PAマニフェスト読み取りFFIが動作する（Android + iOS）
- [x] カメラ撮影時にC2PA署名が即時付与され、署名済みJPEGがギャラリーに保存される
- [x] ギャラリーでC2PA署名付き画像のみ選択可能、他はグレーアウト
- [x] 編集のundo/redo履歴がアプリ再起動後も復元される
- [x] 編集済みコンテンツはMediaLibraryに自動保存されない
- [x] DLボタンで任意にC2PA署名 → MediaLibrary保存ができる
- [x] 登録ボタンで全画像署名 → temp保存 → 登録準備画面に遷移する
- [x] 署名失敗時に未署名フォールバックが発生しない（エラー表示のみ）

## 実装メモ

### C2PAマニフェスト読み取り — JSONフィールドマッピング

c2pa-rs 0.78の`Reader::json()`出力は以下の構造:
- `claim_generator_info[0].name` → claim_generator
- `signature_info.common_name` → signer_common_name
- `signature_info.issuer` → signer_org（Oフィールドがそのままissuerとなる）

### 3段階信頼判定

1. `has_manifest` — C2PAマニフェスト存在確認
2. `is_valid` — 暗号検証（`validation_status`に`mismatch`/`failure`系がないこと）
3. `signer_org === 'RootLens'` — 署名者が信頼リスト内

`signingCredential.untrusted`はtrust anchor未設定のため想定内（自前で信頼判定するため除外）。

## テスト環境

- Android実機（Pixel等）でテスト
- iOSは実機入手後に検証
