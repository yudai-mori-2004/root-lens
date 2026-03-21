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

/** Extension NFT の個別レコード */
export interface ExtensionNft {
  /** cNFT Asset ID (Solana mint address) */
  assetId: string;
  /** cNFT が属するコレクションアドレス */
  collectionAddress: string;
  /** Arweave URI (off-chain metadata) */
  arweaveUri: string;
  /** cNFT の属性 (trait_type/value ペア) */
  attributes: { trait_type: string; value: string }[];
  /** signed_json (Arweave から取得・パース済み) */
  signedJson: SignedJson;
  /** 所有者ウォレットアドレス */
  ownerWallet: string;
}

/** cNFT + オフチェーンデータを統合した解決済みコンテンツ */
export interface ResolvedContent {
  /** Core cNFT Asset ID (Solana mint address) */
  assetId: string;
  /** Core cNFT が属するコレクションアドレス */
  collectionAddress: string;
  /** Core Arweave URI (off-chain metadata) */
  arweaveUri: string;
  /** Core cNFT の属性 (trait_type/value ペア) */
  attributes: { trait_type: string; value: string }[];
  /** Core signed_json (Arweave から取得・パース済み) */
  coreSignedJson: SignedJson | null;
  /** Extension NFT の個別レコード配列 */
  extensionNfts: ExtensionNft[];
  /** Core NFT の所有者ウォレットアドレス */
  ownerWallet: string;
}

// ---------------------------------------------------------------------------
// ContentResolver インターフェース
// ---------------------------------------------------------------------------

export interface ContentResolver {
  /** content_hash trait から cNFT を検索し、オフチェーンデータを含むレコードを返す */
  resolveByContentHash(contentHash: string): Promise<ResolvedContent | null>;
  /** content_hash trait から全 Core cNFT を返す（重複解決用） */
  resolveAllByContentHash?(contentHash: string): Promise<ResolvedContent[]>;
}

// ---------------------------------------------------------------------------
// アクティブなリゾルバ（DAS プロバイダ実装を注入）
// ---------------------------------------------------------------------------

import { DasContentResolver } from "./resolvers/helius";

/** 現在のDASプロバイダ実装。差し替え時はここだけ変更する */
export const contentResolver: ContentResolver = new DasContentResolver();
