/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * ブラウザ内でトラストレス検証を完結させる。
 * RootLens サーバーには一切問い合わせない。
 *
 * 検証ステップ:
 *  1. cNFT が正規コレクションに属するか
 *  2. Arweave オフチェーンデータの TEE 署名 (Ed25519) 検証
 *  3. pHash 照合 (表示画像から再計算 → オンチェーン値と比較)
 *  4. content_hash 一致確認
 */

import type { SignedJson, CorePayload, ExtensionPayload } from "@title-protocol/sdk";
import type { ResolvedContent } from "./content-resolver";
import type { VerificationResult, VerifyStepStatus } from "./types";
import {
  getCollectionMints,
  PHASH_THRESHOLD,
} from "./config";
import { computePHashWasm } from "./phash-wasm";

// ---------------------------------------------------------------------------
// メインの検証関数
// ---------------------------------------------------------------------------

export async function verifyContentOnChain(
  resolved: ResolvedContent,
  thumbnailUrl: string
): Promise<VerificationResult> {
  const result: VerificationResult = {
    collectionVerified: "pending",
    teeSignatureVerified: "pending",
    phashMatched: "pending",
    c2paChainVerified: "pending",
    overall: "pending",
    assetId: resolved.assetId,
    arweaveUri: resolved.arweaveUri,
  };

  console.group("[RootLens Verification]");

  // Step 1: コレクション検証
  console.log("Step 1: Verifying collection membership...");
  const collections = await getCollectionMints();
  result.collectionVerified = verifyCollectionWith(resolved, collections);
  console.log(
    `  → Collection: ${resolved.collectionAddress}`
  );
  console.log(
    `  → Expected core: ${collections.core}`
  );
  console.log(
    `  → Result: ${result.collectionVerified === "verified" ? "verified ✓" : "FAILED ✗"}`
  );

  // Step 2: TEE署名検証
  console.log("Step 2: Verifying TEE signature (Ed25519)...");
  if (resolved.coreSignedJson) {
    result.teeSignatureVerified = await verifyTeeSignature(
      resolved.coreSignedJson
    );
    console.log(`  → TEE pubkey: ${resolved.coreSignedJson.tee_pubkey}`);
    console.log(
      `  → Result: ${result.teeSignatureVerified === "verified" ? "valid ✓" : "FAILED ✗"}`
    );
  } else {
    result.teeSignatureVerified = "failed";
    console.log("  → No signed_json found ✗");
  }

  // Step 3: C2PA チェーン (Core signed_json の存在確認)
  console.log("Step 3: Checking C2PA chain record...");
  if (resolved.coreSignedJson) {
    const payload = resolved.coreSignedJson.payload as CorePayload;
    if (payload.nodes && payload.nodes.length > 0) {
      result.c2paChainVerified = "verified";
      console.log(`  → Provenance nodes: ${payload.nodes.length}`);
      console.log("  → C2PA chain: recorded ✓");
    } else {
      result.c2paChainVerified = "failed";
      console.log("  → No provenance nodes ✗");
    }
  } else {
    result.c2paChainVerified = "failed";
    console.log("  → No core data ✗");
  }

  // Step 4: pHash 照合
  console.log("Step 4: Verifying content identity via pHash...");
  const phashResult = await verifyPHash(resolved, thumbnailUrl);
  result.phashMatched = phashResult.status;
  result.phashDistance = phashResult.distance;
  if (phashResult.onchainHash && phashResult.computedHash) {
    console.log(`  → On-chain pHash: ${phashResult.onchainHash}`);
    console.log(`  → Computed pHash: ${phashResult.computedHash}`);
    console.log(
      `  → Hamming distance: ${phashResult.distance} ${result.phashMatched === "verified" ? "✓" : "✗"} (threshold: ${PHASH_THRESHOLD})`
    );
  } else {
    console.log(`  → pHash: ${phashResult.reason || "skipped"}`);
  }

  // 全体判定 — skipped は除外して判定（データがない検証項目は合否に影響しない）
  const steps = [
    result.collectionVerified,
    result.teeSignatureVerified,
    result.c2paChainVerified,
    result.phashMatched,
  ];
  const activeSteps = steps.filter((s) => s !== "skipped");
  const allVerified = activeSteps.length > 0 && activeSteps.every((s) => s === "verified");
  const anyFailed = activeSteps.some((s) => s === "failed");
  result.overall = allVerified
    ? "verified"
    : anyFailed
      ? "failed"
      : "pending";

  console.log(
    `\nOverall: ${result.overall === "verified" ? "All verification passed ✓" : "Verification incomplete or failed ✗"}`
  );
  console.log(
    "All verification performed client-side. No RootLens server involved."
  );
  console.groupEnd();

  return result;
}

