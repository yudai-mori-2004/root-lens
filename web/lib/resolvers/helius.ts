/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * DAS (Digital Asset Standard) API を使った ContentResolver 実装。
 * Helius / Triton 等の DAS 準拠プロバイダで動作する。
 *
 * Title Protocolでは1つのコンテンツに対して:
 *   - core collection に core cNFT (C2PA署名, TEE署名)
 *   - ext collection に extension cNFT (pHash等) が別々にミントされる
 * 両方を content_hash で検索し、統合して返す。
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
// Arweave signed_json 判定
// ---------------------------------------------------------------------------

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

function isCorePayload(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && "nodes" in payload;
}

// ---------------------------------------------------------------------------
// cNFT → signed_json の取得
// ---------------------------------------------------------------------------

async function fetchSignedJsonFromAsset(asset: DasAsset): Promise<SignedJson | null> {
  try {
    const offchain = await fetchArweaveJson(asset.content.json_uri);
    if (isSignedJson(offchain)) return offchain;
  } catch {}
  return null;
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

      // core と ext の両方を並列検索
      const [coreResult, extResult] = await Promise.all([
        searchAssetsByCollection(collections.core),
        searchAssetsByCollection(collections.ext),
      ]);

      // core collection から content_hash 一致を探す
      const coreAsset = coreResult.items.find(
        (item) => getAttribute(item, "content_hash") === contentHash
      );

      if (!coreAsset) return null;

      // ext collection から同じ content_hash のものを全て取得
      const extAssets = extResult.items.filter(
        (item) => getAttribute(item, "content_hash") === contentHash
      );

      // Arweave signed_json を並列取得
      const [coreSj, ...extSjs] = await Promise.all([
        fetchSignedJsonFromAsset(coreAsset),
        ...extAssets.map(fetchSignedJsonFromAsset),
      ]);

      const coreSignedJson = coreSj && isCorePayload(coreSj.payload) ? coreSj : null;
      const extensionSignedJsons = extSjs.filter((sj): sj is SignedJson => sj !== null);

      return {
        assetId: coreAsset.id,
        collectionAddress: getCollectionAddress(coreAsset),
        arweaveUri: coreAsset.content.json_uri,
        attributes: coreAsset.content.metadata.attributes ?? [],
        coreSignedJson,
        extensionSignedJsons,
        ownerWallet: coreAsset.ownership.owner,
      };
    } catch (e) {
      console.error("[DasContentResolver] resolveByContentHash failed:", e);
      return null;
    }
  }
}
