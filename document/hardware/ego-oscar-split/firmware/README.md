# 映像処理基板ファームウェア

> **第二段階の実装:** このM5Stamp ESP32P4映像ファームウェアは初号機へ書き込まない。初号機はRaspberry Pi 5版のOSCARホスト処理を使う。判断は[2026-09-11の低価格経路](../../existing-glasses/LOW-COST-DECISION-2026-09-11.md#収録処理)、生成可能な実装は[`../pi5`](../pi5/README.md)を参照する。

このディレクトリは、M5Stamp ESP32P4映像処理基板で次を実行するESP-IDFプロジェクトである。

- USBカメラを2560×720、Motion JPEG、30枚/秒で開く。
- JPEGを詰め込み型YUV420へハードウェア復号する。
- 復号出力を二枚交互に使い、次のJPEG復号と現在画像の圧縮を重ねて走らせる。
- 左右各1280×720をコピーせず二本のH.264へ圧縮する。
- XIAO ESP32S3センサー制御基板から921600 baudで受けた完全な`G0`行を映像と同じチャンクへ入れる。
- 録画開始前に、センサー制御基板の状態、露光カウンター、慣性センサー180 Hz開始の成功応答を確認する。
- 5分ごとにCRC32とSHA-256付き`EOS2`ファイルをmicroSDへ確定保存する。
- `RootLens-Ego`無線LANを作り、録画停止後にiPhoneへ確定済みチャンクを送る。

## ソースの構成

| ファイル | 内容 |
|---|---|
| [`capture_main.c`](main/capture_main.c) | microSD、無線LAN、UART、USB撮影、JPEG復号、圧縮、5分分割、チャンク配信 |
| [`stereo_encoder.c`](main/stereo_encoder.c) | 二本のH.264圧縮器を同じ表示時刻とキーフレーム位置で動かす |
| [`eos2_wire.c`](main/eos2_wire.c) | 40 byteヘッダー、CRC32、映像prefix、チャンク末尾の直列化 |
| [`esp-h264-input-stride.patch`](patches/esp-h264-input-stride.patch) | 一枚の横並び画像を左右から直接読むための入力stride追加 |
| [`esp-video-double-buffer.patch`](patches/esp-video-double-buffer.patch) | JPEG復号出力を一枚から二枚へ増やす変更 |
| [`ego-oscar-one-status-led.patch`](patches/ego-oscar-one-status-led.patch) | 頭部装着用の状態表示を外付け一灯へまとめる変更 |
| [`prepare_upstream.sh`](prepare_upstream.sh) | 固定したEspressifソースを取り込み、二つの変更を当てる |
| [`prepare_sensor_controller.sh`](prepare_sensor_controller.sh) | 固定したEgo-OSCARからセンサー制御プログラムを取り込む |
| [`build_sensor_controller.sh`](build_sensor_controller.sh) | XIAO ESP32S3用コンパイラーとライブラリの版を固定してビルドする |

## 再現できるビルド手順

ESP-IDFのcommit `96f54947e08c196cf71c0588243dfc8e33807acc`を使う。このcommitはビルド時に6.2.0と表示される。以下はこのディレクトリをカレントにして実行する。

```bash
git clone https://github.com/espressif/esp-idf.git /opt/esp-idf-rootlens
git -C /opt/esp-idf-rootlens checkout 96f54947e08c196cf71c0588243dfc8e33807acc
git -C /opt/esp-idf-rootlens submodule update --init --recursive
/opt/esp-idf-rootlens/install.sh esp32p4
. /opt/esp-idf-rootlens/export.sh

bash prepare_upstream.sh
idf.py set-target esp32p4
idf.py build
idf.py -p /dev/cu.usbmodemXXXX flash monitor
```

`prepare_upstream.sh`はEspressif映像部品の`50389db65d56b12d4b59fcbb69c68d6e7154a318`からUSBとJPEG復号の実装を取り込み、復号出力を二枚へ増やす。H.264部品の`6fc011d98649c1c04b4c97b41748f7ce45de1e71`には入力stride変更を適用する。取得元を最新版へ自動更新しない。

無線基板は映像処理基板の20ピン専用コネクターへ装着する。`sdkconfig.defaults`はM5Stack資料どおり、無線用CLK=GPIO43、CMD=44、データ線=45〜48、RESET=42を固定している。microSDは別のSPIバスでCLK=18、MOSI=19、MISO=20、CS=21を使う。

## 起動と取り出し

電源投入時にmicroSDとカメラを開き、センサー制御基板から状態、露光カウンター、慣性センサー開始の四つの成功応答を受け取る。どれかが2秒以内に成功しなければ録画を開始しない。すべて成功すると`000000.eos2.partial`へ収録を開始する。映像9000組、つまり5分でSHA-256付き末尾を書き、`000000.eos2`へ変更して次のファイルを開く。

録画を終えるとき、iPhoneは`RootLens-Ego`へ接続する。初号機のパスワードは`rootlens-ego-2026`、映像処理基板のアドレスは`192.168.4.1`。iPhoneはまず`53 54 50 32 00 00 00 00`、ASCIIの`STP2`とゼロ4 byteを送る。映像処理基板は慣性センサー、露光カウンター、状態表示を停止し、現在のチャンクを確定してmicroSDへ同期した後に`DONE`を返す。iPhoneが`DONE`を受け取るまで主電源を切らない。

確定後、iPhoneは`LST2`とゼロ4 byteを送り、映像処理基板から`LIST`と最大チャンク番号を受け取る。確定ファイルが一つもなければ`EMPT`を受け取る。突然の電源断で`.partial`が残り、確定番号に欠番があっても、最大番号まで走査できる。

一つのチャンクを取得する接続では次の8 byteを送る。

```text
47 45 54 32 00 00 00 00
G  E  T  2  チャンク番号0をビッグエンディアンで指定
```

映像処理基板は`OKAY`の4 byteに続けて確定済みの`000000.eos2`を末尾まで返し、接続を閉じる。一つ後は新しい接続でチャンク番号1を要求する。番号が存在しなければ`MISS`、録画中なら`BUSY`、内部失敗なら`FAIL`を返す。書き込み途中の`.partial`は配信しない。

突然の電源断で残った`.partial`は次回起動時に上書きせず、次の空き番号から収録する。完全に書けたレコードは`eos2_extract.py --salvage`で回収できる。

## センサー制御基板のビルドと書き込み

Arduino CLI 1.5.1を入れ、次を実行する。スクリプトはEgo-OSCARのcommit `d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea`からプログラムを取り込み、Espressif Arduino core 3.3.11、SparkFun ICM-20948ライブラリ1.3.2、Adafruit NeoPixelライブラリ1.15.5でビルドする。

```bash
bash prepare_sensor_controller.sh
bash build_sensor_controller.sh
arduino-cli upload \
  --fqbn esp32:esp32:XIAO_ESP32S3 \
  -p /dev/cu.usbmodemXXXX \
  sensor-controller/esp32_coprocessor_led_watchdog
```

取り込むプログラムはUART 921600 baudを使い、カメラ露光同期を`D0`、光学同期LEDを`D2`、一灯の状態表示LEDを`D3`、慣性センサーを`D4/D5`、映像処理基板との送受信を`D6/D7`へ割り当てる。USBシリアルへ切り替える変更は加えない。

## ビルド済み範囲

2026-09-07に映像処理基板ファームウェアを上記ESP-IDFで完全ビルドした。生成された`rootlens_ego_head.bin`は`0x114270` byteで、4 MiBのアプリ領域に73%の空きがある。状態表示を一灯にしたセンサー制御プログラムも上記Arduino環境で完全ビルドし、プログラム領域352,662 byte、動的メモリー24,680 byteだった。

## ローカル検査

ESP-IDFを使わない直列化と配置計算はmacOS/LinuxのCコンパイラーで検査できる。

```bash
cc -std=c11 -Wall -Wextra -Werror -Iinclude \
  tests/test_stereo_layout.c -o /tmp/test_stereo_layout
/tmp/test_stereo_layout

cc -std=c11 -Wall -Wextra -Werror -Imain \
  tests/test_eos2_wire.c main/eos2_wire.c -o /tmp/test_eos2_wire
/tmp/test_eos2_wire
```

映像処理基板のファームウェアは、CRCを計算するために左右映像を結合コピーしない。prefix、左、右の三領域へCRC32を連続適用し、そのままmicroSDへ順番に書く。映像メモリーを複製する処理は入っていない。JPEG復号タスクとH.264圧縮・保存タスクの間は一組だけ保持し、二枚の復号出力を交互に返却する。
