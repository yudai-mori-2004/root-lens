import { useCallback, useState, useEffect } from 'react';
import { loadProfile, saveProfile } from '../store/profileStore';

/**
 * 認証状態管理（軽量）
 *
 * 仕様書 §2.1: カメラ・編集はログイン不要
 * 仕様書 §2.4: 公開時にのみログインを求める
 *
 * Privy自体はRegistrationScreenのPrivyGateコンポーネント内でのみ初期化。
 * このhookはアプリ全体で認証状態を参照するためのもの。
 */

let _isAuthenticated = false;
let _solanaAddress: string | null = null;
const listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function setAuthState(address: string) {
  _isAuthenticated = true;
  _solanaAddress = address;
  notify();

  // profileに自動設定 + Supabase同期
  loadProfile().then((profile) => {
    if (profile.address !== address) {
      saveProfile({ ...profile, address });
    }
  });
}

export function clearAuthState() {
  _isAuthenticated = false;
  _solanaAddress = null;
  notify();
}

export function useAuth() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return {
    isAuthenticated: _isAuthenticated,
    solanaAddress: _solanaAddress,
    logout: clearAuthState,
  };
}
