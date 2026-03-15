/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * DAS (Digital Asset Standard) API を使った ContentResolver 実装。
 * Helius / Triton 等の DAS 準拠プロバイダで動作する。
 */

import type { SignedJson } from "@title-protocol/sdk";
import type { ContentResolver, ResolvedContent } from "../content-resolver";
import { DAS_RPC_URL, getCollectionMints } from "../config";

// ---------------------------------------------------------------------------
// DAS レスポンス型 (必要なフィールドのみ)
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
  return asset.grouping.find((g) => g.group_key === "collection")?.group_value ?? "";
}

function getAttribute(asset: DasAsset, traitType: string): string | undefined {
  return asset.content.metadata.attributes?.find(
    (a) => a.trait_type === traitType
  )?.value;
}

function arweaveToHttpUrl(uri: string): string {
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice(5)}`;
  }
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
// DAS API 呼び出し
// ---------------------------------------------------------------------------

async function dasCall<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(DAS_RPC_URL, {
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
    throw new Error(`DAS RPC error: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`DAS RPC error: ${json.error.message}`);
  }
  return json as T;
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
// cNFT → ResolvedContent
// ---------------------------------------------------------------------------

async function resolveFromAsset(asset: DasAsset): Promise<ResolvedContent> {
  const arweaveUri = asset.content.json_uri;
  const attributes = asset.content.metadata.attributes ?? [];

  let coreSignedJson: SignedJson | null = null;
  const extensionSignedJsons: SignedJson[] = [];

  try {
    const offchain = await fetchArweaveJson(arweaveUri);
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

  return {
    assetId: asset.id,
    collectionAddress: getCollectionAddress(asset),
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
// DasContentResolver
// ---------------------------------------------------------------------------

export class DasContentResolver implements ContentResolver {
  async resolveByContentHash(
    contentHash: string
  ): Promise<ResolvedContent | null> {
    try {
      const collections = await getCollectionMints();
      const result = await searchAssetsByCollection(collections.core);
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
