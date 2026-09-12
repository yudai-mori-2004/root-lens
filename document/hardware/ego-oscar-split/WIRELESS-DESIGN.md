# Ego-OSCAR無線ヘッドデバイス：配線・処理設計

> **第二段階の設計:** この文書はM5Stamp ESP32P4で頭部完結・無線化する小型化案である。現在の初号機はRaspberry Pi 5分離型とし、[2026-09-11の低価格経路](../existing-glasses/LOW-COST-DECISION-2026-09-11.md)を先に実装する。

更新日：2026-09-07。これは初号機を組み立てるための正本である。部品名の略記は避け、回路上の役割で記す。

## 1. 完成時のデータ経路

```text
DECXIN 同期ステレオ・グローバルシャッターカメラ
  2560×720 / 30枚毎秒 / Motion JPEG / 左右42 mm
                │ USB 2.0 High Speed
                ▼
M5Stamp ESP32P4映像処理基板
  JPEGを一枚の2560×720 YUV420へ復号
  左右をコピーせず、2本の1280×720 H.264へ圧縮
                │                    │
                │                    └─ SPI ─ 256 GB microSD
                ▼
M5Stamp ESP32P4用Wi-Fi 6無線基板 ))) 2.4 GHz ))) iPhone

カメラ露光同期端子 ─変換回路─ XIAO ESP32S3センサー制御基板
                                      │ I²C: ICM-20948
                                      └ UART: 映像処理基板
```

保存する映像は左右各1280×720、30枚/秒、H.264 Baseline、6メガビット/秒。左右合計12メガビット/秒、最大18メガビット/秒、キーフレーム間隔60枚とする。これは上流Ego-OSCARの12/18メガビット/秒、60枚という記録条件を継ぐ。違いはRockchipの圧縮器をM5Stamp ESP32P4映像処理基板の圧縮器へ置き換え、左右を別ストリームにする点である。

映像の圧縮誤差は圧縮器の違いによって変わり得る。一方、画角、露光、左右同期、解像度、毎秒枚数、慣性センサー、露光同期の取得は変えない。学習用の統計へ影響し得る変更点を圧縮器に限定し、記録にはビルド識別子と圧縮設定を必ず残す。

## 2. この処理量を通せる根拠

