/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * 公開ページのデータ取得・検証の統合モジュール。
 * モックモードとリアルモードをシームレスに切り替える。
 *
 * データフロー:
 *  1. サーバー: shortId → { contentHash, assetId, thumbnailUrl } (唯一のサーバー依存)
 *  2. Helius DAS API: assetId → cNFT メタデータ (Solana 直接)
 *  3. Arweave: json_uri → オフチェーンデータ (Arweave 直接)
 *  4. ブラウザ内検証: Ed25519 + pHash (サーバー関与なし)
 */

import type { PageMeta, ContentRecord, VerificationResult } from "./types";
import type { ResolvedContent } from "./content-resolver";
import type { CorePayload } from "@title-protocol/sdk";
import { USE_MOCK } from "./config";
import { heliusResolver } from "./resolvers/helius";
import { verifyContentOnChain } from "./verify";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// モック (フォールバック)
// ---------------------------------------------------------------------------

import {
  resolvePageMeta as mockResolvePageMeta,
  fetchContentRecord as mockFetchContentRecord,
  verifyContent as mockVerifyContent,
} from "./mock";

// ---------------------------------------------------------------------------
// Supabase: shortId 解決
// ---------------------------------------------------------------------------

async function resolvePageMetaFromSupabase(
  shortId: string
): Promise<PageMeta | null> {
  const { data, error } = await supabase
    .from("pages")
    .select(
      `
      short_id,
      contents (
        content_hash,
        title_protocol_asset_id,
        thumbnail_url,
        ogp_image_url
      )
    `
    )
    .eq("short_id", shortId)
    .eq("status", "published")
    .single();

  if (error || !data) return null;

  const content = (data.contents as unknown as Array<{
    content_hash: string;
    title_protocol_asset_id: string;
    thumbnail_url: string;
    ogp_image_url: string;
  }>)?.[0];
  if (!content) return null;

  return {
    shortId,
    contentHash: content.content_hash,
    thumbnailUrl: content.thumbnail_url || "",
    ogpImageUrl: content.ogp_image_url || "",
    assetId: content.title_protocol_asset_id || undefined,
  };
}

// ---------------------------------------------------------------------------
// ResolvedContent → ContentRecord 変換
// ---------------------------------------------------------------------------

function toContentRecord(resolved: ResolvedContent): ContentRecord {
  const sj = resolved.coreSignedJson;
  const payload = sj?.payload;

  // attributes からデバイス情報等を抽出
  const getAttr = (key: string) =>
    resolved.attributes.find((a) => a.trait_type === key)?.value;

  // Core payload から情報を取得
  const contentType = getAttr("content_type") || "image/jpeg";
  const isVideo =
    contentType.startsWith("video/") || contentType === "video";

  return {
    deviceName: getAttr("device_name") || "Unknown Device",
    appName: getAttr("app_name") || "RootLens",
    appVersion: getAttr("app_version") || "0.1.0",
    capturedAt:
      getAttr("captured_at") ||
      (payload && "tsa_timestamp" in payload && (payload as CorePayload).tsa_timestamp
        ? new Date((payload as CorePayload).tsa_timestamp! * 1000).toISOString()
        : new Date().toISOString()),
    mediaType: isVideo ? "video" : "image",
    sourceDimensions: parseDimensions(getAttr("source_dimensions")),
    assuranceLevel: parseAssuranceLevel(getAttr("assurance_level")),
    teeType: sj?.tee_type || getAttr("tee_type") || "Unknown",
    signingAlgorithm: getAttr("signing_algorithm") || "ECDSA P-256 (ES256)",
    tsaProvider: getAttr("tsa_provider") || null,
    tsaTimestamp: getAttr("tsa_timestamp") || null,
    editOperations: [],
  };
}

function parseDimensions(
  raw: string | undefined
): { width: number; height: number } {
  if (!raw) return { width: 0, height: 0 };
  // "4032x3024" or "4032,3024" 形式
  const parts = raw.split(/[x,×]/);
  if (parts.length === 2) {
    return {
      width: parseInt(parts[0], 10) || 0,
      height: parseInt(parts[1], 10) || 0,
    };
  }
  return { width: 0, height: 0 };
}

function parseAssuranceLevel(raw: string | undefined): 1 | 2 {
  const n = parseInt(raw || "1", 10);
  return n === 2 ? 2 : 1;
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * shortId からページメタデータを解決する。
 * モードに応じてサーバー API またはモックを使う。
 */
export async function resolvePageMeta(
  shortId: string
): Promise<PageMeta | null> {
  if (USE_MOCK) {
    return mockResolvePageMeta(shortId);
  }
  return resolvePageMetaFromSupabase(shortId);
}

/**
 * content_hash (+ 任意の assetId) からコンテンツ記録を取得する。
 * リアルモード: Helius DAS API → Arweave → パース
 * モックモード: モックデータ
 */
export async function fetchContentRecord(
  contentHash: string,
  assetId?: string
): Promise<{ record: ContentRecord | null; resolved: ResolvedContent | null }> {
  if (USE_MOCK) {
    const record = await mockFetchContentRecord(contentHash);
    return { record, resolved: null };
  }

  // 高速パス: assetId が分かっている場合
  let resolved: ResolvedContent | null = null;
  if (assetId) {
    resolved = await heliusResolver.resolveByAssetId(assetId);
  }

  // フォールバック: content_hash で検索
  if (!resolved) {
    resolved = await heliusResolver.resolveByContentHash(contentHash);
  }

  if (!resolved) {
    return { record: null, resolved: null };
  }

  return { record: toContentRecord(resolved), resolved };
}

/**
 * クライアントサイド検証を実行する。
 * リアルモード: Solana + Arweave データから検証
 * モックモード: モック検証結果
 */
export async function verifyContent(
  contentHash: string,
  thumbnailUrl: string,
  resolved: ResolvedContent | null
): Promise<VerificationResult> {
  if (USE_MOCK || !resolved) {
    return mockVerifyContent(contentHash, thumbnailUrl);
  }

  return verifyContentOnChain(resolved, thumbnailUrl);
}
