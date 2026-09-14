# RootLens v0.1.4 タスク一覧

v0.1.4は、撮影データの収集、現場での確認、提出、加工、手渡しに必要な経路を整える。撮影単位は`unit_id`で識別し、内容の完全性は全rawファイルの`source_manifest_sha256`で確認する。実装と`mobile/README.md`をデータ仕様の正とし、各タスクの判断と検証記録は個別READMEに残す。

## 現在の構成

```text
撮影端末
  → 現場確認
  → iPhoneはWeb API経由でR2へ提出
  → MentraはPCアプリ経由でRootLens Submit内の事業所用保存先へ提出
  → source manifestを検証して加工
  → delivery manifestとともに販売先へ手渡し
```

## 状態

| No. | タスク | 状態 |
|---:|---|---|
| 01 | DB schema simplify | 完了 |
| 02 | Web API simplify | 完了 |
| 03 | App dataflow simplify | 完了 |
| 04 | Capture UI simplify | 完了 |
| 05 | Workflow / Modal cleanup | 完了 |
| 06 | E2E smoke | 現行経路での再検証待ち |
| 07 | Manual upload / landscape / ARKit | 実機E2E待ち |
| 08 | Deblockchain cleanup | Task 12で完了 |
| 09 | Remote C2PA signing | 撤回。Task 12で削除 |
| 10 | Landscape editorial design | 完了 |
| 11 | Upload consent | 本番E2E待ち |
| 12 | C2PA / Title Protocol / Solana cleanup | 完了 |
| 13 | Supabase auth accounts | TestFlight実機確認待ち |
| 14 | Capture flow voice | 完了 |
| 15 | Stera native parity | 完了 |
| 16 | Claru Mentra capture | 長時間・本番E2E待ち |
| 17 | iPhone RGB / IMU capture | 実機再測定待ち |
| 18 | Claru session cutter | 完了 |
| 19 | Mentra USB import | 長時間現場確認待ち |
| 20 | Mentra field submission | 現場導入待ち |
| 21 | Mentra capture reliability | 完了 |
| 22 | Mentra stateless viewer | 完了 |
| 23 | Public site consent flow | 完了 |
| 24 | Consent evidence chain | 完了 |
| 25 | Unit identity | 完了 |
| 26 | Codebase hygiene | 完了 |
| 27 | Runtime layout | 完了 |

未完了項目の条件と、完了時に行った検証は各タスクのREADMEを参照する。過去の設計を記録した完了済み文書は当時の判断記録として保持し、現行仕様として参照しない。
