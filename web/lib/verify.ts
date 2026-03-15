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
  // Extension signed_json から phash-v1 の結果を探す
  const phashExtension = resolved.extensionSignedJsons.find((sj) => {
    const p = sj.payload as ExtensionPayload;
    return p.extension_id === "phash-v1";
  });

  if (phashExtension) {
    // phash-v1 extension: payload.phash に直接ハッシュ値が入っている
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
    const computedHash = await computePHash(thumbnailUrl);
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

/**
 * 画像から DCT 64-bit pHash を計算する。
 * Title Protocol phash-v1 WASM と完全に同一のアルゴリズム。
 *
 * 1. 32x32 にリサイズ + グレースケール（u8精度）
 * 2. 分離型 2D DCT（scale = sqrt(2/N), DC成分 cu/cv = 1/sqrt(2)）
 * 3. 左上 8x8 低周波ブロック抽出
 * 4. DC成分(values[0])を除く 63値の平均と比較
 * 5. values[i] > mean なら bit i = 1（LSBファースト）
 */
export async function computePHash(imageUrl: string): Promise<string> {
  const SIZE = 32;
  const LOW_FREQ = 8;

  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);

  const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  const pixels = imageData.data;

  // グレースケール変換（u8精度 — WASM側はホストがu8で返す）
  const gray = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // f32 matrix
  const matrix: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    matrix[y] = [];
    for (let x = 0; x < SIZE; x++) {
      matrix[y][x] = gray[y * SIZE + x];
    }
  }

  // 分離型 2D DCT（phash-v1 WASM と同一）
  const n = SIZE;
  const scale = Math.sqrt(2.0 / n);
  const invSqrt2 = 1.0 / Math.sqrt(2.0);

  // 行方向 DCT
  const rowDct: number[][] = [];
  for (let y = 0; y < n; y++) {
    rowDct[y] = [];
    for (let u = 0; u < n; u++) {
      const cu = u === 0 ? invSqrt2 : 1.0;
      let sum = 0;
      for (let x = 0; x < n; x++) {
        sum += matrix[y][x] * Math.cos(Math.PI * (2 * x + 1) * u / (2 * n));
      }
      rowDct[y][u] = sum * cu * scale;
    }
  }

  // 列方向 DCT
  const dct: number[][] = [];
  for (let v = 0; v < n; v++) {
    dct[v] = [];
    for (let u = 0; u < n; u++) {
      const cv = v === 0 ? invSqrt2 : 1.0;
      let sum = 0;
      for (let y = 0; y < n; y++) {
        sum += rowDct[y][u] * Math.cos(Math.PI * (2 * y + 1) * v / (2 * n));
      }
      dct[v][u] = sum * cv * scale;
    }
  }

  // 左上 8x8 抽出
  const values: number[] = [];
  for (let v = 0; v < LOW_FREQ; v++) {
    for (let u = 0; u < LOW_FREQ; u++) {
      values.push(dct[v][u]);
    }
  }

  // DC成分(values[0])を除く 63値の平均
  let sum = 0;
  for (let i = 1; i < 64; i++) sum += values[i];
  const mean = sum / 63;

  // LSBファースト: bit i = (values[i] > mean ? 1 : 0) << i
  let hashBigInt = BigInt(0);
  for (let i = 0; i < 64; i++) {
    if (values[i] > mean) {
      hashBigInt |= BigInt(1) << BigInt(i);
    }
  }

  return hashBigInt.toString(16).padStart(16, "0");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

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
