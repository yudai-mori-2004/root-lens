/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * Helius DAS API を使った ContentResolver 実装。
 * cNFT の取得は Helius RPC (Solana DAS API) を、
 * オフチェーンデータの取得は Arweave gateway を直接使用する。
 *
 * Note: Helius はあくまで一実装。将来別の DAS プロバイダや
 * 自前インデクサに差し替え可能なよう ContentResolver IF の裏に配置。
 */

import type { SignedJson } from "@title-protocol/sdk";
import type { ContentResolver, ResolvedContent } from "../content-resolver";
import { HELIUS_RPC_URL, CORE_COLLECTION_MINT } from "../config";

// ---------------------------------------------------------------------------
// Helius DAS レスポンスの型 (必要なフィールドのみ)
// ---------------------------------------------------------------------------

interface DasAsset {
  id: string;
  content: {
    json_uri: string;
    metadata: {
      name: string;
      symbol: string;
      attributes?: { trait_type: string; value: string }[];
    };
  };
  compression: {
    compressed: boolean;
    tree: string;
    leaf_id: number;
  };
  ownership: {
    owner: string;
  };
  grouping: { group_key: string; group_value: string }[];
}

interface DasGetAssetResponse {
  jsonrpc: string;
  result: DasAsset;
}

interface DasSearchAssetsResponse {
  jsonrpc: string;
  result: {
    total: number;
    limit: number;
    page: number;
    items: DasAsset[];
  };
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function getCollectionAddress(asset: DasAsset): string {
  const coll = asset.grouping.find((g) => g.group_key === "collection");
  return coll?.group_value ?? "";
}

function getAttribute(
  asset: DasAsset,
  traitType: string
): string | undefined {
  return asset.content.metadata.attributes?.find(
    (a) => a.trait_type === traitType
  )?.value;
}

/** Arweave URI を HTTP gateway URL に変換 */
function arweaveToHttpUrl(uri: string): string {
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice(5)}`;
  }
  if (uri.startsWith("https://")) {
    return uri;
  }
  // Irys gateway URL はそのまま
  return uri;
}

async function fetchArweaveJson(uri: string): Promise<unknown> {
  const url = arweaveToHttpUrl(uri);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Arweave fetch failed: ${res.status} ${url}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Helius DAS API 呼び出し
// ---------------------------------------------------------------------------

async function dasCall<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "rootlens",
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`Helius RPC error: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Helius RPC error: ${json.error.message}`);
  }
  return json as T;
}

async function getAsset(assetId: string): Promise<DasAsset> {
  const resp = await dasCall<DasGetAssetResponse>("getAsset", { id: assetId });
  return resp.result;
}

async function searchAssetsByCollection(
  collectionMint: string,
  page: number = 1,
  limit: number = 100
): Promise<DasSearchAssetsResponse["result"]> {
  const resp = await dasCall<DasSearchAssetsResponse>("searchAssets", {
    grouping: ["collection", collectionMint],
    page,
    limit,
  });
  return resp.result;
}

// ---------------------------------------------------------------------------
// cNFT → ResolvedContent 変換
// ---------------------------------------------------------------------------

async function resolveFromAsset(
  asset: DasAsset
): Promise<ResolvedContent> {
  const arweaveUri = asset.content.json_uri;
  const collectionAddress = getCollectionAddress(asset);
  const attributes = asset.content.metadata.attributes ?? [];

  // Arweave からオフチェーンデータを取得
  let coreSignedJson: SignedJson | null = null;
  const extensionSignedJsons: SignedJson[] = [];

  try {
    const offchain = await fetchArweaveJson(arweaveUri);
    // signed_json はオフチェーンデータのトップレベルに格納される
    if (isSignedJson(offchain)) {
      const payload = offchain.payload;
      if ("nodes" in payload) {
        coreSignedJson = offchain;
      } else {
        extensionSignedJsons.push(offchain);
      }
    }
  } catch {
    // Arweave 取得失敗は検証結果に反映（null のまま返す）
  }

  // Extension cNFT は別途検索が必要な場合がある
  // ここでは Core cNFT の解決に集中する

  return {
    assetId: asset.id,
    collectionAddress,
    arweaveUri,
    attributes,
    coreSignedJson,
    extensionSignedJsons,
    ownerWallet: asset.ownership.owner,
  };
}

function isSignedJson(obj: unknown): obj is SignedJson {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.protocol === "string" &&
    typeof o.tee_pubkey === "string" &&
    typeof o.tee_signature === "string" &&
    typeof o.payload === "object"
  );
}

// ---------------------------------------------------------------------------
// HeliusContentResolver
// ---------------------------------------------------------------------------

export class HeliusContentResolver implements ContentResolver {
  async resolveByAssetId(assetId: string): Promise<ResolvedContent | null> {
    try {
      const asset = await getAsset(assetId);
      return resolveFromAsset(asset);
    } catch {
      return null;
    }
  }

  async resolveByContentHash(
    contentHash: string
  ): Promise<ResolvedContent | null> {
    try {
      // コレクション内の cNFT を検索し、content_hash 属性でフィルタ
      const result = await searchAssetsByCollection(CORE_COLLECTION_MINT);
      const match = result.items.find(
        (item) => getAttribute(item, "content_hash") === contentHash
      );

      if (!match) return null;
      return resolveFromAsset(match);
    } catch {
      return null;
    }
  }
}

/** デフォルトのリゾルバインスタンス */
export const heliusResolver = new HeliusContentResolver();
