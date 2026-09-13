# RootLens v0.1.4 タスク一覧

「アプリ = カメラ + センサー + C2PA D1 署名 + raw アップロードの入口」に絞る簡素化。
詳細は `document/v0.1.4/DATA_SPECS_JA.md`。

後段（blur / scoring / labeling / mint / staking）は v0.1.5 以降で**サーバ独立ワーカーとして別配線**するため、
v0.1.4 ではアプリと結合しているコードを削るだけで、 機能の代替は作らない。

## 全体マップ

```
v0.1.4 (簡素化スプリント)
  01. db-schema-simplify        🔄  0001_v0_1_4_simplify.sql 適用 + schema.ts を v0.1.4 列に
  02. web-api-simplify          🔄  POST /api/clips から rootAssetId/signedJsonUri 撤去。
                                    finalize / stake / retry / tp-process / tp-mint-tx エンドポイント削除。
                                    raw-uploads は維持 (= signed-json/ を返さない形に)
  03. app-dataflow-simplify     🔄  dataflow から steps/titleProtocol, steps/pipeline2, steps/pipeline3 削除。
                                    steps/sign.ts は D1 1 回のみ (blur + D2 撤去)。 register は network のみ。
                                    orchestrator は uploading → uploaded の最小 state machine
  04. app-capture-ui-simplify   🔄  CalibrationCaptureScreen を「録画→停止→自動アップロード」最小フローに。
                                    キャリブ ceremony / TTS / palm-gesture 撤去 (= 後述 inventory に従う)。
                                    CollectionScreen は quality / mint / staking 表示撤去。
                                    DevSandbox から Pipeline 2/3 ボタン撤去
  05. workflow-modal-cleanup    🔄  web/workflow/process-clip.ts 削除 (= 自動トリガー無し)。
                                    tools/modal/{layer1, layer2, layer3, wilor}.py はリポに残すが Modal
                                    deployment は teardown (v0.1.5 で再配線時に作り直す)
  06. e2e-smoke                 🔄  端末 録画 → 署名 → R2 raw アップロード → POST /api/clips → state='uploaded'
                                    の 1 クリップ実機通過確認
  07. manual-upload-landscape   🔄 新 ジェスチャーキャリブ復活 + 手動アップロード (マイビデオ = 待ち一覧
                                    + プレビューポップで同意 → アップロード) + 全画面 landscape
                                    + arkit 専用バケット (rootlens-raw-arkit) 分離
  08. deblockchain-cleanup      🔄 新 wallet/Solana/mint/staking/license 残骸の全撤去。 識別子は
                                    「アカウント公開鍵」 (X-Account-Pubkey)、 network 撤去、
                                    Buyer/Privy/web3.js 削除、 文言の現実合わせ (onb slide2 = blur 撤回)
  09. remote-signing            🔄 新 C2PA リモート署名 (= Adobe 方式)。 ハッシュはローカル、 COSE 署名
                                    だけサーバ組織鍵 (/api/v1/c2pa-sign)。 鍵がバイナリから消える
  10. landscape-editorial       🔄 新 右レール縦ナビ + 誌面見開きレイアウト + 写真ファーストカード。
                                    実機スクショの自己反復でデザイン検証
  11. upload-consent            🔄 新 アップロード同意の 2 段化 (層1要約 + 3チェック + 全文導線 →
                                    consent_events に証跡記録 → 動画確認 + アップロード)
  12. cleanup-c2pa-tp-solana    🔄 新 C2PA/TP/Solana 残骸の全撤去 + Modal パイプライン再編。
                                    ・C2PA 署名インフラ (task 09) を撤回
                                    ・programs/ crates/ tests/ Anchor.toml network.json 削除
                                    ・web/lib/verify/ + 検証 LP ページ削除
                                    ・signature_hash → content_hash rename
                                    ・tools/modal/ 直下を score-wilor/ + fpvlabs/ に再編
                                    詳細と AUDIT.md は 12-cleanup-c2pa-tp-solana-remnants/
  13. supabase-auth-accounts    🔄 新 店舗運用向けアカウント基盤。 端末ローカル鍵を Supabase Auth の
                                    運営発行アカウント (uuid+pwd、 合成メール、 自己登録なし) に置換。
                                    clips/consent_events を account_id (uuid) に紐づけ、 死骸 5 テーブル
                                    DROP + clips の PK を content_hash 化。 現場名等の意味論はサーバに
                                    置かず運営台帳 (freee) 側で管理。 詳細は 13-supabase-auth-accounts/
  14. capture-flow-voice        ✅ 新 音声コマンド撮影フロー (CaptureFlow strategy 分離。 現行運用の正)
  15. stera-native-parity       🔄 新 収録 + MCAP 組み立てを stera-app (FPV Labs 公開実装) と呼び出し
                                    レベルで一致させる。 恒常差分は RGB の h264 経由と blur のみ。
                                    差分表と決定事項は 15-stera-native-parity/
  16. claru-mentra-capture      🔄 新 Mentra Live単体の1080p30 SDR + raw IMU収録。
                                    per-frame RGB↔IMU timelineと同期証拠を保存し、未証明の
                                    single physical clockをfail-loudに扱う。
  17. iphone-rgb-imu-capture    ✅ 新 設定上の第3撮影方法。iPhone超広角1080p30 + AAC + raw IMUを
                                    ARKitなしで収録し、Mentraと同じ4ファイル契約で手動アップロードする。
  18. claru-session-cutter      🔄 新 長時間iPhone収録をMacでpreviewし、人間が指定した連続タスク区間を
                                    再エンコードなしで4ファイル契約へ切り出す。実機長時間収録の検証待ち。
  19. mentra-usb-import         🔄 新 Mentraの撮影データをUSB-CでPCへ取り込み、現場で内容を確認できるようにする。
                                    端末の送信機能を撤去し、
                                    長時間録画のメモリ・容量予約・開始停止の責務を整理する。
  20. mentra-field-submission   🔄 新 現場PC用の取り込みアプリと、事業所ごとのDriveアップロード手順を整える。
                                    録画をプレビューし、事業所専用サービスアカウントを使って
                                    「承認済みデータ」へ直接アップロードし、進捗と完了を表示する。
  21. mentra-capture-reliability ✅ 新 未完了録画の原因調査と撮影開始・停止・保存処理を修正。
                                    0.1.30を端末へ導入し、30秒録画・取消・PC取り込みを実機確認。
  22. mentra-stateless-viewer   🔄 端末とDriveを正に未アップロード録画だけ表示し、接続時の全量再照合を減らす。
  23. public-site-consent-flow  🔄 公開サイトを「撮影に協力・データの購入・データポリシー」の三入口へ整理。
                                   現場合意、撮影者同意、現場監督者による提供前承認と証跡を通常フローとして示す。
  24. consent-evidence-chain    🔄 現場合意と撮影者同意の電子署名、撮影ロットの現場承認、納品物から
                                   それらを検証する証跡ファイルまでを一つの追跡経路として設計する。
  25. unit-identity             🔄 raw動画のハッシュを撮影単位の識別子にする構成を廃止し、unit_idと
                                   全rawファイルのsource manifestへ置き換える。
```

