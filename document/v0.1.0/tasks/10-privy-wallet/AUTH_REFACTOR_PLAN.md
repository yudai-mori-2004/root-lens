# Auth リファクタリング計画

## 現状の問題

auth状態が3箇所に分散しており、同期がとれていない:
1. **Privy SDK** — セッション永続化済み、アプリ再起動後も生きている
2. **useAuth モジュール変数** — JS変数なのでアプリ再起動でリセット
3. **AsyncStorage profile** — 永続化されるがキャッシュと競合

この3層構造が、再起動・ログアウト・再ログイン時の全てのバグの原因。

## 方針: Privyを唯一の信頼源にする

**useAuthのモジュール変数を廃止する。** Privy SDKが持つセッション状態を唯一の信頼源（Single Source of Truth）とし、profileStoreは表示名・bio等のユーザー設定のみを担う。

### 変更後のアーキテクチャ

```
[Privy SDK]  ← 唯一の認証状態。セッション永続化はPrivyが管理
    ↓ usePrivy() / useEmbeddedSolanaWallet()
[useAuth hook]  ← Privy hookのラッパー。自前の状態を持たない
    ↓
[profileStore]  ← displayName, bio, showDeviceName のみ管理
                   address/userId は Privy の状態から派生
```

### 具体的な変更

#### 1. useAuth.ts — 完全書き換え

```typescript
// Privy hooks のラッパー。自前の状態を一切持たない。
export function useAuth() {
  const { isReady, isAuthenticated, user, logout } = usePrivy();
  const wallet = useEmbeddedSolanaWallet();
  const address = wallet?.wallets?.[0]?.address ?? null;

  return { isReady, isAuthenticated, address, user, logout };
}
```

- `_isAuthenticated`, `_solanaAddress`, `listeners`, `setAuthState`, `clearAuthState` を全て削除
- アプリ再起動時にPrivyセッションが生きていれば自動的にisAuthenticated=true
- モジュール変数の同期問題が消滅

#### 2. profileStore.ts — 認証情報を分離

- `address` と `userId` をProfileから削除（Privyが管理）
- Profile = { displayName, bio, deviceName, showDeviceName } のみ
- Supabase同期は別の関数 `syncUserToSupabase(address, profile)` に分離
- キャッシュの複雑性が大幅に減少

#### 3. RegistrationScreen — ウォレット待機を追加

```typescript
const handleRegister = async () => {
  if (!isAuthenticated) {
    await login({ loginMethods: ['google', 'email'] });
    // login完了後、PrivyがisAuthenticated=trueに自動更新
  }
  // ウォレット準備を待つ
  const address = await waitForWallet();
  // Supabase同期（userId取得）
  const userId = await syncUserToSupabase(address, profile);
  // 全て揃ってからPublishingに遷移
  navigation.navigate('Publishing', { signedUris, address, userId });
};
```

#### 4. PublishingScreen — addressをnavigation paramsで受け取る

- `loadProfile()` に依存しない
- params から直接 address を使う
- 非同期競合の余地がゼロ

#### 5. PublishedGalleryScreen — userId取得を確実に

- Privy isAuthenticated + wallet address から userId を解決
- `useFocusEffect` で毎回最新を取得
- 未ログイン時は空状態（ゴーストグリッド）

#### 6. SettingsScreen — ログアウト

- `usePrivy().logout()` を呼ぶだけ
- Privyがセッションを破棄 → isAuthenticated=false に自動変更
- profile の displayName 等はクリアしない（同じ端末で再ログインする場合に残す）
- Gallery は isAuthenticated を見て空状態に切り替わる

#### 7. App.tsx — useAuthSync フック追加

- PrivyProvider 内部で `usePrivy()` + `useEmbeddedSolanaWallet()` を監視
- ログイン済み + ウォレットあり → Supabase にユーザー同期（バックグラウンド）
- これによりアプリ起動時の自動復帰が実現

### navigation types 変更

```typescript
Publishing: { signedUris: string[]; address: string; userId: string };
```

### 解決される問題

| # | 問題 | 解決方法 |
|---|------|---------|
| 1 | アプリ再起動でauth消える | Privy SDKが唯一の状態源、自動復帰 |
| 2 | setAuthState→Publishing競合 | addressをnavigation paramsで渡す |
| 3 | ウォレット作成遅延 | waitForWallet で明示的に待つ |
| 4 | clearAuthState未await | clearAuthState自体が不要に |
| 5 | 別アカウント再ログイン | Privy logout → login で状態が自動切替 |
| 6 | 前ユーザーのprofile残る | profileにauth情報を持たない |
| 7 | already logged in | Privy.isAuthenticated で事前チェック |
| 8 | app kill中のlogin | Privyセッション永続化に委任 |
| 12 | notify遅延 | notifyメカニズム自体が不要に |
| 13 | Gallery空表示 | Privy状態を直接参照 |

### 実装手順

1. navigation types に address/userId を追加
2. useAuth.ts を Privy hooks ラッパーに書き換え
3. profileStore から address/userId を削除、syncUserToSupabase を分離
4. App.tsx に useAuthSync フック追加
5. RegistrationScreen — login + waitForWallet + syncUser + navigate
6. PublishingScreen — params から address を使用
7. PublishedGalleryScreen — Privy状態ベースでコンテンツ取得
8. SettingsScreen — privy.logout() のみ
9. 全フローの動作確認