M5Stamp ESP32P4映像処理基板が内蔵するJPEG復号器はデータシート上で720pを毎秒70枚まで処理でき、Espressifの映像部品に含まれる実測例では1280×720 JPEG復号が一枚約8.86 msである。H.264圧縮器は二本同時動作と1920×1080・30枚/秒を公称する。今回の二本分は合計55.296メガピクセル/秒で、1920×1080・30枚/秒の62.208メガピクセル/秒より12.5%少ない。[ESP32P4データシート](https://documentation.espressif.com/esp32-p4_datasheet_en.pdf)、[Espressif映像変換例](https://github.com/espressif/esp-video-components/blob/50389db65d56b12d4b59fcbb69c68d6e7154a318/esp_video/examples/m2m/README.md)、[H.264部品](https://github.com/espressif/esp-h264-component/blob/6fc011d98649c1c04b4c97b41748f7ce45de1e71/esp_h264/README.md)

JPEG復号出力を二枚確保し、一枚を左右H.264へ圧縮している間に次のJPEGを別の出力へ復号する。これにより、一組の処理時間は復号時間と圧縮時間の和ではなく、長い側で決まる。実装はEspressif映像部品の復号出力数を一枚から二枚へ変更する[`esp-video-double-buffer.patch`](firmware/patches/esp-video-double-buffer.patch)と、復号タスク・圧縮タスク間の一要素キューである。

無線基板との組み合わせについて、Espressifの公開測定は映像処理基板からパソコンへのTCP送信が32メガビット/秒、UDP送信が50メガビット/秒。初号機は録画終了後にTCPで転送する。32メガビット/秒に対して約70%の22.5メガビット/秒を受入れ下限に置くと、通常設定の5.4 GB/時は収録一時間あたり約32分、最大設定の8.1 GB/時は約48分で転送できる。[ESP-Hosted測定](https://github.com/espressif/esp-hosted-mcu/blob/038f3cbaac73b80d09597d3c112c77a3cd6edd54/docs/design/performance.md)

microSDは40 MHzのSPIで接続し、線速度は40メガビット/秒。1 MiB単位でまとめて書き、映像の最大18メガビット/秒と慣性センサー記録を収める。保存量は12メガビット/秒で5.4 GB/時、18メガビット/秒で8.1 GB/時。220 GBを使用可能量と置くと約40.7時間または27.2時間である。

## 3. 映像メモリーの配置

JPEG復号後の形式は、Espressifが`ESP_H264_RAW_FMT_O_UYY_E_VYY`と呼ぶ詰め込み型YUV420を使う。一枚は`2560 × 720 × 1.5 = 2,764,800 byte`。左右を別バッファへコピーせず、左は先頭、右は先頭から1,920 byte後を圧縮器へ渡す。圧縮器の二次元転送には元画像の横幅2560を指定する。

```text
decoded_stereo[2,764,800]
├─ left input : offset 0,     width 1280, stride 2560
└─ right input: offset 1,920, width 1280, stride 2560
```

このためのEspressif H.264部品への変更は[`esp-h264-input-stride.patch`](firmware/patches/esp-h264-input-stride.patch)、左右同時圧縮の呼び出しは[`stereo_encoder.c`](firmware/main/stereo_encoder.c)に実装した。単純な左右コピーで発生する毎秒165.888 MBの読み書きを省く。

メモリーは、復号画像二枚5.27 MiB、JPEG入力二枚へ最大4 MiB、左右圧縮出力二本へ1 MiB、保存バッファへ1 MiB、転送バッファへ64 KiBを割り当てる。残り約20 MiBをH.264参照画像、USB、無線、タスクへ残す。映像用の大きな領域は32 MB外部RAMから確保し、1 MiBの保存バッファと64 KiBの転送バッファをタスクのスタックへ置かない。

## 4. 電源配線

2000 mAh保護回路付き1セル電池をLipo Rider PlusのJST入力へ挿す。初回だけテスターで赤線が正極、黒線が接地であることを確認する。Lipo Rider PlusのUSB-A出力へUSB-Aプラグ変換基板を挿し、変換基板の5 Vと接地から星形に分ける。変換基板は支持板へ固定し、USB端子だけで荷重を受けないようにする。

```text
2000 mAh電池
  └ JST-PH 2極 ─ Lipo Rider Plus ─ USB-Aプラグ変換基板
                                      ├ 5 V/GND ─ カメラ
                                      ├ 5 V/GND ─ 映像処理基板
                                      ├ 5 V/GND ─ センサー制御基板
                                      └ 5 V/GND ─ 3.3 Vレギュレーター
                                                        └ microSD基板
```

全負荷は同じ5 V・最大2.4 Aの保護された出力へ接続する。映像処理基板の端子やセンサー制御基板の端子からカメラへ逆給電しない。microSDは専用の3.3 V・500 mAレギュレーターから給電し、カード基板の近くへ100 µF・16 V電解コンデンサーと0.1 µFセラミックコンデンサーを各一個置く。

設計消費は平均4 W、ピーク6 W。7.4 Whの電池、変換効率90%なら`7.4 × 0.9 / 4 = 1.665時間`で、運用目標を90分に置く。低電圧時の3.4 Vと効率88%でピーク6 Wを出すと電池電流は約2.01 Aで、選定電池の最大4 A以内、昇圧基板の12 W以内である。

## 5. 信号配線

### 映像処理基板

| 始点 | 終点 | 組み方 |
|---|---|---|
| カメラUSB D+ | 映像処理基板`USB2_HOST_DP`、モジュールpad 40 | USB Type-Aレセプタクル変換基板から、既製USBケーブル内の差動対を保って引く |
| カメラUSB D− | `USB2_HOST_DM`、pad 41 | D+とD−を90 Ω差動のまま保ち、長いジャンパー線へ分解しない |
| カメラUSB GND | 共通接地 | USBシールドもカメラ側ケーブル構造を維持する |
| カメラUSB 5 V | 星形5 V電源 | USBデータ線とは電源の始点だけを分ける |
| センサー制御基板`D6/TX` | 映像処理基板GPIO16/RX | 3.3 V、921600 baud、8N1 |
| センサー制御基板`D7/RX` | 映像処理基板GPIO17/TX | TX同士を結ばない |
| microSD CLK | GPIO18 | 40 MHz以下 |
| microSD MOSI | GPIO19 | 3.3 V |
| microSD MISO | GPIO20 | 3.3 V、採用基板に10 kΩプルアップ実装済み |
| microSD CS | GPIO21 | 3.3 V |

無線基板は20ピン専用コネクターへ直接載せる。割当はCLK=GPIO43、CMD=GPIO44、D0=GPIO45、D1=GPIO46、D2=GPIO47、D3=GPIO48、RESET=GPIO42。ジャンパー配線しない。[M5Stack接続資料](https://docs.m5stack.com/en/arduino/m5stampp4/wifi)

### センサー制御基板

物理的な基板印字を正にする。

| 機能 | XIAO基板印字 | 接続先 |
|---|---|---|
| カメラ露光同期入力 | `D0` | 電圧変換回路の出力 |
| 光学同期LED | `D2` | 470 Ωを介して青色LED |
| 状態表示LED | `D3` | 330 Ω、JST-SHケーブルを介して一灯の小型NeoPixel状態表示モジュールの`In` |
| 慣性センサーSDA | `D4` | ICM-20948 SDA |
| 慣性センサーSCL | `D5` | ICM-20948 SCL |
| UART送信 | `D6` | 映像処理基板GPIO16 |
| UART受信 | `D7` | 映像処理基板GPIO17 |

ICM-20948は3.3 V、共通接地、SDA、SCLの4本でつなぎ、AD0を接地してアドレス0x68にする。起動時に`WHO_AM_I=0xEA`を読めなければ記録を開始しない。

状態表示LEDは3.3 Vで給電する。NeoKeyソケット基板の`VDD (+)`を3.3 V、`GND (-)`を接地、`In (I)`を330 Ω経由で`D3`へつなぐ。`Out (O)`とキースイッチ用端子は接続しない。初号機は基板上の一灯だけを使うため、センサー制御プログラムへ[`ego-oscar-one-status-led.patch`](firmware/patches/ego-oscar-one-status-led.patch)を当てる。表示色と状態遷移は上流のまま保つ。[状態表示LEDの端子資料](https://www.switch-science.com/products/10050)

露光同期端子は3.3 V互換の個体だけを注文する。3.3 Vプッシュプルなら信号線を220 Ω経由で`D0`へ入れる。オープンドレインなら信号線を4.7 kΩで3.3 Vへプルアップし、220 Ω経由で`D0`へ入れる。センサー制御プログラムは`D0`をプルアップ入力にして下降エッジを数える。1.8 V、5 V、電気仕様不明の個体は使わない。回答文を[発注先への確認文](SUPPLIER-QUESTIONS.md)へ記録する。

## 6. 保存・通信形式

映像処理基板は5分ごとに`000000.eos2`、`000001.eos2`のようなファイルを作る。書き込み中は`.partial`を付け、末尾のSHA-256まで書いて同期してから`.eos2`へ変更する。録画停止後、同じバイト列をTCP 47000番でiPhoneへ送る。

各レコードの40 byteヘッダーはビッグエンディアン。

| オフセット | 長さ | 内容 |
|---:|---:|---|
| 0 | 4 | ASCII `EOS2` |
| 4 | 2 | 版番号2 |
| 6 | 2 | 1=左右映像、2=慣性センサー行、3=状態、4=チャンク末尾 |
| 8 | 4 | フラグ |
| 12 | 8 | セッション内通し番号 |
| 20 | 8 | 映像処理基板の単調増加時刻、µs |
| 28 | 4 | payload長 |
| 32 | 4 | payload CRC32 |
| 36 | 4 | 先頭36 byteのCRC32 |

左右映像payloadは`left_length:u32, right_length:u32, pts90k:u64, left H.264, right H.264`。左右は同じ通し番号と表示時刻を持ち、30枚/秒なので表示時刻は一組ごとに3000増える。慣性センサーpayloadはXIAOが出す`G0`行を改変せず、改行区切りでまとめる。末尾payloadはチャンク番号、先頭と末尾の通し番号、末尾以前のバイト数、その範囲のSHA-256を持つ。C実装は[`eos2_wire.c`](firmware/main/eos2_wire.c)、Swift実装は[`EgoRecord.swift`](receiver-ios/Sources/EgoReceiverCore/EgoRecord.swift)で同じ配置を使う。

iPhoneはまず`STP2`を送り、映像処理基板がセンサー停止、現在チャンクのSHA-256、microSD同期、ファイル名確定を終えて`DONE`を返すまで接続を保つ。その後、`LST2`で最大チャンク番号を取得し、ゼロから最大番号まで`GET2`とチャンク番号を送る。`GET2`の応答は`OKAY`に続くファイル本体、録画中を示す`BUSY`、欠番を示す`MISS`、内部失敗を示す`FAIL`のいずれかである。受信途中は`.partial`へ書き、レコードごとのCRC32、通し番号、末尾のバイト数とSHA-256を確認し、`fsync`相当の同期を行ってから`.eos2`へ変更する。実装は[`EgoCaptureDownloader.swift`](receiver-ios/Sources/EgoReceiverCore/EgoCaptureDownloader.swift)と[`EgoChunkWriter.swift`](receiver-ios/Sources/EgoReceiverCore/EgoChunkWriter.swift)。切断時は同じ番号を先頭から取り直し、欠番は飛ばし、すでに検査済みの確定ファイルも飛ばす。

## 7. 収録後の復元

一つのチャンクを検査して分解する。

```bash
python3 tools/eos2_extract.py 000000.eos2 extracted/000000
```

突然の電源断で`.partial`だけが残った場合は、CRC32が一致する最後の完全レコードまでを救出する。

```bash
python3 tools/eos2_extract.py --salvage 000000.eos2.partial recovered/000000
```

出力は`left.h264`、`right.h264`、`sensor-uart.log`、`imu.csv`、`events.jsonl`、`pairs.csv`、`manifest.json`。`sensor-uart.log`にはセンサー制御基板の応答と16進数の元サンプルを残す。`imu.csv`はEgo-OSCARと同じ`index, ax, ay, az, gx, gy, gz, mx, my, mz, fsn, fsd`列へ変換し、軸値を符号付き16 bit、フレーム番号と露光からの時間差を符号なし整数で10進表記する。

圧縮画像を変えずにMP4コンテナーへ入れる場合は、左右を別ファイルのままコピーする。

```bash
ffmpeg -fflags +genpts -r 30 -i extracted/000000/left.h264 -c:v copy left.mp4
ffmpeg -fflags +genpts -r 30 -i extracted/000000/right.h264 -c:v copy right.mp4
```

従来処理が横並び一枚のMP4だけを受け取る場合は次で派生ファイルを作る。この操作は左右を復号して再圧縮するため、`EOS2`内の二本のH.264を撮影原本として残す。

```bash
ffmpeg \
  -fflags +genpts -r 30 -i extracted/000000/left.h264 \
  -fflags +genpts -r 30 -i extracted/000000/right.h264 \
  -filter_complex '[0:v][1:v]hstack=inputs=2[v]' \
  -map '[v]' -c:v libx264 -pix_fmt yuv420p -r 30 \
  -g 60 -b:v 12M -maxrate 18M -bufsize 24M rgb.mp4
```

## 8. 組立時に確認する数値

これは設計を先送りする項目ではなく、組み立てミスを除く検査値である。

| 検査 | 合格値 |
|---|---|
| カメラ列挙 | 2560×720、Motion JPEG、30枚/秒、JPEG色差4:2:0 |
| 左右映像 | 各1280×720、同じ組番号・表示時刻、キーフレーム位置一致 |
| 映像処理 | 10分で平均29.97枚/秒以上、説明のない組欠落0 |
| 保存 | 連続書込2.5 MB/s以上、5分チャンクのSHA-256一致 |
| 無線 | 録画停止後のTCP実効22.5メガビット/秒以上を30分維持 |
| 慣性センサー | 180 Hz、アドレス0x68、`WHO_AM_I=0xEA`、行欠落0 |
| 露光同期 | 一組につき規定数のエッジ、余分なエッジ0 |
| 電源 | 5 Vバス4.75 V以上、ピーク1.2 A以下、90分停止なし |

上流は[`fpv-labs/ego-oscar`のd78d393](https://github.com/fpv-labs/ego-oscar/tree/d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea)を基準とする。センサー制御コードの収録開始、慣性センサー180 Hz、露光同期カウント、光学同期LED、ハートビートを保持し、UART接続先だけを映像処理基板へ変更する。
