# OSCAR MJPEGの無線・保存帯域を測る

実カメラの録画から、平均・バースト帯域、1時間の容量、仮定した通信速度で必要になるキューを計算する。ハードウェア性能そのものを測るコードではない。

Linuxでカメラを接続し、OSCARと同じ入力形式を確認する。

```sh
v4l2-ctl --device=/dev/video0 --list-formats-ext
ffmpeg -f v4l2 -input_format mjpeg -framerate 30 -video_size 2560x720 \
  -i /dev/video0 -map 0:v:0 -c:v copy -t 60 capture.mkv
ffprobe -v error -select_streams v:0 -show_streams -show_packets \
  -show_entries stream=codec_name,width,height:packet=pts_time,size \
  -of json capture.mkv > capture-packets.json
python3 mjpeg_budget.py capture-packets.json --service-mbps 32
python3 mjpeg_budget.py capture-packets.json --service-mbps 32 --outage 10:40
```

`--service-mbps` はTCPの公称リンク速度ではなく、実際のアプリのペイロード転送速度を入れる。32はEspressif掲載例に基づく仮入力で、M5Stack＋iPhoneでの測定値ではない。SD評価にも持続書き込み速度をMbpsへ換算して使えるが、書き込み停止や同時読出しは別途実測する。

入力はMJPEGの2560×720に限定する。H.264から作った値や単眼映像を誤って合否判断へ使わないためのチェック。fpsの違いは`observed_fps`、欠落の手がかりは`pts_gaps_over_50ms`で確認する。これらは露光カウンタとの対応を保証しない。

キュー計算は各JPEGが完成時刻に一括到着し、通信は指定速度で一定に排出すると仮定する。`--outage START:END` は録画先頭からの秒で、複数指定可能。SD書き込み・TCP・PSRAMの実装コストは含まない。平均に余裕があっても一時的な画像サイズ増大で溢れる例をテストに含めた。

```sh
python3 -m unittest discover -s . -v
```

テスト8件：一定入力、持続的な速度不足、長い切断、再接続後の回復、平均だけでは見落とすバースト、重複時刻、誤ったコーデック、重複する切断指定。

`synthetic-check.json` はFFmpegのtestsrc2で生成した3秒の人工MJPEGに対する検算結果。**実カメラ・無線の測定値ではない**。
