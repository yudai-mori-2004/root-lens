# Task 08: E2E統合 — アプリ→サーバー→公開ページの一気通貫

## 目的

アプリで撮影・編集したC2PA署名済みコンテンツを、Title Protocol devnetに登録し、公開ページのリンクを発行し、ブラウザで閲覧できるようにする。加えて公開ページ(web/)をVercelにデプロイする。

**ゴール**: カメラ撮影 → C2PA署名 → 編集 → 公開ボタン → リンク取得 → ブラウザで検証付き表示

## 仕様書参照

- §2.4 公開（パイプライン実行）
- §6.1 パイプラインA: Title Protocol登録
- §6.2 パイプラインB: データ保存（R2 + Supabase）
- §6.4 公開ページ生成・リンク発行
- §7.1 URL構造

## 現状

| コンポーネント | 状態 |
|---|---|
| アプリ: 撮影・C2PA署名・編集 | 実装済み |
| アプリ: RegistrationScreen | **プレースホルダー**（Alertを表示して戻るだけ） |
| サーバー: POST /api/v1/pages | 実装済み（shortId生成、Supabase保存） |
| サーバー: R2アップロード | 実装済み |
| サーバー: Title Protocol登録 | **スクリプトのみ**（register-content.ts） |
| Web: 公開ページ | 実装済み（Supabase + Helius DAS + Arweave） |
| Web: デプロイ | **未着手** |
| Privy認証 | **未着手** |

## 設計方針

### devnet MVP: サーバーサイド登録

仕様書§6.1ではアプリ側がTitle Protocol SDKで直接登録する設計だが、devnet MVPでは以下の理由からサーバーサイド登録を採用する:

1. React Nativeに`@title-protocol/sdk`（Node.js依存）を入れるにはpolyfillが必要で工数が大きい
2. Irys（Arweave）もNode.js前提のライブラリ
3. devnetではRootLensのoperator walletがガス代を負担するため、鍵管理はサーバー側が自然
4. Privy統合前なので、ユーザーwalletの代わりにoperator walletを使う

**mainnet移行時にアプリ側SDK統合 + Privy walletに切り替える。** サーバーAPIのインターフェースはそのままに、内部実装を差し替える形にする。

### Privy: 今回はスキップ

devnet MVPではアカウント認証なしで公開まで通す。cNFTのowner walletはoperator walletを使用する。Privy統合はTask 09以降。

---

## 実装内容

### Phase 1: サーバー — 公開APIの実装

`POST /api/v1/publish` エンドポイントを新設。1つのAPIコールで全パイプラインを実行する。

**リクエスト:**
```
POST /api/v1/publish
Content-Type: multipart/form-data

content: File (C2PA署名済み画像/動画)
```

**処理フロー:**
1. C2PA署名済みコンテンツを受け取る
2. 表示用画像をリサイズしてR2公開バケットにアップロード
3. OGP画像（帯付き）を生成してR2にアップロード
4. Title Protocol SDK で登録:
   - `fetchGlobalConfig("devnet")`
   - `new TitleClient(config).register({...})`
   - `storeSignedJson` コールバックで Irys → Arweave にアップロード
   - partial TX を co-sign して broadcast
5. Supabase にページレコード作成（contentHash, assetId, thumbnailUrl, ogpImageUrl）
6. shortId を生成して返却

**レスポンス:**
```json
{
  "shortId": "abc123xyz",
  "pageUrl": "https://rootlens.io/p/abc123xyz",
  "contentHash": "0x...",
  "assetId": "..."
}
```

### Phase 2: アプリ — 公開フローの接続

#### 2a. RegistrationScreen の実装

現在のプレースホルダーを実サーバー呼び出しに置き換える:

1. 「登録する」ボタン → PublishingScreen に遷移（ローディング表示）
2. C2PA署名済みファイルをサーバーの `/api/v1/publish` にアップロード
3. 成功 → shortId / pageUrl を受け取る
4. PreviewScreen にて公開ページURLを表示 + リンクコピーボタン

#### 2b. PublishingScreen の更新

モックローディングから実際のアップロード進捗表示に変更:
- アップロード中 / 登録処理中 / 完了 のステータス表示
- エラー時のリトライボタン

#### 2c. PreviewScreen の更新

WebViewでの公開ページプレビューに実URLを使用。リンクコピー・共有ボタンを接続。

### Phase 3: Web デプロイ（Vercel）

1. Vercelプロジェクト作成（`web/` ディレクトリ）
2. 環境変数設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_HELIUS_API_KEY`
3. デプロイ → URL取得
4. アプリ・サーバーの `pageUrl` をデプロイURLに更新

### Phase 4: E2E動作確認

実機またはシミュレーターで以下を確認:
1. カメラ撮影 → C2PA署名
2. 編集（クロップ等）
3. 公開ボタン → アップロード → Title Protocol登録
4. 公開ページURL取得
5. ブラウザで開き、検証が動作することを確認

---

## スコープ外

- **Privy認証**（Task 09）
- **ユーザー固有のwallet**（operator walletを使用）
- **動画対応**（画像のみ先行）
- **複数コンテンツの一括公開**（1コンテンツ1ページ）
- **非公開バケット（生データ保存）**
- **本番ドメイン rootlens.io の設定**（Vercelの自動生成URLを使用）

---

## 完了条件

- [ ] `POST /api/v1/publish` がC2PA署名済み画像を受け取り、TP登録 + R2保存 + ページ作成を完了する
- [ ] アプリの公開フローがサーバーAPIに接続され、PublishingScreenで進捗が表示される
- [ ] 公開完了後、PreviewScreenで公開ページURLが表示され、リンクコピーが可能
- [ ] web/ がVercelにデプロイされ、公開ページがアクセス可能
- [ ] E2E: 撮影 → 編集 → 公開 → ブラウザ表示 が一気通貫で動作する
- [ ] COVERAGE.md が更新されている
