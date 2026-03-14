import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { config } from '../config';

const KEY = 'rootlens:profile';

export interface Profile {
  displayName: string;
  address: string;      // Solanaアドレス
  bio: string;          // 自己紹介・SNSリンク等
  deviceName: string;   // 端末名（自動取得、編集不可）
  showDeviceName: boolean; // 公開ページに端末名を表示するか
  synced: boolean;      // Supabaseに同期済みか
}

const defaults: Profile = {
  displayName: '',
  address: '',
  bio: '',
  deviceName: '',
  showDeviceName: true,
  synced: false,
};

let cached: Profile | null = null;

/** 端末名を自動取得 (例: "iPhone 15 Pro", "Pixel 8") */
function getDeviceName(): string {
  return Device.modelName || Device.deviceName || 'Unknown Device';
}

export async function loadProfile(): Promise<Profile> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      cached = { ...defaults, ...JSON.parse(raw) };
    }
  } catch {}
  if (!cached) cached = { ...defaults };
  // 端末名は常に最新を自動取得
  cached.deviceName = getDeviceName();
  return cached;
}

export async function saveProfile(profile: Profile): Promise<void> {
  cached = { ...profile, synced: false };
  await AsyncStorage.setItem(KEY, JSON.stringify(cached));
  console.log('[profileStore] saved locally:', cached);

  // Supabase に非同期で同期（アドレスがある場合のみ）
  if (profile.address) {
    try {
      console.log('[profileStore] syncing to server...');
      const res = await fetch(`${config.serverUrl}/api/v1/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: profile.address,
          displayName: profile.displayName,
          bio: profile.bio,
          deviceName: profile.deviceName,
        }),
      });
      if (res.ok) {
        cached = { ...profile, synced: true };
        await AsyncStorage.setItem(KEY, JSON.stringify(cached));
      }
    } catch (e) {
      console.warn('[profileStore] sync failed (offline?):', e);
    }
  }
}

/** アドレスを短縮表示 (例: 7xKX...3nFd) */
export function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
