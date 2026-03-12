/**
 * モックデータプロバイダー
 *
 * Title Protocol パイプライン完成後、ここを Solana RPC + Arweave 直接取得に置き換える。
 * 関数のインターフェースはそのまま維持する。
 */

import type { PageMeta, ContentRecord, VerificationResult } from "./types";

/**
 * shortId からページメタデータを解決する
 * 本番: Supabase / サーバー API から取得
 */
export async function resolvePageMeta(
  shortId: string
): Promise<PageMeta | null> {
  // モック: どの shortId でもサンプルデータを返す
  return {
    shortId,
    contentHash: "a7f3c2e1b5d6c7a8f9e0d1b2c3a4f5e6d7c8b9a0",
    thumbnailUrl: `/mock/sample.jpg`,
    ogpImageUrl: `/mock/ogp.jpg`,
  };
}

/**
 * content_hash から Title Protocol 上のコンテンツ記録を取得する
 * 本番: Solana RPC で cNFT を検索 → Arweave から off-chain data を取得
 */
export async function fetchContentRecord(
  _contentHash: string
): Promise<ContentRecord | null> {
  // モック: 遅延を模擬
  await new Promise((r) => setTimeout(r, 800));

  return {
    deviceName: "Google Pixel 7",
    appName: "RootLens",
    appVersion: "0.1.0",
    capturedAt: "2026-03-12T14:32:15+09:00",
    mediaType: "image",
    sourceDimensions: { width: 4032, height: 3024 },
    assuranceLevel: 2,
    teeType: "StrongBox (Titan M2)",
    signingAlgorithm: "ECDSA P-256 (ES256)",
    tsaProvider: "DigiCert",
    tsaTimestamp: "2026-03-12T05:32:16Z",
    editOperations: [],
  };
}

/**
 * クライアントサイド検証を実行する
 * 本番: Solana RPC → Arweave → Ed25519 検証 → pHash 再計算 → 比較
 */
export async function verifyContent(
  _contentHash: string,
  _thumbnailUrl: string
): Promise<VerificationResult> {
  // モック: 段階的に検証が進む様子を模擬
  await new Promise((r) => setTimeout(r, 1200));

  return {
    collectionVerified: "verified",
    teeSignatureVerified: "verified",
    phashMatched: "verified",
    c2paChainVerified: "verified",
    overall: "verified",
    phashDistance: 0,
    assetId: "7xKXm9v2pQrN4wE8sLfYhD3jR6tBcUaG5zMnHkWo1iJy",
    arweaveUri: "ar://bJ9Kp2xL5mN8qR3vT7wY0zA4cF6hE1iG9jD2kM5nO8pQ",
  };
}
