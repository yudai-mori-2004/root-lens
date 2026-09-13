# HAMPO USB-3372-V1.0の校正と裸基板実装

更新日: 2026-09-11

## 結論

裸基板で届くこと自体は再校正の理由にならない。左右カメラ、レンズ、IMUを載せた基板を一つの剛体として扱い、レンズ鏡筒を回さず、基板を曲げずに筐体へ固定する。個体別の工場校正ファイルを最終マウント状態で検証し、合格した項目はそのまま使う。不足または不合格の項目だけを再校正する。

[USB-3372-V1.0の公式発表](https://www.hampotech.com/news/hampo-launches-wifi-and-bluetooth-enabled-ego-camera-module-for-untethered-embodied-ai-data-collection/)が明記するのは、各個体に固有の校正ファイル、カメラ内部パラメータ、歪み係数である。外部パラメータは`plus extrinsics where applicable`としか書かれておらず、左右ステレオ外参とcamera–IMU外参のどちらが含まれるかは確定していない。ハードウェアトリガーによる左右同期と、カメラフレームに同期するIMUハードウェア時刻は別に公称されているが、timestampの測定点と固定時刻差は未公開である。

## 評価機と一緒に受け取るもの

個体シリアル番号に対応し、実際に使う解像度・fps・crop/binning設定に有効な次の値を受け取る。

- 左右それぞれの投影モデル、内部パラメータ、歪みモデルと係数、解像度
- 左カメラと右カメラの回転・並進、変換方向、単位
- IMUと基準カメラの回転・並進
- camera–IMUの時刻差、時計領域、timestampが露光開始・中央・終了のどれを示すか
- IMUの軸、単位、範囲、出力レート、ノイズ密度、bias random walk、SDKが適用する補正
- 校正日、校正残差、ハードウェアrevision、firmware/SDK版

保存形式は[Kalibrの`camchain.yaml`と`imu.yaml`](https://github.com/ethz-asl/kalibr/wiki/yaml-formats)へ変換できる形にする。メーカー原本とRootLensで採用した変換済みファイルは別々に保持し、各収録へ校正IDを記録する。

先方が一台を販売可能と返信した後、次の一段落を送る。

```text
Please confirm that this exact USB-3372-V1.0 sample will include its serial-number-matched calibration file. Please state whether it contains the left/right camera intrinsics and distortion, stereo rotation and translation, camera-to-IMU rotation and translation, and camera-to-IMU time offset, and which resolution/FPS profile the calibration is valid for.
```

## 筐体への固定

- 基板の取付穴をスペーサで支持し、レンズ台座や基板中央を上下から挟まない。
- ケーブルと電源線には筐体側で引張逃がしを設け、基板へ曲げ荷重を伝えない。
- M12レンズのフォーカス位置とロック状態を出荷時から変えない。
- 保護窓を追加する場合は平行で反射の少ないものを使い、装着した状態で検証する。
- 下向き角度は基板全体を回転させて作る。左右カメラとIMUの相対位置が変わらないため、内部ステレオ校正とcamera–IMU校正は変わらない。必要なら筐体または頭部座標からカメラ座標への固定変換だけをCAD値または治具測定で記録する。

## 一台目の受入検証

電源投入後10分以上置き、実際の筐体、保護窓、解像度、fpsで検証する。次の数値はRootLensの初期受入基準であり、HAMPOまたはOSCARの公式規格ではない。

1. 既知寸法のAprilGridを中央、四隅、複数距離、複数傾斜で撮る。工場値を固定した独立データで、左右各カメラの再投影誤差をRMS 0.5 px以下、95百分位1.0 px以下とする。良好な目標値は0.1〜0.2 pxである。
2. 工場ステレオ外参で整流し、対応点の縦方向ずれを95百分位1.0 px以下とする。
3. 静止したAprilGridの前で基板を全軸に回転・並進させ、左右画像と生IMUを同時収録する。予測運動とIMU、camera–IMU時刻差、残差を確認する。[Kalibrのcamera–IMU手順](https://github.com/ethz-asl/kalibr/wiki/Camera-IMU-calibration)に合わせ、十分な照明、短い露光、全軸の運動を使う。
4. 10分収録で左右frame ID、camera timestamp、IMU timestampについて逆転、重複、無申告欠落がないことを確認する。
5. OSCARと同じ首振り・歩行・手作業を三回記録し、選定したVIO/SLAMで初期化失敗と追跡リセットを数える。

## 再校正する条件

- 工場ファイルに左右外参がない、またはステレオ検証が不合格: KalibrまたはOpenCVで左右外参を求める。内部値が合格ならOpenCVの`CALIB_FIX_INTRINSIC`で固定する。
- camera–IMU外参または時刻差がない、あるいは動的検証が不合格: Kalibrでcamera–IMUの空間・時間校正を行う。
- レンズまたはフォーカスを動かした、左右カメラの相対位置を変えた、基板を曲げた: カメラ内部と左右外参を再校正する。
- IMU取付、firmware、SDK、timestamp付与方式を変えた: camera–IMUの空間または時間校正を再実施する。
- 落下、筐体交換、締付変更の後: 先に同じ受入検証を行い、不合格項目だけ再校正する。

