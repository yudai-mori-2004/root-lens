// Stage-resumable upload runner: one "advance" function shared by the first
// upload attempt and every retry.
//
//   pending    → unit id + source manifest   → 'manifested'
//   manifested → R2 upload + POST /api/clips → 'registered' (state='uploaded')
//   registered → nothing more happens on the device
//
// Idempotency: from 'manifested' on, the same unit id and source manifest are
// reused, and the server dedupes on unit id, so retries cannot create
// duplicate clip rows.
//
// ⚠ Dataflow layer: must not import react / react-native.

import * as FileSystem from 'expo-file-system/legacy';

import type { EventSink, ClipEventInput } from './events';
import { getCaptureMethod, type CaptureMethod, type RecordingSession } from '../capture';
import type { UploadStage } from './types';
import { buildSourceManifest } from './sourceManifest';
import { uploadToR2 } from './rawUpload';
import { registerClip } from './api';
import { clipStore, makeLocalClipId } from './store';
import { getMemoryMB, nativeSha256File } from '../native/fileHash';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

/** Remove a clip dir and everything under it (after upload completes or on discard). */
async function cleanupClipDir(dir: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {
    // Not fatal.
  }
}

/** Maps a step name to a fixed uploadProgress value (0..1).
 *  The hashing span (0→0.35) and the upload span (0.4→0.97) are not fixed here
 *  (null); they are filled smoothly from each step's own byte progress, so
 *  hashing a multi-GB video does not sit silent for minutes. */
function stepProgress(step: string): number | null {
  switch (step) {
    case 'register-clip': return 1.0;
    default:              return null;
  }
}

/** Maps real hashing byte progress (0..1) onto the 0→0.35 span of uploadProgress. */
function hashFractionToProgress(f: number): number {
  return Math.max(0, Math.min(1, f)) * 0.35;
}

/** Maps real upload byte progress (0..1) onto the 0.4→0.97 span of uploadProgress. */
function uploadFractionToProgress(f: number): number {
  return 0.4 + Math.max(0, Math.min(1, f)) * 0.57;
}

/**
 * Create the clip record when recording finishes (state 'recorded', stage
 * 'pending', keyed by a fresh local id).
 *
 * Nothing uploads automatically. The user reviews the preview in the clip list
 * and taps upload; advanceClip() then walks manifest → R2 → register.
 */
export async function enqueueRecording(input: {
  captureMethod: CaptureMethod;
  session: RecordingSession;
  /** Facts measured by the UI layer: duration (ms, stop − start) and device model. */
  durationMs?: number | null;
  deviceModel?: string | null;
}): Promise<string> {
  const localId = makeLocalClipId();
  const store = clipStore.getState();
  store.upsertClip({
    id: localId,
    state: 'recorded',
    createdAt: Date.now(),
    captureMethodId: input.captureMethod.id,
    durationMs: input.durationMs ?? null,
    deviceModel: input.deviceModel ?? null,
    sessionDir: input.session.sessionDir,
    stage: 'pending',
  });
  store.setCurrentClipId(localId);
  return localId;
}

// ─── Orphan recording recovery (runs once at startup) ─────────────────
//
// Ledger registration (enqueueRecording) only happens on a clean stop, so a
// recording killed by a dead battery, a crash, or the OS leaves files under
// Documents/recordings/ that never appear in the list. rgb.mp4 is a fragmented
// MP4 (finalized in ~10-second chunks), so it is readable even after a mid-write
// death. At startup we scan the directory and put such recordings back into the
// ledger. Leftovers that never became a recording (no mp4, or too small) are
// deleted here instead.
//
// ⚠ Clips that finished uploading are expected to have had their dir removed
//    (cleanupClipDir). If a cleanup failed and the dir survived, it will be
//    re-recovered and show up twice. That duplication is a cleanup bug made
//    visible on purpose, not something to paper over.

const MIN_RECOVERABLE_MP4_BYTES = 3 * 1024 * 1024; // recordings under ~2 seconds are not worth recovering

/** file:// URI → path relative to Documents (ignores container-UUID / private-prefix variance). */
function docRelative(uri: string | undefined): string | null {
  if (!uri) return null;
  const i = uri.indexOf('/Documents/');
  return i >= 0 ? uri.slice(i + '/Documents/'.length).replace(/\/+$/, '') : null;
}