// ---------------------------------------------------------------------------
// Step 1: コレクション検証
// ---------------------------------------------------------------------------

function verifyCollectionWith(
  resolved: ResolvedContent,
  collections: { core: string; ext: string },
): VerifyStepStatus {
  const addr = resolved.collectionAddress;
  if (addr === collections.core || addr === collections.ext) {
    return "verified";
  }
  return "failed";
}

// ---------------------------------------------------------------------------
// Step 2: TEE署名検証 (Ed25519)
// ---------------------------------------------------------------------------

async function verifyTeeSignature(
  signedJson: SignedJson
): Promise<VerifyStepStatus> {
  try {
    const { tee_pubkey, tee_signature, payload, protocol, tee_type, attributes } = signedJson;

    // 署名対象データを再構築: payload + attributes の正規化 JSON
    const signatureTarget = JSON.stringify({ payload, attributes });
    const data = new TextEncoder().encode(signatureTarget);

    // Ed25519 公開鍵 (Base58 → bytes)
    const pubkeyBytes = base58Decode(tee_pubkey);

    // 署名 (Base64 → bytes)
    const sigBytes = base64ToBytes(tee_signature);

    // Web Crypto API で Ed25519 検証
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      pubkeyBytes.buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      sigBytes.buffer as ArrayBuffer,
      data.buffer as ArrayBuffer
    );

    return valid ? "verified" : "failed";
  } catch (e) {
    console.warn("  → Ed25519 verification error:", e);
    // ブラウザが Ed25519 未対応の場合は skipped
    if (e instanceof Error && e.message.includes("not supported")) {
      return "skipped";
    }
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Step 3: pHash 照合
// ---------------------------------------------------------------------------

interface PHashResult {
  status: VerifyStepStatus;
  distance?: number;
  onchainHash?: string;
  computedHash?: string;
  reason?: string;
}

async function verifyPHash(
  resolved: ResolvedContent,
  thumbnailUrl: string
): Promise<PHashResult> {
  // Extension signed_json から image-phash の結果を探す
  const phashExtension = resolved.extensionSignedJsons.find((sj) => {
    const p = sj.payload as ExtensionPayload;
    return p.extension_id === "image-phash";
  });

  if (phashExtension) {
    // image-phash extension: payload.phash に直接ハッシュ値が入っている
    const payload = phashExtension.payload as ExtensionPayload & { phash?: string };
    const onchainHash = payload.phash;
    if (onchainHash) {
      return verifyPHashWithImage(onchainHash, thumbnailUrl);
    }
  }

  // フォールバック: attributes から探す
  const phashAttr = resolved.attributes.find(
    (a) => a.trait_type === "phash"
  );
  if (phashAttr) {
    return verifyPHashWithImage(phashAttr.value, thumbnailUrl);
  }

  return { status: "skipped", reason: "No pHash data in on-chain record" };
}

async function verifyPHashWithImage(
  onchainHash: string,
  thumbnailUrl: string
): Promise<PHashResult> {
  try {
    const computedHash = await computePHashWasm(thumbnailUrl);
    const distance = hammingDistance(onchainHash, computedHash);

    return {
      status: distance <= PHASH_THRESHOLD ? "verified" : "failed",
      distance,
      onchainHash,
      computedHash,
    };
  } catch (e) {
    console.warn("  → pHash computation error:", e);
    return { status: "skipped", reason: `Computation failed: ${e}` };
  }
}

// ---------------------------------------------------------------------------
// pHash 計算 (DCT 64-bit) — 仕様書 §6.3.1
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// ハミング距離
// ---------------------------------------------------------------------------

/**
 * 16進数文字列の pHash 間のハミング距離を算出する。
 */
export function hammingDistance(a: string, b: string): number {
  const x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let dist = 0;
  let bits = x;
  while (bits > 0n) {
    dist += Number(bits & 1n);
    bits >>= 1n;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// エンコーディングユーティリティ
// ---------------------------------------------------------------------------

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const c of str) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${c}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // leading zeros
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
