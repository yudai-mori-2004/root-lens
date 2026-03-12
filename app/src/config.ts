// 仕様書 §10 サーバー設定
// 環境に応じたサーバーURLを返す

import { Platform } from 'react-native';

// Android エミュレータは 10.0.2.2 で host の localhost にアクセス
// iOS シミュレータは localhost でOK
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

// web/ に統合 — DEV/本番ともにVercelを使用
const SERVER_URL = 'https://www.rootlens.io';

export const config = {
  serverUrl: SERVER_URL,
  /** パイプラインB: 画像保存 + ページ作成 — 仕様書 §6.2, §6.4 */
  publishUrl: `${SERVER_URL}/api/v1/publish`,
  /** signed_json 保存 — storeSignedJsonコールバック用 */
  storeJsonUrl: `${SERVER_URL}/api/v1/store-json`,
  /** 証明書発行API */
  deviceCertificateUrl: `${SERVER_URL}/api/v1/device-certificate`,
  /** 証明書更新API */
  deviceCertificateRenewUrl: `${SERVER_URL}/api/v1/device-certificate/renew`,
  /** 証明書更新しきい値（日数） — 仕様書 §4.4.2 */
  certRenewalThresholdDays: 14,
};