/** Scan for recording dirs missing from the ledger and recover them. Returns the count. Call after hydrate. */
export async function recoverOrphanRecordings(): Promise<number> {
  const doc = FileSystem.documentDirectory;
  if (!doc) return 0;
  const recRoot = `${doc}recordings/`;
  const rootInfo = await FileSystem.getInfoAsync(recRoot);
  if (!rootInfo.exists) return 0;
  if (!rootInfo.isDirectory) throw new Error('recordings path is not a directory');
  const names = await FileSystem.readDirectoryAsync(recRoot);
  const known = new Set<string>();
  for (const c of Object.values(clipStore.getState().clips)) {
    const rel = docRelative(c.sessionDir);
    if (rel) known.add(rel);
  }
  let recovered = 0;
  for (const name of names) {
    if (!name.startsWith('rec-')) continue;
    if (known.has(`recordings/${name}`)) continue;
    const dir = `${recRoot}${name}/`;
    const mp4 = await FileSystem.getInfoAsync(`${dir}rgb.mp4`);
    if (!mp4.exists || mp4.isDirectory || (mp4.size ?? 0) < MIN_RECOVERABLE_MP4_BYTES) {
      await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
      continue;
    }
    // Recording config and device model come back from metadata.json (written with
    // the first frame). Duration stays unknown; only the self-reported value is
    // lost, the server can measure the real length from the mp4.
    let captureMethodId = 'arkit';
    let deviceModel: string | null = null;
    try {
      const meta = JSON.parse(await FileSystem.readAsStringAsync(`${dir}metadata.json`));
      if (typeof meta.recording_config === 'string') captureMethodId = meta.recording_config;
      if (typeof meta.device_model === 'string') deviceModel = meta.device_model;
    } catch {
      // No metadata is fine; recover as the default arkit config as long as the mp4 exists.
    }
    const captureMethod = getCaptureMethod(captureMethodId);
    if (!captureMethod) continue;
    clipStore.getState().upsertClip({
      id: makeLocalClipId(),
      state: 'recorded',
      createdAt: mp4.modificationTime ? Math.round(mp4.modificationTime * 1000) : Date.now(),
      captureMethodId: captureMethod.id,
      durationMs: null,
      deviceModel,
      sessionDir: dir,
      stage: 'pending',
    });
    recovered += 1;
  }
  return recovered;
}

/**
 * Resolve the stage a clip can actually resume from.
 * If the unit id or manifest has vanished, demote to 'pending' and rebuild it.
 */
function effectiveStage(
  stage: UploadStage,
  unitId: string | undefined,
  sourceManifestSha256: string | undefined,
  sourceFiles: unknown[] | undefined,
): UploadStage {
  if (stage === 'registered') return 'registered';
  if (stage === 'manifested' && unitId && sourceManifestSha256 && sourceFiles?.length) return 'manifested';
  return 'pending';
}

let advanceQueue = Promise.resolve();

/**
 * Enqueue an advance so concurrent taps are serialized. The second clip waits
 * for the first to finish (manifest → upload → register) before starting its own.
 * The clip is marked 'queued' immediately so the wait is visible on its card
 * (advanceClip flips it to 'uploading' when its turn starts); an already
 * queued / uploading clip is not enqueued twice.
 */
export function enqueueAdvance(clipId: string, sink: EventSink): void {
  const clip = clipStore.getState().clips[clipId];
  if (!clip || clip.state === 'queued' || clip.state === 'uploading') return;
  clipStore.getState().patchClip(clipId, { state: 'queued', errorMessage: null });
  advanceQueue = advanceQueue
    .then(() => advanceClip(clipId, sink))
    .catch((error) => sink({ step: 'upload', level: 'error', message: errMsg(error) }));
}

/**
 * Advance a clip from its current stage (shared by submit and retry).
 *
 *   pending    → issue unit id + manifest → 'manifested'
 *   manifested → upload + register        → 'registered'
 */
