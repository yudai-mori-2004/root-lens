# Task 09: UIデザインシステム導入 & 全画面ビジュアルポリッシュ

## 目的

エンジニアリング主導で構築されたUIを、デザインシステムに基づいた製品品質に引き上げる。
ブランドカラーの導入、デザイントークンの統一、技術用語のリライト、各画面のビジュアル改善を一括実施する。

## 仕様書参照

- §3.1.1 UI表現の基本方針
- §3.1.2 用語マッピング（技術用語禁止）
- §3.1.3 本物証明の表示基準
- §3.2 画面構成
- §3.3 公開済みギャラリー（ホーム画面）
- §3.7 登録準備画面
- §2.4 公開パイプライン

## 制約

- **編集画面（EditScreen）の操作ロジック・インタラクションは一切変更しない**
  - undo/redo、ツール選択、プレビュー計算、生成処理等には手を入れない
  - 変更するのはスタイル（デザイントークン適用）とツールバーのラベル追加のみ

## 実装内容

### 1. デザイントークン定義 (`app/src/theme.ts`)
- **ブランドカラー**: ネイビーブルー（`#1E3A5F`）
  - 紋章・証明の重厚さ。紫感を排した深い青
- **カラーパレット**: background, surface, text (primary/secondary/hint), accent, success, error, overlay等
- **タイポグラフィ**: heading, body, caption, label の fontSize / fontWeight / lineHeight
- **スペーシング**: 4px単位の間隔トークン (xs=4, sm=8, md=12, lg=16, xl=24, xxl=32)
- **形状**: borderRadius (sm=6, md=10, lg=16, full=9999)
- **ナビゲーションヘッダー**: `navigationHeaderOptions` で全スタックに統一

### 2. 技術用語リライト（§3.1.2 準拠）
| 画面 | 修正前 | 修正後 |
|------|--------|--------|
| RegistrationScreen | 「C2PA署名が付与されています」 | 「本物証明が付いています」 |
| RegistrationScreen | 「Title Protocolに記録されます」 | 「改ざん不可能な記録として公開されます」 |
| PublishingScreen | 「本物証明の登録とアップロード」 | 「本物証明の記録と公開の準備」 |
| CameraScreen | 「署名中...」 | 「証明付与中...」 |
| EditScreen | 「署名エラー」 | 「本物証明エラー」 |

### 3. ホーム画面の再設計
- ゴーストグリッド（3列、色付きシマーアニメーション）
- 下部のボトムシート（角丸カード）にCTA配置
- フローティングヘッダー（RootLens + 設定アイコン）
- プロフィール表示（名前 + アドレスコピー）
- Supabase APIからコンテンツ一覧を取得して表示

### 4. カメラ画面の強化
- トップバー・ボトムバーをプレビュー範囲外に分離（黒帯レイアウト）
- フラッシュ3段トグル（off / on / auto）
- セルフタイマー（off / 3s / 10s）+ カウントダウン表示
- 三分割グリッドオーバーレイ
- ピンチズーム + 倍率バッジ
- 設定永続化（cameraSettings ストア）

### 5. ギャラリー画面
- ヘッダー削除（タブと重複）、グリッドを上端から表示
- 選択UIを下部フローティングCTAに統合（選択数 + キャンセル + シェアボタン）

### 6. 編集画面（ビジュアルのみ）
- ツールバーにテキストラベル追加（切り抜き/マスク/サイズ/トリム/保存）
- シェアボタンをアクセントカラーに
- ヘッダー高さ52pxに統一

### 7. 登録準備画面
- 写真を大きく表示（主役）。テキストは控えめに
- 丸アイコン+中央テキストのテンプレートパターンを排除

### 8. 公開画面（PublishingScreen）
- ステップ表示を下寄せ、各ステップ横にインラインスピナー/チェック
- エラーUIも下寄せ

### 9. プレビュー画面
- WebViewで公開ページを直接表示
- ローカルcontentStore依存を排除

