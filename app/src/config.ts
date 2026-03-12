// 仕様書 §10 サーバー設定
// 環境に応じたサーバーURLを返す

import { Platform } from 'react-native';

// Android エミュレータは 10.0.2.2 で host の localhost にアクセス
// iOS シミュレータは localhost でOK
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

// TODO: 本番URL設定
const SERVER_URL = __DEV__
  ? `http://${DEV_HOST}:3000`
  : 'https://api.rootlens.io';

export const config = {
  serverUrl: SERVER_URL,
  /** 公開API — 仕様書 §6.1, §6.2, §6.4 */
  publishUrl: `${SERVER_URL}/api/v1/publish`,
  /** 証明書発行API */
  deviceCertificateUrl: `${SERVER_URL}/api/v1/device-certificate`,
  /** 証明書更新API */
  deviceCertificateRenewUrl: `${SERVER_URL}/api/v1/device-certificate/renew`,
  /** 証明書更新しきい値（日数） — 仕様書 §4.4.2 */
  certRenewalThresholdDays: 14,
};
