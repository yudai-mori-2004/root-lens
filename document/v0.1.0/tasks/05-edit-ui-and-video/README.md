# Task 05: 動画・編集画面・カメラ画面・アプリ全体のUI品質向上

## 目的

Task 04で基本機能が動作する状態になったアプリのUI/UXを製品品質に引き上げる。
動画のC2PA署名対応、編集ツールの完成度向上、カメラUXの改善、アプリ全体の視覚的一貫性を実現する。

## 仕様書参照

- §3.1 UI表現の原則
- §3.4 カメラ（動画撮影 + 署名）
- §3.6 編集画面（クロップ・マスク・リサイズの品質向上）
- §2.2 撮影・選択（動画対応）

## 実装内容

### 1. フォーマット非依存C2PA署名
- c2pa-rs FFI: `mime_from_path()` によるMIMEタイプ自動検出（JPEG/PNG/WebP/HEIC/AVIF/MP4/MOV等）
- 動画署名修正: `fs::File::create()`（write-only）→ `OpenOptions` (read+write+seek) でBMFF形式に対応
- Android Kotlin / iOS Swift: 出力ファイルの拡張子を入力から引き継ぐよう修正

### 2. 動画編集ツール
- **トリミング（時間方向）**: TrimTool新規作成。タイムラインPanResponder、トリム範囲内のみ再生、自前の再生/停止ボタン
- **クロップ**: CropToolを動画対応（Videoコンポーネントでプレビュー）
- **リサイズ**: ResizeToolを動画対応（onReadyForDisplayで動画寸法を取得）
- マスクは画像専用（仕様通り）
- ツール順序: トリミング → クロップ → サイズ（動画）、クロップ → マスク → サイズ（画像）

### 3. 動的動画プレビュー
- EditScreen: 画像と同じ `overflow:hidden` + オフセット配置で動画にもクロップを動的に反映
- トリム: 再生範囲をstartMs〜endMsに制約（自動停止・自動シーク）
- カスタム再生コントロール: `useNativeControls`廃止、自前の再生/停止ボタン
- 解像度変更は視覚反映不可のため、変更時のみ控えめなラベルで表示

### 4. カメラUX改善
- カメラ画面左下にギャラリーサムネ小窓を追加（最新アセット表示、タップでギャラリーへ）
- 録画タイマーをヘッダーに移動

### 5. ギャラリー共通化
- `GalleryView` 共通コンポーネント作成（DeviceGalleryScreen / CameraGalleryScreen が利用）
- 両ギャラリーで複数選択対応（番号付きインジケーター）
- `useC2paCache` hook: モジュールレベルのセッション内キャッシュで画面間共有
- 画面再訪問時にC2PA再検証をスキップ（セッション内キャッシュ維持）

### 6. UI/UX品質向上
- 用語統一: 「写真」「画像・動画」→「コンテンツ」に全面統一
- フッタータブ: 「ギャラリー」→「ホーム」（home icon）、「フォト」→「ギャラリー」（images icon）
- フッター選択状態: 塗りアイコン + 太字ラベル + コントラスト強化
- ギャラリーヘッダー: 「端末ギャラリー」→「ギャラリー」、タイトル左寄せ
- ホーム空状態: RootLensのバリュープロポジション表示（「本物を、証明しよう」）
- 「次へ」→「本物証明をシェア」、「登録(n)」→「シェア(n)」

### 7. マスクのピクセル描画（ネイティブ実装）
- Android: `C2paBridgeModule.kt` の `applyMasks` で `Canvas.drawRect` + EXIF orientation対応
- iOS: `C2paBridgeModule.swift` の `applyMasks` で `CGContext.fill` による黒塗り描画
- JS層: `c2paBridge.ts` に `applyMasks` エクスポート、EditScreenから呼び出し

### 8. 動画書き出し（ネイティブ実装、ffmpeg-kit代替）
- ffmpeg-kit-react-native を完全削除（2025年1月にプロジェクト終了・Maven artifact削除）
- Android: Media3 Transformer（クロップ・リサイズ）+ MediaExtractor/MediaMuxer（トリムのみ高速パス）
- iOS: AVFoundation（AVMutableComposition + AVMutableVideoComposition + AVAssetExportSession）
- JS層: `c2paBridge.ts` に `processVideo` エクスポート、EditScreenから呼び出し

