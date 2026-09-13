# OSCAR級エゴセントリック収録機の市場調査

調査日: 2026-09-10。公開一次資料、販売ページ、公開SDKを照合した。販売先への問い合わせと注文はまだ行っていない。

> **2026-09-11の価格反映:** 以下の順位は2026-09-10時点の調査記録である。現在はDAS Egoを量産候補から外し、完成機の評価をEGO1GS、最低価格の基準機をRaspberry Pi 5分離型とした。[低価格経路の採用判断](LOW-COST-DECISION-2026-09-11.md)を現在の正とする。

## 今回の要件

比較対象は、FPV LabsのEgo-OSCARと同じ種類の原データを、一般の仕事中に5時間以上収録する機器である。

- カラーのグローバルシャッター2眼、各1280×720・30 fps以上。
- 左右の元映像または元フレーム、生の加速度・角速度、機器側の測定時刻とフレーム番号を取り出せる。
- 左右露光とIMUの時間関係が定義され、個体別の内部・歪み・ステレオ外部・camera–IMU外部パラメータを得られる。
- 給電中、または記録を止めない電池交換により5時間以上連続する。ファイル分割は許容する。
- RootLensが自己収録した原本と派生物を所有し、顧客へ販売、ライセンス、再許諾できる。
- 日本へ1台を輸入でき、同じ仕様を10・30・50台へ増やす価格と納期を契約できる。
- 長い身体ケーブルは除外条件にしない。頭部重量、全装着重量、引っ掛かり、着脱、断線時の記録保護で評価する。

OSCARの比較値は、カラーGS 1280×720・30 fps×2、42 mm基線、約126°対角画角、ICM-20948の加速度・角速度約120 Hz（公開コードの要求値は180 Hz）、左右カメラは同一ASICで同期、SOE/STRBとIMUをXIAO ESP32S3で記録し、オフライン補正後の残差約700 µsである。入力MJPEGをH.264へ保存する。

## 結論

この2か月で、OSCARのデータ契約に近い完成機と半完成品は明確に増えた。**2026-09-10時点ではGenRobot DAS Egoを条件付きの第一評価候補** に置いた。六眼すべてがカラーGSで、中央の前方二眼、200 Hzの加速度・角速度、個体校正、ローカルMCAP、演算・保存・電池を一体化したリング型筐体まで揃うためである。公式実録MCAPも公開されている。IMUは2×2 arrayを校正・処理した1系統で、未処理生値かは未確認である。価格を反映した2026-09-11以後の購入順位は冒頭の更新を優先する。

1. **GenRobot DAS Ego** — OSCAR相当の二眼を内包し、さらに四眼、音声、VIO軌跡を加えられる。公開実録まで確認できるが、無停止5時間、現在の販売経路、日本条件、収録データの契約上の権利を発注前に書面化する。
2. **GI EGO1GS** — 価格、公開SDK、MCAP、共通時計の均衡がよい。
3. **Luckey Stereo Headband** — 公称同期値と量産価格は強い。新しい小規模ベンダーなので、未加工サンプルと実機検収を先に置く。
4. **VDEgo-C2** — 日本配送と購入画面を公開確認できる完成機。重量と基線の確認が残る。
5. **SenseXperience** — 長い身体ケーブルを許容すると本命群に入る。157 gの頭部と214 gの演算・1 TB保存部を分離し、左右映像とIMUをMCAPでローカル出力する。大阪窓口がある。
6. **TOBI E2** — 150 g未満・内蔵5時間超という装着性は最良だが、同期が同じ公式サイト内で「ミリ秒級」と「ハードウェア同期」に分かれ、同名の旧製品も存在する。
7. **VisionLibra Wego2** — 900米ドル、世界配送、ホットスワップ電池を公称するが、SC233HGSのカラー版搭載、基線、重量、数値同期、個体校正の範囲が未掲載である。

