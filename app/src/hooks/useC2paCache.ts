import { useState, useEffect } from 'react';
import { readManifest, type C2paManifestInfo } from '../native/c2paBridge';
import type * as MediaLibrary from 'expo-media-library';

// 仕様書 §3.5: C2PA検証結果のセッション内キャッシュ
// 画面間で共有し、同一アセットの再検証を防ぐ
const cache: Record<string, C2paManifestInfo> = {};
const checking = new Set<string>();

export function useC2paCache(assets: MediaLibrary.Asset[]) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const unchecked = assets.filter(a => !cache[a.id] && !checking.has(a.id));
    for (const asset of unchecked) {
      checking.add(asset.id);
      readManifest(asset.uri).then(info => {
        cache[asset.id] = info;
        checking.delete(asset.id);
        setVersion(v => v + 1);
      });
    }
  }, [assets]);

  return cache;
}

// 仕様書 §3.5: 信頼判定（3段階チェック）
export function isTrustedAsset(
  c2paStatus: Record<string, C2paManifestInfo>,
  assetId: string,
): boolean | null {
  const info = c2paStatus[assetId];
  if (!info) return null; // まだチェック中
  if (!info.has_manifest) return false;
  if (!info.is_valid) return false; // 改ざん検知
  // signer_org は c2pa-rs の signature_info.issuer (発行者CA)の Organization
  // Dev証明書: issuer O = "RootLens Dev", Prod証明書: issuer O = "RootLens"
  return info.signer_org?.startsWith('RootLens') ?? false;
}
