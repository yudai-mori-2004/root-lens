# 送付用本文

2026-09-10作成。以下は送信前の原稿。送信も注文も行っていない。

## GenRobotへのDAS Ego照会

宛先: `bdmarket@genrobot.ai`。技術回答のCC候補: `support@genrobot.ai`。[公式Contact Sales](https://www.genrobot.com/purchase)にも同じ本文を送れる。公開Buy Now先のJD SKUは現在下架のため、直販見積もりを前提にする。

件名: DAS Ego evaluation unit and 1 / 10 / 30 / 50-unit DDP Japan quotation

```text
Hello GenRobot team,

RootLens is a Japan-based project that records sensor-rich egocentric demonstrations of everyday and professional manual work for embodied-AI and VLA datasets. DAS Ego is currently our leading evaluation candidate because it combines six color global-shutter cameras, a 200 Hz IMU, local MCAP recording, per-camera calibration, storage, compute, and a balanced head-mounted enclosure.

We preserve the original device MCAP and create a separate FPV Labs Ego-OSCAR-compatible derivative. We intend to own recordings made with purchased devices and sell, license, and sublicense both original and derived recordings to our customers. Before ordering one evaluation unit, please quote and confirm the following for the current production hardware revision and current firmware.

COMMERCIAL QUOTATION

1. Unit price for 1, 10, 30, and 50 complete DAS Ego sets, shipped DDP to Tokyo, Japan. State currency, MOQ, quotation validity, payment terms, production lead time, shipping time, and Incoterm.
2. Exact hardware revision, firmware version, included accessories, warranty period, RMA turnaround, spare-unit policy, and how long this revision will remain orderable without sensor substitution.
3. Price and lead time for four batteries per headset, the largest currently supported battery, simultaneous multi-battery chargers/docks, replacement head pads/straps, and approved 256 GB or 512 GB SD cards.
4. Japanese radio approvals for Wi-Fi/Bluetooth and documentation needed for lawful operation in Japan. Provide battery transport documents, UN38.3 test summary, MSDS, and any applicable Japanese electrical-safety documentation.

FIVE-HOUR UNINTERRUPTED RECORDING

5. Your product page states “24-hour continuous operation” and “seamless battery swapping.” However, the DAS Ego v2.0 manual §6.2 and the current v2.1.26 firmware notes state that batteries must not be changed during recording because data may be corrupted. Please state the supported procedure on the quoted revision.
6. Confirm one of these as a warranted production configuration:
   a. continuous recording for at least five hours while powered through USB-C, including the required input voltage/current and a recommended 20,000 mAh power bank; or
   b. battery replacement during recording with no stopped exposure, lost frame, timestamp discontinuity, or MCAP corruption.
   If a single large battery supports five hours, provide its capacity, weight, dimensions, price, and measured runtime with all six cameras, IMU, and audio enabled.
7. Provide a five-hour original MCAP captured on a current production unit, or a machine-readable QC report from such a recording: per-topic expected/actual counts, dropped/duplicate frames, timestamp reversals, file boundaries, temperatures, thermal throttling, and battery events.
8. Confirm that Factory Mode file rollover does not stop sensor acquisition. State the gap in microseconds at each boundary, whether sequence numbers and sensor timestamps remain continuous, what portion can be lost after sudden power failure, and whether exFAT and 256/512 GB SD cards are supported.

CAMERAS, IMU, SYNCHRONIZATION, AND CALIBRATION

9. Confirm that all six 1600 × 1300, 30 Hz cameras in the quoted unit are color global-shutter sensors. Provide sensor part number, bit depth, lens FOV, rolling/global exposure mode, available exposure/gain/white-balance controls, H.264 profile, target bitrate per stream, GOP/IDR interval, and whether each MCAP message contains one complete encoded frame/access unit.
10. Identify the intended forward stereo pair and provide its nominal baseline and overlap. Camera2/3 have a 57.719 mm T_b_c translation separation in one official sample, 58.643 mm in a second official sample, and 59.0 mm in the published nominal URDF. Please confirm whether camera2/3 is the production stereo/VIO pair and that per-unit calibration, rather than the nominal URDF, is authoritative.
11. Define `header.timestamp` for camera messages exactly: sensor exposure start, exposure midpoint, exposure end, ISP completion, encoder output, or host publication. Also define MCAP log_time/publish_time, clock epoch, clock resolution, and `sequence_num` behavior. In the public 11.4-second sample, camera2/camera3 header timestamp differences have median 6 µs, p95 11 µs, and maximum 32 µs, while all-six spread has median 26.5 µs and maximum 105 µs. These values are useful only if the timestamps represent physical capture.
12. Describe the physical synchronization architecture: shared trigger, shared oscillator, sensor frame-sync input, PTP, or software alignment. Provide measured p50, p95, p99.9, maximum, and five-hour drift for (a) camera2 versus camera3 exposure, (b) all six camera exposures, and (c) each camera exposure versus IMU sampling time.
13. Confirm that every production unit includes populated `cameraN/camera_info` messages with Double Sphere intrinsics/distortion and per-camera T_b_c. Define whether T_b_c maps camera to base or base to camera, the order and units of D and K, quaternion convention, coordinate handedness, and whether the base frame origin/axes are exactly the calibrated `imu_link` frame in the URDF. Provide per-unit calibration residuals and the IMU-to-base transform, scale/bias calibration, noise density, and random walk.
14. Define IMU units and signs. The public sample’s acceleration norm is approximately 1.0, suggesting g rather than m/s². The manual says the 2×2 IMU array is output “after calibration and algorithm processing.” Confirm accelerometer units, gyroscope units, axis directions, gravity/sign convention, measurement timestamp event, sample batching, filter/fusion/temperature-compensation behavior, sensor part/range, and whether four unfiltered physical streams are available or only one processed six-axis stream is recorded.

DATA ACCESS, LICENSE, AND PRIVACY

15. Confirm that original six-camera H.264 messages, the recorded 200 Hz accelerometer/gyroscope stream and any available unfiltered physical-IMU streams, original sensor timestamps and sequence numbers, audio, all per-unit calibration, and any derived trajectory can be copied from the SD card without decryption, cloud processing, or a paid subscription.
16. Confirm in the sales agreement that RootLens owns all recordings created with the purchased units and may sell, transfer, license, sublicense, modify, publish, and use the original and derived recordings for commercial AI training and evaluation.
17. Confirm that GenRobot will not upload, copy, access, retain, anonymize, analyze, or use our recordings for product improvement, research, model training, or any other purpose without a separate explicit opt-in for each transfer. We need local-only operation, guest/offline device control, cloud upload disabled, log upload disabled, and direct upload only to storage credentials controlled by RootLens.
18. Your public Privacy Policy says that APP image data may be collected and anonymized image data may be used for R&D, while the Japanese App Store privacy label states that the app collects no data. Please explain which statement applies in No Matrix/local-only mode and provide the applicable DPA, controller/processor roles, data-flow diagram, server regions, subprocessors, retention, and deletion procedure.
19. State the license and redistribution terms for `das-datakit`, device protobuf schemas, device firmware/API, local processing containers, VIO output, and calibration files. Confirm that an OSCAR-compatible converter and customer dataset documentation may include the required schemas and our modified adapter code.

FIELD USE

20. The manual lists illumination ≤500 lux, no direct light or reflective surfaces, vibration-free ground, distance from motors/VFD/high-power supplies/Wi-Fi 6E/5G base stations, and a dust/smoke-free environment. Please distinguish mandatory safety/warranty limits from recommended conditions for VIO accuracy. Our intended sites include homes, kitchens, workshops, warehouses, and factories under normal indoor lighting.
21. Reconcile the product-page weight of 350 g with the manual values of 269 g main unit plus one 100 g battery. Provide the complete worn mass and center of gravity for each battery option, measured surface temperature after five hours, supported head circumference range, consumable pad cleaning/replacement, and an IP rating suitable for the stated environments.

Please answer each numbered item against the exact quoted hardware revision and attach the datasheet, compliance documents, current English manual/firmware notes, an original MCAP sample, and a draft sales agreement/DPA. If the five-hour and data-rights conditions are supported, we are ready to purchase one evaluation unit and proceed to 10/30/50 units after acceptance testing.

Best regards,
RootLens
Japan
```

評価機の注文書には、回答本文を参照資料として添付し、次の四点を明示する。

- 全六眼＋IMUで5時間無停止になる電源構成。ファイル分割は許すが、露光とIMU取得は止めない。
- camera2/3の物理露光差、camera–IMU差、`header.timestamp`の測定点、5時間drift、個体校正の座標規約、IMUの処理内容・単位・軸。
- 自己収録した原本・派生物の所有、販売、移転、ライセンス、再許諾と、GenRobot側の無断取得・利用禁止。
- 日本へ納入する同一revisionを10/30/50台で供給する価格、納期、センサー変更時の事前通知。

## General Intelligence LabsへのEGO1GS照会

宛先: hello@gilabs.xyz

件名: EGO1GS sample MCAP and DDP Japan quote for 1 / 10 / 30 / 50 units

Hello General Intelligence Labs team,

RootLens is a Japan-based project collecting sensor-rich egocentric recordings of everyday manual work for embodied-AI and VLA datasets. We are evaluating EGO1GS against FPV Labs Ego-OSCAR. Our required data are two synchronized color global-shutter streams, raw accelerometer and gyroscope samples, original capture timestamps, and per-unit stereo and camera-to-IMU calibration. We need at least five hours of uninterrupted capture while powered from a USB power bank. File rollover is acceptable if capture remains continuous.

Before purchasing the evaluation unit, could you provide a short original MCAP recorded by the same production EGO1GS hardware revision and firmware version that you would ship to us? The sample should contain fast head motion, hand interaction, and a static calibrated scene. Please include the original camera, CameraFrameInfo, ImuRaw, camera intrinsics, stereo extrinsics, IMU extrinsics, and IMU info topics produced by that firmware. We will retain the source MCAP and convert a derived copy into our FPV Labs delivery pipeline.

Please quote the following quantities for delivery to Japan: 1 evaluation unit, 10 units, 30 units, and 50 units. For each quantity, please state unit price, included accessories and 128 GB card, shipping charge, Incoterm, estimated production lead time, transit time, monthly capacity, warranty/RMA terms, and the period for which the same camera sensor, lens, hardware revision, and firmware branch can be supplied. We would also like a DDP Japan option and the proposed HS code. If DDP is unavailable, please separate freight, insurance, duty, tax, and brokerage assumptions.

Please confirm the following technical points for the current EGO1GS production unit:

1. The exact global-shutter image-sensor and lens part numbers, and whether 1920×1080 at 30 fps is recorded independently for both cameras.
2. Whether `SetBitrate.bitrate_kbps` applies to each encoder or the aggregate of both cameras, the production default, and the typical five-hour MCAP size.
3. How production firmware rolls MCAP parts on the included FAT32 card, and whether the session ID, calibration, and monotonic capture timeline remain complete across every part.
4. Measured left-to-right exposure-start error and camera-to-IMU timing error, including p50, p95, and maximum values rather than timestamp resolution alone.
5. The camera frame-drop rate in a five-hour 1080p30×2 + 400 Hz IMU recording, and whether recording continues through Wi-Fi loss and USB connection/disconnection.
6. Whether each delivered MCAP contains both camera intrinsics/distortion, cam1-to-cam0 extrinsics, IMU-to-cam0 extrinsics, IMU update rate/noise information, and the camera-to-IMU time offset.
7. Supported USB input voltage/current and a recommended Japan-certified 10,000–15,000 mAh power bank and cable.
8. Whether the Wi-Fi/Bluetooth configuration supplied may be operated in Japan under Japanese radio certification. If not, whether all RF transmitters can be disabled while local recording and USB export remain fully functional.
9. Whether disabling EgoHand and all on-device filtering records every captured frame. Please confirm that idle footage is not dropped, hand detections are not burned into either video stream, and the delivered camera streams are the original unrectified, unstabilized, overlay-free H.265 output.
10. The exact firmware version, companion-application version, wire-schema tag/commit, and MCAP schema descriptors used by the quoted production unit. Please provide a compatibility table and confirm that recordings remain fully decodable offline after future updates or discontinuation.

Our business supplies recordings and processed datasets to third-party embodied-AI customers. The order is conditional on the purchase agreement or order acknowledgement confirming the following:

> Buyer owns all original recordings, sensor data, timestamps, calibration, metadata, and all derived data generated through use of the devices. Buyer may retain, process, modify, de-identify, combine, sell, license, sublicense, disclose, and deliver those original and derived data to third-party customers for commercial machine-learning training, testing, and evaluation. The vendor has no right to access, upload, retain, train on, or otherwise use those recordings or derived data without Buyer's separate written opt-in. These rights survive any device, software, support, or firmware termination.

Please also identify the commercial terms for using and redistributing the minimum runtime/schema components required to read customer recordings after the supported life of the product. We understand that the public `visio-schema` is MIT licensed; this question concerns any additional firmware, companion application, decryption component, or runtime needed for production use.

Best regards,

RootLens

送付前に記入する情報: 法人名、担当者名、会社メール、配送先。公開されていない会社情報を推測で埋めない。

## ArducamへのB0492R照会

宛先: https://www.arducam.com/contact-arducam/ のSales / Customization窓口

件名: B0492R externally triggered stereo kit for Raspberry Pi 5 — 1 / 10 / 30 / 50 units to Japan

```text
Hello Arducam team,

RootLens is developing a head-worn recorder for commercial egocentric datasets in Japan. We are evaluating B0492R as a documented supply alternative to the stereo camera used by FPV Labs Ego-OSCAR. Our target recording is two original color global-shutter views at 1280 x 720 and 30 fps, a raw 6-axis IMU at 180 Hz or higher, and a defensible camera-to-IMU time relationship for at least five uninterrupted hours.

Please quote one evaluation B0492R kit and quantities 10, 30, and 50, delivered to Japan. State product price, freight, Incoterm/DDP availability, lead time, monthly capacity, warranty, and how long the same AR0234 sensor, lens, Camarray HAT revision, and driver will remain orderable.

Please confirm the following against Raspberry Pi 5 and current Raspberry Pi OS Bookworm/Trixie:

1. Continuous aggregate 2560 x 720 at exactly 30 fps in full-spelling-combine mode for five hours, with both original 1280 x 720 Bayer/color views present in every aggregate frame.
2. The exact rpicam/libcamera command, driver package version, kernel compatibility, tuning file, pixel format, stride, color conversion path, and method for piping the aggregate stream into FFmpeg without display or frame-rate conversion.
3. The electrical specification of the B0492R external-trigger input: connector/pad, logic voltage, VIH/VIL, internal pull-up/down, maximum current, active edge, required pulse width, maximum trigger rate, and whether a 3.3 V XIAO ESP32-S3 GPIO may drive it directly.
4. The physical meaning of the trigger edge and its delay to exposure start. Provide measured left/right exposure-start skew and trigger-to-exposure delay as p50, p95, maximum, jitter, and five-hour drift.
5. Whether libcamera metadata exposes an unambiguous sensor frame sequence number and sensor capture timestamp for every aggregate pair. Explain how a missing trigger, missing CSI frame, or duplicated frame can be detected and how the external trigger count can be mapped to the saved video frame count.
6. Whether external-trigger mode changes auto exposure, gain, white balance, maximum exposure time, or the advertised aggregate modes. State the supported exposure range at 30 triggers per second.
7. Bare weights and mechanical drawings for each 40 x 40 mm camera board, the UC-512 Camarray HAT, every cable, and the supplied hardware. State the longest validated camera-to-HAT and HAT-to-Pi FFC lengths at 2560 x 720 x 30 on Pi 5.
8. A factory option with the two optical centers fixed at 42 mm, and either the standard 120-degree diagonal lens or the closest lens to the Ego-OSCAR field of view. State horizontal, vertical, and diagonal FOV after ISP cropping. Do not substitute rolling-shutter or monochrome sensors.
9. A per-unit calibration option containing each camera's intrinsics and distortion and the rigid stereo transform at 1280 x 720 per eye. State the model, coordinate convention, units, calibration residual, and whether camera-to-IMU extrinsics can be added if we supply the IMU position.
10. A short original aggregate sample from the production revision, including rapid head motion, the corresponding libcamera metadata, exact capture command, and the per-unit calibration file.
11. Permission to retain, modify, sell, license, sublicense, and deliver all original and derived recordings made with purchased units for commercial machine-learning training and evaluation. Also identify the redistribution and long-term offline-use licenses for the required driver, tuning files, and metadata reader.

The evaluation purchase is conditional on points 1 through 6 being written into the quotation or attached specification. Please do not quote a different mono camera, independent unsynchronized cameras, or a Raspberry Pi 5 configuration that has not been validated with B0492R.

Best regards,

RootLens
Japan
```

送付前に記入する情報: 法人名、担当者名、会社メール、配送先。公開されていない会社情報を推測で埋めない。

## HAMPOへのUSB-3372 / Model 3290照会

宛先: `fairy@hampotech.com`

WhatsApp: `+86 158 1867 7270`

メーカーはUSB-3372-V1.0を評価用・量産用として注文可能と案内し、一般FAQでもサンプル注文に対応するとしている。公開購入ページと価格はなく、営業への問い合わせ、見積、仕様確認、支払い、検品、国際配送の順で購入する。Alibaba等にある3840×1080の有線EgoカメラはUSB-3372-V1.0の公開販売ページではないため、その商品ページから代用品を即時購入しない。

- [USB-3372-V1.0の公式発表](https://www.hampotech.com/news/hampo-launches-wifi-and-bluetooth-enabled-ego-camera-module-for-untethered-embodied-ai-data-collection/)
- [サンプル注文を案内する公式FAQ](https://www.hampotech.com/faqs/)
- [公式連絡先](https://www.hampotech.com/contact-us/)
- [AlibabaのHAMPO製3840×1080品](https://www.alibaba.com/product-detail/Hampo-Head-Worn-Binocular-Ego-Camera_1601904175062.html)は100米ドル・最低1台と表示されるが、USB-3372、Wi-Fi、Bluetoothの記載がなく、USB-3372の価格根拠に使わない。

### 一台を買う手順

1. 下記の短い文面をメールで送り、同じ内容をWhatsAppにも送る。
2. 返信後、`USB-3372-V1.0`、数量1、日本の配送先、同梱品、商品代、送料、発送日、到着目安を記載したProforma Invoiceを受け取る。
3. 同社の既存Alibaba商品を購入せず、USB-3372-V1.0専用の買い手保護付きAlibaba注文リンクを作ってもらう。作成できない場合はPayPalの買い手保護付き商品取引を依頼し、初回サンプルでT/TまたはWestern Unionを先に選ばない。
4. 注文画面とInvoiceの販売者名が`Dongguan Hampo Electronic Technology Co., Ltd.`で一致し、品名に`USB-3372-V1.0 WiFi stereo ego camera evaluation unit`が入っていることを確認して支払う。
5. 到着後に型番、左右映像、生IMU、校正ファイル、SDK、本体保存、USB動作を確認し、無線は技適または適法な試験条件を確認してから有効にする。

### 初回の購入問い合わせ

件名: Request to purchase one USB-3372-V1.0 sample

```text
Hello HAMPO team,

My name is Yudai Mori from RootLens in Japan. I would like to purchase one USB-3372-V1.0 WiFi stereo ego camera as an evaluation sample.

Could you please let me know whether you can ship one unit to Japan, what is included, the total price including shipping, the lead time, and how I can place the order?

Best regards,
Yudai Mori
RootLens
Japan
```

WhatsApp用:

```text
Hello, I’m Yudai Mori from RootLens in Japan. I’d like to purchase one USB-3372-V1.0 WiFi stereo ego camera as an evaluation sample. Can you ship one unit to Japan? Please let me know what is included, the total price including shipping, the lead time, and how to order. Thank you.
```

先方が購入可能と返信したら、注文書または支払リンクの品名を`USB-3372-V1.0 WiFi stereo ego camera evaluation unit`に固定する。筐体、保存媒体、電池または外部給電部、SDK、校正ファイルのどこまでが一台分に含まれるかを見積書で確定する。日本の技適がない場合は、無線を完全に停止してUSB接続と本体保存だけで評価できるかを支払前に確認する。

### 返信後・支払前に送る技術質問票

件名: USB-3372-V1.0 / Model 3290 technical confirmation and DDP Japan quote for 1 / 10 / 30 / 50 units

```text
Hello HAMPO team,

RootLens is a Japan-based project collecting egocentric stereo video and inertial data for commercial embodied-AI datasets. We are evaluating your USB-3372-V1.0 integrated wireless ego module and Model 3290 wired stereo camera against FPV Labs Ego-OSCAR.

Please quote each model separately for 1 evaluation unit, 10, 30, and 50 units delivered DDP to Tokyo, Japan. State the exact orderable part number and hardware revision, unit price, sample charge, included lens/cable/storage/battery/enclosure, freight, MOQ, production lead time, monthly capacity, warranty, and same-revision supply period. Do not combine the two products in one specification.

Before purchase, please provide an original recording made by the exact production revision being quoted. It should include rapid head motion, hand interaction, and a static calibration target. We need the original left and right color global-shutter images or encoded frames, every camera sequence number and capture timestamp, raw accelerometer and gyroscope samples with each measurement timestamp, and the exact per-unit calibration file.

For USB-3372-V1.0, please confirm:

1. Image sensor and lens part numbers, active color resolution per eye, exact sustained frame rate, stereo baseline, FOV, bit depth, output pixel/codec format, and whether the two original views can be exported independently without rectification, stabilization, overlays, or frame removal.
2. Left/right physical exposure synchronization method and measured exposure-start skew: p50, p95, maximum, and drift after five hours.
3. IMU part number, raw sample rates at 100/200/500 Hz, ranges, units, axes, filtering, batching, measurement-time definition, and whether acceleration and angular velocity retain one timestamp per physical sample.
4. Camera-to-IMU physical synchronization method and measured exposure-to-IMU timing error: p50, p95, maximum, and five-hour drift. State whether camera and IMU use one oscillator or how their clocks are mapped.
5. Per-unit calibration contents: both camera intrinsics/distortion, right-to-left extrinsics, IMU-to-camera extrinsics, camera-to-IMU time offset, calibration model, coordinate convention, units, and residuals.
6. Onboard recording format, SDK/API, supported SD capacity/file system, typical five-hour data size, file rollover behavior, and a five-hour QC report with expected/actual frame and IMU counts.
7. Whether recording all requested streams continues without interruption for at least five hours while an external USB battery is connected. State input voltage/current, measured power, thermal limit, complete module/headset weight, dimensions, and the exact battery/storage/enclosure needed.
8. Wi-Fi/Bluetooth Japanese radio certification. If not certified, confirm that all radios can be disabled while local recording and wired export continue without loss.

For Model 3290, please resolve one specification issue explicitly. Your product/news pages describe a hardware-synchronized onboard IMU, local TF-card MP4 + IMU CSV recording, host ROSbag/MCAP export, and factory camera-to-IMU calibration. Please state whether all of those functions are physically included in the exact Model 3290 part being quoted. If not, list the exact included functions and quote the orderable wired model that includes them. Also provide the maximum 5 V current, bare weight, mounting drawing, UVC descriptor, supported 3840 x 1080 at 30 fps MJPEG/H.264/H.265 modes, and the Linux SDK source or binary license.

Our purchase is conditional on the quotation or order acknowledgement confirming that RootLens owns recordings generated with the devices and may copy, modify, sell, transfer, license, and sublicense the original and derived recordings to third-party commercial AI customers. No recording may be uploaded to or used by HAMPO without our separate written opt-in. We also need perpetual offline access to the schema, calibration, and minimum reader needed to decode our recordings.

Best regards,
RootLens
Japan
```

送付前に記入する情報: 法人名、担当者名、会社メール、配送先。USB-3372と3290の回答・価格を混ぜず、型番ごとに注文書へ固定する。

## TOBIへのE2照会

評価根拠と発注条件は[TOBI E2評価記録](TOBI-E2-ASSESSMENT-2026-09-11.md)を参照する。

### 送信経路

- 第一宛先: `lk@langhuiai.com`。`langhuiai.com`には受信用MXがある。
- CC: `tobi@tobi.cn`。`tobi.cn`には2026-09-11時点でMXが見つからないため、これだけを宛先にしない。
- 製品ページ: https://www.tobi.cn/product-e2.html
- 製品モーダルは使わない。画面にメール欄がなく、送信データにも`email`を含めない一方、サーバーはメールを必須として拒否する。電話番号や本文の修正では解決しない。
- [ホームページ下部の問い合わせフォーム](https://www.tobi.cn/#contact)はメール欄を持ち、国際電話番号も受け付ける。メール欄は画面上では任意に見えるが、必ず入力する。

### ホームページ下部フォーム用本文（437文字）

`[YOUR EMAIL]`を実際の会社メールへ置き換える。

```text
Hello, I'm Yudai Mori from RootLens in Japan. We would like to purchase one TOBI E2 sample/evaluation unit. We mean the current lightweight model listed with dual 1080p60 RGB global-shutter cameras, a 1 kHz IMU, and 5+ hour recording. Please let us know availability for Japan, total price including shipping, lead time, and how to order. If the evaluation succeeds, we may purchase 10-50 units. Please reply by email in English: [EMAIL]
```

### 初回の直接メール

件名: Request to purchase one TOBI E2 evaluation unit

```text
Hello TOBI team,

My name is Yudai Mori from RootLens in Japan. We are interested in the current lightweight TOBI E2 listed on your website with dual 1080p60 RGB global-shutter cameras, a 1 kHz IMU, and more than five hours of recording.

We would like to purchase one E2 as a sample/evaluation unit. Could you please let us know whether it is currently available for shipment to Japan, the total price including shipping, the lead time, and how we can place the order?

If the evaluation is successful, we may consider purchasing 10 to 50 units. We would appreciate a reply by email in English.

Best regards,
Yudai Mori
RootLens
Japan
```

### 返信後・支払前に送る技術質問票

件名: TOBI E2 evaluation unit, raw sample, and Japan quotation for 1 / 10 / 30 / 50 units

```text
Hello TOBI team,

My name is Yudai Mori from RootLens in Japan. We collect synchronized egocentric stereo video and inertial data for commercial embodied-AI and VLA datasets. We are evaluating the production TOBI E2 as a lower-burden alternative to FPV Labs Ego-OSCAR. If one evaluation unit passes our acceptance tests, our next stages are 10, 30, and 50 units.

Please reply to the numbered items below in English and attach the supporting files.

1. Product identity and quotation

Please identify the exact orderable E2 model, hardware revision, firmware version, enclosure, and complete worn configuration. Your current pages show both <140 g / about 6 hours and <150 g / more than 5 hours, together with different enclosure images. Please state which version is now in production and send its signed or stamped datasheet, mechanical drawing, current unedited photographs, and bill of included accessories.

Please quote 1 evaluation unit and 10, 30, and 50 units delivered DDP to Tokyo, Japan. Include unit price, evaluation charge, storage card, accessories, freight, tax/duty handling, MOQ, lead time, monthly capacity, same-BOM supply period, warranty, DOA/return/RMA terms, and quotation validity. If DDP is unavailable, quote DAP and provide the HS code and country of origin.

2. Original sample package before purchase

Please provide a 10–20 minute unedited recording made by the exact production revision being quoted. It should contain rapid head rotation, normal hand interaction, and a stationary calibration target. We need:

- the separate original left and right files exactly as written by the device, without re-encoding, rectification, stabilization, overlays, resampling, or frame removal;
- every camera frame sequence number and capture timestamp, with the timestamp's clock domain and whether it represents exposure start, midpoint, or end;
- raw accelerometer and gyroscope values with one measurement timestamp for every physical IMU sample, plus units, axes, ranges, filters, and actual output rate;
- that physical unit's complete calibration file; and
- the schema, sample reader, and offline export instructions needed to decode the package.

Please state the image-sensor, lens, and IMU part numbers; native bit depth; actual sustained frame rate per eye; H.265 bitrate, rate-control mode and GOP; whether B-frames or variable frame rate are used; and the physical stereo baseline.

3. Synchronization and calibration evidence

Your current product matrix claims binocular hardware synchronization below 1 microsecond and binocular-to-IMU synchronization below 10 microseconds, while another current comparison page describes E2 as millisecond-class. Please provide the synchronization architecture, timestamp definitions, test method, raw test result, and p50, p95, maximum, and five-hour drift for both left-to-right exposure-start skew and camera-to-IMU timing residual. Host or file-arrival timestamps are not sufficient.

For each delivered serial number, please confirm that calibration contains both cameras' intrinsics and distortion models, right-to-left rotation and translation, camera-to-IMU rotation and translation, camera-to-IMU time offset, coordinate conventions, units, image resolution, reprojection residuals, and rectified vertical residuals.

4. Long-duration recording and power

Please provide a continuity/QC report for at least five hours of simultaneous 1920 x 1080 at 60 fps from both cameras plus the full-rate 1 kHz IMU while external power is connected. The report should show expected and actual frame/IMU counts, every drop and duplicate, timestamp reversals, file-rollover gaps, recording state during cable insertion/removal, device temperature, throttling, and file corruption checks.

Please state the battery cell voltage and watt-hours, measured average and peak system power, external input voltage/current, whether recording remains uninterrupted while charging, complete worn mass including battery/strap/card, supported microSD capacity and file system, included card, and typical five-hour data size.

5. Japan deployment and supply

Please provide the exact Wi-Fi/Bluetooth module part number and Japanese radio certification number. If it is not certified for Japan, confirm a persistent mode that completely disables all radio transmitters while local recording and USB export continue without loss. Please also provide the battery UN38.3 test summary and shipping documents required for Japan.

Please provide a current business-license copy for Hunan Tuobi Technology Co., Ltd., Unified Social Credit Code 91430100MA4R4G362C. State the contracting company, invoice issuer, payment-account beneficiary, warranty provider, shipping address, and return address. If any is Changsha Langhui Information Technology Co., Ltd. or another entity, please explain the legal relationship in writing. For the evaluation unit, please offer a payment method with buyer dispute protection if available.

6. Data ownership and offline availability

Please include the following condition in the quotation, order acknowledgement, or purchase agreement:

Buyer owns all recordings, sensor data, timestamps, calibration, metadata, and derived data generated through use of the devices. Buyer may retain, process, modify, de-identify, combine, sell, transfer, license, sublicense, disclose, and deliver the original and derived data to third-party commercial AI customers for training, testing, and evaluation. The vendor may not access, upload, retain, train on, or otherwise use those data without Buyer's separate written opt-in. These rights survive termination of device, software, firmware, cloud, and support services.

Please also confirm that recording and export require no cloud connection, subscription, online activation, or vendor account, and that we receive perpetual offline access to the format specification, calibration, firmware needed for the supplied revision, and minimum reader required to decode our recordings.

Finally, please offer a live video call before payment. In one unedited view, please show the quoted E2 unit and serial label, boot it, display both camera streams and IMU, begin recording on external power, stop it, and export the two original videos, IMU file, timestamps, and calibration file from that same unit.

We can review a reasonable mutual NDA if one is required before transferring the sample or test reports.

Best regards,
Yudai Mori
RootLens
Japan
```

評価機は、未編集サンプルと実機ライブデモを支払前に取得し、左右露光のp95が100 µs以下・最大500 µs以下、camera–IMU residualのp95が1 ms以下・最大2 ms以下、5時間driftが確認でき、日本着100,000円以下なら購入候補にする。少なくとも左右最大1 msを満たさない、時刻をhost到着時刻で代用する、または実測値を出さない場合は購入しない。

## VDEgoへのC2照会

宛先: sales@vdegoai.com

件名: VDEgo-C2 sample data and Japan quote for 1 / 10 / 30 / 50 units

Hello VDEgo team,

RootLens is a Japan-based egocentric data-collection project evaluating VDEgo-C2 against FPV Labs Ego-OSCAR. The public product page and shipping policy indicate that the Full Hat version can be ordered for delivery to Japan. Before placing the evaluation order, please provide an original, decrypted sample containing the unprocessed binocular video, per-frame timestamps, raw accelerometer and gyroscope data, trajectory, and the exact per-unit calibration file from current production firmware.

Please confirm and quote the following:

1. The exact color global-shutter sensor and lens part numbers, physical stereo baseline, resolution of each eye before side-by-side packing, and the calibrated camera model/distortion model.
2. Measured left-to-right exposure-start error and camera-to-IMU timing error with p50, p95, and maximum values, and the definition and clock domain of every CSV timestamp.
3. Whether buyers can export the original left and right frames independently without stitching, rectification, denoising, stabilization, frame-rate conversion, or irreversible filtering.
4. The available recording codecs. Your pages refer to MJPG/AVI, MP4, and H.265; please provide the exact five-hour file size and image-quality settings for 3840×1200 at 30 fps.
5. A five-hour continuity report showing frame counts, dropped/duplicate frames, file rollover behavior, IMU sample count, thermal conditions, and whether recording survives Wi-Fi loss.
6. Whether `calibration.json` includes both camera intrinsics/distortion, cam1-to-cam0 extrinsics, and IMU-to-camera extrinsics for each physical unit.
7. The physical mass of the Full Hat recorder, mount, cable, and supplied 20,000 mAh battery separately and together. The detailed specification graphic states approximately 210 g excluding the battery, while the page text states under 300 g and describes an all-in-one system; please identify exactly what each figure includes.
8. Whether the 20,000 mAh battery is included, its rated output energy, UN38.3 documents, and Japanese PSE status. If it is not suitable for Japan, please specify the required 5 V 3 A input and approved third-party cable/battery configuration.
9. The Japan shipping charge, Incoterm, HS code, radio certification for Wi-Fi/Bluetooth, warranty/RMA terms, and landed price for one Full Hat evaluation unit.
10. Unit price, MOQ, production lead time, monthly capacity, same-revision supply period, spare-unit terms, and firmware/SDK support for 10, 30, and 50 units.

Our intended use includes selling and licensing our own original and processed recordings to third-party embodied-AI customers. Please add the following condition to the quotation or purchase agreement:

> Buyer owns all original recordings, sensor data, timestamps, calibration, metadata, and all derived data generated through use of the devices. Buyer may retain, process, modify, de-identify, combine, sell, license, sublicense, disclose, and deliver those original and derived data to third-party customers for commercial machine-learning training, testing, and evaluation. The vendor has no right to access, upload, retain, train on, or otherwise use those recordings or derived data without Buyer's separate written opt-in. These rights survive any device, software, support, or firmware termination.

Please also state the SDK/decryption-tool license, offline activation requirements, runtime redistribution rights, fees, and how recordings remain readable if support or the product ends.

Best regards,

RootLens

送付前に記入する情報: 法人名、担当者名、会社メール、配送先。公開されていない会社情報を推測で埋めない。

## UNIPOSへの比較見積もり・仕様調査

宛先: sales@unipos.net / https://www.unipos.net/contact/

フォームは「調達依頼」「製品仕様・詳細調査」の項目を持ち、未掲載製品も1個から型番・URLを指定して相談できる。Dual-Egoは掲載済み。EGO1GSとVDEgo-C2は、メーカー直販より国内調達をまとめた場合の費用も比較する。

件名: 頭部装着型の同期ステレオ収録機 評価1台・量産10/30/50台の比較見積もり（EGO1GS / E2 / HAMPO / VDEgo-C2 / Dual-Ego / E6）

ユニポス ご担当者様

RootLensという、一人称視点の作業映像とセンサーデータを収集するプロジェクトで、研究開発用の頭部装着型収録機を検討しています。日本で初号機1台を評価し、要件を満たした機種を数十台へ展開する計画です。

以下の6機種について、各1台の比較見積もりと仕様調査をお願いします。6台の同時注文ではありません。

1. General Intelligence Labs EGO1GS
   https://www.gilabs.xyz/products/ego1gs
2. VDEgo-C2 Full Hat
   https://vdegoai.com/products/fpv-head-mounted-egocentric-camera-video-data-collection-camera
3. Orbbec Dual-Ego
   https://unipos.net/products/orbbec-robot-free-data-collection/
4. TOBI / Langhui E6 RGB全局快门版本（カラーのグローバルシャッター版）
   https://www.tobi.cn/product-e6.html
5. TOBI E2
   https://www.tobi.cn/product-e2.html
6. HAMPO USB-3372-V1.0、および同期IMU付きModel 3290
   https://www.hampotech.com/news/hampo-launches-wifi-and-bluetooth-enabled-ego-camera-module-for-untethered-embodied-ai-data-collection/
   https://www.hampotech.com/news/hampo-ego-camera-a-first-person-head-mounted-binocular-data-camera-with-built-in-imu-and-hardware-synchronization/

用途は、手作業・家事などの一人称映像、ステレオ深度を計算するための左右画像、および生IMUを長時間収集し、機械学習用データにすることです。比較基準はFPV Labs OSCARです。

必須の構成は次のとおりです。

- カラーのグローバルシャッター2眼を、各1280×720・30fps以上で同時に記録。両眼の元映像を取り出せること。
- 生の加速度・角速度を100Hz以上で記録し、各サンプルの測定時刻が得られること。
- 左右映像とIMUについて、ホストが受信した時刻ではなく機器側の測定時刻・フレーム番号・同期仕様が得られること。
- 各個体のレンズ校正、カメラ間およびカメラとIMU間の位置・姿勢校正が提供されること。
- 外部電源を接続した状態で、映像・IMUの取得を止めずに5時間以上記録できること。ファイル分割は可能ですが、取得の停止・再開を繰り返す構成は想定していません。
- 元の記録を自社の処理で読み、機械学習用データとして利用・納品できること。

見積もりには、本体1台、頭部保持具、標準電池、指定給電ケーブル、必要な保存媒体、収録ソフト、対応SDK、校正ファイル、実記録サンプルを含めてください。別の計算機が常時必要な場合は、必要機種・接続方法・価格を分けて記載してください。

型番別に、以下をご回答いただけると助かります。

1. 提供可能なハードウェアの版、左右RGBセンサーの品番とシャッター方式。特にDual-Egoはグローバルシャッター構成を確認したいです。
2. 30fps以上の連続記録での画像形式、圧縮設定、1時間の実データ量、IMUの実記録頻度、左右とIMUの同期精度、および露光時刻の定義。
3. 上記設定での5時間以上の連続運転条件、保存容量、電源仕様、消費電力、既存試験結果。E6はRGBグローバルシャッター版についてお願いします。
4. 頭部に保持する総重量と、その内訳。特にDual-Egoの200gが電池・保持具・計算部を含むかを確認したいです。
5. SDK・収録ソフトの対応OS、サンプルの提供時期、開発および取得データ利用の条件。
6. 日本への評価1台の供給可否、在庫または製作納期、本体・付属品・ライセンス・輸送・税金・手数料を含む円建て総額。
7. 同一構成を10台、30台、50台発注する場合の段階価格、最小発注数量、初回と継続発注の製造リードタイム、月間供給可能数、代替部品・型式変更時の通知条件、保証・交換用予備機の条件。

比較は低コストの構成を優先しています。要件を満たす最小構成でお願いします。要件を満たさない項目がある場合は、代替可能な型番と差分をご提示ください。

よろしくお願いいたします。

RootLens

送付前に記入する情報: 法人名、所属、氏名、返信先、電話番号。フォームの必須情報を推測で埋めない。

## Aria Gen 2企業向け申請

入口: https://ai.meta.com/aria-application/

実フォーム: https://docs.google.com/forms/d/e/1FAIpQLSdPuJsdfBVPAr_TLauVxQQdfjPAPEtGrOisH5DI625KZvH9uQ/viewform

フォームは企業情報、利用国、企業規模、利用する技術者数、1ページ以上の事業目的を求める。以下は事業目的欄用の原稿である。企業規模・法人名・技術者数・企業ドメインの連絡先は未記入。個人のGmailを企業連絡先に代用しない。

### Business goal statement

RootLens is developing a platform for collecting first-person recordings of everyday manual activities, including household tasks, for embodied AI and vision-language-action model development. Our website is https://rootlens.io. We are based in Japan and would like to begin with one Aria Gen 2 research kit for an engineering evaluation.

Our current collection platform uses an iPhone to record RGB video, LiDAR depth, inertial measurements, and associated motion information. We have also explored camera glasses as a way to reduce the burden on people performing their normal activities. Comfortable glasses make recording easier, but ordinary camera glasses do not necessarily provide the synchronized visual and inertial measurements needed for geometric reconstruction and motion analysis. Long cables to a waist-mounted recording unit also interfere with normal movement. We are therefore evaluating existing glasses platforms that combine a practical wearable form with accessible, calibrated sensor data.

We would use Aria Gen 2 to record first-person manual activities and evaluate whether its synchronized cameras and inertial sensors can support our data-collection workflow. Our intended starting configuration is the documented recording profile 10, with 30 fps RGB, 30 fps computer-vision camera streams, and 800 Hz inertial measurements. We would retain the original recordings, sensor timestamps, and device-specific calibration, and use the Project Aria tools to read the data. We are interested in visual-inertial trajectories, hand tracking, and geometry derived from the synchronized camera streams. We understand that Aria's monochrome tracking cameras and separate RGB camera differ from a synchronized color stereo camera pair, and would document those differences in our data specifications.

Our engineering comparison is FPV Labs' OSCAR collection system. The objective is to preserve useful sensor-rich egocentric data while reducing the wearing burden. We would assess temporal alignment, image and IMU continuity, calibration availability, visibility of hands and manipulated objects, storage requirements, and suitability for ordinary work. A key operating requirement is at least five hours of uninterrupted video and inertial acquisition. We prefer to record untethered on the internal battery; we also need to know whether an approved portable power source can be connected without interrupting acquisition when additional runtime is required. Splitting output files is acceptable provided acquisition continues without gaps. Based on the public Gen 2 Pilot Dataset profile 8 example, we estimate roughly 169 GB for five hours of raw VRS data, and roughly 220 GB for profile 10 under a simple pixel-rate scaling assumption. We would like to confirm the actual usable on-device storage, five-hour file size, supported power accessories, and sustained thermal and battery performance for profile 10.

Integration would use Aria's existing recording and transfer tools. We would add a reader for Aria recordings to our data-processing workflow, preserve the original timing and calibration, apply our existing face-blurring process where appropriate, and export data with explicit camera identities and coordinate conventions. The goal is to reuse the established recording platform while making the resulting data usable in our collection and delivery system.

The intended application includes the provision of collected training data to embodied-AI developers. Please advise which partnership and data-use terms apply to this activity, including sharing recordings or derived data with customers. We would also appreciate information on eligibility for a Japan-based company, provision of a single evaluation kit, pricing or loan arrangements, shipping, and access to the required recording and processing tools. This initial request is for evaluation of the hardware and integration path; we are not representing that a larger deployment or purchase quantity has already been committed.

In particular, please confirm whether the applicable device agreement allows us to (1) compensate participants for recording everyday manual activities, (2) enroll and train multiple participants as authorized adult users and reassign a device between participants, (3) sell or license the resulting original video and inertial recordings, as well as processed depth and pose data, to third-party customers for commercial model training, and (4) continue such collection as a recurring commercial data service in Japan. Please distinguish permission to conduct internal product research from permission to operate this data-collection and delivery service, and identify any separate approval or agreement required. We also need to understand the provision arrangement, fees or deposit, number of devices, project term, return conditions, and the process for adding authorized users.

Please also confirm that the supplied Aria Gen 2 hardware and its configured Wi-Fi, Bluetooth, GNSS, and Sub-GHz time-alignment functions may legally be operated in Japan, and identify any functions that must be disabled in Japan. For our five-hour requirement, please confirm the uninterrupted recording duration and required free storage for profile 10, rather than the general battery-life figure alone.

### 採択後の契約に入れるデータ利用条項案

フォームの `commercialization` 選択だけでは収録データの顧客販売まで許諾されたことにならないため、Research Kit契約、注文書、またはside letterに次の趣旨を入れる。メール回答だけで終わらせず、MetaとRootLensの両者を拘束する文書で確定する。

> **Company Data and Commercial Use.** “Company Data” means all sensor recordings, metadata, Machine Perception Services outputs generated from those recordings, annotations, processed or de-identified data, datasets, and models or other derivatives created by or for Company through use of the Aria Research Kit. As between Meta and Company, Company owns all right, title, and interest in Company Data. Company may collect Company Data in Japan through Company’s authorized adult employees, contractors, and research participants and may access, copy, retain, process, modify, de-identify, combine, disclose, distribute, license, sublicense, sell, and otherwise commercially exploit Company Data, including by providing datasets to third parties for training, testing, and evaluating machine-learning and embodied-AI systems. To the extent Meta has any rights necessary for those activities, Meta grants Company a worldwide, perpetual, irrevocable, royalty-free, transferable and sublicensable license to exercise them. These rights survive expiration or termination of this Agreement and return of the devices. This clause does not grant Company rights held by participants or bystanders, and Company remains responsible for applicable law, notices, consents, and deletion obligations.

最低限、次の範囲を削らずに合意する。

- 日本で、認定された成人の従業員・業務委託者・収録参加者が装着して収録できること。
- 生の映像・音声・IMU・校正・メタデータに加え、MPS出力、深度・姿勢、注釈、匿名化・加工データを対象に含めること。
- 顧客への有償納品、ライセンス、再許諾、および顧客による商用モデルの学習・評価を認めること。
- 研究期間の終了やAria端末の返却後も、既に収録したデータの権利が存続すること。
- Meta側に利用許諾が必要な権利が残る場合、その範囲について再許諾可能な商用ライセンスをRootLensへ付与すること。

### 申請時の選択

- 利用国: Japan。
- 事業用途は外部へのデータ提供を含むため、internal researchだけに限定して申告しない。
- オープンソース公開、公開論文、参加者数や導入規模は、合意していない約束として追加しない。
- 価格、貸与か購入か、日本発送、5時間の指定モード、取得データの顧客提供は回答を受けて確定する。
