# 28. Hardware layout

## 目的

物理機材に関する実装と設計を`hardware/`へ集め、一般文書と混在しない構造にする。

## 変更

- ステレオ撮影機材のファームウェア、受信処理、設計資料を`hardware/ego-oscar-split/`へ移した。
- Hampoカメラ用筐体のCADと造形データを`hardware/hampo-rhb02bk-headset/`へ移した。
- 既製デバイスの比較、校正、調達記録を`hardware/research/existing-glasses/`へ移した。
- Hampoフォルダと内容が完全に重複していた配布用ZIPをGit管理から削除した。

## 成功基準

- `document/hardware/`が残っていない。
- ハードウェア文書内の相対リンクと実行例が移動後の場所を指す。
- ハードウェアの検証が移動後のパスで通る。

## 状態

完了。
