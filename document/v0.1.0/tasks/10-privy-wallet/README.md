# Task 10: Privy認証 + Solanaウォレット導入

## 目的

RootLensにPrivyを導入し、ユーザー認証とSolanaウォレット（embedded wallet）を統合する。
これにより:
- ユーザーが自分のSolanaアドレスを自動取得（手入力不要に）
- Title ProtocolのcNFTミントに必要なウォレット署名が可能に
- 公開コンテンツとユーザーの紐付けがウォレットアドレスベースで確実に

## 仕様書参照

- §2.1 初回起動: ログイン不要でカメラ・編集が使える
- §2.4 公開: 公開時にのみログインを求める
- §3.1.2 用語マッピング: 「Privyアカウント / Solanaウォレット」→ UI上は「アカウント」
- §4 PKI / 認証
- §6.1 Title Protocol登録（ウォレット署名が必要）

## 実装内容

### 1. Privy SDKセットアップ
- `@privy-io/expo` + `@privy-io/expo-native-extensions` インストール
- PrivyProvider + PrivyElements を App.tsx ルートに配置
- Inter フォント（400/500/600）ロード（PrivyElements 必須）
- metro.config.js: package exports 設定
- tsconfig.json: moduleResolution: Bundler
- .env: EXPO_PUBLIC_PRIVY_APP_ID / EXPO_PUBLIC_PRIVY_CLIENT_ID

### 2. 認証アーキテクチャ（Privy = Single Source of Truth）
- **useAuth.ts**: `usePrivy()` + `useEmbeddedSolanaWallet()` の薄いラッパー
  - 自前の状態（モジュール変数・listeners）を一切持たない
  - `isAuthenticated = !!user`（Expo SDKは isAuthenticated を返さない）
  - アプリ再起動時もPrivyセッション永続化により自動復帰
- **profileStore.ts**: 認証情報(address/userId)を削除、表示名・bio等のユーザー設定のみ管理
  - `syncUserToSupabase(address, profile)` を分離

### 3. 認証フロー（遅延ログイン）
- 仕様書 §2.1: カメラ・編集はログイン不要
- 仕様書 §2.4: 公開時にのみログインを求める
- RegistrationScreen「公開する」ボタン押下時:
  1. `usePrivy().user` が null → `useLogin().login()` でPrivy UIを起動
  2. ログイン完了 → embedded Solana wallet の準備を待つ
  3. `syncUserToSupabase(address, profile)` で userId 取得
  4. `navigation.navigate('Publishing', { signedUris, address, userId })` — パラメータで明示渡し
- PublishingScreen: navigation params から address を直接使用（非同期競合なし）
- Google + Email ログイン対応（Privy Dashboard設定済み）

### 4. ホーム画面（PublishedGalleryScreen）
- Privy `isAuthenticated` + `address` でコンテンツ取得を制御
- ログイン済み → `syncUserToSupabase()` → `fetchMyPages(userId)`
- 未ログイン → 空状態（ゴーストグリッド）

### 5. 設定画面
- 未ログイン時: プロフィールセクション非表示、「はじめる」ログインボタン表示
- ログイン済み: プロフィール編集 + Solanaアドレス表示（コピー付き） + ログアウトボタン
- ログアウト: `usePrivy().logout()` でセッション破棄、スピナーフィードバック
- セッション不整合時（address有りだがuser null）: ログアウトボタンのみ表示

### 6. 公開ページ検証の修正
- コレクションアドレス: SDKの `fetchGlobalConfig()` からオンチェーン毎回取得
- TEE署名検証: 署名対象を `{payload, attributes}` に修正（検証成功確認済み）
- pHash検証: ext collection も並列検索、extension_id を `image-phash` に
- pHash計算: phash-v1.wasm（→image-phash.wasm）をブラウザで実行、EXIF orientation対応（TP側修正済み）
- overall判定: skippedを除外して判定
- 閾値5に復帰

### 7. カメラ・ギャラリーUX改善
- SwipeGalleryView: カメラサムネからの1枚表示スワイプギャラリー
  - FlatList水平ページング + 仮想化（windowSize=3）
  - 画像: `@likashefqet/react-native-image-zoom` でピンチズーム+ダブルタップ
  - 動画: タップで再生、自前シークバー（VideoSeekBar）
  - LINE式選択インジケーター（番号付き丸）
- VideoSeekBar: 共通コンポーネント（Gesture Handler + Reanimated）
  - EditScreen と SwipeGalleryView で共用
- メディア保存: `DCIM/RootLens/` アルバム、ファイル名 `RL_日時_連番.ext`

### 8. SDK更新
- `@title-protocol/sdk` 0.1.3 → 0.1.4
- processorId: `phash-v1` → `image-phash`

## ディレクトリ変更

### 新規
- `app/src/components/SwipeGalleryView.tsx` — スワイプギャラリー
- `app/src/components/VideoSeekBar.tsx` — 共通シークバー
- `app/src/utils/saveMedia.ts` — RootLensアルバム保存
- `app/metro.config.js` — Privy用設定
- `app/eas.json` — EAS Build設定
- `app/.env.example` — Privy認証情報テンプレート
- `web/public/wasm/image-phash.wasm` — pHash WASM
- `web/lib/phash-wasm.ts` — ブラウザWASMランナー
- `document/v0.1.0/tasks/10-privy-wallet/AUTH_REFACTOR_PLAN.md`

### 変更（主要）
- `app/App.tsx` — PrivyProvider + PrivyElements + Inter フォント
- `app/src/hooks/useAuth.ts` — Privy hooks ラッパー（完全書き換え）
- `app/src/store/profileStore.ts` — auth情報分離（完全書き換え）
- `app/src/screens/RegistrationScreen.tsx` — login + waitForWallet + syncUser
- `app/src/screens/PublishingScreen.tsx` — params.address
- `app/src/screens/PublishedGalleryScreen.tsx` — Privy状態ベース
- `app/src/screens/SettingsScreen.tsx` — 認証状態で出し分け
- `app/src/screens/CameraGalleryScreen.tsx` — SwipeGalleryView使用
- `app/src/screens/EditScreen.tsx` — VideoSeekBar追加
- `app/src/navigation/types.ts` — Publishing params にaddress/userId追加
- `web/lib/config.ts` — 動的コレクション取得
- `web/lib/verify.ts` — TEE署名・pHash・overall修正
- `web/lib/resolvers/helius.ts` — core + ext 並列検索
- `web/components/ContentPage.tsx` — 用語リライト

### 削除
- `web/public/wasm/phash-v1.wasm` → `image-phash.wasm` にリネーム

## 完了条件

- [x] Privy SDKが組み込まれ、Google/メールログインが動作する
- [x] ログイン後にSolana embedded walletが自動生成される
- [x] Solanaアドレスが設定画面に表示され、Supabaseに同期される
- [x] 公開時にアドレスが自動で送信される（navigation params経由）
- [x] 設定画面にログイン/ログアウトが認証状態に応じて表示される
- [x] UI上にウォレット/秘密鍵等の技術用語が表示されていない（Solanaアドレスは例外: §3.1.2）
- [x] 公開ページの検証が全4項目通る（コレクション・TEE署名・C2PA・pHash）
- [x] カメラサムネからのスワイプギャラリーが動作する
- [x] 動画シークバーがSwipeGalleryViewとEditScreenで動作する
- [x] メディアがRootLensアルバムに保存される

## 完了日

2026-03-17
