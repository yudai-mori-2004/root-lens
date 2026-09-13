import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalSourceManifest, sourceManifestSha256 } from '../lib/integrity.mjs';

const testVector = JSON.parse(await readFile(
  new URL('../../../tests/source-manifest-v1.json', import.meta.url),
  'utf8',
));

test('source manifest matches the cross-runtime test vector', () => {
  assert.equal(JSON.stringify(canonicalSourceManifest(testVector.unitId, testVector.files)), testVector.canonicalJson);
  assert.equal(sourceManifestSha256(testVector.unitId, testVector.files), testVector.sha256);
});
