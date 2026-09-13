import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const SHA256_RE = /^[0-9a-f]{64}$/;
export const SITE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const UNIT_ID_RE = /^unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8}$/;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function compactUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('録画開始時刻が不正です');
  return date.toISOString().replace(/[-:]/g, '').replace('.', '');
}

function randomSuffix(length = 8) {
  return [...randomBytes(length)].map((byte) => CROCKFORD[byte & 31]).join('');
}

export function createUnitId(siteId, recordedAt) {
  if (!SITE_ID_RE.test(siteId)) throw new Error(`site_idが不正です: ${siteId}`);
  const unitId = `unit_${siteId}_${compactUtc(recordedAt)}_${randomSuffix()}`;
  if (!UNIT_ID_RE.test(unitId)) throw new Error(`unit_idの生成に失敗しました: ${unitId}`);
  return unitId;
}

export async function sha256File(file, onProgress) {
  const stat = await fs.stat(file);
  const handle = await fs.open(file, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let offset = 0;
  try {
    while (offset < stat.size) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - offset), offset);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
      onProgress?.(stat.size ? offset / stat.size : 1);
    }
  } finally {
    await handle.close();
  }
  if (offset !== stat.size) throw new Error(`SHA-256読込サイズ不一致: ${file}`);
  return hash.digest('hex');
}

export async function describeFiles(folder, names) {
  const files = [];
  for (const name of [...names].sort()) {
    const file = path.join(folder, name);
    const [stat, sha256] = await Promise.all([fs.stat(file), sha256File(file)]);
    if (!stat.isFile() || stat.size <= 0) throw new Error(`原本ファイルが不正です: ${name}`);
    files.push({ name, bytes: stat.size, sha256 });
  }
  return files;
}

export function canonicalSourceManifest(unitId, files) {
  if (!UNIT_ID_RE.test(unitId)) throw new Error(`unit_idが不正です: ${unitId}`);
  return {
    schema: 'io.rootlens.source-manifest.v1',
    unit_id: unitId,
    files: [...files]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  };
}

export function sourceManifestSha256(unitId, files) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalSourceManifest(unitId, files)), 'utf8')
    .digest('hex');
}

export function sourceRecordingManifestSha256(recordingId, files) {
  const manifest = {
    schema: 'io.rootlens.source-recording-manifest.v1',
    recording_id: recordingId,
    files: [...files]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  };
  return createHash('sha256').update(JSON.stringify(manifest), 'utf8').digest('hex');
}
