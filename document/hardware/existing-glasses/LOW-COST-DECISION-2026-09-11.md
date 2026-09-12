# OSCAR相当収録機の低価格経路

判断日: 2026-09-11。価格は同日の表示または直近確認値で、決済はまだ行っていない。

## 採用判断

GenRobot DAS Egoは量産購入候補から外す。公式購入先が下架されており有効な価格はないが、残存表示から推定される本体価格は約92万〜114万円である。369 gを頭部へ載せる構成でもあり、比較・データ形式の参照機にだけ残す。

公開価格まで確認できた次の二経路を並行して進める。

1. **完成機の評価候補はGeneral Intelligence Labs EGO1GS。** 549米ドル、二眼カラー・グローバルシャッター、左右1920×1080・30 fps、63 mm基線、400 Hz 9軸IMU、共通ハードウェア時計、H.265とMCAP、128 GBカード、約200 gという公称構成である。2026-09-10の日本銀行中心相場153.41円/USDと輸入消費税10%だけを置くと92,644円で、国際送料と外部電池を加える前の額である。日本納入、量産機の実MCAP、5時間連続、データ販売権を確認できた場合に評価機を一台買う。
2. **最低価格の実装候補はRaspberry Pi 5分離型。** Ego-OSCARと同系の42 mmカメラ、XIAO ESP32-S3、ICM-20948を頭部に残し、Raspberry Pi 5、保存媒体、電池を身体側へ移す。現在の表示額による初号機下限は57,856円だが、DECXINの加工・日本送料は未確定である。カメラ日本着20,000円を発注上限にすると、初回材料を含む上限は64,042円、身体保持具3,000円まで含めて67,042円となる。既存の20,000 mAh電池を流用すれば、この上下限から9,280円を引ける。電池と複数台分の工作材料を除いた一台分の電子部品下限は39,000円である。二台目以降は余る配線・抵抗・基板を再利用でき、約47,000〜49,000円/台になる。

さらに、2026年9月に公開されたHAMPO `USB-3372-V1.0`と、TOBI E2を価格照会へ追加する。前者は二眼カラーGS、100/200/500 Hz IMU、ハードウェア時刻、個体校正、Wi-Fi、Bluetooth、保存・携帯電源を一体化したOEMモジュールを公称する。後者は二眼カラーGS 1080p60、1 kHz IMU、microSD、150 g未満、内蔵電池5時間超を公称する。どちらも価格と原記録が非公開なので、既知価格の候補と同列に合格扱いはしないが、Pi分離型より安い回答なら構成を簡略化できる。

Arducam `B0492R`は、価格とPi 5対応を公開した調達保険として残す。259.99米ドルで、二台のAR0234カラー・グローバルシャッターカメラ、Camarray HAT、外部トリガーを含み、Pi 5上で左右一体2560×720を最大94 fpsで出す。標準レンズは対角120°・水平90°で、IMUと個体校正は含まれない。日本着カメラを52,000円で置くと、現在の購入表からDECXIN関係費を入れ替えた初号機は96,042円、保持具まで含め99,042円になる。またMIPIケーブルのためCamarray HATとPiをカメラから30 cm程度以内に置く構造になり、身体側へUSB一本を延ばせるDECXIN構成より頭部設計が窮屈になる。したがって安さを理由に先に買う機種ではなく、DECXINとHAMPOの双方が発注条件を満たさない場合に使う。

EGO1GSへ追加で払う約2.5万〜4.5万円は、頭部と電池だけで完結する筐体、MCAP収録、配線済みの同期系、現場操作を買う費用である。Pi分離型は頭部を約95 gに抑え、OSCARのカメラ・IMU・露光同期コードを直接使え、記録データを完全に管理できる。Pi分離型を価格とデータの基準設計として維持し、DECXINへ支払う前にHAMPO、TOBI、EGO1GSの原記録と日本着見積を比較する。HAMPOまたはTOBIが下記の価格・データ条件を通れば先に一台評価し、通らなければPi分離型を完成させる。完成機も同じ作業を5時間収録し、装着負担とデータを比較して量産側を決める。

## 価格と位置づけ

