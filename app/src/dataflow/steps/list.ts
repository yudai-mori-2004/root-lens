// Fetch the account's clips from the server (GET /api/clips).
//
// Used for the "total recorded time" statistic (summing durationMs over
// uploaded clips). The clip list UI itself trusts the local store (it only
// shows clips waiting to upload), so this step is a read-only side channel.
// The account comes from the Bearer token on the server side.
//
// ⚠ Dataflow layer: must not import react / react-native.

import { SERVER_URL } from '../../env';
import { getAuthHeader } from '../../services/auth/instance';
import type { ServerClipStatus } from '../types';

/** API 失敗の理由タグ (= 呼び出し側が「無い」「未認証」「通信」「サーバ」 で表示を分ける)。 */
export class ClipApiError extends Error {
  readonly kind: 'not-found' | 'unauthorized' | 'network' | 'server';
  constructor(kind: ClipApiError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

const mediaUrlCache = new Map<string, { url: string; expiresAtMs: number }>();
const mediaUrlInflight = new Map<string, Promise<string>>();

export async function fetchMyClips(): Promise<ServerClipStatus[]> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/clips`, {
      headers: await getAuthHeader(),
    });
  } catch (e) {
    throw new ClipApiError('network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = `GET /api/clips ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 401 || res.status === 403) throw new ClipApiError('unauthorized', detail);
    throw new ClipApiError('server', detail);
  }
  const { clips } = (await res.json()) as { clips: ServerClipStatus[] };
  return clips;
}

/** 履歴再生 (= R2 の rgb.mp4 の presigned GET URL を取る)。識別子は unit id。 */

export async function fetchClipMediaUrl(unitId: string): Promise<string> {
  const cached = mediaUrlCache.get(unitId);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) return cached.url;
  const running = mediaUrlInflight.get(unitId);
  if (running) return running;

  const request = fetchClipMediaUrlUncached(unitId).finally(() => {
    mediaUrlInflight.delete(unitId);
  });
  mediaUrlInflight.set(unitId, request);
  return request;
}

async function fetchClipMediaUrlUncached(unitId: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/clips/${unitId}/media`, {
      headers: await getAuthHeader(),
    });
  } catch (e) {
    // fetch 自体が throw = 実際の通信失敗 (オフライン・DNS・タイムアウト等)
    throw new ClipApiError('network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = `GET /api/clips/:unitId/media ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 404) throw new ClipApiError('not-found', detail);
    if (res.status === 401 || res.status === 403) throw new ClipApiError('unauthorized', detail);
    throw new ClipApiError('server', detail);
  }
  const { url, expiresAt } = (await res.json()) as { url: string; expiresAt?: string };
  const parsedExpiry = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  mediaUrlCache.set(unitId, {
    url,
    expiresAtMs: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 50 * 60_000,
  });
  return url;
}

/** 撮影者本人のクリップを R2 raw 一式とサーバ一覧から削除する。 */
export async function deleteServerClip(unitId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/clips/${unitId}`, {
      method: 'DELETE',
      headers: await getAuthHeader(),
    });
  } catch (e) {
    throw new ClipApiError('network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = `DELETE /api/clips/:unitId ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 404) throw new ClipApiError('not-found', detail);
    if (res.status === 401 || res.status === 403) throw new ClipApiError('unauthorized', detail);
    throw new ClipApiError('server', detail);
  }
  mediaUrlCache.delete(unitId);
  mediaUrlInflight.delete(unitId);
}
