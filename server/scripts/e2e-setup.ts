/**
 * E2Eセットアップスクリプト
 * 1. テスト画像を R2 にアップロード
 * 2. Supabase にページレコード作成
 * 3. 公開ページURL出力
 */

import "dotenv/config";
import * as fs from "node:fs";
import { uploadPublic, contentKey, ogpKey } from "../lib/r2.js";
import { createPage } from "../lib/page-store.js";

const IMAGE_PATH = "/Users/forest/WebCreations/title-protocol/integration-tests/fixtures/pixel_photo_ramen.jpg";
const CONTENT_HASH = "0xf44718548624e507bdd893d2bb7492d84b16faf56ca1b9d923b6521129b50905";
// この asset_id は登録が broadcast されていれば存在するが、なくても E2E フローは確認できる
const ASSET_ID = "";

async function main() {
  console.log("1. R2 に画像をアップロード中...");
  const imageBytes = fs.readFileSync(IMAGE_PATH);
  const key = contentKey(CONTENT_HASH.replace("0x", ""));
  const thumbnailUrl = await uploadPublic(key, imageBytes, "image/jpeg");
  console.log(`   → ${thumbnailUrl}`);

  // OGP も同じ画像を使う（本番ではアプリが帯付き画像を生成）
  const oKey = ogpKey(CONTENT_HASH.replace("0x", ""));
  const ogpUrl = await uploadPublic(oKey, imageBytes, "image/jpeg");
  console.log(`   → OGP: ${ogpUrl}`);

  console.log("\n2. Supabase にページレコード作成中...");
  const record = await createPage({
    contentHash: CONTENT_HASH,
    assetId: ASSET_ID,
    thumbnailUrl,
    ogpImageUrl: ogpUrl,
  });
  console.log(`   → shortId: ${record.shortId}`);
  console.log(`   → pageUrl: /p/${record.shortId}`);

  console.log("\n3. 公開ページURL:");
  console.log(`   http://localhost:3000/p/${record.shortId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
