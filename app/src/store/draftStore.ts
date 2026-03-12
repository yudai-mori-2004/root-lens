import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { EditAction } from '../types/editActions';
import type { MediaItem } from '../navigation/types';

// 仕様書 §3.6 編集画面 — ドラフト自動保存
// - 編集操作をアクション履歴として永続化（中間画像ファイル不要）
// - アプリ再起動後も復元可能
// - 常に最初の無加工状態に遡れること

const DRAFT_KEY = 'rootlens_edit_draft';

export interface DraftEditState {
  actions: EditAction[];
  currentIndex: number;
}

export interface Draft {
  mediaItems: MediaItem[];
  editStates: DraftEditState[];
  pageIndex: number;
  savedAt: number;
}

/**
 * ドラフトを保存する
 * 編集操作のたびに呼び出す（デバウンス推奨）
 */
export async function saveDraft(draft: Draft): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn('ドラフト保存エラー:', e);
  }
}

/**
 * ドラフトを読み込む
 * アプリ起動時・編集画面表示時に呼び出す
 */
export async function loadDraft(): Promise<Draft | null> {
  try {
    const json = await AsyncStorage.getItem(DRAFT_KEY);
    if (!json) return null;
    const draft: Draft = JSON.parse(json);
    // 元メディアが存在するか確認
    for (const item of draft.mediaItems) {
      const info = await FileSystem.getInfoAsync(item.uri);
      if (!info.exists) return null;
    }
    return draft;
  } catch (e) {
    console.warn('ドラフト読み込みエラー:', e);
    return null;
  }
}

/**
 * ドラフトを削除する
 * 登録完了時やユーザーが明示的に破棄した時に呼び出す
 */
export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    console.warn('ドラフト削除エラー:', e);
  }
}
