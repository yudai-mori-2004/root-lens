# Ego-OSCAR Raspberry Pi 5初号機

このディレクトリは、Ego-OSCARのカメラ・慣性センサー・露光同期処理を維持し、Radxa ROCK 5CだけをRaspberry Pi 5へ置き換える初号機実装である。M5Stamp ESP32P4の頭部完結型は[`../firmware`](../firmware/README.md)に独立した第二段階として残し、この生成処理から変更しない。

## 固定した上流

- repository: `https://github.com/fpv-labs/ego-oscar.git`
- commit: `d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea`
- `radxa/fpv_recorder.py` SHA-256: `94b8a353caf42e64d7d5b844ccbcbf4998a4157930a9cf5a021e1bb80e59079b`
- XIAO sketch SHA-256: `dc4b04ccebb11201ae5727a9cd8cb3be2b9d81de45067125919337073d5d1856`

[`prepare_upstream.sh`](prepare_upstream.sh)はcommit中の二ファイルを`git show`で取り出し、SHA-256が一致した場合だけ次のパッチを当てる。GitHub上の既定branchが変化しても入力は変わらない。

| パッチ | 変更 |
|---|---|
| [`xiao-d8-record-button.patch`](patches/xiao-d8-record-button.patch) | D8を内部プルアップの録画ボタンにし、30 msデバウンス後の1.5秒長押しで`B0,LONG;`を一回送る。処理は非ブロッキングで、D2のSTRB同期LED ISRを変更しない |
| [`raspberry-pi5-recorder.patch`](patches/raspberry-pi5-recorder.patch) | UARTを`/dev/ttyAMA0`へ変更し、Rockchip codecとGPIOボタンを外す。標準Motion JPEG decoderから`libx264 ultrafast`へ変換し、UARTの`B0,LONG`で録画を開始・停止する |

上流から維持するのは、左右一体2560×720・30 fps入力、IMU行の`fsn`/`fsd`、921,600 baud、D0 STRB計数、D2の60フレーム同期LED、1 Hz heartbeat、12/18 Mbps、GOP 60、5分分割、metadata、segment offsetである。

## 生成とビルド

```bash
cd document/hardware/ego-oscar-split/pi5
bash prepare_upstream.sh
python3 -m py_compile build/ego-oscar-pi5/radxa/fpv_recorder.py
bash build_xiao.sh
```

既にEgo-OSCARをcloneしている場合は、ネットワークを使わず同じcommitのblobを生成できる。checkout中のbranchは参照しない。

```bash
bash prepare_upstream.sh \
  --source /absolute/path/to/ego-oscar \
  --output /tmp/ego-oscar-pi5
```

生成先にはApache-2.0の上流ライセンスと`UPSTREAM.json`も入る。二つの変更済みファイルにはRootLensによる変更通知を記載している。

## Piへの設定と実行

UART、GPIO端子、カメラ別給電、OS package、systemd配置、XIAO書込みは[`config/README.md`](config/README.md)に手順を固定した。要点は次の構成である。

```text
DECXIN USB data + GND ── Pi 5 USB 2.0
DECXIN VBUS            ── battery output 2（Pi USB VBUSは開放）
Pi 5 power             ── battery output 1

XIAO D6/TX ── Pi pin 10/GPIO15/RX ── /dev/ttyAMA0
XIAO D7/RX ── Pi pin 8/GPIO14/TX
XIAO D8    ── momentary switch ── GND
XIAO D2    ── 220 ohm × 2 ── left/right sync LEDs ── GND
```

## 静的検査

テストは固定commitから一時ディレクトリへ生成し、次を実際の生成物に対して確認する。

- XIAOのD8、1.5秒、一押下一イベント、非ブロッキング処理
- 上流の`vsyncISR`と`resetInterruptData`の内容が同一で、D2同期処理が残ること
- `B0,LONG`がホストのスレッド安全なqueueへ入り、開始と停止を交互に呼ぶこと
- `/dev/ttyAMA0`、標準`mjpeg`、`libx264 ultrafast`、GOP 60、300秒分割
- `gpiod`、`gpiochip1`、`mjpeg_rkmpp`、`h264_rkmpp`が生成物に残らないこと
- `uart0-pi5`、GPIO14/15、カメラの別給電と共通GNDが設定文書にあること

ローカルcloneを使う実行例:

```bash
EGO_OSCAR_SOURCE=/absolute/path/to/ego-oscar \
  python3 -m unittest discover -s tests -v
```

`EGO_OSCAR_SOURCE`を省略すると、テスト自身がGitHubから上流をcloneする。この検査はソース、パッチ、設定の検査で、カメラのUVC持続受信、UART電気特性、Pi 5の温度と5時間連続記録は実機受入試験で測る。
