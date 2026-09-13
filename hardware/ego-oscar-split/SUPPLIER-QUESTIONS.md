# DECXINカメラの注文前確認文

商品ID `1601162804134` の販売元へ、次の英文をそのまま送る。回答は注文画面の会話だけに残さず、Proforma Invoiceまたは製品仕様書へ記載してもらう。

```text
Hello,

I would like to order one synchronized stereo USB camera module for delivery to Japan. Please quote exactly the following configuration and confirm every numbered item before I place the order.

1. Two color OmniVision OG02B10 global-shutter sensors on one rigid board.
2. Lens center-to-center baseline: 42 mm.
3. Approximately 126-degree wide-angle lenses. Please state whether this is horizontal, vertical, or diagonal FOV, and provide the lens part number.
4. The two sensors must be hardware synchronized to the same exposure start. Please state the maximum left/right exposure skew.
5. One USB 2.0 High-Speed UVC device must output side-by-side 2560 x 720 MJPEG at 30 frames per second: left 1280 x 720 and right 1280 x 720.
6. The JPEG SOF sampling factors must be Y=0x22, Cb=0x11, Cr=0x11 (YUV 4:2:0), because the target hardware decoder requires 4:2:0 JPEG.
7. Please expose the frame/exposure strobe signal and signal ground on labeled wires or a connector. For the strobe, provide:
   - connector/pad and pinout,
   - voltage levels,
   - push-pull or open-drain output,
   - active-high or active-low polarity,
   - which edge corresponds to exposure start,
   - pulse width,
   - number of pulses per stereo frame,
   - maximum current and any required pull-up voltage.
   The strobe must be directly compatible with a 3.3 V microcontroller input: either 3.3 V push-pull, or open-drain that can be pulled up to 3.3 V. The recording firmware counts the falling edge. I will not accept a 1.8 V-only, 5 V push-pull, or electrically unspecified strobe.
8. Please provide the board dimensions, mounting-hole drawing, bare board weight, startup and steady-state maximum 5 V current, UVC descriptor, and the Windows or Linux command/output showing 2560 x 720 MJPEG at 30 fps. Maximum current must not exceed 1 A. Include one shielded USB 2.0 High-Speed split cable, no longer than 600 mm from the camera board to the split. Its data-host USB-A plug must carry D+, D-, and GND but leave VBUS disconnected. A separate power USB-A plug must carry 5 V and GND to the camera. The two 5 V sources must never be tied together. Please quote this custom cable in the same line item rather than supplying the standard long cable.
9. Please state whether you can deliver the per-unit calibration for the exact shipped module: both cameras' intrinsics and distortion coefficients, and the rigid transform between the two cameras. State the calibration model, image resolution, coordinate convention, and units.
10. Quantity: one. Delivery address: Japan. Please quote product price, customization price, shipping, Incoterm, delivery date, and whether import tax is prepaid separately.

Please do not substitute a 65 mm baseline board, monochrome sensors, rolling-shutter sensors, separate unsynchronized USB cameras, YUV422-only MJPEG, or a lower frame-rate firmware.

Thank you.
```

## 回答を注文仕様へ反映する表

| 販売元回答 | 発注・配線への反映 |
|---|---|
| 全10項目が一致 | 数量1で注文し、回答PDFと注文番号をセッションmanifestへ保存する |
| 42 mm版は別商品番号 | その商品番号、追加価格、納期を注文書へ固定する |
| 2560×720・30枚/秒がYUV422 JPEGのみ | 購入しない。映像処理基板のJPEG復号入力条件と合わない |
| 露光同期信号が3.3 Vプッシュプル | 220 Ωを介してセンサー制御基板`D0`へ接続する |
| 露光同期信号が3.3 Vへプルアップ可能なオープンドレイン | 4.7 kΩで3.3 Vへプルアップし、220 Ωを介して`D0`へ接続する |
| 露光同期信号が1.8 Vまたは5 Vプッシュプル | 購入しない。初号機の配線条件から外れる |
| 露光同期信号の電気仕様が出ない | 購入しない。OSCARの露光同期を再現できない |
| 最大電流が1 A以下で、指定した二股ケーブルを供給できる | CIO電池の第二出力からカメラVBUSを給電し、Pi側USBはD+、D−、GNDだけ接続する |
| 最大電流が1 A以下だが、指定した二股ケーブルを供給できない | 電源注入基板を別途用意するまでカメラをPiへ接続しない |
| 最大電流が1 Aを超える | 今回の電源・配線では購入しない |

USBケーブルはカメラと同じ注文へ含める。販売元が600 mmを作れない場合は、400〜600 mmの範囲で出せる長さを回答と注文書へ記載させる。電源とD+/D−をばらのジャンパー線にせず、販売元のシールド済みハーネスを使う。D+/D−のシールド対はハーネスのまま残し、身体側の短い分岐部でVBUSだけを分ける。組立後は導通検査を行い、カメラを外した状態でデータ側USB-AのVBUSと電源側5 Vが導通しないことを確認する。
