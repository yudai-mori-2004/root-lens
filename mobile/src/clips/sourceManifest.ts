// Assign a stable unit id, write it into metadata, and hash every source file.

import * as FileSystem from 'expo-file-system/legacy';

import { nativeSha256File } from '../native/fileHash';
import type { EventSink } from './events';
import type { OutputFileSpec, RecordingSession } from '../capture';
import type { SourceFileIntegrity, SourceManifestResult } from './types';
import { issueUnitId } from './rawUpload';
import { sourceManifestSha256 } from './sourceManifestDigest';

const HEX64 = /^[0-9a-f]{64}$/;
const UNIT_ID_RE = /^unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8}$/;

function sessionUri(session: RecordingSession, name: string): string {
  return `${session.sessionDir.endsWith('/') ? session.sessionDir : `${session.sessionDir}/`}${name}`;
}

async function readMetadata(session: RecordingSession): Promise<Record<string, unknown>> {
  const uri = sessionUri(session, 'metadata.json');
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(uri)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`metadata.json is not valid JSON: ${String(error)}`);
  }
}

function recordedAt(metadata: Record<string, unknown>, fallbackMs: number): string {
  for (const key of ['created_at', 'recorded_at']) {
    const value = metadata[key];
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return new Date(fallbackMs).toISOString();
}

export async function buildSourceManifest(
  session: RecordingSession,
  outputFiles: readonly OutputFileSpec[],
  recordingConfig: string,
  fallbackRecordedAtMs: number,
  existingUnitId: string | undefined,
  sink: EventSink,
  onProgress?: (fraction: number) => void,
): Promise<SourceManifestResult> {
  const metadata = await readMetadata(session);
  const embeddedUnitId = typeof metadata.unit_id === 'string' && UNIT_ID_RE.test(metadata.unit_id)
    ? metadata.unit_id
    : undefined;
  const issued = existingUnitId || embeddedUnitId
    ? null
    : await issueUnitId(recordedAt(metadata, fallbackRecordedAtMs), recordingConfig);
  const unitId = existingUnitId ?? embeddedUnitId ?? issued?.unitId;
  if (!unitId) throw new Error('unit_id could not be issued');
  if (!UNIT_ID_RE.test(unitId)) throw new Error(`invalid unit_id: ${unitId}`);

  metadata.unit_id = unitId;
  if (issued?.siteId) metadata.site_id = issued.siteId;
  await FileSystem.writeAsStringAsync(sessionUri(session, 'metadata.json'), JSON.stringify(metadata, null, 2));

  const files: Record<string, string> = {};
  let totalBytes = 0;
  for (const spec of outputFiles) {
    const uri = sessionUri(session, spec.name);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      if (spec.required) throw new Error(`required source file missing: ${spec.name}`);
      continue;
    }
    const bytes = (info as { size?: number }).size ?? 0;
    if (bytes <= 0) throw new Error(`source file is empty: ${spec.name}`);
    files[spec.name] = uri;
    totalBytes += bytes;
  }

  sink({
    step: 'source-manifest',
    level: 'info',
    message: `${Object.keys(files).length}個の原本ファイルを検証 (${(totalBytes / 1e6).toFixed(1)} MB)`,
  });

  const sourceFiles: SourceFileIntegrity[] = [];
  let completedBytes = 0;
  for (const name of Object.keys(files).sort()) {
    const info = await FileSystem.getInfoAsync(files[name]);
    const bytes = (info as { size?: number }).size ?? 0;
    const digest = await nativeSha256File(files[name]);
    if (!digest || !HEX64.test(digest)) throw new Error(`SHA-256 failed for ${name}`);
    sourceFiles.push({ name, bytes, sha256: digest });
    completedBytes += bytes;
    if (totalBytes > 0) onProgress?.(completedBytes / totalBytes);
  }

  const manifestSha256 = sourceManifestSha256(unitId, sourceFiles);
  const video = sourceFiles.find((file) => file.name === 'rgb.mp4');
  if (!video) throw new Error('source manifest has no rgb.mp4');

  sink({
    step: 'source-manifest',
    level: 'success',
    message: `原本マニフェスト確定: ${unitId}`,
    detail: { unitId, sourceManifestSha256: manifestSha256, sourceFiles },
  });
  return { unitId, videoBytes: video.bytes, sourceManifestSha256: manifestSha256, sourceFiles, files };
}
