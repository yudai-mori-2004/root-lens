/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
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
import type { VerificationResult, VerifyStepStatus, NftVerification, SpecificCheck } from "../types";
import {
  getGlobalConfigData,
  findWasmVersionByHash,
  type GlobalConfigData,
  PHASH_THRESHOLD,
  DAS_RPC_URL,
} from "./config";
import { contentResolver } from "./content-resolver";
import { computePHashWasm } from "./phash-wasm";

// ---------------------------------------------------------------------------
// メインの検証関数
// ---------------------------------------------------------------------------

/** 翻訳関数の型。check.* キーを解決する。存在しないキーはキー名をそのまま返す */
export type CheckTranslator = (key: string, params?: Record<string, string | number>) => string;

/**
 * ユーザーが手元で知覚しているメディアへの参照。
 * オンチェーンに記録された知覚特徴量（pHash等）との同一性検証に使用する。
 *
 * これらはRootLensサーバー由来であり、信頼境界の外にある。
 * 検証結果は「この表示データがオンチェーン記録と一致するか」を示すものであり、
 * 表示データ自体の真正性を保証するものではない。
 *
 * 全フィールドはURL形式。ローカルデータは URL.createObjectURL(blob) で変換可能。
 */
export interface PerceptualInputs {
  /** 画像pHash比較対象。image-phash Extension の検証に使用 */
  imageUrl?: string;
  /** 動画pHash比較対象。video-phash Extension の検証に使用（将来） */
  videoUrl?: string;
}

/** ログ用マーク */
const mark = (s: VerifyStepStatus) => s === "verified" ? "\u2713" : s === "failed" ? "\u2717" : "-";

