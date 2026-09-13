# 既存メガネをRootLensの撮影端末として利用する検討

現在の購入判断は[低価格経路の採用判断](LOW-COST-DECISION-2026-09-11.md)を正とする。TOBI E2の会社・製品・サイト監査と評価機の受入条件は[TOBI E2評価記録](TOBI-E2-ASSESSMENT-2026-09-11.md)に分離した。GenRobot DAS Egoは価格と369 gの装着重量から量産購入候補を外し、比較基準だけに残した。完成機の公開価格基準はGI EGO1GS、国内調達中心で直ちに組める価格下限はRaspberry Pi 5 / 1GBとEgo-OSCAR同系42 mmカメラを使う分離型である。新たにHAMPO USB-3372-V1.0とTOBI E2を低価格照会へ加え、原記録と日本着価格が既定の上限を通れば先に評価する。Arducam B0492RはPi 5対応・価格・供給経路が明確だが、完成約9.6万〜9.9万円になるためDECXINとHAMPOが不成立の場合の調達保険にする。日本への公開購入経路があるVDEgo-C2は、本体・送料だけで219,565円となり、低価格案にはならない。長い身体ケーブルは除外条件ではなく、頭部重量、総装着重量、引っ掛かり、着脱時間で評価する。

更新日: 2026-09-11

最新の価格別判断とPi分離型の発注構成は[2026-09-11の低価格判断](LOW-COST-DECISION-2026-09-11.md)、型番別比較は[2026-09-10の調査結果](DECISION-2026-09-10.md)、DAS Egoの公式実録検査は[DAS Egoの採用判定](DAS-EGO-ASSESSMENT-2026-09-10.md)、送付可能な照会原稿は[調達・Aria企業申請](PROCUREMENT-REQUESTS.md)にまとめた。以下の広い候補一覧は調査記録として残す。

## 目的と必須条件

最上位の目的は、**FPV LabsのOSCAR相当の情報量・計測品質を持つエゴセントリックデータを、普段の仕事中に負担少なく収集すること**である。データ品質の比較基準はOSCAR、装着と長時間運用の比較基準はユーザーが使用したMentra Liveとする。「カメラとIMUがある」「長時間録画できる」「軽い」という条件だけではOSCARの代替として評価しない。

必要な撮影データは、グローバルシャッターの左右同期映像、生の加速度・角速度、映像とIMUを対応付ける測定時刻・同期情報、および深度・姿勢推定に使える校正情報である。OSCAR相当かどうかは、これらの有無に加えて、映像の色・解像度・フレームレート・視野・基線長・圧縮、IMUの取得頻度、同期精度まで比較する。同じ部品を使うこと自体は目的ではないが、白黒の低解像度追跡カメラや後付けの受信時刻だけで同等と判定しない。

調べる対象は、既存のメガネ型デバイスをMentraの代替、またはRootLensの現場用撮影端末へ改修する案である。市販品、中古ARグラス、組立済み開発キット、研究機、試作機、メーカーの完成評価機を横断して探す。Voxelはその一例であり、未完成品だけに対象を限定しない。既存の筐体、カメラ、計算部分、電池、無線を活用し、自作アプリや小さな追加工作で不足を補う。OSCARのコードを使えれば有益だが、その流用を優先して一からハードウェアを組む案へ戻さない。

ユーザーが2026-09-10に明示した追加の必須条件は、装着中に外部給電しながら、5時間以上の連続動画撮影に耐え、IMUも収録できることである。以前Mentraを選んだ理由がこの条件である。他機種の合格を、IMUの搭載や開発キットの存在だけから推定しない。

連続収録の実装では、カメラとIMUの取得を継続しながら保存ファイルを分割する。短い撮影を停止・再開して合計5時間にする方式は要件の代用にならない。生IMUと映像の元の測定時刻を保存する。

日本からの調達が必須である。ユーザーは腰までのケーブルを邪魔と感じている。装着負担、ケーブルの取り回し、熱、現場での操作を比較する。深度と同期を含む豊かなデータ収集が目的であり、5時間条件を満たしても単眼RGBだけなら深度の課題が残る。従来の同期ステレオ・グローバルシャッター要件を黙って緩和しない。

## 具体的な追加候補と調達経路

