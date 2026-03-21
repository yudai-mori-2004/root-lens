/**
 * 仕様書 §5.2 クライアントサイド検証フロー
 *
 * ブラウザ内でトラストレス検証を完結させる。
 * RootLens サーバーには一切問い合わせない。
 *
 * 全NFT共通ステップ:
 *  1. コレクション所属確認
 *  2. TEE署名検証 (Ed25519)
 *
 * NFT固有ステップ (specificChecks):
 *  Core (c2pa): C2PA来歴チェーン確認, content_hash一致, 重複解決
 *  Extension (image-phash): pHash同一性検証
 *  Extension (hardware-*): ハードウェア署名検出
 *  Extension (その他): WASMハッシュ検証
 */

import type { SignedJson, CorePayload, ExtensionPayload } from "@title-protocol/sdk";
import type { ResolvedContent } from "./content-resolver";
import type { VerificationResult, VerifyStepStatus, NftVerification, SpecificCheck } from "./types";
import {
  getGlobalConfigData,
  findWasmVersionByHash,
  type GlobalConfigData,
  PHASH_THRESHOLD,
} from "./config";
import { contentResolver } from "./content-resolver";
import { computePHashWasm } from "./phash-wasm";

// ---------------------------------------------------------------------------
// メインの検証関数
// ---------------------------------------------------------------------------

/** 翻訳関数の型。check.* キーを解決する。存在しないキーはキー名をそのまま返す */
export type CheckTranslator = (key: string, params?: Record<string, string | number>) => string;

export async function verifyContentOnChain(
  resolved: ResolvedContent,
  thumbnailUrl: string,
  queryContentHash: string,
  tc: CheckTranslator,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    nfts: [],
    overall: "pending",
    assetId: resolved.assetId,
    arweaveUri: resolved.arweaveUri,
  };

  console.group("[RootLens Verification] §5.2");

  // Step 1 (global): GlobalConfig取得
  console.log("Fetching Global Config...");
  const globalConfig = await getGlobalConfigData();

  // =====================================================================
  // Core NFT 検証
  // =====================================================================
  const coreNft: NftVerification = {
    id: "c2pa",
    collectionVerified: "pending",
    teeSignatureVerified: "pending",
    specificChecks: [],
  };

  // 共通ステップ1: コレクション
  coreNft.collectionVerified = resolved.collectionAddress === globalConfig.core
    ? "verified" : "failed";
  console.log(`Core collection: ${coreNft.collectionVerified}`);

  // 共通ステップ2: TEE署名
  if (resolved.coreSignedJson) {
    coreNft.teeSignatureVerified = await verifyTeeSignature(resolved.coreSignedJson);
  } else {
    coreNft.teeSignatureVerified = "failed";
  }
  console.log(`Core TEE sig: ${coreNft.teeSignatureVerified}`);

  // Core固有: C2PA来歴チェーン
  if (resolved.coreSignedJson) {
    const payload = resolved.coreSignedJson.payload as CorePayload;
    const hasNodes = payload.nodes && payload.nodes.length > 0;
    coreNft.specificChecks.push({
      label: tc("c2pa_chain"),
      status: hasNodes ? "verified" : "failed",
      detail: hasNodes
        ? tc("c2pa_chain_pass", { nodes: payload.nodes.length, links: payload.links?.length ?? 0 })
        : tc("c2pa_chain_fail"),
    });
  } else {
    coreNft.specificChecks.push({
      label: tc("c2pa_chain"),
      status: "failed",
      detail: tc("c2pa_chain_fail"),
    });
  }

  // Core固有: content_hash一致
  if (resolved.coreSignedJson) {
    const payload = resolved.coreSignedJson.payload as CorePayload;
    const matched = payload.content_hash === queryContentHash;
    coreNft.specificChecks.push({
      label: tc("content_hash_match"),
      status: matched ? "verified" : "failed",
      detail: matched ? tc("content_hash_match_pass") : tc("content_hash_match_fail"),
    });
  } else {
    coreNft.specificChecks.push({
      label: tc("content_hash_match"),
      status: "failed",
      detail: tc("content_hash_match_fail"),
    });
  }

  // Core固有: オリジナルチェック（自分が最古の登録か）
  if (contentResolver.resolveAllByContentHash) {
    const allResolved = await contentResolver.resolveAllByContentHash(queryContentHash);
    const isOriginal = allResolved.length === 0 || allResolved[0].assetId === resolved.assetId;
    coreNft.specificChecks.push({
      label: tc("original_check"),
      status: isOriginal ? "verified" : "failed",
      detail: isOriginal ? tc("original_check_pass") : tc("original_check_fail"),
    });
  }

  result.nfts.push(coreNft);

  // =====================================================================
  // Extension NFT 検証（全extensionを同じ枠組みで処理）
  // =====================================================================
  for (const extNft of resolved.extensionNfts) {
    const extSj = extNft.signedJson;
    const extPayload = extSj.payload as ExtensionPayload;
    const extId = extPayload.extension_id || "unknown";

    const nftVerif: NftVerification = {
      id: extId,
      collectionVerified: "pending",
      teeSignatureVerified: "pending",
      specificChecks: [],
    };

    // 共通ステップ1: コレクション
    nftVerif.collectionVerified = extNft.collectionAddress === globalConfig.ext
      ? "verified" : "failed";

    // 共通ステップ2: TEE署名
    nftVerif.teeSignatureVerified = await verifyTeeSignature(extSj);
    console.log(`[${extId}] collection: ${nftVerif.collectionVerified}, TEE sig: ${nftVerif.teeSignatureVerified}`);

    // Extension固有: WASMハッシュ検証（NFTのwasm_hashに一致するバージョンがあるか）
    const wasmHash = (extPayload as Record<string, unknown>).wasm_hash as string | undefined;
    if (wasmHash && globalConfig.trustedWasmModules.length > 0) {
      const matchedVersion = findWasmVersionByHash(globalConfig.trustedWasmModules, extId, wasmHash);
      nftVerif.specificChecks.push({
        label: tc("wasm_hash"),
        status: matchedVersion ? "verified" : "failed",
        detail: matchedVersion ? tc("wasm_hash_pass") : tc("wasm_hash_fail"),
      });
    } else if (wasmHash) {
      nftVerif.specificChecks.push({
        label: tc("wasm_hash"),
        status: "skipped",
        detail: tc("wasm_hash_skip"),
      });
    }

    // Extension固有: image-phash → pHash同一性検証
    if (extId === "image-phash") {
      const phashPayload = extPayload as ExtensionPayload & { phash?: string };
      if (phashPayload.phash) {
        const phashResult = await verifyPHashWithImage(phashPayload.phash, thumbnailUrl, wasmHash);
        if (phashResult.distance !== undefined) {
          nftVerif.specificChecks.push({
            label: tc("phash_identity"),
            status: phashResult.status,
            detail: tc(phashResult.status === "verified" ? "phash_identity_pass" : "phash_identity_fail", { distance: phashResult.distance, threshold: PHASH_THRESHOLD }),
          });
        } else {
          // 画像取得失敗（CORSなど）
          nftVerif.specificChecks.push({
            label: tc("phash_identity"),
            status: "skipped",
            detail: tc("phash_identity_error", { reason: phashResult.reason || "unknown" }),
          });
        }
      } else {
        nftVerif.specificChecks.push({
          label: tc("phash_identity"),
          status: "skipped",
          detail: tc("phash_identity_skip"),
        });
      }
    }

    // Extension固有: hardware-* → ハードウェア署名検出
    if (extId.startsWith("hardware-")) {
      nftVerif.specificChecks.push({
        label: tc("hardware_signing"),
        status: nftVerif.teeSignatureVerified,
        detail: nftVerif.teeSignatureVerified === "verified"
          ? tc("hardware_signing_pass", { id: extId })
          : tc("hardware_signing_fail"),
      });
    }

    result.nfts.push(nftVerif);
  }

  // =====================================================================
  // 全体判定
  // =====================================================================
  const allChecks: VerifyStepStatus[] = [];
  for (const nft of result.nfts) {
    allChecks.push(nft.collectionVerified);
    allChecks.push(nft.teeSignatureVerified);
    for (const sc of nft.specificChecks) {
      allChecks.push(sc.status);
    }
  }
  const active = allChecks.filter((s) => s !== "skipped");
  const allVerified = active.length > 0 && active.every((s) => s === "verified");
  const anyFailed = active.some((s) => s === "failed");
  result.overall = allVerified ? "verified" : anyFailed ? "failed" : "pending";

  console.log(`Overall: ${result.overall}`);
  console.groupEnd();

  return result;
}