export async function verifyContentOnChain(
  resolved: ResolvedContent,
  perceptual: PerceptualInputs,
  queryContentHash: string,
  tc: CheckTranslator,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    nfts: [],
    overall: "pending",
    assetId: resolved.assetId,
    arweaveUri: resolved.arweaveUri,
  };

  const hashShort = queryContentHash.slice(0, 10) + "..." + queryContentHash.slice(-4);

  // --- console.groupCollapsed: 並列実行でもコンテンツ間でログが混ざらない ---
  console.groupCollapsed(`Content: ${hashShort}`);

  // INPUT
  console.log(
    `  INPUT (from RootLens page metadata \u2014 not verified)\n` +
    `  \u251c\u2500 Content Hash: ${queryContentHash}\n` +
    `  \u2502  (SHA-256 of C2PA Active Manifest Signature)\n` +
    (perceptual.imageUrl ? `  \u251c\u2500 Display image: ${perceptual.imageUrl}\n` : "") +
    (perceptual.videoUrl ? `  \u251c\u2500 Display video: ${perceptual.videoUrl}\n` : "") +
    `  \u2514\u2500 content_hash only used below\n`
  );

  // Title Protocol box
  const globalConfig = await getGlobalConfigData();
  const extNftIds = resolved.extensionNfts.map(e => {
    const p = e.signedJson.payload as ExtensionPayload;
    return p.extension_id || "unknown";
  });
  console.log(
    `  \u250c\u2500 Title Protocol \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n` +
    `  \u2502  https://github.com/yudai-mori-2004/title-protocol\n` +
    `  \u2502\n` +
    `  \u2502  Solana RPC: ${DAS_RPC_URL}\n` +
    `  \u2502  \u251c\u2500 Core cNFT: ${resolved.assetId} (oldest by leaf_id)\n` +
    resolved.extensionNfts.map((e, i) => {
      const p = e.signedJson.payload as ExtensionPayload;
      return `  \u2502  ${i === resolved.extensionNfts.length - 1 ? "\u2514" : "\u251c"}\u2500 Ext  cNFT: ${e.assetId} (${p.extension_id || "unknown"})`;
    }).join("\n") + "\n" +
    `  \u2502\n` +
    `  \u2502  Off-chain storage (TEE-signed data)\n` +
    `  \u2502  \u251c\u2500 Core: ${resolved.arweaveUri}\n` +
    resolved.extensionNfts.map((e, i) =>
      `  \u2502  ${i === resolved.extensionNfts.length - 1 ? "\u2514" : "\u251c"}\u2500 Ext:  ${e.arweaveUri}`
    ).join("\n") + "\n" +
    `  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`
  );

  // SIGNATURE VERIFICATION header
  const corePubkey = resolved.coreSignedJson?.tee_pubkey?.slice(0, 8) || "?";
  console.log(`  SIGNATURE VERIFICATION`);

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

  // 共通ステップ2: TEE署名
  if (resolved.coreSignedJson) {
    coreNft.teeSignatureVerified = await verifyTeeSignature(resolved.coreSignedJson);
    console.log(`  verify(pubkey: ${corePubkey}..., core_data) = ${mark(coreNft.teeSignatureVerified)}`);
  } else {
    coreNft.teeSignatureVerified = "failed";
    console.log(`  verify(core_data) = \u2717 (no signed_json)`);
  }

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
    if (allResolved === null) {
      // DAS APIエラー: 比較不能 → failed（"判定不能"であり"オリジナル"ではない）
      coreNft.specificChecks.push({
        label: tc("original_check"),
        status: "failed",
        detail: tc("original_check_error"),
      });
    } else {
      const isOriginal = allResolved.length === 0 || allResolved[0].assetId === resolved.assetId;
      coreNft.specificChecks.push({
        label: tc("original_check"),
        status: isOriginal ? "verified" : "failed",
        detail: isOriginal ? tc("original_check_pass") : tc("original_check_fail"),
      });
    }
  } else {
    // resolverがメソッドを持たない場合も明示的にfailed
    coreNft.specificChecks.push({
      label: tc("original_check"),
      status: "failed",
      detail: tc("original_check_error"),
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
    const extPubkey = extSj.tee_pubkey?.slice(0, 8) || "?";
    console.log(`  verify(pubkey: ${extPubkey}..., ${extId}_data) = ${mark(nftVerif.teeSignatureVerified)}`);

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
      // GlobalConfigにモジュール未登録（devnet等）
      nftVerif.specificChecks.push({
        label: tc("wasm_hash"),
        status: "skipped",
        detail: tc("wasm_hash_skip"),
      });
    } else {
      // wasm_hashがペイロードに存在しない → Extension NFTとして不正
      nftVerif.specificChecks.push({
        label: tc("wasm_hash"),
        status: "failed",
        detail: tc("wasm_hash_missing"),
      });
    }

    // Extension固有: image-phash → pHash同一性検証
    if (extId === "image-phash") {
      const phashPayload = extPayload as ExtensionPayload & { phash?: string };
      if (phashPayload.phash) {
        const phashResult = perceptual.imageUrl
          ? await verifyPHashWithImage(phashPayload.phash, perceptual.imageUrl, wasmHash)
          : { status: "skipped" as const, reason: "No image URL provided for pHash comparison" };
        if (phashResult.distance !== undefined) {
          nftVerif.specificChecks.push({
            label: tc("phash_identity"),
            status: phashResult.status,
            detail: tc(phashResult.status === "verified" ? "phash_identity_pass" : "phash_identity_fail", { distance: phashResult.distance, threshold: PHASH_THRESHOLD }),
          });
        } else {
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
  // 全体判定 + リアルタイムログ
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

  // リアルタイムステップログ（各NFTの全チェックを列挙）
  console.log(`\n  VERIFICATION STEPS`);
  for (const nft of result.nfts) {
    const nftLabel = nft.id === "c2pa" ? "Core" : `Ext (${nft.id})`;
    console.log(`  ${mark(nft.collectionVerified)} ${nftLabel} collection membership`);
    console.log(`  ${mark(nft.teeSignatureVerified)} ${nftLabel} TEE signature (Ed25519)`);
    for (const sc of nft.specificChecks) {
      let line = `  ${mark(sc.status)} ${sc.label}`;
      if (sc.detail) line += `: ${sc.detail}`;
      console.log(line);
    }
  }

  // Owner
  console.log(`  ${mark("verified")} Owner: ${resolved.ownerWallet}`);

  // サマリー
  const passed = active.filter((s) => s === "verified").length;
  console.log(
    `\n  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n` +
    `  ${mark(result.overall)} ${result.overall.toUpperCase()} (${passed}/${active.length})\n` +
    `  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n` +
    `  RootLens server was NOT consulted.\n` +
    `  Verify: https://solana.fm/address/${resolved.assetId}`
  );
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
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// pHash 照合
// ---------------------------------------------------------------------------

interface PHashResult {
  status: VerifyStepStatus;
  distance?: number;
  computedHash?: string;
  reason?: string;
}

async function verifyPHashWithImage(
  onchainHash: string,
  imageUrl: string,
  wasmHash?: string,
): Promise<PHashResult> {
  try {
    const computed = await computePHashWasm(imageUrl, wasmHash);
    const distance = hammingDistance(onchainHash, computed);
    return {
      status: distance <= PHASH_THRESHOLD ? "verified" : "failed",
      distance,
      computedHash: computed,
    };
  } catch (e) {
    console.warn("  → pHash computation error:", e);
    return { status: "failed", reason: `Computation failed: ${e}` };
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