export async function advanceClip(clipId: string, sink: EventSink): Promise<void> {
  const initial = clipStore.getState().clips[clipId];
  if (!initial) return;

  const captureMethod = initial.captureMethodId ? getCaptureMethod(initial.captureMethodId) : undefined;
  if (!captureMethod || !initial.sessionDir) {
    clipStore.getState().patchClip(clipId, {
      state: 'error',
      errorMessage: 'クリップのメタ情報 (撮影構成 / session) が不足し再開できません',
    });
    return;
  }
  const session: RecordingSession = { sessionDir: initial.sessionDir };

  clipStore.getState().setCurrentClipId(clipId);
  clipStore.getState().patchClip(clipId, { state: 'uploading', errorMessage: null, uploadProgress: 0 });

  const targetIdRef = { id: clipId };
  const progressSink: EventSink = (e: ClipEventInput) => {
    sink(e);
    const p = stepProgress(e.step);
    if (p != null && e.level !== 'error') {
      clipStore.getState().patchClip(targetIdRef.id, { uploadProgress: p });
    }
  };

  // Progress writes are throttled to ~0.4% steps. The native sent-bytes callback
  // fires per socket write (hundreds of times per second on fast Wi-Fi), and an
  // unthrottled patchClip clones the clip map, notifies every subscriber, and
  // re-arms the persistence timer on each call, starving the JS thread during
  // the most memory-sensitive stretch of the upload.
  let lastPatchedProgress = -1;
  const patchProgress = (progress: number) => {
    if (progress < 1 && Math.abs(progress - lastPatchedProgress) < 0.004) return;
    lastPatchedProgress = progress;
    clipStore.getState().patchClip(targetIdRef.id, { uploadProgress: progress });
  };

  try {
    let stage = effectiveStage(
      initial.stage ?? 'pending',
      initial.unitId,
      initial.sourceManifestSha256,
      initial.sourceFiles,
    );

    const memLog = (label: string) => {
      const mb = getMemoryMB();
      if (mb >= 0) sink({ step: 'memory', level: 'info', message: `[mem] ${label}: ${mb.toFixed(0)} MB` });
    };
    memLog('pipeline-start');

    let sourceFilesForUpload: Record<string, string> | undefined;

    // ─── pending → manifested ──────────────────────────────────────────
    if (stage === 'pending') {
      memLog('manifest-begin');
      const manifested = await buildSourceManifest(
        session,
        captureMethod.outputFiles,
        captureMethod.id,
        initial.createdAt,
        initial.unitId,
        progressSink,
        (f) => {
        patchProgress(hashFractionToProgress(f));
        },
      );
      memLog('manifest-done');
      sourceFilesForUpload = manifested.files;
      clipStore.getState().adoptUnitId(clipId, manifested.unitId);
      clipId = manifested.unitId;
      targetIdRef.id = clipId;
      clipStore.getState().patchClip(clipId, {
        stage: 'manifested',
        unitId: manifested.unitId,
        videoBytes: manifested.videoBytes,
        sourceManifestSha256: manifested.sourceManifestSha256,
        sourceFiles: manifested.sourceFiles,
        uploadProgress: 0.4,
      });
      stage = 'manifested';
    }

    // ─── manifested → registered (R2 + POST /api/clips) ───────────────
    if (stage === 'manifested') {
      const cur = clipStore.getState().clips[clipId];
      if (!cur?.unitId || !cur.sourceManifestSha256 || !cur.sourceFiles?.length) {
        throw new Error('原本マニフェスト未確定で登録段に進めません');
      }

      // PUT the capture method's output files to R2 in sequence. The primary
      // video is the raw mp4 from the session dir, sent as is.
      const files = sourceFilesForUpload ?? {};
      if (!sourceFilesForUpload) {
        for (const source of cur.sourceFiles) {
          const localUri = `${session.sessionDir}${source.name}`;
          const info = await FileSystem.getInfoAsync(localUri);
          if (!info.exists || (info as { size?: number }).size !== source.bytes) {
            throw new Error(`manifested source file changed or missing: ${source.name}`);
          }
          const sha256 = await nativeSha256File(localUri);
          if (sha256 !== source.sha256) {
            throw new Error(`manifested source file content changed: ${source.name}`);
          }
          files[source.name] = localUri;
        }
      }
      memLog('upload-begin');
      await uploadToR2(
        {
          unitId: cur.unitId,
          recordingConfig: captureMethod.id,
          sourceManifestSha256: cur.sourceManifestSha256,
          sourceFiles: cur.sourceFiles,
          files,
        },
        progressSink,
        (f) => patchProgress(uploadFractionToProgress(f)),
      );
      memLog('upload-done');

      await registerClip(
        {
          unitId: cur.unitId,
          videoBytes: cur.videoBytes ?? 0,
          sourceManifestSha256: cur.sourceManifestSha256,
          sourceFiles: cur.sourceFiles,
          recordingConfig: captureMethod.id,
          durationMs: cur.durationMs ?? null,
          deviceModel: cur.deviceModel ?? null,
          consentEventId: cur.consentEventId ?? null,
        },
        progressSink,
      );

      clipStore.getState().patchClip(clipId, {
        stage: 'registered',
        state: 'uploaded',
        uploadProgress: 1,
      });
      // Upload complete. Remove the durable clip dir (thumbnails are regenerated
      // from the server-side video from now on).
      await cleanupClipDir(session.sessionDir);
      return;
    }

    // ─── registered: nothing more happens on the device.
  } catch (e) {
    clipStore.getState().patchClip(clipId, { state: 'error', errorMessage: errMsg(e) });
  }
}

/**
 * Discard a clip (local delete). Also removes the durable clip dir so nothing
 * lingers under Documents.
 */
export async function discardClip(clipId: string): Promise<void> {
  const clip = clipStore.getState().clips[clipId];
  if (clip?.sessionDir) await cleanupClipDir(clip.sessionDir);
  clipStore.getState().removeClip(clipId);
}
