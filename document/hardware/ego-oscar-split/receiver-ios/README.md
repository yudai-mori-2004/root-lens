# iPhone受信ライブラリ

`EgoReceiverCore`は、映像処理基板の録画を安全に停止し、確定済み5分チャンクをiPhoneへ保存するSwift Packageである。TCPが任意のバイト位置で分割されても4 byte応答、40 byteヘッダー、payloadを再構成し、CRC32、通し番号、チャンク全体のSHA-256を確認する。検査が終わるまで`.partial`、成功後だけ`.eos2`になる。

## RootLensアプリへの追加

Xcodeで`app/ios`のworkspaceを開き、File → Add Package Dependencies → Add Localを選び、この`receiver-ios`ディレクトリを指定する。受信画面のtargetへ`EgoReceiverCore`を追加する。`Info.plist`には次を追加する。

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>頭部カメラから撮影チャンクを受信します。</string>
```

端末設定で`RootLens-Ego`へ接続した後、停止、確定待ち、全チャンクの取得を次の一回の呼び出しで行う。最大チャンク番号を先に取得するため、突然の電源断で確定番号に欠番があっても、その後のファイルまで回収する。取得済み番号と欠番は飛ばす。

```swift
import EgoReceiverCore

let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
let captureDirectory = documents.appendingPathComponent("ego-capture", isDirectory: true)
let downloader = EgoCaptureDownloader(
    directory: captureDirectory,
    onChunkSaved: { index, url in
        print("verified chunk \(index): \(url.lastPathComponent)")
    },
    completion: { result in
        print("head camera transfer: \(result)")
    }
)
downloader.stopAndDownloadAll()
```

接続が準備できるとライブラリが`GET2`と4 byteのチャンク番号を送る。映像処理基板は`OKAY`に続けてファイルを返す。録画中なら`EgoTransferError.recordingActive`、番号がなければ`chunkMissing`、映像処理基板内部の失敗なら`deviceFailure`を返す。接続が閉じ、`.eos2`が存在すれば次の番号で新しいwriterとclientを作る。すでに`.eos2`がある番号は要求しない。`.partial`だけが残った番号は同じ番号を再要求すると、古い一時ファイルを消して先頭から取り直す。

`stopAndDownloadAll()`は、センサー停止、現在チャンクのSHA-256確定、`DONE`受信、最大チャンク番号の取得、チャンク取得を順番に実行する。完了クロージャの成功値は今回新しく保存したチャンク数である。転送を後で行う場合は`EgoHeadControl.requestGracefulStop`で`DONE`まで待ち、次回接続時に`downloadAllAfterStopped()`を呼ぶ。

録画中はmicroSDへの記録に専念し、停止完了後に全チャンクを転送する。通常設定では一時間5.4 GBなので、受入れ下限22.5メガビット/秒で約32分、90分なら約48分かかる。転送中はiPhoneの受信画面を前面に置き、頭部デバイスの電源を保つ。切断してもmicroSDの正本は残り、同じチャンクを先頭から取り直せる。

## テスト

```bash
swift test
```

八件のテストは、TCPを複数位置で分断した応答とレコードの復元、途中で切れたレコードの拒否、録画中・欠番・内部失敗応答、最大チャンク番号、正常チャンクの原子的保存、SHA-256不一致の拒否、CRC32既知値を含む。

iPhone向けとしても次のコマンドでコンパイル済みである。

```bash
xcodebuild \
  -scheme EgoReceiverCore \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/EgoReceiverCoreDerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

2026-09-07時点で八件すべて成功し、iOS Simulator向けビルドも`BUILD SUCCEEDED`まで完了している。
