#import <React/RCTBridgeModule.h>

// 仕様書 §4.6 C2PA SDK統合
// SwiftモジュールをReact Nativeに登録する

@interface RCT_EXTERN_MODULE(C2paBridge, NSObject)

RCT_EXTERN_METHOD(signContent:(NSString *)imagePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getVersion:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
