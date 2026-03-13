/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * ContentResolver: content_hash → cNFT + Arweave オフチェーンデータの解決レイヤー。
 * DAS プロバイダ（Helius, Triton, 自前インデクサ等）は差し替え可能。
 */

import type { SignedJson } from "@title-protocol/sdk";

// ---------------------------------------------------------------------------
// 解決結果
// ---------------------------------------------------------------------------

/** cNFT + オフチェーンデータを統合した解決済みコンテンツ */
export interface ResolvedContent {
  /** cNFT Asset ID (Solana mint address) */
  assetId: string;
  /** cNFT が属するコレクションアドレス */
  collectionAddress: string;
  /** Arweave URI (off-chain metadata) */
  arweaveUri: string;
  /** cNFT の属性 (trait_type/value ペア) */
  attributes: { trait_type: string; value: string }[];
  /** Core signed_json (Arweave から取得・パース済み) */
  coreSignedJson: SignedJson | null;
  /** Extension signed_json 配列 (Arweave から取得・パース済み) */
  extensionSignedJsons: SignedJson[];
  /** 所有者ウォレットアドレス */
  ownerWallet: string;
}

// ---------------------------------------------------------------------------
// ContentResolver インターフェース
// ---------------------------------------------------------------------------

export interface ContentResolver {
  /** content_hash trait から cNFT を検索し、オフチェーンデータを含むレコードを返す */
  resolveByContentHash(contentHash: string): Promise<ResolvedContent | null>;
}

// ---------------------------------------------------------------------------
// アクティブなリゾルバ（DAS プロバイダ実装を注入）
// ---------------------------------------------------------------------------

import { DasContentResolver } from "./resolvers/helius";

/** 現在のDASプロバイダ実装。差し替え時はここだけ変更する */
export const contentResolver: ContentResolver = new DasContentResolver();
