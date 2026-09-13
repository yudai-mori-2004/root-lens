// クリップストアをReact画面から購読するhooks。
//
// 一覧 (useClips) は s.clips (= Record の安定参照) を購読し、 useMemo で並べ替えるだけ。
// clips の参照は mutation 時しか変わらないので、 ソート済み配列の再生成は最小限で済む
// (= zustand selector が毎回新配列を返して無限再描画する問題を回避)。

import { useMemo } from 'react';
import { useStore } from 'zustand';

import {
  clipStore,
  clipList,
  selectCurrentClip,
  type Clip,
  type ClipEvent,
  type RecordingPhase,
} from './index';

/** 全クリップ (= 新しい順)。 */
export function useClips(): Clip[] {
  const clips = useStore(clipStore, (s) => s.clips);
  return useMemo(() => clipList(clips), [clips]);
}

/** 単一クリップ (= id 指定)。 */
export function useClip(id: string | null | undefined): Clip | null {
  const clips = useStore(clipStore, (s) => s.clips);
  return useMemo(() => (id ? clips[id] ?? null : null), [clips, id]);
}

/** 録画 → アップロードで進行中のクリップ。 */
export function useCurrentClip(): Clip | null {
  return useStore(clipStore, selectCurrentClip);
}

/** 実行中アクションのラベル (= null なら待機)。 */
export function useClipBusy(): string | null {
  return useStore(clipStore, (s) => s.busy);
}

/** 録画ライフサイクル。 */
export function useRecordingPhase(): RecordingPhase {
  return useStore(clipStore, (s) => s.recording);
}

/** イベントログ。 */
export function useClipEvents(): ClipEvent[] {
  return useStore(clipStore, (s) => s.events);
}
