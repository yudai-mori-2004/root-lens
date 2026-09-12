# Raspberry Pi 5設定

Raspberry Pi OS Bookworm 64-bitをRaspberry Pi 5へ入れ、先にActive Coolerを装着する。OSCARの記録形式を維持する設定は、UART 921,600 baud、2560×720・30 fps Motion JPEG入力、`libx264`、12 Mbps、5分分割である。

## 1. UART0を40ピンヘッダーへ出す

[`config.txt.fragment`](config.txt.fragment)の一行を`/boot/firmware/config.txt`の末尾へ追加する。

```bash
sudo tee -a /boot/firmware/config.txt < config/config.txt.fragment
```

`/boot/firmware/cmdline.txt`は一行のまま編集し、`console=serial0,115200`、`console=ttyAMA0,115200`があればその語だけを削除する。`enable_rp1_uart=1`はGPIO14/15へファームウェアのデバッグ出力を流すため設定しない。再起動後に次を確認する。

```bash
test -c /dev/ttyAMA0
test "$(readlink -f /dev/serial0)" != /dev/ttyAMA0
pinctrl get 14,15
```

`uart0-pi5`はPi 5のUART0をGPIO14/15へ割り当てる公式overlayで、Linux上のUART0は`/dev/ttyAMA0`である。Pi 5の`/dev/serial0`は通常、専用デバッグ端子のUART10を指すため、記録プログラムでは別名を使わない。

- [Raspberry Pi公式UART説明](https://www.raspberrypi.com/documentation/computers/configuration.html#primary-and-secondary-uarts)
- [Raspberry Pi公式overlay一覧の`uart0-pi5`](https://github.com/raspberrypi/firmware/blob/master/boot/overlays/README#L5517-L5534)

## 2. 頭部側を配線する

UARTとセンサー制御は3.3 Vロジックである。ピン番号はPiの40ピンヘッダー物理番号である。

| 信号 | 始点 | 終点 |
|---|---|---|
| XIAOからの送信 | XIAO D6 / GPIO43 / TX | Pi pin 10 / GPIO15 / RXD0 |
| XIAOへの受信 | XIAO D7 / GPIO44 / RX | Pi pin 8 / GPIO14 / TXD0 |
| 共通接地 | XIAO GND | Pi pin 6 / GND |
| XIAO電源 | Pi pin 2 / 5 V | XIAO 5V |
| 露光同期 | カメラSTRB/SOE → 220 Ω | XIAO D0 / GPIO1 |
| 慣性センサー | ICM-20948 SDA/SCL | XIAO D4 / GPIO5、D5 / GPIO6 |
| 光学同期LED | XIAO D2 / GPIO3 → 各220 Ω | 左右の青色LED各一個 → GND |
| 録画ボタン | モーメンタリースイッチ | XIAO D8 / GPIO7とGNDの間 |

D8は内部プルアップなので外付け抵抗は不要である。1.5秒押すとXIAOが`B0,LONG;`を一回だけ送り、Piは待機中なら開始、収録中なら安全停止する。離して再度1.5秒押すまで次のイベントは出ない。D2は上流OSCARと同じ同期LED端子のままで、60回目のSTRBに対応する画像アンカーを作る。

## 3. カメラを別給電する

Pi 5が5 V・3 A給電と判断した場合、USB機器全体へ許す電流は600 mAである。カメラの最大電流回答が得られる前からこの制限へ依存しないよう、20,000 mAh電池の二出力を次のように分ける。

```text
battery USB-C output 1 ── 5 V / 3 A以上 ── Pi 5 USB-C電源
battery output 2       ── 5 V ─────────── camera VBUS

camera D+ / D- / GND ───────────────────── Pi USB 2.0 port
camera VBUS          ── open（Pi側USB VBUSへ接続しない）
camera GND           ───────────────────── Pi/XIAO共通GND
```

データ線は90 Ω差動対のまま使う。Pi側USBの赤線VBUSを切って個別に絶縁し、カメラ側VBUSだけを電池出力2の5 Vへ接続する。二電源のGNDは共通にし、Pi側VBUSと電池出力2の5 Vが導通しないことを電源投入前にテスターで確認する。これでPiのUSB電流制限を越えるカメラでも、Piへ5 Vを逆流させずに映像データを渡せる。

## 4. 記録プログラムを配置する

このディレクトリの一つ上で固定済み上流を生成した後、Piへ配置する。

```bash
bash prepare_upstream.sh
sudo apt update
sudo apt install -y ffmpeg python3-serial rsync v4l-utils
sudo useradd --system --create-home --home-dir /var/lib/rootlens-recorder \
  --shell /usr/sbin/nologin rootlens || true
sudo usermod -aG video,dialout rootlens
sudo install -d -o rootlens -g rootlens /opt/rootlens-recorder /var/lib/rootlens-recorder
sudo install -m 0755 build/ego-oscar-pi5/radxa/fpv_recorder.py \
  /opt/rootlens-recorder/fpv_recorder.py
sudo install -m 0644 config/rootlens-recorder.env /etc/rootlens-recorder.env
sudo install -m 0644 config/rootlens-recorder.service \
  /etc/systemd/system/rootlens-recorder.service
```

`ROOTLENS_DEVICE_ID`は個体ごとに変える。他の既定値は配線と一致している。カメラを挿して次の三点を確認する。

```bash
v4l2-ctl -d /dev/video0 --list-formats-ext
ffmpeg -hide_banner -decoders | grep -w mjpeg
ffmpeg -hide_banner -encoders | grep -w libx264
```

一覧に`MJPG`、2560×720、30 fpsがあり、標準Motion JPEG decoderと`libx264` encoderが表示されなければサービスを開始しない。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rootlens-recorder.service
journalctl -u rootlens-recorder.service -f
```

実行される映像経路は一本の左右一体フレームを保つ。

```text
/dev/video0: MJPEG 2560×720@30
  → mjpeg software decoder
  → yuv420p
  → libx264 ultrafast + zerolatency
  → 12 Mbps target / 18 Mbps max / GOP 60
  → 300秒ごとのfpv_stereo_*.mp4
```

## 5. XIAOへ書き込む

開発機で次を実行する。Arduino ESP32 coreと二ライブラリはビルドスクリプト内で版を固定している。

```bash
bash build_xiao.sh
arduino-cli upload \
  --fqbn esp32:esp32:XIAO_ESP32S3 \
  -p /dev/cu.usbmodemXXXX \
  build/ego-oscar-pi5/firmware/esp32_coprocessor_led_watchdog
```

起動後、D8を一度長押ししてログに`XIAO LONG -> START`、再度長押しして`XIAO LONG -> STOP`が出ることを確認する。収録中はIMU CSVの`fsn`が増え、左右映像の同じフレームにD2の青色LEDが写ることを確認する。
