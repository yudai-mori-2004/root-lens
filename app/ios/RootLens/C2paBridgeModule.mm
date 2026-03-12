// 仕様書 §4.6 C2PA SDK統合
// React Nativeネイティブモジュール: c2pa-bridge (.a) をC FFI経由で呼び出す

#import <React/RCTBridgeModule.h>
#import <React/RCTLog.h>
#import <Photos/Photos.h>
#include "c2pa_bridge.h"

@interface C2paBridgeObjC : NSObject <RCTBridgeModule>
@end

@implementation C2paBridgeObjC

RCT_EXPORT_MODULE(C2paBridge)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(signContent:(NSString *)imagePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    RCTLogInfo(@"[C2paBridge] signContent called with: %@", imagePath);

    // 開発用証明書を読み込む
    NSString *certPath = [[NSBundle mainBundle] pathForResource:@"dev-chain" ofType:@"pem"];
    NSString *keyPath = [[NSBundle mainBundle] pathForResource:@"dev-device-key" ofType:@"pem"];

    if (!certPath || !keyPath) {
      RCTLogError(@"[C2paBridge] Dev certs not found");
      reject(@"CERT_ERROR", @"開発用証明書が見つかりません", nil);
      return;
    }

    NSError *error = nil;
    NSString *certChain = [NSString stringWithContentsOfFile:certPath encoding:NSUTF8StringEncoding error:&error];
    NSString *privateKey = [NSString stringWithContentsOfFile:keyPath encoding:NSUTF8StringEncoding error:&error];

    if (!certChain || !privateKey) {
      RCTLogError(@"[C2paBridge] Failed to read certs: %@", error);
      reject(@"CERT_ERROR", @"証明書の読み込みに失敗しました", error);
      return;
    }

    RCTLogInfo(@"[C2paBridge] Certs loaded: chain=%lu chars, key=%lu chars",
              (unsigned long)certChain.length, (unsigned long)privateKey.length);

    // 入力ファイルを実パスに変換（ph:// は非同期）
    [self resolveToFile:imagePath completion:^(NSString *inputPath) {
      if (!inputPath) {
        RCTLogError(@"[C2paBridge] Input file not found: %@", imagePath);
        reject(@"FILE_ERROR", [NSString stringWithFormat:@"入力ファイルが見つかりません: %@", imagePath], nil);
        return;
      }

      NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:inputPath error:nil];
      RCTLogInfo(@"[C2paBridge] Input file: %@ (%llu bytes)", inputPath, [attrs fileSize]);

      // 出力先
      NSString *outputPath = [NSTemporaryDirectory() stringByAppendingPathComponent:
                             [NSString stringWithFormat:@"c2pa_signed_%lld.jpg",
                              (long long)([[NSDate date] timeIntervalSince1970] * 1000)]];

      int result = c2pa_sign_image(
        [inputPath UTF8String],
        [outputPath UTF8String],
        [certChain UTF8String],
        [privateKey UTF8String]
      );

      RCTLogInfo(@"[C2paBridge] nativeSignImage result: %d", result);

      switch (result) {
        case 0: {
          NSDictionary *outAttrs = [[NSFileManager defaultManager] attributesOfItemAtPath:outputPath error:nil];
          RCTLogInfo(@"[C2paBridge] Sign success: %@ (%llu bytes)", outputPath, [outAttrs fileSize]);
          resolve(outputPath);
          break;
        }
        case -1:
          reject(@"ARG_ERROR", @"引数エラー", nil);
          break;
        case -2:
          reject(@"SIGN_ERROR", [NSString stringWithFormat:@"署名エラー (code: %d)", result], nil);
          break;
        default:
          reject(@"UNKNOWN_ERROR", [NSString stringWithFormat:@"不明なエラー: %d", result], nil);
          break;
      }
    }];
  });
}

RCT_EXPORT_METHOD(getVersion:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  resolve(@"c2pa-bridge 0.1.0");
}

#pragma mark - Helpers

- (void)resolveToFile:(NSString *)path completion:(void (^)(NSString *filePath))completion {
  // すでにファイルパスの場合
  if ([path hasPrefix:@"/"]) {
    completion([[NSFileManager defaultManager] fileExistsAtPath:path] ? path : nil);
    return;
  }

  // file:// URI
  if ([path hasPrefix:@"file://"]) {
    NSURL *url = [NSURL URLWithString:path];
    NSString *filePath = [url path];
    if (filePath && [[NSFileManager defaultManager] fileExistsAtPath:filePath]) {
      completion(filePath);
    } else {
      completion(nil);
    }
    return;
  }

  // ph:// URI (iOS Photos Library)
  if ([path hasPrefix:@"ph://"]) {
    NSString *localId = [path stringByReplacingOccurrencesOfString:@"ph://" withString:@""];
    // Remove trailing path components like /L0/001
    NSRange slashRange = [localId rangeOfString:@"/"];
    if (slashRange.location != NSNotFound) {
      localId = [localId substringToIndex:slashRange.location];
    }

    PHFetchResult *results = [PHAsset fetchAssetsWithLocalIdentifiers:@[localId] options:nil];
    PHAsset *asset = results.firstObject;
    if (!asset) {
      RCTLogError(@"[C2paBridge] PHAsset not found for: %@", localId);
      completion(nil);
      return;
    }

    PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
    options.synchronous = YES;
    options.networkAccessAllowed = YES;
    options.version = PHImageRequestOptionsVersionOriginal;

    [[PHImageManager defaultManager] requestImageDataAndOrientationForAsset:asset
                                                                   options:options
                                                             resultHandler:^(NSData *data, NSString *uti, CGImagePropertyOrientation orient, NSDictionary *info) {
      if (!data) {
        RCTLogError(@"[C2paBridge] Failed to get image data for: %@", localId);
        completion(nil);
        return;
      }

      NSString *tempPath = [NSTemporaryDirectory() stringByAppendingPathComponent:
                           [NSString stringWithFormat:@"c2pa_input_%lld.jpg",
                            (long long)([[NSDate date] timeIntervalSince1970] * 1000)]];
      [data writeToFile:tempPath atomically:YES];
      RCTLogInfo(@"[C2paBridge] Copied ph:// to: %@ (%lu bytes)", tempPath, (unsigned long)data.length);
      completion(tempPath);
    }];
    return;
  }

  completion(nil);
}

@end
