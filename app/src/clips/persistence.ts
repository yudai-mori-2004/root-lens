// クリップ永続化アダプタ。
//
// dataflowStore (= 純粋 store) を subscribe して、 進行中 / 準備完了のクリップを
// AsyncStorage に保存し、 起動時に hydrate する。 AsyncStorage は react-native 依存なので
// dataflow 層には入れず、 このアダプタに分離する (= dataflow の純粋性維持)。
//
// 仕様:
//   - uploading の永続化は、 アプリ kill でタイマーが切れるため、
//     起動時に error 扱い (= 「アプリ再起動中に中断されました」) にする。
//   - v2 key separates the unit-id pipeline from pre-production upload state.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { dataflowStore, clipList, type Clip } from '../dataflow';

const STORAGE_KEY = '@rootlens/clips/v2';
const PERSIST_DEBOUNCE_MS = 400;

let initialized = false;
let persistenceErrorListener: ((error: Error) => void) | null = null;

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function reportPersistenceError(value: unknown): void {
  const error = asError(value);
  console.error('[clips/persistence] write failed:', error);
  persistenceErrorListener?.(error);
}

export function subscribeClipPersistenceErrors(listener: (error: Error) => void): () => void {
  persistenceErrorListener = listener;
  return () => {
    if (persistenceErrorListener === listener) persistenceErrorListener = null;
  };
}

// iOS はアプリを再インストールするたびに Data コンテナの UUID が変わる。 絶対パスを
// そのまま保存すると、 次のインストールで全クリップのファイル参照が無効になる
// (rc=-2 「No such file or directory」 の原因)。 保存時は Documents 起点の相対パスに
// 落とし、 復元時に現在の documentDirectory で絶対化する。
const DOC_MARKER = '/Documents/';

function toRelativePath(uri: string | undefined): string | undefined {
  if (!uri) return uri;
  const i = uri.indexOf(DOC_MARKER);
  return i >= 0 ? uri.slice(i + DOC_MARKER.length) : uri;
}

function toAbsoluteUri(path: string | undefined): string | undefined {
  if (!path) return path;
  const doc = FileSystem.documentDirectory ?? '';
  if (path.includes('://')) {
    // 旧形式 (絶対 URI)。 コンテナ UUID が変わっていても Documents 以下の構造は同じなので付け替える。
    const i = path.indexOf(DOC_MARKER);
    return i >= 0 ? `${doc}${path.slice(i + DOC_MARKER.length)}` : path;
  }
  return `${doc}${path}`;
}

/** 起動時に保存済みクリップを store へ流し込む (= 1 回だけ)。 */
async function hydrate(): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const arr = JSON.parse(raw) as Clip[];
  const sanitized = arr.map((c) => {
      const clip: Clip = {
        ...c,
        sessionDir: toAbsoluteUri(c.sessionDir),
      };
      // uploading (= アップロード中断) は error にする。 段 (stage) は保持されるので、
      // 「もう一度試す」 で advanceClip が成功済みの段から再開できる。
      if (clip.state === 'uploading') {
        return { ...clip, state: 'error' as const, errorMessage: 'アプリ再起動中に中断されました' };
      }
      // queued (= 順番待ちのまま kill) はまだ何も始まっていないので、 黙って録画済みに戻す
      // (= キュー自体は再起動で消えるため、 もう一度アップロード操作してもらう)。
      if (clip.state === 'queued') {
        return { ...clip, state: 'recorded' as const };
      }
      return clip;
  });
  dataflowStore.getState().replaceClips(sanitized);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastClips: Record<string, Clip> | null = null;

function serializedClips(clips: Record<string, Clip>): string {
  const persistent = clipList(clips)
    .filter((clip) => clip.state !== 'uploaded')
    .map((clip) => ({ ...clip, sessionDir: toRelativePath(clip.sessionDir) }));
  return JSON.stringify(persistent);
}

async function persistClips(clips: Record<string, Clip>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, serializedClips(clips));
}

/** clips の変化を AsyncStorage に書き出す (= uploaded は保存しない、 軽くデバウンス)。 */
function schedulePersist(clips: Record<string, Clip>): void {
  if (clips === lastClips) return;
  lastClips = clips;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    // uploaded = サーバに引き渡し済み (= 一覧から消える + ローカルファイルも掃除済み)。
    // 永続化しないことで再起動後に蘇らない。
    void persistClips(clips).catch(reportPersistenceError);
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * クリップ永続化を開始する (= 冪等)。 hydrate → subscribe の順。
 * アプリ起動時に 1 度だけ呼ぶ (= App.tsx の effect)。
 */
export async function initClipPersistence(): Promise<void> {
  if (initialized) return;
  await hydrate();
  // clips が変わるたびに永続化 (= zustand vanilla の subscribe は (state, prev) を渡す)。
  dataflowStore.subscribe((state, prev) => {
    if (state.clips !== prev.clips) schedulePersist(state.clips);
  });
  initialized = true;
}

export async function retryClipPersistence(): Promise<void> {
  await persistClips(dataflowStore.getState().clips);
}