凡例: ✅ = 完了、 🔄 = 進行中 / 未着手、 新 = 新規追加。

⚠ 07 は 04 の「ジェスチャー撤去 + 自動アップロード」を部分的に巻き戻す (= 実機 UX 検討の結果、
ジェスチャー式が正と確定)。 現行フローの正は 07 の README を参照。

## 順序

01 (DB) → 02 (web API) → 03 (app dataflow) → 04 (app UI) → 05 (workflow/modal cleanup) → 07 (全貌確定) → 06 (E2E)。

08〜11 は 07 の後、 それぞれ独立。 **12 は最後** (= 08 + 09 で残った塵と v0.1.5 予定廃棄後の crates/programs
の一掃、 別セッションで小分け PR 10 本)。

DB → web → app → cleanup → 検証 の素直な依存順。 02 と 03 は contract が一致していれば並行可。

## 仕様書

| 文書 | 役割 |
|---|---|
| `DATA_SPECS_JA.md` | データパイプライン仕様 (v0.1.4) |

## v0.1.3 からの差分要約

- 端末 blur (Apple Vision) 撤去 — iOS 専用で発熱+処理時間が許容外。 サーバ側でもこのバージョンでは行わない
- C2PA は D1 のみ (生 mp4 への 1 回署名)。 D2 / blur assertion / parentOf ingredient 撤去
- Title Protocol `/process` + cNFT mint をパイプラインから完全分離
- `rootAssetId` / `signedJsonUri` の必須要件削除
- 段レジューム + identity 再 key (Pipeline1Stage / advanceClip 等) も撤去 (= mint 起因の複雑性が全部消える)
- Pipeline 2 (採点 + ラベリング) と Pipeline 3 (WiLoR) はアプリ + web workflow から切り離し
- `raw/<hash>/` バケットは**本当の raw**（blur 無し）に。 命名と中身が一致
- 撮影構成ごとにバケット分離: ultra_wide → rootlens-raw、 arkit → rootlens-raw-arkit (07 で追加)
- clip state machine (app): `recorded → uploading → uploaded / error` (= 手動アップロード、 07 で確定)
- アップロードは自動ではなくユーザーがプレビュー確認 + 同意して起動 (07)
- UI 全体を横持ち (landscape) ベースに (07)
- DB 列は 10+ 削除（詳細は `0001_v0_1_4_simplify.sql`）