DAS Egoは最初に仕様照会する機種、VDEgo-C2は一台を今日カートで購入できる確実性が最も高い機種である。DAS Egoの公開購入ボタンが遷移するJD商品は現在「下架」で、一般購入はできない。GenRobot直販から日本向け評価機を買えるという回答を得るまでは、調達済み候補とは扱わない。

## 完成機・収録端末

「公開適合」はメーカーが数値または形式を公開しているという意味であり、RootLensの受入試験を通過済みという意味ではない。

| 優先 | 機種 | 公開される映像・IMU・同期 | 5時間と装着 | 価格・日本・数量 | 発注前に残るゲート |
|---:|---|---|---|---|---|
| 1 | [GenRobot DAS Ego](https://www.genrobot.com/products/ego) | RGB GS 1600×1300@30×6、6軸IMU 200 Hz、H.264/MCAP、各カメラのDouble Sphere内部・歪み・`T_b_c`。公式実録で六眼とIMUの元メッセージを確認 | 本体269 g＋装着電池100 g＝実算369 g。身体ケーブルなし。電池1本約1時間40分 | 価格非公開。公式Buy Now先のJD SKUは現在下架。日本、1/10/30/50台は直販RFQ | 現行fwの無停止5時間、露光timestampの意味とcamera–IMU skew、IMU単位・軸、環境条件、データ権利、日本認証 |
| 2 | [GI EGO1GS](https://www.gilabs.xyz/products/ego1gs) | RGB GS 1920×1080@30×2、63 mm、157°×84°、9軸400 Hz、全ストリーム共通時計、H.265/MCAP、個体校正、公開schema | 頭部約200 g。10,000 mAhで12–16時間公称。外部USB電池 | $549。5台未満はSFから即時、5台以上は中国工場から輸送10–14日との公称。日本は未明記 | 日本DDP、技適、共通時計の実skew、実MCAPで全校正topicが埋まること、データ販売権 |
| 3 | [Luckey Stereo Headband](https://luckey.to/) | RGB GS 1920×1200@60×2、左右<1 µs、IMU–露光<10 µs、個体別stereo/camera–IMU校正、MCAPまたはraw video+IMU | 外部電池で12時間超。頭部重量は未掲載 | $1,180、25台以上$850、量産1–2週を公称。日本配送は未明記 | 会社は2–10人規模の新規ベンダー。未加工実録、製造QA、頭部・総重量、日本DDP/RMA、権利条項を実機購入前に確認 |
| 4 | [VDEgo-C2](https://vdegoai.com/products/fpv-head-mounted-egocentric-camera-video-data-collection-camera) | RGB GS 3840×1200合成@30/60、6軸300–600 Hz、左右≤1 µs、camera–IMU<50 µs、映像・frame timestamp・IMU・calibration | 詳細図は頭部210 gを電池別とし20,000 mAhで8時間。本文の「300 g未満」と整合しない | $1,100。[配送規約](https://vdegoai.com/policies/shipping-policy)は日本4–8営業日、処理5–10営業日 | 基線、センサー品番、頭部/電池/保持具の各重量、AVI/MJPGとMP4/H.265の実際、個体camera–IMU外参、権利条項 |
| 5 | [IO-AI SenseXperience](https://io-ai.tech/ja/sensexperience/specs/) | Ego部: RGB GS 2048×1536@30×2、65 mm、170°、IMU 240 Hz。左右`CompressedImage`と`Head_IMU/imu`をMCAPへローカル出力 | 頭部157±5 g、演算/1 TB SSD部214±5 g、さらに電池とベスト。専用ケーブルで接続。入力5 V 4 A、連続時間は未掲載 | 価格はRFQ。日本語サイトと大阪事業所、連絡先`io@io-ai.tech`。数量納期は未掲載 | 左右/camera–IMUのp95・最大skew、時刻の定義、frame ID、個体stereo/camera–IMU校正、実消費電力、5時間、国内販売条件、ローカルのみの利用と権利 |
| 6 | [TOBI E2](https://www.tobi.cn/product-e2.html) | RGB GS 1920×1080@60×2、65 mm、HFOV 194°/VFOV 111°、1 kHz IMU、左右H.265、時刻、内外参 | 完成機<150 g、1600 mAhで>5時間、給電しながら収録を公称。microSD保存 | 「量産在售」だが価格、MOQ、日本配送はRFQ。`lk@langhuiai.com` | 公式比較表はE2を「ミリ秒級同期」とする。軽量2眼版の正式part number、数値同期、camera–IMU外参、5時間実録、技適、権利が必要。同名の旧10–12眼機・手首機と混同不可 |
| 7 | [VisionLibra Wego2](https://visionlibra.com/product-wego2) | SC233HGS GS 1920×1200×2、ICM-42688 200/500 Hz、video/IMUのハードウェア時刻、H.265、per-image時刻、校正パラメータ | 5,600 mAh交換電池＋500 mAh UPS。交換中もセッション継続を公称。重量未掲載 | $900、5台在庫、超過分30–60日。[世界配送DHL/FedEx](https://visionlibra.com/support) | センサーにはcolor/mono版があるため搭載版がRGBか、基線・前方overlap、左右skew、camera–IMU外参、5時間ファイル、技適、権利 |

### 2026-09-10にDAS Egoを第一評価候補へ上げた根拠

[公式製品仕様](https://www.genrobot.com/products/ego)は、六眼すべてをRGB・グローバルシャッター・1600×1300・30 Hz、IMUを200 Hzとする。[公式v2.0マニュアル](https://docs.genrobot.ai/products/das-ego)は、収録データをSDカードへMCAPで保存し、六つのH.264カメラtopic、IMU topic、六つのcamera calibration topicを出す。クラウドを使わず、自社object storageへ送るNo Matrix Modeと、指定間隔でMCAPを自動分割するFactory Modeもある。

[公式処理リポジトリの11.402秒の実録](https://github.com/genrobot-ai/das-ego-stack/tree/main/sample_input)も直接解析した。六眼は各340–341フレーム、30.000 fps、IMU出力は2,271点、200.000 Hzで、各カメラのH.264、`sequence_num`、ナノ秒`header.timestamp`、Double Sphere内部・歪み、カメラから本体基準への`T_b_c`が実際に入る。中央のcamera2/3はこの個体で57.719 mm基線、別の公式個体で58.643 mm、公称URDFで59.0 mmで、前方下向きの重複視野を持つ。二眼の記録timestamp差は中央値6 µs、95%値11 µs、最大32 µs、六眼全体のspreadは中央値26.5 µs、最大105 µsだった。これは公開サンプル内の記録値であり、`header.timestamp`が露光開始・露光中央・publishのどれかは公開定義がない。発注仕様では露光時刻の定義と、物理露光差、camera–IMU差を別々に固定する。

カメラごとの`T_b_c`から相対姿勢を算出できるため、camera2/3をOSCAR相当のステレオ組として扱える。個体差があるので59.0 mmをhardcodeせず、収録ごとの校正を使う。公称URDFでは各カメラが`imu_link`を親に持つが、MCAPのbaseとの対応と変換方向は公開定義だけでは確定しない。残り四眼も原本に保持し、手や身体の被遮蔽を減らす付加視野として使う。公開サンプルのIMU加速度ノルムは中央値約1.000で、数値はm/s²よりg単位に見えるが、schemaには単位、軸規約、処理内容がない。変換時に推測せず、生値か処理済みか、単位・符号・軸・フィルタをメーカー仕様で固定する。

データ量も実測できる。実録MCAPは36,070,940 bytes / 11.402086秒で約25.31 Mbps、同じ設定の5時間は約56.9 GBである。128 GB SDは5時間に足りる。現行FAT32の4 GB制限を避けてexFAT化し、Factory Modeを10–15分にして分割保存する。15分なら1ファイルは約2.85 GB、5時間で約20本になる。

電源だけは現在不合格である。製品ページは「24-hour continuous operation」「seamless battery swapping」とするが、最新ファームウェアv2.1.26の更新注意とマニュアル§6.2は録画中の電池交換を禁止し、データ破損のおそれを明記する。本体269 g、電池100 g・14.8 Wh、1本約1時間40分なので、同梱2本は約3時間20分にしかならない。追加2本を含む4本なら合計時間には余裕が出るが、現行公式手順では約80–90分ごとに録画停止、電源OFF、交換、再起動が入り、無停止5時間にはならない。USB-Cから録画中に連続給電できる入力定格も非公開である。注文条件は、現行製品・現行fwで外部USB-C給電による5時間無停止、または録画中ホットスワップが保証されることとする。

装着中は実算369 gで、製品ページ350 gと19 g差がある。Mentra級の眼鏡より重いが、演算・保存・電池を前後に分散したリングで、身体ケーブルと腰の演算箱が不要になる点は大きい。一般作業での採否は、5時間後の前額・後頭部の圧力、ずれ、蒸れ、首疲労を実機で測る。

もう一つの発注ゲートは環境条件である。マニュアル§1.4は照度500 lux以下、直射・反射面なし、無振動、モーター・インバーター・Wi-Fi 6E/5G基地局から離す、粉塵・煙なしと記載する。家庭、厨房、工場、物流で字面どおりには満たせない。この文言が安全・保証上の使用限界なのか、VIO精度の推奨条件なのかを契約書で区別させる。

### SenseXperienceを身体ケーブル込みで使う形

[接続ガイド](https://io-ai.tech/sensexperience/en/docs/hardware-connection/)は、Ego Unitを専用ケーブルでCompute Unitの専用USBへ接続し、Compute Unitへ別の専用電源ケーブルを入れる構成を示す。腰まで垂らす必要はない。Compute Unitを肩甲骨上部のベストへ置けば、頭部から演算部までの可動するケーブルを概ね35–50 cmに抑えられる。そこから電池も同じ上背部または胸側へ固定する。

5 V 4 Aは入力端子の定格であり、実消費20 Wの証拠ではない。5時間の保証は平均入力電力と電池の実効Whで決める。99.9 Whの電池を85%利用できる場合、5時間を保証できる平均負荷の上限は約17 Wである。ベンダーにはEgo＋Computeだけを全解像度で録画した平均・95%・ピーク電力と5時間ログを要求する。

[公開データ形式](https://io-ai.tech/sensexperience/en/docs/reference-data-format/)は、左右の`EgoCentric_Camera_0/1`、頭部IMU、分割MCAP、`device_meta.json`、各センサーの書込状態を明記する。一方、公開文書は露光時刻の定義とcamera–IMU誤差を数値化しておらず、再校正は収録したcalibration dataをベンダーへ送ってパラメータを受け取る手順である。量産では各個体の校正ファイルを納品物に固定する。

### TOBI E2の同一性と同期の問題

現行軽量版の注文条件は、`2×1080p60 RGB global shutter / 65 mm / HFOV 194° / <150 g / no onboard SLAM`まで明記する。「E2」という名称だけでは、公式サイトに残る10–12眼・XR2の産業用頭部機や手首型機と区別できない。

現行製品ページは「ハードウェアレベルで時刻同期」とする一方、TOBIトップの比較表はE2を「ミリ秒級同期」、E6を「マイクロ秒級ハード同期」と分ける。OSCARの700 µsと比較するには、左右露光とcamera–IMUについて共通発振器/トリガー、timestamp位置、5時間のp50・p95・p99.9・最大・driftを注文仕様にする。

## 完成機の追加RFQ候補

| 機種 | 強い点 | 現時点で上位6台より下に置く理由 |
|---|---|---|
| [StellarNex Stereo POV](https://stellarnexrobotics.com/) | RGB GS 1920×1080@60×2、左右<100 µs、camera–IMU<500 µs、IMU最大1 kHz、MCAP/LeRobot、約150 g、5 V 1 A | 2026年の新規会社で、価格、5時間実録、個体校正、日本輸出、RMAが非公開 |
| [Cervo Stereo Headset](https://cervo-tech.com/) | RGB GS 2000×1200/眼@60、IMU 200 Hz、HW同期、stereo/IMU外参、腰RK3588、最大12時間 | データ収集サービスが主で、機器単体価格、販売SKU、SDK、MOQ、日本が非公開 |
| [EGO R9](https://www.egocamera.com/) | RGB GS、1080p30、120°、IMU>200 Hz、共通時計、H.265、外部電池約5時間 | 公開標準表は単眼。2眼SKU、基線、独立左右、校正、数値同期、価格、日本が必要 |
| [TOBI E6](https://www.tobi.cn/product-e6.html) | 6眼、IMU 1 kHz、マイクロ秒級同期、長時間 | 現行版のRGBシャッター仕様を型式別に再確認する必要があり、総重量370 g |
| [Orbbec Dual-Ego](https://unipos.net/products/orbbec-robot-free-data-collection/) | 国内UNIPOS窓口、RGB 1600×1200×2、IMU 400/1000 Hz、200 g | RGBのシャッター方式・センサー品番が公開表で確定しない |
| [VisionLibra Wego4](https://visionlibra.com/product-wego4) | GS×4、共通時計、IMU 200/500 Hz、UPS付き交換電池、$1,500 | 前方カラーstereo pair、基線、overlap、校正範囲が未確定。Wego2の方が目的に近い |

[Abundance A4](https://abundance.company/)はRGB GS stereo、300 Hz IMU、全センサー<1 ms、56 g（board込み130 g）、8時間shift、15,000台配備を公称する。しかし同じ公式ページでA4を「Hand Sensors」と呼び、頭部用の2眼機であることを確認できないため、頭部搭載できる完成SKUがある場合だけRFQへ加える。

## 自作・OEM向けの有力部品

長い身体ケーブルを許容すると、頭部にはカメラとIMUだけを置き、演算・保存・電池を肩または上背部へ逃がす経路が実用候補になる。

| 優先 | 部品 | 公開仕様 | 調達・実装上の判定 |
|---:|---|---|---|
| 1 | [CyperStereo 四目RGB視覚慣性モジュール](https://tujian.tech/products/quad) | RGB GS 1280×1024@30×4、camera 10 µs、camera–IMU<100 µs、BMI088 raw 200 Hz、53 g、1.5–2 W、USB3/UVC | OSCARの必要な2眼を使い、残り2眼も保存できる。SN別校正DLあり。価格、日本配送、カメラ配置、校正内容をRFQ。軽量自作の第一候補 |
| 2 | [Camemake CameVision EGO CV-EGO01-OS](https://www.camemake.eu/shop/cv-ego01-os-camevision-ego-dual-global-shutter-ai-stereo-camera-2414) | RGB GS 2.3 MP×2、FSYNC/EFSYNC、IMU×2、RV1126B、16 GB eMMC、microSD、Wi‑Fi 6、USB-C、電池端子 | $199、MOQ 10、世界配送公称。公開Release 1は12.5 fpsしか実証していない。30 fps recorder、共通時刻、重量/FOV/電力/校正を完成させる条件でのみ購入 |
| 3 | [HAMPO Model 3290](https://www.hampotech.com/ego-camera/) | RGB GS 2 MP×2、3840×1080@30、125°D、6軸100–500 Hz、共通GPIO、camera–IMU<10 µs、個体校正、USB2、MJPG/H.264/H.265 | OEM製造元へ評価機をRFQ。基線、頭部重量、実帯域、5時間ホスト、価格、日本配送を確定すれば完成機化しやすい |
| 4 | [Panoculon Trinet Stereo](https://www.panoculonlabs.com/trinet) | RGB×2、70 mm、単一時計トリガー、9軸IMU、個体校正、microSD本体記録またはUVC/phone | stereo版のシャッター、解像度、fps、重量、電力、5時間、価格が未公開。ここがGSなら非常に近い |
| 5 | [Stereolabs ZED X One GS×2](https://store.stereolabs.com/products/zed-x-one-gs) | 各RGB GS 1920×1200@60、wide HFOV 110°、IMU 200 Hz、2台同期、各50–55 g | 世界配送・1–2週、各$399＋wide。2台、ZED Link Duo、Jetson、SSD、電池で$1,600–2,100程度。供給は堅いが総額と胴体重量が大きい |
| 6 | [Luxonis OAK-FFC 4P + AR0234×2](https://shop.luxonis.com/products/oak-ffc-4p) | RGB GS 1920×1200@60×2、外部FSYNC、BNO086、生IMU、H.264/H.265 | 42 mmを自由に固定できる保険。主要部品約$510以上、筐体・Pi/host・SSD・電池を加える。完成品より組立工数が大きい |

Leopard Imaging HAWKはAR0234 RGB GS 1920×1200@60×2、RAW10、BMI088を備える工業部品だが、全解像度にはGMSL2＋Jetsonが必要で、100 mm版でもカメラ部156 gである。ZED経路より小型化しにくいため予備に置く。

## OSCARコードをどう再利用するか

カメラ機器が変わっても、OSCAR/Steraへ渡すデータ契約と検査は再利用できる。ROCKやXIAOの録画ファームウェアを全機種へ移植する必要はない。

- EGO1GS、Luckey、SenseXperienceなどMCAP出力機は、原本MCAPを変更せず保存し、topic/schema変換だけを行う。
- TOBI E2、VDEgoなど左右H.265/MP4＋sidecar型は、左右frame timestamp、生IMU、校正をOSCAR互換MCAPへ写す。
- CyperStereo、Camemake、HAMPO、ZEDなど部品型は、機器時刻とframe IDを落とさない録画daemon、分割ファイル、電源断保護をこちらで実装する。
- 全機種で、原本とOSCAR互換派生物を分ける。基線、画角、解像度、露光、圧縮が違うため、データの統計分布をOSCARと同一とは扱わない。

## 受入試験

評価機1台は次をすべて通してから10台へ進む。

1. 指定最高品質で5時間連続し、左右の期待フレーム数、欠落、重複、時刻逆行、IMU欠落を機械集計する。
2. 左右露光差とcamera–IMU誤差のp50・p95・p99.9・最大、5時間driftを得る。ホスト受信時刻ではなく測定時刻を使う。
3. シリアル番号に紐づくintrinsics、distortion model、stereo transform、camera–IMU transform、校正残差を読み出す。
4. 電源接続・交換、ファイル分割、SD満杯警告、Wi‑Fi切断、突然の電源断で確定済みファイルを失わない。
5. 5時間後の頭部重量、総重量、接触温度、着脱時間、ケーブルの引っ掛かり、視野遮蔽を測る。
6. 原本をRootLensが顧客へ販売・ライセンス・再許諾でき、ベンダーが明示opt-inなしに閲覧・学習へ使わない契約を締結する。

## 現時点で本番候補から外すもの

- **Project Aria Gen 2**: センサーは比較用として強いが、非売品・選定配布で10–50台を予算に応じて購入できない。同期カラーGS 2眼でもない。
- **Ray-Ban Meta、RayNeo、Rokid、Mentra Live**: 一般眼鏡としては軽いが、同期カラーGS 2眼の元映像と個体ステレオ校正を同時に満たさない。
- **ROBOTRAIN HM-01**: 公開サンプルのcamera skew最大16.69 ms、IMUは30 Hzへ近傍化され、まだ先行予約。
- **DeepMirror Insight9**: GS stereoはモノクロで、カラーはrolling shutter。電池150–170分。
- **RunCam Feed Camera Ego**: 単眼で、2台を共通露光・個体stereo calibrationへ束ねる仕組みがない。
- **Lumos Ego、Attrsense EgOmini 4X、KAI Halo、JoyEgoCam、Primus Ego**: 一部のGS/IMU/多眼要素はあるが、カラーstereo、数値同期、5時間、販売SKUのいずれかを公開確認できない。監視とRFQ対象に残す。

## 価格の目安

2026-09-10の日本銀行ドル円中値153.41円、輸入消費税10%を単純に加えた。送料、通関手数料、数量値引きは除く。

| 機種 | 公開価格 | 税前円換算 | 税後概算 |
|---|---:|---:|---:|
| DAS Ego | 非公開。公式Buy Now先は現在下架 | 直販RFQ | 直販RFQ |
| EGO1GS | $549 | 約84,222円 | 約92,644円 |
| Luckey 1台 | $1,180 | 約181,024円 | 約199,126円 |
| Luckey 25台以上 | $850 | 約130,399円 | 約143,439円/台 |
| VDEgo-C2 | $1,100 | 約168,751円 | 約185,626円 |
| Wego2 | $900 | 約138,069円 | 約151,876円 |
| CameVision EGO | $199、MOQ 10 | 約30,529円 | 約33,582円/台 |
| ZED X One GS wide×2 | $836 | 約128,251円 | 約141,076円。capture card/Jetson等は別 |

左右映像合計20/30/40 Mbpsなら、5時間は45/67.5/90 GBになる。DAS Egoだけは公式実録から全六眼・音声・IMU込みで約56.9 GB/5時間と外挿でき、128 GBで足りる。その他の128 GB機は音声・IMU・索引・予備領域を含め、実ビットレートを確認してから媒体を決める。SenseXperienceは1 TB SSDなので容量より電力が先に制約になる。

## 一次資料

- [EGO1GS製品仕様](https://www.gilabs.xyz/products/ego1gs)、[OSCAR/Aria比較・価格・供給](https://www.gilabs.xyz/blog/ego1gs-vs-project-aria-vs-ego-oscar)、[公開MCAP schema](https://github.com/General-Intelligence-Labs/visio-schema)
- [DAS Ego製品仕様](https://www.genrobot.com/products/ego)、[v2.0マニュアル](https://docs.genrobot.ai/products/das-ego)、[データ形式とproto](https://github.com/genrobot-ai/das-datakit)、[公式実録とローカル処理stack](https://github.com/genrobot-ai/das-ego-stack)
- [Luckey製品・価格・量産](https://luckey.to/)、[data pipeline](https://luckey.to/data-pipeline)
- [VDEgo-C2](https://vdegoai.com/products/fpv-head-mounted-egocentric-camera-video-data-collection-camera)、[配送規約](https://vdegoai.com/policies/shipping-policy)
- [SenseXperience仕様](https://io-ai.tech/ja/sensexperience/specs/)、[データ形式](https://io-ai.tech/sensexperience/en/docs/reference-data-format/)、[接続](https://io-ai.tech/sensexperience/en/docs/hardware-connection/)、[大阪窓口](https://io-ai.tech/ja/feedback/)
- [TOBI E2](https://www.tobi.cn/product-e2.html)、[機種比較](https://www.tobi.cn/)、[Langhui E2](https://www.langhuiai.com/ego-e2.html)
- [Wego2](https://visionlibra.com/product-wego2)、[配送・保証](https://visionlibra.com/support)
- [CyperStereo四目](https://tujian.tech/products/quad)、[個体校正DL](https://tujian.tech/support/downloads)
- [CameVision EGO](https://github.com/Camemake/camevision-ego/)
- [HAMPO Ego Camera](https://www.hampotech.com/ego-camera/)
- [Trinet Stereo](https://www.panoculonlabs.com/trinet)
- [ZED X One GS](https://store.stereolabs.com/products/zed-x-one-gs)、[二眼構成](https://docs.stereolabs.com/docs/products/cameras/zedxone/dual-camera-stereo-vision)
