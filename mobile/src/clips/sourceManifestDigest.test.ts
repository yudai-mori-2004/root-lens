import testVector from '../../../tests/source-manifest-v1.json';
import { describe, expect, it } from 'vitest';

import { canonicalSourceManifest, sourceManifestSha256 } from './sourceManifestDigest';

describe('source manifest contract', () => {
  it('matches the cross-runtime test vector', () => {
    expect(canonicalSourceManifest(testVector.unitId, testVector.files)).toBe(testVector.canonicalJson);
    expect(sourceManifestSha256(testVector.unitId, testVector.files)).toBe(testVector.sha256);
  });
});