// ---------------------------------------------------------------------------
// TEE署名検証 (Ed25519)
// ---------------------------------------------------------------------------

async function verifyTeeSignature(
  signedJson: SignedJson
): Promise<VerifyStepStatus> {
  try {
    const { tee_pubkey, tee_signature, payload, attributes } = signedJson;
    const signatureTarget = JSON.stringify({ payload, attributes });
    const data = new TextEncoder().encode(signatureTarget);
    const pubkeyBytes = base58Decode(tee_pubkey);
    const sigBytes = base64ToBytes(tee_signature);

    const cryptoKey = await crypto.subtle.importKey(
      "raw", pubkeyBytes.buffer as ArrayBuffer,
      { name: "Ed25519" }, false, ["verify"]
    );
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" }, cryptoKey,
      sigBytes.buffer as ArrayBuffer, data.buffer as ArrayBuffer
    );
    return valid ? "verified" : "failed";
  } catch (e) {
    console.warn("  → Ed25519 verification error:", e);
    if (e instanceof Error && e.message.includes("not supported")) return "skipped";
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// pHash 照合
// ---------------------------------------------------------------------------

interface PHashResult {
  status: VerifyStepStatus;
  distance?: number;
  reason?: string;
}

async function verifyPHashWithImage(
  onchainHash: string,
  thumbnailUrl: string,
  wasmHash?: string,
): Promise<PHashResult> {
  try {
    const computedHash = await computePHashWasm(thumbnailUrl, wasmHash);
    const distance = hammingDistance(onchainHash, computedHash);
    return {
      status: distance <= PHASH_THRESHOLD ? "verified" : "failed",
      distance,
    };
  } catch (e) {
    console.warn("  → pHash computation error:", e);
    return { status: "skipped", reason: `Computation failed: ${e}` };
  }
}

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

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
