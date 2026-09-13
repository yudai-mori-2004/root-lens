# 27. Runtime layout

## 目的

リポジトリの最上位を実行環境で分け、モバイル内部を実際の業務責務で読める構造にする。

## 変更

- iPhoneアプリを`mobile/`、スマートグラスアプリを`glasses/`、現場PCアプリを`desktop/`に配置した。
- 物理機材の設計を`hardware/rootcap/`へ移した。
- Claru専用名だった切り出しツールを`tools/session_cutter/`へ改称した。
- 使用しないModal処理、LP素材生成、アセット生成ツールを削除した。
- `mobile/src/dataflow/`を廃止し、実撮影方式を`capture/`、クリップの保存・送信・APIを`clips/`へ分けた。
- 表示用の撮影方式と実行用の撮影設定を統合し、ARKitとiPhoneを一つの選択表から扱うようにした。

## 成功基準

- 移動前のパスを現行コードと運用文書が参照していない。
- Mobile、Web、Desktop、Glasses、session cutterの検証が通る。
- 最上位の各ディレクトリが、一つの実行環境または明確な補助分類を表す。

## 状態

完了。

## 検証

- Mobile: TypeScript、Vitest、Expo Doctor、iOS Simulator向けネイティブビルド
- Web: ESLint、テスト、production build
- Desktop: 153件の本体テスト、36件の取込スクリプトテスト
- Glasses: 収録、状態遷移、保存、長時間記録、導入ガードのhost test
- Session cutter: 11件のテスト
- Graphify: 移動後のコードから索引を再構築
