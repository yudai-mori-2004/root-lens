import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { SourceFileIntegrity } from './types';

export function canonicalSourceManifest(unitId: string, files: SourceFileIntegrity[]): string {
  return JSON.stringify({
    schema: 'io.rootlens.source-manifest.v1',
    unit_id: unitId,
    files: [...files]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(({ name, bytes, sha256: digest }) => ({ name, bytes, sha256: digest })),
  });
}

export function sourceManifestSha256(unitId: string, files: SourceFileIntegrity[]): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalSourceManifest(unitId, files))));
}
