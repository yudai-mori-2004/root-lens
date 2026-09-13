import fixture from '../../../fixtures/source-manifest-v1.json';
import { describe, expect, it } from 'vitest';

import { canonicalSourceManifest, sourceManifestSha256 } from './sourceManifestContract';

describe('source manifest contract', () => {
  it('matches the cross-runtime fixture', () => {
    expect(canonicalSourceManifest(fixture.unitId, fixture.files)).toBe(fixture.canonicalJson);
    expect(sourceManifestSha256(fixture.unitId, fixture.files)).toBe(fixture.sha256);
  });
});
