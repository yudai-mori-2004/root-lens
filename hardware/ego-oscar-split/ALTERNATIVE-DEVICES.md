# エゴセントリック収集デバイスの追加調査

調査日：2026-09-07。無線ヘッドデバイスを決める前に比較した候補の記録である。現在の採用構成と発注品は[2026-09-11の低価格経路](../research/existing-glasses/LOW-COST-DECISION-2026-09-11.md)を正とする。

## 構成が近い候補

| デバイス | 確認した構成 | 公開範囲 | 調達と未解決点 |
|---|---|---|---|
| [Trinet Stereo / Panoculon Labs](https://www.panoculonlabs.com/trinet) | 左右RGB、基線70mm、共通クロックで露光をトリガー、9軸IMU。内蔵記録またはUVC出力。外部SBC不要 | 仕様とSDKの説明。SDKソース・CAD・BOMは未確認 | 要見積。価格、数量1、日本配送、Stereo版の重量・fps・画角・シャッター方式は未確認 |
| [Voxel Glass / Physical Inc](https://www.voxel.glass/) | 眼鏡に左右の広角カメラ。ステレオ映像と深度のデモ | [MITのSDK](https://github.com/physicalinc/voxel-sdk)。録画操作、転送、IMU表示等。CAD・BOMは未確認 | 注文リンク先を取得できず価格・在庫・日本配送は未確認。左右への同時コマンド送信は露光のハード同期を保証しない |
| [ActiveGlasses](https://arxiv.org/html/2604.08534v1) | XREAL Air 2 UltraにZED Miniを装着。ステレオ映像と頭部6DoFを収集。ROSでタイムスタンプを整列 | 論文に機器構成と処理を公開。製作CAD・BOM・収録コードの公開は未確認 | [PC4UのZED Mini](https://www.pc4u.co.jp/view/item/000000047347)は87,120円税込・品切れ。眼鏡等は別費用。安価な購入候補にはならない |
| [OpenSQZ OpenGlass](https://github.com/OpenSQZ/OpenGlass) | ESP32-S3のカメラ・マイクを眼鏡に載せ、近傍PC等で推論 | STEP、3MF、BOM、ファームウェア、ホスト側ソフト。公開配線図・ピンマップ・はんだ付け手順は未公開との記載 | 自作。単眼の視覚支援用途であり、同期ステレオ＋IMUの代替には追加開発が必要。日本向け全BOMの調達は未確認 |

Trinetのページにある40g・150°・FHD30fpsは基本モデルの説明であり、Stereo版の確定仕様として扱わない。Stereo版の内蔵記録は、重い計算基板を省く可能性がある一方、頭部の記録回路・発熱・重量が許容範囲かを確かめる必要がある。

ActiveGlassesは「眼鏡にステレオカメラを固定して素手の作業を記録する」という実例として適合する。XREALの頭部姿勢とZED映像のROSによる時刻整列を、OSCARのカメラ露光信号とIMUのハードウェア同期と同一視しない。

## 専用の収集装置

| デバイス | 確認した構成 | 公開・販売状態 | 今回の判断 |
|---|---|---|---|
| [Lumos Ego STD / Lite](https://www.lumosbot.tech/products/ego/) | 235g、RGB魚眼1280×1280/60fps、SLAMカメラ4台、IMU500Hz。STDはToF追加。USB-C接続、5V・最大4W未満 | ROS/ROS2等の対応を記載。価格・MOQ・日本配送、設計ソースは未確認 | 頭部と外部ホストを分ける参考。ただしカラーのステレオ対ではなく、軽い眼鏡バーにも重い |
| [Wego4 / VisionLibra](https://visionlibra.com/product-wego4) | SC233HGSの1920×1200グローバルシャッター4台、カメラ・IMUのハード同期 | 1,500ドル、5台在庫表示。ソース公開・日本配送・重量は未確認 | 用途は適合するが予算を大きく超える |
| [VDEgo-C2](https://vdegoai.com/products/fpv-head-mounted-egocentric-camera-video-data-collection-camera) | 双眼RGB、IMU同期、300g未満、SD録画、Wi-Fi操作 | Full Hat表示813.83ポンド。API/SDKの説明はあるがソース・CAD・BOM未確認。日本配送未確認 | 完成品だが価格・頭部重量の点で優先度は低い |
| [Arducam EgoSync](https://www.arducam.com/blog/arducam-egosync-data-collection-solution/) | 装着型、複数カメラ型などの構成。ハード同期、USB/GMSL、放熱分離設計を説明 | 個別相談型。単品SKU・価格・MOQ・日本配送・全設計公開は未確認 | 複数台製作時のカスタム製造候補。初号機1台の確定購入先にはできない |

## 公開状況がまだ足りないもの・目的が異なるもの

- [EgoKit](https://www.chuange.org/papers/EgoKit.html)：スマートフォン・XR機器と外部手首カメラを統合する研究。周辺機材約151ドルはホスト機器代を含まない。ダウンロードリンクはプレースホルダーとの明記があり、そのまま導入できる配布済みキットとは扱わない。
- [EdgeTrack](https://github.com/edgetrackorg/overview)：ステレオ・ハード同期・Raspberry Pi構成を掲げるが、概要リポジトリの文書は準備中。配線まで再現可能な公開設計とは確認できない。
- [OpenGlass: Ultra-Low-Power On-Device AI Eyewear with Event-based Vision](https://arxiv.org/abs/2606.07431)：nRF5340とGAP9を用いるイベント視覚の眼鏡。論文はハード・ファーム等の公開を述べるが、今回リポジトリは未特定。通常のRGBステレオ動画収録とは異なる。OpenSQZのOpenGlassとは別プロジェクト。

## 採用構成への反映

機能面ではTrinet Stereo、形状面ではActiveGlasses、公開製作データではOpenSQZが参考になる。Voxel Glassは眼鏡形状と公開SDKを両立する候補だが、同期の仕様が決定要因になる。

完成品候補には、日本へ一個を注文できる公開価格、42 mmの同期カラー・グローバルシャッター対、露光同期端子、公開実装、OSCARに近い価格を同時に満たすものがなかった。このため初号機はDECXINカメラ、M5Stamp ESP32P4映像処理基板、専用Wi-Fi 6無線基板、XIAO ESP32S3センサー制御基板、頭部microSDと電池で組む。Trinetの内蔵記録とArducamの放熱分離は、後続の一体基板で部品数を減らす際の参考にする。
