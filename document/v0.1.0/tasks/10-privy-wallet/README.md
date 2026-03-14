# Task 10: Privy認証 + Solanaウォレット導入

## 目的

RootLensにPrivyを導入し、ユーザー認証とSolanaウォレット（embedded wallet）を統合する。
これにより:
- ユーザーが自分のSolanaアドレスを自動取得（手入力不要に）
- Title ProtocolのcNFTミントに必要なウォレット署名が可能に
- 公開コンテンツとユーザーの紐付けがウォレットアドレスベースで確実に

## 仕様書参照

- §3.1.2 用語マッピング: 「Privyアカウント / Solanaウォレット」→ UI上は「アカウント」
- §4 PKI / 認証
- §6.1 Title Protocol登録（ウォレット署名が必要）

## 実装内容

### 1. Privy SDKセットアップ
- `@privy-io/expo` インストール・設定
- PrivyProvider をApp.tsxに追加
- Privy App ID の環境変数管理

### 2. 認証フロー
- 初回起動時: ログイン画面（メール or ソーシャルログイン）
- ログイン後: Privy embedded wallet が自動生成
- Solanaアドレスを `profileStore` に自動設定（手入力の代わり）
- 設定画面のSolanaアドレス欄は自動反映（編集不可、コピーのみ）

### 3. ウォレット連携
- profileStore: ログイン時にPrivyからアドレスを取得 → Supabase usersにupsert
- publishフロー: アドレスを自動で送信（現在は手動設定前提）

### 4. UI変更
- ログイン画面の新規作成
- 設定画面にログアウトボタン追加
- §3.1.2準拠: UI上では「アカウント」表記、ウォレット用語は使わない

## スコープ外

- SOL送金・残高表示（設定画面のウォレットセクションで将来対応）
- Title ProtocolのdelegateMint以外のミント方式
- マルチウォレット対応

## 完了条件

- [ ] Privy SDKが組み込まれ、メール/ソーシャルログインが動作する
- [ ] ログイン後にSolana embedded walletが自動生成される
- [ ] Solanaアドレスがprofileに自動設定され、Supabaseに同期される
- [ ] 公開時にアドレスが自動で送信される
- [ ] 設定画面にアカウント情報とログアウトが表示される
- [ ] UI上にウォレット/秘密鍵等の技術用語が表示されていない
