import { contentResolver } from '../lib/content-resolver';
import { verifyContentOnChain } from '../lib/verify';

const contentHash = '0xa1476d7705cdc9cf2903d0aef5d7897e207715683aa3dc6375b59da76712d2d3';
const thumbnailUrl = 'https://pub-494b37dbfc9645299042fcf51236d1fc.r2.dev/content/97a7a73e-e220-4a32-8f5c-84f60fae0d93.jpg';

async function main() {
  console.log('Resolving content_hash:', contentHash);

  const resolved = await contentResolver.resolveByContentHash(contentHash);
  if (!resolved) {
    console.log('NOT FOUND');
    return;
  }

  console.log('\n=== Resolved ===');
  console.log('Asset ID:', resolved.assetId);
  console.log('Collection:', resolved.collectionAddress);
  console.log('Core signed_json:', !!resolved.coreSignedJson);
  console.log('Extension signed_jsons:', resolved.extensionSignedJsons.length);

  for (const ext of resolved.extensionSignedJsons) {
    const p = ext.payload as any;
    console.log(`  extension: ${p.extension_id}, phash: ${p.phash}`);
  }

  console.log('\n=== Verification ===');
  const result = await verifyContentOnChain(resolved, thumbnailUrl);
  console.log('\n=== Result ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
