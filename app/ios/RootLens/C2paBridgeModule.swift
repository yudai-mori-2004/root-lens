import Foundation

/// 仕様書 §4.6 C2PA SDK統合
/// React Nativeネイティブモジュール: c2pa-bridge (.a) をC FFI経由で呼び出す
@objc(C2paBridge)
class C2paBridgeModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// C2PA署名を実行する
  @objc
  func signContent(_ imagePath: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      NSLog("[C2paBridge] signContent called with: \(imagePath)")

      // 開発用証明書を読み込む
      guard let certChain = Self.loadBundleResource("dev-chain", ext: "pem"),
            let privateKey = Self.loadBundleResource("dev-device-key", ext: "pem") else {
        NSLog("[C2paBridge] Dev certs not found")
        reject("CERT_ERROR", "開発用証明書が見つかりません", nil)
        return
      }
      NSLog("[C2paBridge] Certs loaded: chain=\(certChain.count) chars, key=\(privateKey.count) chars")

      // 入力ファイルを実パスに変換
      guard let inputPath = Self.resolveToFile(imagePath) else {
        NSLog("[C2paBridge] Input file not found: \(imagePath)")
        reject("FILE_ERROR", "入力ファイルが見つかりません: \(imagePath)", nil)
        return
      }

      let fileSize = (try? FileManager.default.attributesOfItem(atPath: inputPath)[.size] as? Int) ?? 0
      NSLog("[C2paBridge] Input file: \(inputPath) (\(fileSize) bytes)")

      // 出力先
      let ext = (inputPath as NSString).pathExtension.isEmpty ? "jpg" : (inputPath as NSString).pathExtension
      let outputPath = NSTemporaryDirectory() + "c2pa_signed_\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"

      let result = c2pa_sign_image(
        inputPath.cString(using: .utf8),
        outputPath.cString(using: .utf8),
        certChain.cString(using: .utf8),
        privateKey.cString(using: .utf8)
      )

      NSLog("[C2paBridge] nativeSignImage result: \(result)")

      switch result {
      case 0:
        let outSize = (try? FileManager.default.attributesOfItem(atPath: outputPath)[.size] as? Int) ?? 0
        NSLog("[C2paBridge] Sign success: \(outputPath) (\(outSize) bytes)")
        resolve(outputPath)
      case -1:
        reject("ARG_ERROR", "引数エラー", nil)
      case -2:
        reject("SIGN_ERROR", "署名エラー (code: \(result))", nil)
      default:
        reject("UNKNOWN_ERROR", "不明なエラー: \(result)", nil)
      }
    }
  }

  @objc
  func getVersion(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve("c2pa-bridge 0.1.0")
  }

  // MARK: - Helpers

  /// バンドルからリソースファイルを読み込む
  private static func loadBundleResource(_ name: String, ext: String) -> String? {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
      return nil
    }
    return try? String(contentsOf: url, encoding: .utf8)
  }

  /// パスまたはfile:// URIを実ファイルパスに変換
  private static func resolveToFile(_ path: String) -> String? {
    if path.hasPrefix("/") {
      return FileManager.default.fileExists(atPath: path) ? path : nil
    }

    if path.hasPrefix("file://") {
      let url = URL(string: path)
      if let filePath = url?.path, FileManager.default.fileExists(atPath: filePath) {
        return filePath
      }
      return nil
    }

    // ph:// (Photos library) — キャッシュにコピーが必要だが、
    // EditScreenからはfile:// URIで渡される想定
    return nil
  }
}
