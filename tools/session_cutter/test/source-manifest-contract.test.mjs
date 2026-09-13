import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalSourceManifest, sourceManifestSha256 } from '../lib/integrity.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../../../fixtures/source-manifest-v1.json', import.meta.url),
  'utf8',
));

test('source manifest matches the cross-runtime fixture', () => {
  assert.equal(JSON.stringify(canonicalSourceManifest(fixture.unitId, fixture.files)), fixture.canonicalJson);
  assert.equal(sourceManifestSha256(fixture.unitId, fixture.files), fixture.sha256);
});