以下は調査した既存プラットフォームの記録である。単眼のRokid・OSAIG・Neonなどは、そのままではOSCAR相当のデータを取得できない。代替として推薦するには、不足する同期ステレオ等を既存ハードの改修・追加で補う具体的な経路を示す必要がある。Nreal LightやVoxelなどの二眼機も、センサー構成の一部が揃うだけでOSCAR相当と判定しない。画像での見た目比較は、データ要件の評価を置き換えない。

調査時点の販売表示と、提供を相談できる窓口を以下に記録する。価格がある中古品も在庫の継続を保証するものではない。見積もり対象は日本への完成機1台の提供を確認するための候補であり、日本発送を確認済みという意味ではない。

| 候補 | 既存ハード・取得できるデータ | 我々が完成させる部分 | 調達経路 |
|---|---|---|---|
| Nreal Light / XREAL Light | RGB、左右640×480の白黒画像、生IMU、工場校正。公開ドライバーにカメラ時刻をIMU基準へ対応させる処理がある。106g（ケーブルを除く） | Androidの収録アプリ、RGBとステレオの同時取得、圧縮保存、欠落検査、深度処理 | [HardOff中古NR-9101GGL](https://netmall.hardoff.co.jp/product/6137381/)。税込22,000円＋地域別送料、カート表示あり。メーカー仕様と販売文の重量が食い違うため106gを採用 |
| XREAL Air 2 Ultra | 白黒ステレオの取得・復元・録画実装が2026年7月公開。IMU取得実装も存在。外向きRGBなし | Androidへの移植、画像とIMUの時刻対応。RootLensのカラー映像には別の対応が必要 | [ソフマップ中古A](https://a.sofmap.com/product_detail.aspx?sku=415320544)。55,980円＋送料550円の表示 |
| OSAIG / OpenSource-Ai-Glasses | 43gの組立済みLinuxメガネ。1080p、Wi-Fi、8GB。動画と加速度・ジャイロの同時記録コードあり | 生IMUの独立した時刻付き取得、圧縮映像と計測時刻をスマホへ保存。単眼であり、ステレオを解決した機種ではない | [作者掲載のキット](https://item.taobao.com/item.htm?id=1007109700786)／[予備リンク](https://item.taobao.com/item.htm?ft=t&id=1056653633568)。価格・日本発送は作者 iam5tilllearning@foxmail.com に見積もりを求める対象 |
| Voxel Glass | 既存試作機と公開SDK。左右画像、本体録画、生IMU、Wi-Fi転送の実装あり | 撮影時刻・フレーム番号を保つファームウェアと録画処理、左右の同期・校正。センサー型番と同期回路は未特定 | [SDK](https://github.com/physicalinc/voxel-sdk)作者Ahad Jawaid氏の[現行窓口](https://www.ahadjawaid.com/)、ahad@ahadjawaid.com。試作機・カメラアセンブリ・ファームウェアの提供相談。価格・在庫・日本発送は未確定 |
| Qualcomm QAR2130P / Snapdragon AR2 Gen 1 Smart Viewer Development Kit | 完成眼鏡型開発機。OG01A1Bグローバルシャッター2眼、RGB、加速度・ジャイロ・磁気、Wi-Fi、USB-C、600mAh | 生センサーアクセスを含む開発権限を取得し、録画と時刻・校正保存を実装 | Qualcomm顧客向け評価機。価格、最低数量、日本への提供は見積もり対象。一般向けSDKだけで追跡画像を取得できると推定しない |
| Goertek AR2 reference design | 105gの完成リファレンス眼鏡。RGBと追跡カメラ、無線を内蔵 | OEM評価機の生画像・IMU取得権限を確保して収録アプリを実装 | goertek@goertek.com。完成評価機1台と開発アクセスの相談。QAR2130Pと同一製品とは確認できていない |
| Project Aria Gen 2 | RGB、グローバルシャッター4眼（前方ステレオを含む）、生IMUほか。メーカーは連続収録6〜8時間を記載。研究用の録画・校正・時刻付きデータ処理を提供 | 必要なセンサー設定で記録し、RootLensへの入力変換を実装 | [研究キット申請](https://ai.meta.com/aria-application/)に企業向け別窓口あり。価格、日本提供、データの用途に対応する契約は申請側で確定 |
| Panocle | RGB・LiDAR・9軸IMUを予定する開発中の眼鏡。同社に既存のTrinet Stereo収録製品あり | 試作機の実データ取得APIを確保し、保存と同期情報を取り込む | [メーカー製品ページ](https://www.panoculonlabs.com/panocle)、innovate@panoculonlabs.com。公開画像は参考イメージであり、実機提供時期・価格は未公表 |
| Xvisio SeerFusion One | RGBグローバルシャッター2眼＋VGAグローバルシャッター4眼＋9軸IMU、同期、2TBカード、3〜6W。350g以下の頭部収録機 | 既存収録データと時刻・校正をRootLensへ変換 | [2026年7月20日メーカー発表](https://www.xvisiotech.com/CompanyNews/348)。contact@xvisiotech.com。完成機の見積もり対象。6月に米国展示、7月に中国公開。装着負担は軽い眼鏡と大きく異なる |
| HAMPO USB-3372-V1.0 | 1600×1200のカラーGS二眼、100/200/500 Hz IMU、ハードウェア時刻、個体校正、Wi-Fi/BT、機上保存を一体化したOEMモジュール | 5時間収録、camera–IMU外参、基線・fpsを固定し、頭部筐体へ組み込む | [2026年9月4日メーカー発表](https://www.hampotech.com/news/hampo-launches-wifi-and-bluetooth-enabled-ego-camera-module-for-untethered-embodied-ai-data-collection/)。評価・量産注文可、価格と日本納入は照会。[裸基板の校正・固定・受入手順](HAMPO-USB-3372-CALIBRATION-2026-09-11.md) |
| TOBI E2 | カラーGS 1080p60×2、65 mm、1 kHz IMU、H.265、microSD。150 g未満、内蔵電池5時間超を公称 | 左右・camera–IMUの実同期、原データ、校正、データ権を検収 | [メーカー製品ページ](https://www.tobi.cn/product-e2.html)。量産在售を掲げるが価格は照会、比較表では同期がミリ秒級 |
| Arducam B0492R | AR0234カラーGS二眼、Camarray HAT、外部トリガー。Pi 5で左右一体2560×720を最大94 fps。259.99米ドル | XIAO＋ICM-20948、Pi側のlibcamera入力、時刻対応、個体校正、頭部支持を実装。MIPIのためPiとHATを頭部近くへ置く | [公式製品ページ](https://www.arducam.com/arducam-2-3mp2-ar0234-color-global-shutter-synchronized-stereo-camera-bundle-kit-for-raspberry-pi.html)。Pi 5対応と公開購入経路あり。完成価格は約9.6万〜9.9万円なので供給予備 |
| CameVision EGO | 二眼カラーGS、二つのIMU、RV1126B、Wi-Fi、eMMCを一枚に搭載。199米ドル/台、最低10台 | 30 fps収録、センサー時刻、microSD、Wi-Fi、電池運用、校正を完成させる | [公式GitHub](https://github.com/Camemake/camevision-ego/)の現行実装は12.5 fps。基板メモもmicroSD・Wi-Fi・充電回路を未実証と記載するため、現在は購入しない |
| Pupil Labs Neon | 既存眼鏡／交換フレーム、単眼の周辺映像、生IMU、視線。メーカーがUSBハブを介した給電中収録を明示 | 公開API・記録形式からRootLensへ取り込み。外向きステレオ深度は別途必要 | [公式](https://pupil-labs.com/products/neon)6,250ユーロ〜、日本では[テガラ](https://www.unipos.net/info/neon_pupil_labs/)に取扱い。価格帯がOSCARやMentraと大きく異なる |

これらは採用候補の根拠であり、すべてが必須条件を達成済みという一覧ではない。外向きグローバルシャッター2眼を型番・一次仕様で確認できた追加候補はQAR2130P、Aria Gen 2、SeerFusion One。Nreal Light、Air 2 Ultra、Voxelのシャッター方式は未特定。OSAIG、Neon、Rokidの単眼をステレオとして扱わない。

### Nreal Lightを使う収録構成

眼鏡をUSBで外部給電し、接続ホストで映像・IMUを連続保存する。眼鏡側の短時間クリップ録画機能に依存しない。[MITライセンスのar-drivers-rs](https://github.com/badicsalex/ar-drivers-rs)に既存実装があり、[nreal_light.rs](https://github.com/badicsalex/ar-drivers-rs/blob/master/src/nreal_light.rs)は左右各640×480・30fpsの画像、校正情報、センサー時刻を読み出す。カメラ時刻にはプロトコル上37.6msの補正を加えてIMU時間軸へ対応させている。現在のAPIで捨てている加速度側の時刻も保存するよう修正する。

白黒ステレオを8bit無圧縮で5時間保存すると640×480×2×30×18,000 = 331.776GBになる。まずデータ品質を維持する基準構成は512GB以上のホスト保存領域とし、RGB分を別途加算する。小容量端末向けにはハードウェア圧縮を導入するが、圧縮条件を収録メタデータに残す。AndroidでのRGB・ステレオ・IMU同時動作、外部給電とUSB接続を両立するホスト構成は統合作業であり、公開ドライバーの存在だけで完成したとは扱わない。腰までのケーブルを標準配置に固定しない。

Air 2 Ultraの[2026年7月公開コード](https://github.com/sean9061/xreal-air2ultra-camera)は、旧来の市販ARグラスから生画像を得る別実装である。それ以前の[公開デコーダー](https://github.com/DeskUnreal/xreal-vio-vr/blob/main/parts/xreal.py)も存在するので、7月がカメラアクセスの初公開とは扱わない。7月の実装は毎秒60枚のUSBフレームから約30組の左右画像を取り出すが、[プロトコル資料](https://github.com/sean9061/xreal-air2ultra-camera/blob/main/docs/PROTOCOL.md)では画像内時刻とIMU時計の対応が未完成である。

### OSAIGを使う収録構成

発注時はIMU搭載の組立済み統合ハードウェアとUSB給電・データケーブルを指定する。[公開コード](https://github.com/Iam5tillLearning/OpenSource-Ai-Glasses/blob/main/samples/video_recorder/simple_vi_bind_venc.c)は動画フレームごとにIMUを1回読んでおり、IMU設定104Hzそのままの独立した連続ログではない。Linuxのセンサー取得機構を使ったバッファ読み出し・計測時刻・単位の保存へ改修する。

[カメラAPI](https://github.com/Iam5tillLearning/OpenSource-Ai-Glasses/blob/main/SDK/ai_glass_sdk/include/ai_camera.h)はH.265フレームにseq、pts_us、capture_ts_usを持つ。capture_ts_usの定義は露光時刻と確定せず、実装／作者仕様で照合する。眼鏡内で圧縮し、[既存Wi-Fi転送](https://github.com/Iam5tillLearning/OpenSource-Ai-Glasses/blob/main/docs/RTSP_VIDEO_STREAMING.en.md)を土台にスマホで保存する。元のフレーム番号と計測時刻を動画と一緒に送る。4Mbpsなら5時間で9GB、8Mbpsなら18GBなので内蔵8GBだけに保存し続ける構成は採らない。

メーカー記載の180mAh・録画45分を3.7Vと仮定して換算すると平均約0.89W、5時間約4.44Wh。これは同じ録画負荷の電力量目安であり、Wi-Fi転送負荷は上乗せされる。USB給電中に必要な負荷を支えられる充電回路かは型番・電源経路の確認対象になる。小さな電力量から熱停止の有無まで推定しない。

### Voxelを使う収録構成

左右のデバイスを制御してWi-Fi上のTCPでJPEGを取得する。Bluetoothは制御用であり、動画をBluetoothだけで転送する設計ではない。[公開SDK](https://github.com/physicalinc/voxel-sdk)には本体録画、画像・metadata取得、raw加速度・角速度・磁気の取得が実装されている。

公開動画ヘッダーはVXL0と画像サイズに続くJPEGで、デコーダーには撮影時刻が渡らない。左右ビューアーもホスト受信後の時刻を用い最大100msの差を許すため、そのままでは厳密な同期ステレオにならない。time_syncという名称の送受信メタデータも、センサー時計の同期を実装したものではない。元のJPEGを固定fpsのMP4へ並べ直す前に、ファームウェアから撮影時刻と番号を付けて保存する。左右露光の同期は、共有トリガーの有無と追加可否を確認する。時刻フィールドだけを付けても露光そのものは同期しない。

以前のJPEG平均40〜100KiB/枚という仮定は、OSCAR相当の転送経路を選ぶ根拠には使わない。[OSCAR論文v2](https://arxiv.org/html/2608.08285v2#S3)の元MJPEG 70〜80GB/時を基準にすると、左右合成30fpsの1フレームは平均約648〜741kB、映像だけで約156〜178Mbps、5時間で350〜400GBになる。Voxelがこの解像度・画質・転送量を維持できると確認した数値ではない。OSCARの保存用H.264は別の容量であり、元JPEGの帯域と混同しない。

公式購入リンクの不調だけで既存試作機を除外しない。SDK作者の現行サイトは2026年9月4日更新で、Physical Inc創業経験と連絡先を掲載している。会社ドメインより作者本人への試作機・設計資産の相談が具体的な窓口である。

### メーカー評価機・研究機

[QAR2130P仕様書](https://docs.qualcomm.com/bundle/publicresource/87-61722-1_REV_C_Snapdragon_AR2_GEN_1_Smart_Viewer_Development_Kit_Product_Brief.pdf)には追跡用OG01A1Bを2台、RGB OV8856、IMUを明記する。[センサーメーカー](https://www.ovt.com/products/og01a1b/)がOG01A1Bをグローバルシャッターと記載している。ソフト提供には契約があり、顧客向けに回路図・基板配置も提供される。生画像・生IMU・センサー時刻・校正値にアクセスできる評価契約を求める。一般の表示アプリ開発権限だけでは目的を満たさない。[Goertekの105g参照設計](https://www.goertek.com/en/content/details62_233801.html)は別の照会対象として残す。

Aria Gen 2の[公式仕様](https://facebookresearch.github.io/projectaria_tools/gen2/technical-specs/device/hardware)は連続収録6〜8時間、前方を含む4眼グローバルシャッター、記録可能な生IMUを示す。ただし6〜8時間という総括値を、全センサー最高設定での持続時間へ読み替えない。[既定収録プロファイル](https://facebookresearch.github.io/projectaria_tools/gen2/technical-specs/device/profile)で必要なデータと継続時間を指定して提供元と条件を合わせる。USB-Cと充電状態の取得APIがあり、充電しながら必要プロファイルを5時間録画する条件も申請時に含める。Gen 1は[マニュアル](https://facebookresearch.github.io/projectaria_tools/docs/ARK/glasses_manual/glasses_user_manual)が使用中のモバイルバッテリー充電を明示している。Gen 1の記述を無条件にGen 2へ転用しない。

SeerFusion Oneは公称3〜6Wから5時間15〜30Wh。メーカーは外部給電と継続運転を設計に含む。頭部重量350g以下を普通の仕事中の装着評価から落とさない。同社の[SeerLens W50R Pro仕様](https://cloud-1251007531.bcdn8.com/quans0818/uploads/20260903/SeerLens%20W50R_V2.2en.pdf)も確認したが、眼鏡336g＋外部計算部であり、小型メガネの候補としての優位は弱い。

Panocleは実物SDKや出荷済み眼鏡を確認できた製品ではない。同社が[Trinet Stereo](https://www.panoculonlabs.com/trinet)で同期2眼・IMU・校正を扱っていることを根拠に、組立済み試作機が得られるか照会する位置づけである。Neonは[メーカーが給電中の記録継続を明示](https://docs.pupil-labs.com/neon/hardware/using-a-usb-hub/)しており、既存フレームを流用できる研究機という別の選択肢になるが、単眼深度と価格の課題が残る。

## 引き続き比較する市販メガネ

| 機種 | 外部給電と長時間録画を実装する根拠 | 残る点 |
|---|---|---|
| Mentra Live | ユーザーの運用上の比較基準。リポジトリの`glasses/`に自作Android録画・生IMU取得の実装がある | 他機種にも同じ連続運転能力があるとは推定しない |
| RayNeo X3 Pro | メーカーが充電中の使用を明記。標準Android Camera2と生IMU取得を公開。Androidスマホへの映像転送サンプルもある | 給電＋動画＋IMUで5時間連続運転した公開実績は未確認。二眼同時取得・露光同期も別途未確定 |
| Rokid Glasses（表示あり） | 公式の本体アプリ開発資料にAndroid 12、CameraXによる独立した動画録画、SensorManagerによる生加速度・角速度取得がある。サンプルの動画録画処理に時間上限の指定はない | 標準アプリの時間制限と自作録画の可否は別。給電中の使用は案内されるが、5時間連続の動画・IMU収録実績は未確認 |
| Rokid AI Glasses Style | 日本向け予約、IMU・開発キット対応の記載がある | 表示付きモデルの本体アプリ開発経路が、同じ範囲でStyleにも適用できるとはまだ確認できない。5時間要件の達成済み候補として扱わない |
| Ray-Ban Meta等 | 標準動画は最大3分。スマホ向け開発キットには別のストリーミング経路がある | 開発キットの存在だけでは、5時間の外部給電録画と生IMU取得を満たしたことにならない |

標準アプリのクリップ上限が、自作アプリにも適用されるとは限らない。反対に、自作アプリのコードに時間上限がないことは、端末が熱や給電上の理由で停止しないという証明ではない。

Rokidの本体アプリ導入には、公式資料上、付属の充電ケーブルとは別の開発ケーブルが必要である。国内向けファームウェアへの適用と開発ケーブルの調達価格は未確認。表示ありモデルのサンプルをStyleにもそのまま適用できるとは扱わない。

## 5時間分の保存容量

映像の合計ビットレートからの計算値（10進GB、音声・IMU・メタデータを除く）は次の通り。

| 映像合計 | 5時間分 |
|---|---:|
| 8 Mbps | 18 GB |
| 12 Mbps | 27 GB |
| 16 Mbps | 36 GB |

32 GBの公称ストレージにはOSも入るため、必要容量と実際の空き容量を比較する。容量が不足する場合は、確定済み録画ファイルをスマホへ転送し、受信・検証後にメガネ側から削除する方式が候補になる。転送中も映像・IMUの取得と元時刻の記録を継続する。端末やスマホのOSごとの対応を確認し、Android用Wi-Fi DirectサンプルがiPhoneでもそのまま動くとは扱わない。

## 一次資料

- [RayNeo: 充電中の使用と同梱ケーブル](https://www.rayneo.com/pages/x3-pro-launch)
- [RayNeo: Camera2](https://rayneo-en.gitbook.io/rayneo-devdoc/x-series/android-sdk/capabilities-and-api/camera-development)
- [RayNeo: 生IMU](https://rayneo-en.gitbook.io/rayneo-devdoc/x-series/android-sdk/capabilities-and-api/imu-data-acquisition)
- [RayNeo: Androidスマホへの映像転送](https://rayneo-en.gitbook.io/rayneo-devdoc/x-series/android-sdk/application-scenario-examples/live-streaming-relay-via-mobile-app)
- [RayNeo: 電源・ストレージ仕様](https://rayneo-en.gitbook.io/rayneo-devdoc/x-series/device-introduction)
- [Rokid: 本体アプリ開発入口](https://ar.rokid.com/sprite?lang=en)
- [Rokid: 本体アプリ開発資料](https://custom.rokid.com/prod/rokid_web/ff28c865a9634876be98cbc293588460/pc/us/index.html?documentId=d43738accccd44a1866a59b3495ad39f)
- [Rokid: 生IMU取得](https://custom.rokid.com/prod/rokid_web/ff28c865a9634876be98cbc293588460/pc/us/index.html?documentId=28007d95eb7a46828f9ac7f19421867a)
- [Rokid: APK導入](https://custom.rokid.com/prod/rokid_web/ff28c865a9634876be98cbc293588460/pc/us/index.html?documentId=63837f8f9e3d4f3387517b224e5c9875)
- [Rokid: 公式サンプル](https://rokid-ota.oss-cn-hangzhou.aliyuncs.com/toB/Document/CXR_Bare/GlassesBareDevSample.zip)
- [Rokid: 公式FAQ](https://global.rokid.com/pages/faq)
- [Ray-Ban: 標準動画の長さ](https://www.ray-ban.com/usa/ray-ban-meta-ai-glasses)

RayNeo資料の「5 hours recording」は動画5時間の根拠にしない。動画と音声の記載が別である。また仕様の「5V、最大充電電流735mA」は電流の測定位置が明示されていないため、録画に使えるUSB入力電力を3.675Wと確定しない。
