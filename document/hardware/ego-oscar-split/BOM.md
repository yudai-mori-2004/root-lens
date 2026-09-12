# 初号機1台の発注表

> **発注停止:** この表は2026-09-07のM5Stamp ESP32P4案である。初号機はRaspberry Pi 5分離型へ変更したため、この表から注文しない。現在の発注表は[2026-09-11の低価格経路](../existing-glasses/LOW-COST-DECISION-2026-09-11.md#raspberry-pi-5分離型の購入表)を使う。

確認日：2026-09-07。日本から一個ずつ購入でき、主要部品を三つの注文先へまとめる。価格と在庫は確認時点の表示で、決済はまだ行っていない。

## 注文1：スイッチサイエンス

| 数 | 商品 | 商品コード | 税込価格 | 用途 |
|---:|---|---|---:|---|
| 1 | [M5Stamp ESP32P4](https://www.switch-science.com/products/11126) | M5STACK-S013 | 2,453円 | 映像処理基板。2560×720 JPEG復号と左右二本のH.264圧縮 |
| 1 | [M5Stamp ESP32P4用Wi-Fi 6拡張モジュール](https://www.switch-science.com/products/11127) | M5STACK-A172 | 1,331円 | iPhoneへの2.4 GHz無線。技適表示のある外箱を保管する |
| 1 | [Seeed Studio XIAO ESP32S3](https://www.switch-science.com/products/8968) | SEEED-113991114 | 1,456円 | 露光同期信号、慣性センサー、同期LED |
| 1 | [Lipo Rider Plus](https://www.switch-science.com/products/8540) | SEEED-106990290 | 1,184円 | 1セル電池の充電、5 V・最大2.4 Aへの昇圧、主電源スイッチ |
| 1 | [Conta microSDカードソケット、ピンヘッダなし](https://www.switch-science.com/products/10770) | SSCI-107709 | 440円 | SPI接続の頭部保存 |
| 1 | [Adafruit 5 V→3.3 V変換基板](https://www.switch-science.com/products/8592) | ADA-5637 | 726円 | microSD専用3.3 V・500 mA電源。I²C端子は使わない |
| 1 | [Adafruit リバーシブルUSB Type-Aプラグ変換基板](https://www.switch-science.com/products/9946) | ADA-6001 | 616円 | 昇圧基板のUSB-A出力から5 Vと接地を取り出す |
| 1組 | [USB Type-Aレセプタクル・コンパクト変換基板、2組セット](https://www.switch-science.com/products/5363) | ABBC-021 | 326円 | カメラのUSB Type-Aプラグを受け、5 V、接地、D+、D−を分ける。一組を使用、一組は予備 |
| 1 | [NeoKeyソケット基板、NeoPixel付き](https://www.switch-science.com/products/10050) | ADA-5756 | 429円 | 基板上の一灯で起動、録画、停止、異常を表示。3〜5 V動作、24×19×3.6 mm、1.5 g。キースイッチは付けない |
| 1組 | [Cytron Raspberry Pi 5用ヒートシンクセット](https://www.switch-science.com/products/9666) | CYTRON-V-HD-HSPI5-4 | 407円 | 付属の17×17×6 mmヒートシンクと熱伝導シートを映像処理基板の主処理チップへ一組使う |

小計 **9,368円**。上記10品は2026-09-07に各商品APIで注文可能と再確認した。少数在庫のLipo Rider Plus、3.3 V変換基板、USB-Aプラグ変換基板、ヒートシンクセットを先に確保し、残りも同じ注文へ入れる。

## 注文2：Amazon.co.jp

| 数 | 商品 | 商品番号 | 確認価格 | 用途 |
|---:|---|---|---:|---|
| 1 | [EEMB LP103454、3.7 V・2000 mAh、保護回路・JST-PH 2極付き](https://www.amazon.co.jp/dp/B08214DJLJ) | B08214DJLJ | 1,309円 | 頭部電池。34.5×57.5×10.6 mm、40 g、最大放電4 A |
| 1 | [SanDisk High Endurance 256 GB](https://www.amazon.co.jp/dp/B0B21BNJVY) | SDSQQNR-256G-GH3IA | 10,667円 | 5分チャンクの正本保存。U3/V30/Class 10 |
| 1組 | [GY-ICM20948V2、2枚組](https://www.amazon.co.jp/dp/B0DR72C188) | B0DR72C188 | 5,100円 | 9軸慣性センサー。一枚を使用、一枚は予備 |
| 1箱 | [OSOYOO 電子工作基本部品セット](https://www.amazon.co.jp/dp/B01MFBMX8A) | B01MFBMX8A | 2,676円 | 220 Ω、330 Ω、470 Ω、4.7 kΩ、10 kΩ、100 kΩ、0.1 µF、100 µF・16 V、青色3 mm LEDをこの箱から使う |
| 1箱 | [ネセクト 0.2平方mm・24 AWGシリコーン撚り線、6色各9 m](https://www.amazon.co.jp/dp/B09Z2YY1JF?th=1) | B09Z2YY1JF | 2,180円 | 5 V・3.3 V電源と接地用。赤と黒を使う。外径1.6 mm |
| 1箱 | [Striveday 28 AWG配線キット、5色各10 m](https://www.amazon.co.jp/dp/B07CGC2618?th=1) | B07CGC2618 | 1,799円 | UART、I²C、露光同期、microSD信号用。商品画面でサイズ`28AWG`、色`Box-1`を選ぶ。PVC被覆、錫めっき撚り線 |
| 1組 | [KKHMF 5×7 cm・2.54 mmユニバーサル基板、25枚](https://www.amazon.co.jp/dp/B083DSPML5) | B083DSPML5 | 579円 | 電源分岐基板と支持板。必要寸法へ切り、切断面を研磨する |
| 1箱 | [FINGOOO 熱収縮チューブ、12サイズ・780個](https://www.amazon.co.jp/dp/B0C9HK95WM) | B0C9HK95WM | 999円 | はんだ接合部と線の出口を絶縁する |
| 1巻 | [DanYun ポリイミド絶縁テープ、15 mm×33 m](https://www.amazon.co.jp/dp/B08JYBJ43B) | B08JYBJ43B | 645円 | 基板裏面、電池周囲、ケース内面の絶縁 |
| 1組 | [コモライフ 薄型ソフト面ファスナー、幅25 mm×各2 m](https://www.amazon.co.jp/dp/B0FRRQG5ZV) | B0FRRQG5ZV | 698円 | 頭部支持輪、頭頂補助帯、電池ポケットの閉じ具。縫製用、厚さ1 mm |
| 1本 | [エレコム USB 2.0 A―micro-Bケーブル、0.15 m](https://www.amazon.co.jp/dp/B005C8RUWG) | U2C-AMB015BK / B005C8RUWG | 403円 | 中央を切り、シールド付きD+/D−撚り対をカメラUSB受け基板から映像処理基板まで30 mm使う |

小計 **27,055円**。すべて一個のAmazon注文へ入れる。太い線材は商品ページで既定表示される**0.2平方mm・24 AWG**、細い線材は**28 AWG・Box-1**を指定する。前者は電源、後者は信号に分け、商品選択肢を入れ替えない。慣性センサー基板は到着後に3.3 Vで給電し、I²Cアドレス0x68と`WHO_AM_I=0xEA`を確認する。この二点を満たさない個体は予備へ交換する。

エレコムの短いUSBケーブルは完成品のカメラケーブルではなく、基板間30 mmのUSB差動配線を作る材料である。カメラ本体から出るUSB Type-Aプラグは、注文3のカメラに付属させる。

## 注文3：DECXIN販売窓口

| 数 | 注文ページ | 表示価格 | 注文書へ固定する仕様 |
|---:|---|---:|---|
| 1 | [Shenzhen Dechuangxin / DECXIN OG02B10ステレオUSBカメラ](https://www.alibaba.com/pla/USB-2MP-Global-Shutter-Camera-Binocular_1601162804134.html) | 約12,753円 | カラーOG02B10を左右各1、基線42 mm、画角約126°、左右ハードウェア同期、USB 2.0 High Speed、UVC、2560×720 Motion JPEG 30枚/秒、JPEG 4:2:0、露光同期信号と接地の引出し、USB Type-Aプラグ付き200 mmシールドケーブル、日本へ1台発送 |

商品ページの選択肢だけで確定せず、[確認文](SUPPLIER-QUESTIONS.md)を販売元へ送り、回答を注文書またはProforma Invoiceへ転記してもらう。特に以下の六点が一致した個体だけを注文する。

1. 42 mm基線であること。
2. カラーのOG02B10が二個であること。
3. 左右が同じ露光開始でハードウェア同期されること。
4. 一つのUSB機器から2560×720、毎秒30枚のMotion JPEGが出ること。
5. JPEGのSOFサンプリングがY=`0x22`、Cb/Cr=`0x11`、つまり4:2:0であること。
6. 露光同期信号の電圧、極性、プッシュプルまたはオープンドレイン、端子位置が資料で示されること。

注文する個体は、露光同期信号が3.3 Vプッシュプル、または3.3 Vへプルアップできるオープンドレインのものに限る。前者は220 Ωを介してセンサー制御基板の`D0`へ接続する。後者は3.3 Vへ4.7 kΩでプルアップし、220 Ωを介して`D0`へ接続する。上流Ego-OSCARと同じく`D0`の下降エッジを露光同期として数える。1.8 V、5 V、電気仕様不明の個体は注文しない。

## 金額と不足のない購入単位

| 区分 | 金額 |
|---|---:|
| スイッチサイエンス10品 | 9,368円 |
| Amazon 11品 | 27,055円 |
| カメラ1台 | 約12,753円 |
| 商品価格合計 | **約49,176円** |
| カメラ送料・輸入時費用 | 3,000〜8,000円の予算枠 |
| 初号機総額 | **約52,200〜57,200円** |

この購入単位で、映像処理、無線、センサー制御、慣性センサー、5 V電源、2000 mAh電池、256 GB保存、配線、絶縁、支持輪まで揃う。頭部支持輪は購入した25 mm幅の薄型面ファスナーから製作し、カメラ支持板と電子基板の台板は5×7 cmユニバーサル基板から切り出す。普段使うキャップを外観カバーとして上から被るため、専用品は追加購入しない。

工具は価格へ含めない。組立には温度調整式はんだごて、0.6〜0.8 mmの電子工作用はんだ、吸煙器、ニッパー、ワイヤーストリッパー、テスター、オシロスコープ、精密やすり、裁縫針とポリエステル糸を使う。

## 注文後の受入れ順

1. 電池のJST極性をテスターで確認する。
2. 映像処理基板へ無線基板を専用コネクターで重ね、技適表示の外箱を保管する。
3. 慣性センサーを単独で読み、0x68と0xEAを確認する。
4. カメラをパソコンへつなぎ、2560×720・30枚/秒・Motion JPEG・4:2:0を確認する。
5. 露光同期端子をオシロスコープで読み、販売元回答どおりの電圧と極性であることを確認してからセンサー制御基板へつなぐ。
6. [端子別配線表](WIRING-NETLIST.md)に従って星形5 V、microSD用3.3 V、USB、UART、I²C、状態表示LEDの順に組む。