### 9. ギャラリー表示・信頼判定の修正
- `isTrustedAsset` の `signer_org` チェックを修正（Dev証明書の issuer O = "RootLens Dev" に対応）
- ギャラリーのソートを `creationTime` → `modificationTime` に変更（EXIF日時なしの再エンコード画像がリスト末尾に送られる問題を修正）
- `applyMasks` でEXIF日時タグを元画像からコピー（Android: ExifInterface / iOS: CGImageSource）

## スコープ外

- Title Protocolへの登録処理
- サーバーサイド実装
- TEE鍵生成・Attestation
- アカウント・認証機能

## ディレクトリ変更

### 新規
- `app/src/components/GalleryView.tsx` — 共通ギャラリーコンポーネント
- `app/src/hooks/useC2paCache.ts` — C2PA検証キャッシュhook
- `app/src/components/edit/TrimTool.tsx` — 動画トリミングツール

### 変更（主要）
- `native/c2pa-bridge/src/lib.rs` — フォーマット非依存署名 + 動画BMFF修正
- `app/android/.../C2paBridgeModule.kt` — applyMasks(EXIF日時保持) + processVideo(Media3 Transformer)
- `app/modules/c2pa-bridge/ios/C2paBridgeModule.swift` — applyMasks(CGContext+EXIF) + processVideo(AVFoundation)
- `app/src/native/c2paBridge.ts` — applyMasks + processVideo エクスポート追加
- `app/src/screens/EditScreen.tsx` — 動的動画プレビュー + カスタム再生 + ネイティブマスク/動画処理
- `app/src/hooks/useC2paCache.ts` — isTrustedAsset修正 + デバッグログ
- `app/src/components/GalleryView.tsx` — modificationTimeソート
- `app/src/components/edit/CropTool.tsx` — 動画対応
- `app/src/types/editActions.ts` — trim アクション追加
- `app/src/screens/CameraScreen.tsx` — サムネ小窓 + タイマー移動 + modificationTimeソート
- `app/src/screens/DeviceGalleryScreen.tsx` — GalleryView薄ラッパー化
- `app/src/screens/CameraGalleryScreen.tsx` — GalleryView薄ラッパー化
- `app/src/navigation/TabNavigator.tsx` — タブ名・アイコン・選択状態改善
- `app/src/screens/PublishedGalleryScreen.tsx` — ホーム空状態メッセージ
- `app/android/app/build.gradle` — Media3 Transformer + ExifInterface 依存追加

## 完了条件

- [x] 動画録画後にC2PA署名が付与される
- [x] MaskToolで実際にピクセルが黒塗りされる（ネイティブCanvas/CGContext実装）
- [x] CropToolの操作感が一般的な編集アプリ相当
- [x] アプリ全体のUI表現が一貫している
- [x] 署名中・処理中のフィードバックが適切に表示される
- [x] 動画書き出し時のクロップ・リサイズ・トリム適用（ネイティブAPI実装）
- [x] C2PA署名済み画像がギャラリーで正しく表示・選択可能
- [x] マスク付き画像がギャラリーに正しい位置でソートされる

## 実装メモ

### ffmpeg-kit廃止とネイティブ代替

ffmpeg-kit-react-nativeは2025年1月にプロジェクト終了、Maven artifactも削除された。
代替としてプラットフォームネイティブAPIを採用:
- **Android**: Media3 Transformer（Crop + Presentation effect）+ MediaExtractor/MediaMuxer（トリムのみ高速パス）
- **iOS**: AVFoundation（AVMutableComposition + AVMutableVideoComposition + AVAssetExportSession）

### EXIF日時とMediaStoreソート

`applyMasks`でBitmap.compress/UIGraphicsImageRendererを使うとEXIFメタデータが消失する。
AndroidのMediaStoreは`DATE_TAKEN`（EXIF由来）でソートするため、EXIF日時なしの画像がリスト末尾に送られる。
対策: applyMasks出力にEXIF日時タグをコピー + ギャラリーソートを`modificationTime`に変更。

### 残課題
- なし

## 完了日

2026-03-12
