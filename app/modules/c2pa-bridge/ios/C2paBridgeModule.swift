import ExpoModulesCore
import Photos
import AVFoundation
import MobileCoreServices
import C2paBridgeFFI

// 仕様書 §4.6 C2PA SDK統合
// Expo Modules APIでc2pa-bridge (.a) をC FFI経由で呼び出す

public class C2paBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("C2paBridge")

    AsyncFunction("signContent") { (imagePath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        NSLog("[C2paBridge] signContent called with: \(imagePath)")

        guard let certPath = Bundle.main.path(forResource: "dev-chain", ofType: "pem"),
              let keyPath = Bundle.main.path(forResource: "dev-device-key", ofType: "pem"),
              let certChain = try? String(contentsOfFile: certPath, encoding: .utf8),
              let privateKey = try? String(contentsOfFile: keyPath, encoding: .utf8) else {
          NSLog("[C2paBridge] Dev certs not found")
          promise.reject("CERT_ERROR", "開発用証明書が見つかりません")
          return
        }

        NSLog("[C2paBridge] Certs loaded: chain=\(certChain.count) chars, key=\(privateKey.count) chars")

        Self.resolveToFile(imagePath) { inputPath in
          guard let inputPath = inputPath else {
            NSLog("[C2paBridge] Input file not found: \(imagePath)")
            promise.reject("FILE_ERROR", "入力ファイルが見つかりません: \(imagePath)")
            return
          }

          let fileSize = (try? FileManager.default.attributesOfItem(atPath: inputPath)[.size] as? Int) ?? 0
          NSLog("[C2paBridge] Input file: \(inputPath) (\(fileSize) bytes)")

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
            promise.resolve(outputPath)
          case -1:
            promise.reject("ARG_ERROR", "引数エラー")
          case -2:
            promise.reject("SIGN_ERROR", "署名エラー (code: \(result))")
          default:
            promise.reject("UNKNOWN_ERROR", "不明なエラー: \(result)")
          }
        }
      }
    }

    AsyncFunction("readManifest") { (imagePath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        NSLog("[C2paBridge] readManifest called with: \(imagePath)")

        Self.resolveToFile(imagePath) { inputPath in
          guard let inputPath = inputPath else {
            NSLog("[C2paBridge] Input file not found: \(imagePath)")
            promise.resolve("{\"has_manifest\":false,\"error\":\"file not found\"}")
            return
          }

          let resultPtr = c2pa_read_manifest(inputPath.cString(using: .utf8))
          if let resultPtr = resultPtr {
            let json = String(cString: resultPtr)
            c2pa_free_string(resultPtr)
            NSLog("[C2paBridge] readManifest result: \(json)")
            promise.resolve(json)
          } else {
            promise.resolve("{\"has_manifest\":false,\"error\":\"null result\"}")
          }
        }
      }
    }

    AsyncFunction("applyMasks") { (imagePath: String, masksArray: [[String: Double]], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        Self.resolveToFile(imagePath) { inputPath in
          guard let inputPath = inputPath,
                let image = UIImage(contentsOfFile: inputPath) else {
            promise.reject("FILE_ERROR", "入力ファイルが見つかりません")
            return
          }

          let size = image.size
          let renderer = UIGraphicsImageRenderer(size: size)
          let masked = renderer.image { ctx in
            image.draw(at: .zero)
            ctx.cgContext.setFillColor(UIColor.black.cgColor)

            for mask in masksArray {
              let x = CGFloat(mask["x"] ?? 0)
              let y = CGFloat(mask["y"] ?? 0)
              let w = CGFloat(mask["w"] ?? 0)
              let h = CGFloat(mask["h"] ?? 0)
              let rotation = CGFloat(mask["rotation"] ?? 0) * .pi / 180

              ctx.cgContext.saveGState()
              ctx.cgContext.translateBy(x: x + w / 2, y: y + h / 2)
              ctx.cgContext.rotate(by: rotation)
              ctx.cgContext.fill(CGRect(x: -w / 2, y: -h / 2, width: w, height: h))
              ctx.cgContext.restoreGState()
            }
          }

          // UIGraphicsImageRenderer は JPEG/PNG のみ出力可能。HEIC等の場合もJPEGで保存し、
          // 拡張子を実際のエンコード形式に合わせる（c2pa-rsが拡張子からMIMEを判定するため）
          let inputExt = (inputPath as NSString).pathExtension.lowercased()
          let isPng = inputExt == "png"
          let outputExt = isPng ? "png" : "jpg"
          let outputPath = NSTemporaryDirectory() + "masked_\(Int(Date().timeIntervalSince1970 * 1000)).\(outputExt)"
          let data: Data?
          if isPng {
            data = masked.pngData()
          } else {
            data = masked.jpegData(compressionQuality: 0.95)
          }

          guard let data = data else {
            promise.reject("ENCODE_ERROR", "画像のエンコードに失敗しました")
            return
          }

          try? data.write(to: URL(fileURLWithPath: outputPath))

          // EXIF日時をコピー（Photos libraryのcreationDateに必要）
          if !isPng {
            let inputURL = URL(fileURLWithPath: inputPath) as CFURL
            let outputURL = URL(fileURLWithPath: outputPath) as CFURL
            if let srcRef = CGImageSourceCreateWithURL(inputURL, nil),
               let srcProps = CGImageSourceCopyPropertiesAtIndex(srcRef, 0, nil) as? [String: Any],
               let exifDict = srcProps[kCGImagePropertyExifDictionary as String] as? [String: Any],
               let dstSource = CGImageSourceCreateWithURL(outputURL, nil),
               let dstImage = CGImageSourceCreateImageAtIndex(dstSource, 0, nil),
               let dstRef = CGImageDestinationCreateWithURL(outputURL, kUTTypeJPEG, 1, nil) {
              let dstProps: [String: Any] = [kCGImagePropertyExifDictionary as String: exifDict]
              CGImageDestinationAddImage(dstRef, dstImage, dstProps as CFDictionary)
              CGImageDestinationFinalize(dstRef)
            }
          }

          NSLog("[C2paBridge] applyMasks: \(masksArray.count) masks → \(outputPath)")
          promise.resolve(outputPath)
        }
      }
    }

    // 動画処理（クロップ・リサイズ・トリム）をAVFoundationで実行
    AsyncFunction("processVideo") { (videoPath: String, optionsJson: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        NSLog("[C2paBridge] processVideo called with: \(videoPath)")

        guard let data = optionsJson.data(using: .utf8),
              let opts = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          promise.reject("ARG_ERROR", "オプションのパースに失敗しました")
          return
        }

        Self.resolveToFile(videoPath) { inputPath in
          guard let inputPath = inputPath else {
            promise.reject("FILE_ERROR", "入力ファイルが見つかりません: \(videoPath)")
            return
          }

          let asset = AVURLAsset(url: URL(fileURLWithPath: inputPath))
          guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            promise.reject("TRACK_ERROR", "動画トラックが見つかりません")
            return
          }

          let naturalSize = videoTrack.naturalSize
          let transform = videoTrack.preferredTransform
          // 実際の表示サイズを算出（回転考慮）
          let isRotated = abs(transform.b) == 1.0 && abs(transform.c) == 1.0
          let sourceW = isRotated ? naturalSize.height : naturalSize.width
          let sourceH = isRotated ? naturalSize.width : naturalSize.height

          let cropX = CGFloat(opts["cropX"] as? Double ?? 0)
          let cropY = CGFloat(opts["cropY"] as? Double ?? 0)
          let cropW = CGFloat(opts["cropW"] as? Double ?? Double(sourceW))
          let cropH = CGFloat(opts["cropH"] as? Double ?? Double(sourceH))
          let outputW = CGFloat(opts["outputW"] as? Double ?? Double(cropW))
          let outputH = CGFloat(opts["outputH"] as? Double ?? Double(cropH))
          let startMs = opts["startMs"] as? Double
          let endMs = opts["endMs"] as? Double

          let hasCrop = cropX != 0 || cropY != 0 ||
            abs(cropW - sourceW) > 1 || abs(cropH - sourceH) > 1
          let hasResize = abs(outputW - cropW) > 1 || abs(outputH - cropH) > 1
          let hasTrim = startMs != nil || endMs != nil
          let needsReencode = hasCrop || hasResize

          // トリムのみ（再エンコード不要）→ AVAssetExportSession で高速コピー
          if hasTrim && !needsReencode {
            let composition = AVMutableComposition()
            let timeRange: CMTimeRange
            let start = CMTime(seconds: (startMs ?? 0) / 1000.0, preferredTimescale: 600)
            let end = endMs != nil
              ? CMTime(seconds: endMs! / 1000.0, preferredTimescale: 600)
              : asset.duration
            timeRange = CMTimeRange(start: start, end: end)

            do {
              if let videoTrack = asset.tracks(withMediaType: .video).first {
                let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
                try compVideoTrack?.insertTimeRange(timeRange, of: videoTrack, at: .zero)
                compVideoTrack?.preferredTransform = videoTrack.preferredTransform
              }
              if let audioTrack = asset.tracks(withMediaType: .audio).first {
                let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
                try compAudioTrack?.insertTimeRange(timeRange, of: audioTrack, at: .zero)
              }
            } catch {
              promise.reject("COMP_ERROR", "コンポジション作成に失敗: \(error)")
              return
            }

            let outputPath = NSTemporaryDirectory() + "video_out_\(Int(Date().timeIntervalSince1970 * 1000)).mp4"
            let outputURL = URL(fileURLWithPath: outputPath)
            try? FileManager.default.removeItem(at: outputURL)

            guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
              promise.reject("EXPORT_ERROR", "エクスポートセッション作成に失敗")
              return
            }
            exporter.outputURL = outputURL
            exporter.outputFileType = .mp4

            exporter.exportAsynchronously {
              if exporter.status == .completed {
                NSLog("[C2paBridge] processVideo trim-only success: \(outputPath)")
                promise.resolve(outputPath)
              } else {
                promise.reject("EXPORT_ERROR", "動画エクスポートに失敗: \(exporter.error?.localizedDescription ?? "unknown")")
              }
            }
            return
          }

          // クロップ・リサイズ（再エンコード必要）
          let composition = AVMutableComposition()
          let timeRange: CMTimeRange
          if hasTrim {
            let start = CMTime(seconds: (startMs ?? 0) / 1000.0, preferredTimescale: 600)
            let end = endMs != nil
              ? CMTime(seconds: endMs! / 1000.0, preferredTimescale: 600)
              : asset.duration
            timeRange = CMTimeRange(start: start, end: end)
          } else {
            timeRange = CMTimeRange(start: .zero, duration: asset.duration)
          }

          do {
            let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
            try compVideoTrack?.insertTimeRange(timeRange, of: videoTrack, at: .zero)
            if let audioTrack = asset.tracks(withMediaType: .audio).first {
              let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
              try compAudioTrack?.insertTimeRange(timeRange, of: audioTrack, at: .zero)
            }
          } catch {
            promise.reject("COMP_ERROR", "コンポジション作成に失敗: \(error)")
            return
          }

          // ビデオコンポジションでクロップ・リサイズを適用
          let videoComposition = AVMutableVideoComposition()
          // 出力サイズ（偶数に丸め）
          let finalW = Int(outputW / 2) * 2
          let finalH = Int(outputH / 2) * 2
          videoComposition.renderSize = CGSize(width: finalW, height: finalH)
          videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(videoTrack.nominalFrameRate > 0 ? videoTrack.nominalFrameRate : 30))

          let instruction = AVMutableVideoCompositionInstruction()
          instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)

          let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: composition.tracks(withMediaType: .video).first!)

          // トランスフォーム構築: まず元動画のpreferredTransformを適用し、
          // そこからクロップ位置を引き、出力サイズにスケール
          var tx = transform
          // クロップオフセットを適用
          tx = tx.concatenating(CGAffineTransform(translationX: -cropX, y: -cropY))
          // スケール（クロップ領域→出力サイズ）
          if hasResize || hasCrop {
            let scaleX = CGFloat(finalW) / cropW
            let scaleY = CGFloat(finalH) / cropH
            tx = tx.concatenating(CGAffineTransform(scaleX: scaleX, y: scaleY))
          }
          layerInstruction.setTransform(tx, at: .zero)

          instruction.layerInstructions = [layerInstruction]
          videoComposition.instructions = [instruction]

          let outputPath = NSTemporaryDirectory() + "video_out_\(Int(Date().timeIntervalSince1970 * 1000)).mp4"
          let outputURL = URL(fileURLWithPath: outputPath)
          try? FileManager.default.removeItem(at: outputURL)

          guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            promise.reject("EXPORT_ERROR", "エクスポートセッション作成に失敗")
            return
          }
          exporter.outputURL = outputURL
          exporter.outputFileType = .mp4
          exporter.videoComposition = videoComposition

          exporter.exportAsynchronously {
            if exporter.status == .completed {
              NSLog("[C2paBridge] processVideo success: \(outputPath)")
              promise.resolve(outputPath)
            } else {
              promise.reject("EXPORT_ERROR", "動画エクスポートに失敗: \(exporter.error?.localizedDescription ?? "unknown")")
            }
          }
        }
      }
    }

    AsyncFunction("getVersion") { () -> String in
      return "c2pa-bridge 0.1.0"
    }
  }

  private static func resolveToFile(_ path: String, completion: @escaping (String?) -> Void) {
    if path.hasPrefix("/") {
      completion(FileManager.default.fileExists(atPath: path) ? path : nil)
      return
    }

    if path.hasPrefix("file://") {
      if let url = URL(string: path), FileManager.default.fileExists(atPath: url.path) {
        completion(url.path)
      } else {
        completion(nil)
      }
      return
    }

    if path.hasPrefix("ph://") {
      var localId = path.replacingOccurrences(of: "ph://", with: "")
      if let slashIndex = localId.firstIndex(of: "/") {
        localId = String(localId[..<slashIndex])
      }

      let results = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil)
      guard let asset = results.firstObject else {
        NSLog("[C2paBridge] PHAsset not found for: \(localId)")
        completion(nil)
        return
      }

      if asset.mediaType == .video {
        // 動画: PHAssetResource経由でオリジナルファイルをエクスポート
        let resources = PHAssetResource.assetResources(for: asset)
        guard let videoResource = resources.first(where: { $0.type == .video }) else {
          NSLog("[C2paBridge] No video resource found for: \(localId)")
          completion(nil)
          return
        }
        let ext = (videoResource.originalFilename as NSString).pathExtension.isEmpty
          ? "mov" : (videoResource.originalFilename as NSString).pathExtension
        let tempPath = NSTemporaryDirectory() + "c2pa_input_\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
        let tempURL = URL(fileURLWithPath: tempPath)
        let writeOptions = PHAssetResourceRequestOptions()
        writeOptions.isNetworkAccessAllowed = true
        PHAssetResourceManager.default().writeData(for: videoResource, toFile: tempURL, options: writeOptions) { error in
          if let error = error {
            NSLog("[C2paBridge] Failed to export video for: \(localId) - \(error)")
            completion(nil)
          } else {
            let size = (try? FileManager.default.attributesOfItem(atPath: tempPath)[.size] as? Int) ?? 0
            NSLog("[C2paBridge] Exported ph:// video to: \(tempPath) (\(size) bytes)")
            completion(tempPath)
          }
        }
      } else {
        // 画像: requestImageDataAndOrientation でデータ取得
        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.isNetworkAccessAllowed = true
        options.version = .original

        // UTIから拡張子を推定
        let resources = PHAssetResource.assetResources(for: asset)
        let ext: String
        if let firstResource = resources.first {
          let resExt = (firstResource.originalFilename as NSString).pathExtension
          ext = resExt.isEmpty ? "jpg" : resExt
        } else {
          ext = "jpg"
        }

        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
          guard let data = data else {
            NSLog("[C2paBridge] Failed to get image data for: \(localId)")
            completion(nil)
            return
          }
          let tempPath = NSTemporaryDirectory() + "c2pa_input_\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
          try? data.write(to: URL(fileURLWithPath: tempPath))
          NSLog("[C2paBridge] Copied ph:// to: \(tempPath) (\(data.count) bytes)")
          completion(tempPath)
        }
      }
      return
    }

    completion(nil)
  }
}