| 経路 | 1台の現在額 | OSCAR相当の核 | 装着 | 判断 |
|---|---:|---|---|---|
| Raspberry Pi 5分離型 | 現在額の下限57,856円。カメラ日本着20,000円と保持具を含む発注上限67,042円 | 同系42 mmカラーGSカメラ、XIAO、ICM-20948、STRBを再利用 | 頭部約95〜97 g、計算部約71〜81 g、20,000 mAh電池約320 g | 基準機として製作 |
| [GI EGO1GS](https://www.gilabs.xyz/products/ego1gs) | 約92,644円＋送料＋外部電池 | カラーGS 1080p30×2、63 mm、400 Hz IMU、共通時計、MCAP | 頭部約200 g＋外部電池。約110 gの5,000 mAh電池なら合計約310 g。5時間到達は10,000 mAh時の公称12〜16時間からの容量比例推定で、評価機で確認する | 書面・実MCAP合格後に評価機1台 |
| [HAMPO USB-3372-V1.0](https://www.hampotech.com/news/hampo-launches-wifi-and-bluetooth-enabled-ego-camera-module-for-untethered-embodied-ai-data-collection/) | 非公開 | カラーGS 1600×1200×2、IMU 100/200/500 Hz、ハードウェア時刻、個体校正、Wi-Fi/BT、機上保存を公称 | 筐体・電池・重量・基線・fpsは未掲載 | 日本着45,000円以下なら原記録を検収して評価モジュール1台 |
| [TOBI E2](https://www.tobi.cn/product-e2.html) | 非公開 | カラーGS 1080p60×2、65 mm、1 kHz IMU、H.265、microSDを公称 | 150 g未満、内蔵電池5時間超、外部給電対応を公称 | 同期のp95が1 ms以下で、日本着100,000円以下なら評価機1台。単なる「ミリ秒級」だけなら50,000円以下に限定 |
| [HAMPO Model 3290](https://www.hampotech.com/news/hampo-ego-camera-a-first-person-head-mounted-binocular-data-camera-with-built-in-imu-and-hardware-synchronization/) | 非公開 | カラーGS 3840×1080@30、USB 2.0、同期IMU・校正を公称 | カメラコア。Pi等の記録機が必要 | 日本着20,000円以下かつ発注型番にIMU・時刻・校正が含まれるならDECXIN一式を置換 |
| [Arducam B0492R](https://www.arducam.com/arducam-2-3mp2-ar0234-color-global-shutter-synchronized-stereo-camera-bundle-kit-for-raspberry-pi.html) | 259.99米ドル。カメラ日本着約50,000〜52,000円、完成約96,000〜99,000円 | AR0234カラーGS×2、外部トリガー、Pi 5対応、左右一体2560×720 | IMU・個体校正なし。PiとCamarray HATをカメラから約30 cm以内に置く | DECXIN・HAMPOが不成立の場合の供給保険。先行購入しない |
| [VisionLibra Wego2](https://visionlibra.com/product-wego2) | 日本checkout 144,185円 | 公称二眼GS＋IMU | 重量未掲載 | 実機・実録・企業実体の裏付けが弱く、買わない |
| [Luckey](https://luckey.to/) | 1台1,180米ドル、25台以上850米ドル/台 | 公称仕様は強い | 頭部重量未掲載、外部電池 | 25台以上の相見積先。初号機には買わない |
| [VDEgo-C2](https://vdegoai.com/pages/vdego-egocentric-camera-wearable-camera-for-embodied-ai) | 日本checkoutで本体178,905円＋送料40,660円＝219,565円 | 二眼RGB GS、IMU、同期・校正 | 頭部210 g＋外部20,000 mAh電池 | 公開購入できる予備。低価格案ではない |
| GenRobot DAS Ego | 有効な販売価格なし。残存表示から約92万〜114万円の可能性 | 六眼RGB GS、IMU、MCAP | 本体269 g＋電池100 g | 量産候補から除外 |

Luckey、VDEgo、Wego2はいずれもEGO1GSより安い完成機にならない。CameVision EGOは199米ドル・最低10台と安いが、公開ファームウェアが12.5 fpsまでである。メーカー自身の基板メモでもmicroSD、Wi-Fi接続、充電回路を未実証としており、30 fps連続収録、時刻契約、個体校正も完成していないため今回の発注対象にしない。HAMPOとTOBIは公開価格がないため、上表の上限を超えたら価格交渉を続けずPi分離型へ戻る。Arducamは公開購入できるが完成価格がEGO1GSへ近づくため、価格競争ではなく供給確実性を買う予備経路である。

## Raspberry Pi 5分離型の購入表

購入先はAlibaba、スイッチサイエンス、Amazon.co.jpの三つにまとめる。Amazonの工作材料は複数台分を含む。

- [スイッチサイエンスの三品を一括でカートへ入れる](https://www.switch-science.com/cart/45354499604678:1,42792689107142:1,42672641278150:1)
- [Amazon.co.jpの十品を一括でカートへ入れる](https://www.amazon.co.jp/gp/aws/cart/add.html?ASIN.1=B0DR72C188&Quantity.1=1&ASIN.2=B0B21G52KG&Quantity.2=1&ASIN.3=B0GMXGS247&Quantity.3=1&ASIN.4=B01MFBMX8A&Quantity.4=1&ASIN.5=B09Z2YY1JF&Quantity.5=1&ASIN.6=B07CGC2618&Quantity.6=1&ASIN.7=B083DSPML5&Quantity.7=1&ASIN.8=B0C9HK95WM&Quantity.8=1&ASIN.9=B08JYBJ43B&Quantity.9=1&ASIN.10=B0FRRQG5ZV&Quantity.10=1)
- [DECXIN商品ページ](https://www.alibaba.com/product-detail/USB-2MP-Global-Shutter-Camera-Binocular_1601162804134.html)は仕様確認後に一台を決済する。

| 購入先 | 数 | 品目 | 型番・商品番号 | 確認額 |
|---|---:|---|---|---:|
| Alibaba | 1 | [DECXIN USBステレオ・グローバルシャッターカメラ](https://www.alibaba.com/product-detail/USB-2MP-Global-Shutter-Camera-Binocular_1601162804134.html) | `1601162804134` | 12,558円 |
| Switch Science | 1 | [Raspberry Pi 5 / 1 GB](https://www.switch-science.com/products/10908) | `RPI-SC2162` | 9,900円 |
| Switch Science | 1 | [Raspberry Pi 5用Active Cooler](https://www.switch-science.com/products/9253) | `RPI-SC1148` | 1,100円 |
| Switch Science | 1 | [Seeed Studio XIAO ESP32-S3](https://www.switch-science.com/products/8968) | `SEEED-113991114` | 1,456円 |
| Amazon | 1組 | [GY-ICM20948V2、2枚組](https://www.amazon.co.jp/dp/B0DR72C188) | `B0DR72C188` | 5,100円 |
| Amazon | 1 | [SanDisk High Endurance 128 GB](https://www.amazon.co.jp/dp/B0B21G52KG) | `SDSQQNR-128G-GH3IA` | 6,980円 |
| Amazon | 1 | [CIO SMARTCOBY TRIO 35W SS 20000 mAh](https://www.amazon.co.jp/dp/B0GMXGS247) | `CIO-MB35W2C1A-SS20000` | 9,280円 |
| Amazon | 1箱 | [抵抗・コンデンサ・LED・スイッチ](https://www.amazon.co.jp/dp/B01MFBMX8A) | `B01MFBMX8A` | 2,676円 |
| Amazon | 1箱 | [24 AWGシリコーン線](https://www.amazon.co.jp/dp/B09Z2YY1JF) | `B09Z2YY1JF` | 2,180円 |
| Amazon | 1箱 | [28 AWG信号線](https://www.amazon.co.jp/dp/B07CGC2618) | `B07CGC2618` | 1,799円 |
| Amazon | 1組 | [5×7 cmユニバーサル基板](https://www.amazon.co.jp/dp/B083DSPML5) | `B083DSPML5` | 579円 |
| Amazon | 1箱 | [熱収縮チューブ](https://www.amazon.co.jp/dp/B0C9HK95WM) | `B0C9HK95WM` | 999円 |
| Amazon | 1巻 | [15 mmポリイミドテープ](https://www.amazon.co.jp/dp/B08JYBJ43B) | `B08JYBJ43B` | 645円 |
| Amazon | 1組 | [25 mm薄型縫製面ファスナー](https://www.amazon.co.jp/dp/B0FRRQG5ZV) | `B0FRRQG5ZV` | 698円 |

表示額合計は56,600円。スイッチサイエンス送料650円を含み、DECXINカメラの輸入時費用として商品額の10%に相当する1,256円を仮置きした**57,856円は下限**である。DECXINの42 mm加工、二股ケーブル、校正、日本送料を含む着地額はProforma Invoiceで確定する。カメラ着地額が20,000円を超えたら注文せず、同額以下のHAMPO Model 3290回答と比較する。カメラを20,000円で置いた全購入表の上限は64,042円、身体側のメッシュポケット、25 mm弾性帯、バックル、Pi保護ガード3,000円まで含む上限は67,042円である。

[CIO電池](https://connectinternationalone.co.jp/cioproduct/mobilebattery/smartcoby/cio-mb35w2c1a-ssa20000/)は77.4 Wh、約320 gで、USB-C二口同時使用時に合計5 V・6 Aを公称する。PiにはUSB-C1から5 V・3 A、カメラにはUSB-C2またはUSB-Aから別に5 Vを供給する。[Pi 5の電源仕様](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply)では5 V・3 A時にUSB機器とActive Coolerが合計600 mAの下流枠を共有するため、カメラをPiのUSB電源へ載せない。

DECXINへは、ホスト側USB-AではVBUSを接続せずD+、D−、GNDだけをPiへ通し、別のUSB-A電源プラグからカメラへ5 VとGNDを入れる二股シールドケーブルを指定する。二つの5 V出力を結線せず、GNDだけをカメラ基板側で共有する。販売者がこのケーブルを供給できない場合は、同じ配線を持つ電源注入基板とシールドUSB延長を追加し、導通検査でPi側VBUSが開放されていることを確認してからカメラを接続する。カメラ最大電流は5 V・1 A以下を発注条件にする。

### さらに安いRaspberry Piを初号機に使わない理由

Pi Zero 2 Wは3,190〜3,520円の掲載があるが、2026-09-11時点で国内主要三店が在庫切れである。さらにVideoCore IV用`bcm2835-codec`の幅上限は1920画素なので、2560×720の左右一体Motion JPEGをそのままハードウェア復号・圧縮できない。CPUでJPEGを復号して左右へ切り、1280×720のH.264ハードウェア圧縮を二本同時に走らせる必要がある。1 GHz・512 MB、単一USB OTG、放熱条件で5時間無欠落を初号機から前提にしない。

[Raspberry Pi 3 Model A+](https://akizukidenshi.com/catalog/g/g114878/)は秋月電子で5,780円・在庫52と表示され、Pi 5より4,120円安い。フルサイズUSBと1.4 GHz CPUを持つので小型化評価には使えるが、同じ左右二本のハードウェア圧縮と5時間試験が必要である。Pi 4 / 2 GBは[11,880円](https://www.switch-science.com/products/5681)で、Pi 5 / 1 GBとActive Coolerの合計11,000円より高い。初号機は幅2560を一本のソフトウェアH.264へ直接圧縮でき、国内即納のPi 5を維持する。30〜50台へ進む段階では、CM4またはPi 3A+で二本圧縮を実測し、4,000〜5,000円/台の削減に対して欠落率と消費電力が有利な場合だけ置き換える。

## DECXINへ固定する注文仕様

商品名や写真だけではOSCAR用42 mm版を特定できない。支払い前に販売者が次をProforma Invoiceへ記載した個体だけを買う。

- カラーOmniVision OG02B10を左右一個ずつ搭載する。
- レンズ中心間を42 mm、対角画角を約126°とする。
- 左右露光をカメラ基板上でハードウェア同期する。
- 一つのUVC機器として、左右一体2560×720、Motion JPEG、30 fpsをLinuxへ出す。
- JPEGの色差形式を4:2:0とする。
- 露光開始を示すSTRBまたはSOEとGNDを引き出す。電圧、極性、プッシュプル／オープンドレイン、パルス幅を記載する。
- 0.6 m以下のシールド二股ケーブルを付ける。ホスト側USB-AはD+、D−、GNDだけを接続してVBUSを開放し、別のUSB-A電源プラグからカメラへ5 VとGNDを供給する。
- 5 V時の起動時・定常時の最大電流を記載し、1 A以下とする。
- 個体別の左右内部パラメータ、歪み、左右外部パラメータを納品できるか回答する。
- 数量一個を日本へ送付する。商品代、加工代、送料、Incotermを分けて示す。

送付文は[`../ego-oscar-split/SUPPLIER-QUESTIONS.md`](../ego-oscar-split/SUPPLIER-QUESTIONS.md)を使う。販売者回答を注文書へ転記できない場合、その商品ページからは買わない。

## 配線

頭部にはカメラ、XIAO、ICM-20948を置く。カメラとIMUは同じ剛体支持板に固定し、装着中に相対姿勢が変わらないようにする。Piと電池は頭部へ載せない。

```text
DECXIN camera USB-A ─────────────── Raspberry Pi 5 USB 2.0
       │ (D+ / D− / GND only; host VBUS is open)
       ├── 5 V / GND ────────────── battery output 2
       │ STRB/SOE
       └── 220 Ω ── XIAO D0 / GPIO1

XIAO D2 / GPIO3 ── 220 Ω ── blue sync LED L ── GND
                 └─ 220 Ω ── blue sync LED R ── GND

ICM-20948 3V3  ── XIAO 3V3
ICM-20948 GND  ── XIAO GND ───────── Pi GND / pin 6
ICM-20948 SDA  ── XIAO D4 / GPIO5
ICM-20948 SCL  ── XIAO D5 / GPIO6
ICM-20948 AD0  ── GND

XIAO D6 / GPIO43 / TX ── Pi GPIO15 / RXD / pin 10
XIAO D7 / GPIO44 / RX ── Pi GPIO14 / TXD / pin 8
Pi 5 V / pin 2 ───────── XIAO 5V
momentary switch ──────── XIAO D8 / GPIO7 ── GND
```

UARTは921,600 baud、3.3 Vロジックとする。[Raspberry Pi公式UART手順](https://www.raspberrypi.com/documentation/computers/configuration.html#configure-uarts)に従ってシリアルコンソールを無効化し、`/boot/firmware/config.txt`へ`dtoverlay=uart0-pi5`を追加してGPIO14/15のUART0を有効にし、再起動後に`/dev/ttyAMA0`がそのピンへ対応することを`pinctrl`とループバックで確認する。録画プロセスには`/dev/ttyAMA0`を渡し、Pi 5で既定のデバッグ端子を指す`/dev/serial0`は使わない。XIAOの正しい物理対応はD0=GPIO1、D2=GPIO3、D4=GPIO5、D5=GPIO6、D6=GPIO43、D7=GPIO44、D8=GPIO7である。上流OSCARソース内の異なるGPIO番号コメントは使わず、Arduinoの`D0`等の記号をXIAO ESP32-S3ボード定義でビルドする。上流で未使用予約のD8を内部プルアップ入力へ変え、接地への1.5秒長押しで`B0,LONG;`を一度だけPiへ送る。Piは待機中なら録画開始、録画中なら安全停止として扱う。

二つの青色同期LEDは各レンズの画角上端に一つずつ置き、通常の作業視野を隠さず、発光した一フレームだけ左右映像へ写るよう固定する。XIAOは[OSCARの同期処理](https://arxiv.org/html/2608.08285v2#S3.SS2)と同じく60回目のSTRBで両方を同時点灯する。この映像アンカーを外すと、起動時のUVC欠落・重複によってSTRB番号と保存動画のフレーム番号を一意に対応できない。

STRBが3.3 Vプッシュプルなら上図どおり220 Ωを直列にする。3.3 Vへプルアップ可能なオープンドレインなら、信号を4.7 kΩでXIAO 3V3へプルアップしてから220 Ωを直列にする。1.8 Vまたは5 Vなら直結せず、販売者の出力回路に合わせたレベル変換を入れる。

## 収録処理

Piはカメラから左右一体の2560×720・30 fps Motion JPEGをFFmpegへ直接渡す。並行してXIAOは、直近のSTRB番号`fsn`と、そのSTRBからIMU読取りまでの遅延`fsd`を各IMU行へ入れてUARTで送る。録画後、左右映像に写った60回目の同期LEDを検出して、保存動画のフレーム番号とXIAOのSTRB番号を対応付ける。上流OSCARのXIAO側センサー取得とオフライン同期を再利用し、ホスト名、シリアルポート、映像コーデック、物理ボタンだけPi用に変える。

保存は上流OSCARと同じく、左右一体2560×720・30 fpsを一本のH.264にする。目標12 Mbps、最大18 Mbps、キーフレーム間隔60、5分ごとのセグメントとする。元の一体フレームを保存するので左右の同時性を崩さず、CPU側のH.264圧縮も一回で済む。セグメント切替中もUVCとIMU取得を止めない。収録後の同期処理で、各セグメントの最初と最後の動画フレームをSTRB番号・IMU時刻へ対応付けてmanifestへ書く。

目標12 Mbpsを厳密に維持した計算値は5時間で約27 GB、最大18 Mbpsへ張り付いた場合でも約41 GBである。一方、[OSCAR論文](https://arxiv.org/html/2608.08285v2#S3.SS2)は実測出力を12〜14 GB/時、5時間で60〜70 GBと報告しており、公開された圧縮設定の数値と一致しない。媒体は安全側の論文実測値で選び、初回5時間試験では生成ファイルの総バイト数と実効ビットレートをmanifestへ記録する。128 GBならOSと予備領域を残しても、この安全側の容量を収められる。

Raspberry Pi 5にはH.264ハードウェアエンコーダーがないため、`libx264`でCPU圧縮する。[Raspberry Pi公式測定](https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010033-WP-1-H.264%20encoding%20performance%20on%20Raspberry%20Pi%205_series%20computers.pdf)で1080p30を一CPUコアのおよそ60〜90%で圧縮できた条件と合わせ、`ultrafast`と`zerolatency`を使う。2560×720は1080pの約88.9%の画素数だが、今回のMotion JPEGソフトウェア復号は公式測定に含まれないため、CPU余力は推定で合格にしない。左右1280×720は納品時に横長映像から切り出し、元の横長映像も保持する。

Pi版の録画コマンドは上流のRockchip用二コーデック指定だけを置き換える。

```bash
ffmpeg -thread_queue_size 64 \
  -f v4l2 -input_format mjpeg -framerate 30 -video_size 2560x720 \
  -i /dev/video0 \
  -vf format=yuv420p \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -b:v 12000k -maxrate 18000k -bufsize 30000k \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -f segment -segment_time 300 -segment_start_number 1 \
  -reset_timestamps 1 fpv_stereo_%03d.mp4
```

OSCARの`fpv_recorder.py`では、`ESP_UART_PORT`を`/dev/ttyAMA0`へ、`mjpeg_rkmpp`を標準`mjpeg` decoderへ、`h264_rkmpp`を上記`libx264`へ変更する。Radxa固有の`gpiochip1`とline 8の読取りは外し、XIAOから受ける`B0,LONG;`を開始・停止イベントへ割り当てる。IMU行形式、`fsn`、`fsd`、60回目の同期LED、921,600 baud、heartbeat、5分segmentation、metadataとsegment offsetの生成は維持する。

電力はカメラ、XIAO、IMUを含め9〜12 Wを設計範囲とする。77.4 Whに変換効率85%を掛けた65.8 Whから、5.5〜7.3時間を見込む。5時間試験では平均13.2 W以下、低電圧警告ゼロ、CPUサーマルスロットリングゼロを合格条件にする。上限を超える場合は画質を落とさず、JPEG復号と`libx264`の負荷を測って処理を直す。Pi 4系へ変える場合は、幅上限のため左右二本のハードウェア圧縮へ実装を変え、同じ5時間試験を通す。

## 身体への保持

カメラからPiまでの線束は、シールドUSBとSTRB/UARTを一つの柔らかいスリーブへ収め、こめかみから耳の後ろ、後頭部中央を通して肩甲骨上端のPiポケットまで35〜45 cmとする。フレームまたはヘッドバンドへ5〜7 cm間隔で留め、耳後ろとPi入口へ引張逃がしを付ける。

Piは通気する保護ガードに入れ、襟そのものへ吊らず、左右の25 mm弾性帯で肩へ荷重を分ける小型メッシュポケットへ入れる。20,000 mAh電池は胸ポケット、作業ベストの上背部ポケット、または同じ肩ハーネスの下側へ置く。Piと電池の間だけを30〜50 cmのUSB-Cケーブルにする。これにより、メガネから腰まで一本の重い線を垂らさない。

頭部重量は、販売ページのカメラ梱包重量65 gを安全側の上限に置き、XIAO、IMU、線、剛体支持、引張逃がしを含め約95〜97 g。Pi、Active Cooler、保護ガード、短い線は約71〜81 g。電池は約320 gで、布ハーネスを除く総装着重量は約486〜498 gになる。重い電池を頭や首から吊らず、胸郭へ密着させる。

## 受入試験

Pi基準機は次を一度の5時間収録で満たした場合に完成とする。

1. 5時間のあいだカメラ・IMU取得を一度も再起動せず、5分ファイルだけが継続的に切り替わる。
2. 左右とも期待フレーム数540,000に対し、欠落、重複、順序逆転を数える。許容値を隠さずmanifestへ残す。
3. IMUの実レート、欠番、timestamp逆転、STRB数、カメラframe数の差を出す。
4. 静止格子と高速な頭振りを含め、左右の同時露光、42 mm剛体、内部・外部校正を検査する。
5. 電池開始・終了残量、平均・最大電力、低電圧、CPU温度、スロットリング、microSD書込エラーを保存する。
6. 元の横長H.264、IMU、STRB対応表、校正、検査manifestからOSCAR互換MCAPを再生成できる。

EGO1GSは、出荷される量産機と同じハードウェアrevision・firmwareで撮った原MCAPを先に受け取り、次を確認してから発注する。

- 左右元H.265、各frameのcapture timestamp、連番、生加速度・角速度、各IMU測定時刻が入る。
- 左右内部・歪み、左右外部、IMU-to-camera外部、camera–IMU時刻offsetが実際に埋まる。
- EgoHandを無効にすると全frameを保存し、無活動区間を落とさず、矩形・整流・安定化を焼き込まない。
- USB電池で5時間、file rolloverをまたいで無停止収録したログを出せる。
- RootLensが自己収録した原本と派生データを顧客へ販売、移転、ライセンス、再許諾できる。
- 日本の無線認証、日本向け送料、評価一台と10/30/50台の単価・納期・同一部品供給を示す。
- 出荷firmware、companion application、wire schemaのtag/commitを一組で固定し、将来もオフライン復号できる。

照会文は[調達依頼原稿](PROCUREMENT-REQUESTS.md#general-intelligence-labsへのego1gs照会)に完成済みである。

## 発注の順序

1. DECXIN、HAMPO、TOBIへ同じデータ要件を送り、42 mm版カメラ、`USB-3372-V1.0`、Model 3290、E2の日本着見積と原記録を得る。
2. 同時にEGO1GSへ量産機原MCAPと日本向け1/10/30/50台見積を求める。
3. `USB-3372-V1.0`が日本着45,000円以下で原記録を満たせば評価モジュールを一台買う。TOBI E2がp95 1 ms以下の同期を満たして日本着100,000円以下なら、装着比較用に一台買う。HAMPO Model 3290が発注型番として同期IMU・時刻・個体校正を含み日本着20,000円以下なら、DECXIN、XIAO、ICM-20948の代わりに使う。
4. これらが価格または原記録を満たさなければ、DECXINの注文書を確定し、カメラ一台と国内二店のPi部品を発注する。
5. Pi基準機またはHAMPO統合機の5時間収録とOSCAR互換変換を完了する。
6. EGO1GSが書面・原MCAPを満たした場合、一台を注文して同じ作業で比較する。
7. 量産機は装着継続率、欠落、同期、校正再現性、5時間停止率、台当たり総額を並べて選ぶ。

現時点ではWego2、VDEgo-C2、Luckey、DAS Egoへ支払わない。Luckeyは25台以上の段階で相見積だけを取り、EGO1GSの供給能力または検収結果が不足した場合に使う。
