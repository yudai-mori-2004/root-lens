import AsyncStorage from '@react-native-async-storage/async-storage';

// ローカルコンテンツ管理
// 将来的にはサーバー連携（§6 公開パイプライン）に置き換わるが、
// 現時点ではAsyncStorage + ローカルファイルで完結する

export type ContentStatus = 'draft' | 'published';

export interface ContentItem {
  id: string;
  uri: string; // ローカルファイルパス
  thumbnailUri?: string;
  status: ContentStatus;
  createdAt: number;
  editedAt?: number;
  // 将来: c2paManifest, titleProtocolId, pageUrl 等
}

const STORAGE_KEY = 'rootlens_contents';

export async function loadContents(): Promise<ContentItem[]> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  if (!json) return [];
  return JSON.parse(json) as ContentItem[];
}

export async function saveContents(contents: ContentItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contents));
}

export async function addContent(item: ContentItem): Promise<void> {
  const contents = await loadContents();
  contents.unshift(item);
  await saveContents(contents);
}

export async function updateContent(
  id: string,
  updates: Partial<ContentItem>,
): Promise<void> {
  const contents = await loadContents();
  const index = contents.findIndex((c) => c.id === id);
  if (index >= 0) {
    contents[index] = { ...contents[index], ...updates };
    await saveContents(contents);
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
