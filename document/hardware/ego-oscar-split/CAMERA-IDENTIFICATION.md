# Ego-OSCARカメラの同定と注文仕様

調査日：2026-09-07。初号機は、DECXIN製、OmniVision OG02B10を二個載せたカラー・グローバルシャッター・同期ステレオUSBカメラの**42 mm基線版**を注文する。日本へ数量一個を発送できる販売窓口は[Alibaba商品ID 1601162804134](https://www.alibaba.com/pla/USB-2MP-Global-Shutter-Camera-Binocular_1601162804134.html)。ページ表示は約12,753円である。

## 同定の根拠

| 項目 | 根拠 |
|---|---|
| メーカー表記 | 論文のDexcinと、販売元Shenzhen Dechuangxin Imaging TechnologyのDECXINは、カメラ種別と基板配置が一致する |
| センサー | FPV LabsのSTERA One Rev 1.0仕様にOG02B10×2と明記 |
| シャッター | 論文と販売品がグローバルシャッターを明記 |
| 基線 | 論文、FPV Labs仕様、公開CADで42 mm |
| 画角 | 論文と仕様は各126°。水平・垂直・対角の区別は販売元回答で固定する |
| USB映像 | 一つのUSB Video Class機器として左右横並び2560×720 Motion JPEG、30枚/秒 |
| 露光同期 | カメラの露光同期端子をXIAO ESP32S3へ入れ、慣性センサー行のフレーム同期番号・時間差と対応させる |

一次資料は[Ego-OSCAR論文 §3.1.1](https://arxiv.org/html/2608.08285v2#S3.SS1.SSS1)、[製作ガイド](https://docs.google.com/document/d/1dvJL8DUp5scAC98Ftn1m2_ct00IfqAN9NuJ8NyL8t5I/edit)、[FPV Labs仕様PDF](https://drive.google.com/file/d/1ZMgKqFdM65cAtcaI2s7SHr3Z-DljlHbe/view)、[公開CAD](https://www.fpvlabs.ai/ego-oscar/cap)。OG02B10自体が1280×720へ対応することは[OmniVision製品ページ](https://www.ovt.com/products/og02b/)で確認できる。

## 販売ページと注文個体を区別する

同じ販売元は65 mmや120 mm基線、白黒センサー、異なるレンズのカメラも同じ商品群へ載せている。このため、商品名や代表画像だけで42 mm版が届くとは扱わない。[発注先への確認文](SUPPLIER-QUESTIONS.md)で次を回答させ、注文書へ固定する。

- OG02B10カラー二個、42 mm基線、約126°のレンズ品番。
- 左右の露光開始がハードウェア同期され、その最大ずれが示されること。
- 一つのUSB 2.0 High Speed機器から2560×720・毎秒30枚のMotion JPEGが出ること。
- JPEGの色差間引きが4:2:0であること。
- 露光同期信号と接地が引き出され、電圧、極性、出力形式、露光開始に対応するエッジが示されること。
- 基板寸法、穴位置、重量、最大5 V電流、USB Type-Aプラグ付き200 mmシールドケーブル。

## 筐体へ使う参考寸法

FPV Labs公開CADの`Stereo Camera v6:1`では左右配置のX座標差が42 mm、カメラ基板はおよそ60×30×1.65 mm、レンズ前端まで約26.4 mm。公開CADファイル`stereo_cap.glb.gz`の取得時SHA-256は`b8d09daa17a801cf0f4c4c223e774fc5d2bc9be81807f77a5a8780d80d3ce8d0`。

この寸法に対して初号機の支持板を70×35 mmへ固定した。販売元の穴位置にかかわらず、支持板の2.54 mm穴へ通した糸でカメラ基板外周を留められる。左右カメラと慣性センサーは同じ剛体へ固定し、組立後にステレオ内部・外部パラメーターとカメラ対慣性センサーの姿勢を校正する。