### 10. 設定画面
- プロフィール編集（表示名 / Solanaアドレス表示+コピー / 自己紹介 / 端末名トグル）
- カメラ設定（グリッド / シャッター音）
- バージョン + 端末名表示

### 11. 多言語化（i18n）
- `t()` 関数 + ja/en 辞書
- 全画面のUI文字列を翻訳キーに置換（ハードコード日本語ゼロ）

### 12. 公開ページ（web）デザイン刷新
- ネイビーブランドカラー適用（ライト/ダークモード両対応）
- 検証サマリーの用語を一般向けにリライト（技術詳細セクションは正確な技術用語を維持）
- OGP・ランディングページを英語化（国際向け）
- フッターにブランドカラー

### 13. データアーキテクチャ変更
- Supabase `users` テーブル追加 + `pages.user_id` 紐付け
- `/api/v1/users` — upsert API
- `/api/v1/pages?user_id=xxx` — 自分のコンテンツ取得API
- publish時に `address` 送信 → `user_id` 自動紐付け
- `contentStore` 削除（ローカル保存から Supabase 取得に移行）
- `profileStore` に `userId` 追加、サーバー同期対応

### 14. アイコン整理
- shield-checkmarkの全面使用を廃止
- カメラボタン: クリーンなシャッターデザイン（アイコンなし）
- 認証バッジ: `checkmark-circle`
- アクション: `arrow-up-circle`
- 各用途に適したアイコンに個別変更

## ディレクトリ変更

### 新規
- `app/src/theme.ts` — デザイントークン定義
- `app/src/i18n/index.ts` — 多言語化基盤 (ja/en)
- `app/src/store/cameraSettings.ts` — カメラ設定永続化
- `app/src/store/profileStore.ts` — プロフィール管理 + Supabase同期
- `supabase/migrations/20260315_create_users.sql` — usersテーブル
- `web/app/api/v1/users/route.ts` — ユーザーAPI

### 変更
- `app/App.tsx` — トークン適用
- `app/src/screens/` — 全画面リデザイン
- `app/src/components/` — 全コンポーネントトークン適用
- `app/src/navigation/TabNavigator.tsx` — カメラボタン + ヘッダー統一
- `web/components/ContentPage.tsx` — 用語リライト + ブランドカラー
- `web/app/globals.css` — ブランドカラー変数追加
- `web/app/api/v1/publish/route.ts` — address パラメータ追加
- `web/app/api/v1/pages/route.ts` — GET追加（user_idでフィルタ）
- `web/lib/server/page-store.ts` — user_id紐付け

### 削除
- `app/src/store/contentStore.ts` — Supabase取得に移行
- `web/app/api/v1/store-json/route.ts` — 不要
- `web/lib/server/title-protocol.ts` — 不要

## 完了条件

- [x] `theme.ts` でデザイントークンが定義され、全画面・全コンポーネントで使用されている
- [x] UI上に技術用語が一切表示されていない（§3.1.2 完全準拠、技術詳細セクション除く）
- [x] ホーム空状態にゴーストグリッド + ボトムシートCTA
- [x] 編集画面のツールバーにテキストラベルが付いている
- [x] 共有UI（Publishing/Preview）が目立つCTAになっている
- [x] ブランドカラー（ネイビー #1E3A5F）がアクセントとして一貫使用されている
- [x] 編集画面の操作ロジックが一切変更されていない
- [x] 多言語化基盤（i18n）が ja/en 対応で全画面に適用されている
- [x] カメラにグリッド・タイマー・フラッシュ3段・ピンチズームが追加されている
- [x] 設定画面にプロフィール編集・カメラ設定が実装されている
- [x] ホーム画面がSupabaseからコンテンツを取得して表示する
- [x] 公開ページにブランドカラー・用語リライトが適用されている
- [x] contentStore が削除されている

## 完了日

2026-03-15
