# 初号機の注文画面

> **発注停止:** この一括カートは2026-09-07のM5Stamp ESP32P4案である。現在の初号機では使わない。Raspberry Pi 5版の一括カートとDECXINの発注順は[2026-09-11の低価格経路](../research/existing-glasses/LOW-COST-DECISION-2026-09-11.md#raspberry-pi-5分離型の購入表)を使う。

確認日：2026-09-07。数量はすべて一個。次の二つのリンクは、この設計で固定した国内品を一括でカートへ入れる。

1. [スイッチサイエンス10品を一括でカートへ入れる](https://www.switch-science.com/cart/45672157806790:1,45672157774022:1,42672641278150:1,42461316907206:1,44973013139654:1,42464472301766:1,44096079331526:1,42382062125254:1,44239303442630:1,43699000213702:1)
2. [Amazon.co.jp 11品を一括でカートへ入れる](https://www.amazon.co.jp/gp/aws/cart/add.html?ASIN.1=B08214DJLJ&Quantity.1=1&ASIN.2=B0B21BNJVY&Quantity.2=1&ASIN.3=B0DR72C188&Quantity.3=1&ASIN.4=B01MFBMX8A&Quantity.4=1&ASIN.5=B09Z2YY1JF&Quantity.5=1&ASIN.6=B07CGC2618&Quantity.6=1&ASIN.7=B083DSPML5&Quantity.7=1&ASIN.8=B0C9HK95WM&Quantity.8=1&ASIN.9=B08JYBJ43B&Quantity.9=1&ASIN.10=B0FRRQG5ZV&Quantity.10=1&ASIN.11=B005C8RUWG&Quantity.11=1)

どちらも未ログインなら先にサインイン画面が出る。サインイン後、各品の数量が1であることを確認する。Amazonの線材は、`B09Z2YY1JF`が0.2平方mm・24 AWG、`B07CGC2618`が28 AWG・Box-1になっていることを商品名でも確認する。

| 注文 | 品数 | 商品価格 |
|---|---:|---:|
| スイッチサイエンス | 10 | 9,368円 |
| Amazon.co.jp | 11 | 27,055円 |
| 国内二店合計 | 21 | **36,423円** |

カメラは[DECXIN商品ページ](https://www.alibaba.com/pla/USB-2MP-Global-Shutter-Camera-Binocular_1601162804134.html)の販売元へ[この英文](SUPPLIER-QUESTIONS.md)を送り、回答と見積書に次が明記された個体を一台注文する。

- カラーのOmniVision OG02B10を二個搭載し、レンズ中心間42 mm。
- 一つのUSB機器から左右一体2560×720、Motion JPEG、毎秒30枚、JPEG 4:2:0。
- 左右の露光開始がハードウェア同期。
- 露光同期信号は3.3 Vプッシュプル、または3.3 Vへプルアップできるオープンドレイン。
- USB Type-Aプラグ付き200 mmシールドケーブルを同梱。
- 日本へ数量一個を発送。

カメラの商品表示価格約12,753円を加えた商品価格合計は49,176円。カメラ送料と輸入時費用3,000〜8,000円を含め、初号機の決済額は52,200〜57,200円を見込む。
