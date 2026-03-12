# Task 01: App Shell（フッターナビゲーション + 画面スケルトン）

## 目的

仕様書 §3.2 に基づき、アプリの基本骨格を構築する。
フッタータブナビゲーション（3タブ）と各画面のプレースホルダーを実装し、
以降のタスクがこの骨格の上に機能を追加していける状態にする。

## 仕様書参照

- §3.2 画面構成（フッターナビゲーション）
- §3.3 公開済みギャラリー（ホーム画面）— 空状態のみ
- §3.4 カメラ — プレースホルダー
- §3.5 端末ギャラリー — プレースホルダー
- §3.8 設定画面 — 遷移のみ

## 実装内容

### 1. React Navigation導入
- `@react-navigation/native` + `@react-navigation/bottom-tabs`
- 必要な依存: `react-native-screens`, `react-native-safe-area-context`

### 2. フッターナビゲーション（3タブ）
| 位置 | タブ名 | 画面 |
|------|--------|------|
| 左 | ギャラリー | PublishedGalleryScreen |
| 中央 | カメラ（丸ボタン） | CameraScreen |
| 右 | フォト | DeviceGalleryScreen |

- 中央のカメラボタンは他の2つと視覚的に区別（丸い大きめのボタン）
- 初期表示は左タブ（公開済みギャラリー）

### 3. 各画面のプレースホルダー
- **PublishedGalleryScreen**: 空状態UI（「カメラで撮影するか、端末のギャラリーから選択してください」的な誘導）+ 右上の歯車アイコン
- **CameraScreen**: 「カメラ（準備中）」のプレースホルダー
- **DeviceGalleryScreen**: 「端末ギャラリー（準備中）」のプレースホルダー
- **SettingsScreen**: 歯車アイコンからのスタック遷移先。「設定（準備中）」のプレースホルダー

### 4. ナビゲーション構造
```
BottomTabNavigator
├── PublishedGalleryStack
│   ├── PublishedGalleryScreen
│   └── SettingsScreen
├── CameraScreen
└── DeviceGalleryScreen
```

## 完了条件

- [x] 3タブのフッターナビゲーションが動作する
- [x] 中央カメラボタンが丸い専用デザイン
- [x] 公開済みギャラリーの空状態が表示される
- [x] 歯車アイコンから設定画面に遷移できる
- [x] iOS / Android 両方でビルド・動作確認
- [x] UI上に技術用語を表示していない（§3.1.2 準拠）

## 完了日: 2026-03-12

## ディレクトリ構成

```
app/
├── App.tsx              # NavigationContainer
├── src/
│   ├── navigation/
│   │   └── TabNavigator.tsx
│   └── screens/
│       ├── PublishedGalleryScreen.tsx
│       ├── CameraScreen.tsx
│       ├── DeviceGalleryScreen.tsx
│       └── SettingsScreen.tsx
```
