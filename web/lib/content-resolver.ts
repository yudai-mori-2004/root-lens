/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * ContentResolver: cNFT + Arweave オフチェーンデータを統合して返す抽象レイヤー。
 * 現在の実装は Helius DAS API だが、将来インデクサや別プロバイダに差し替え可能。
 */

import type { SignedJson } from "@title-protocol/sdk";

// ---------------------------------------------------------------------------
// 解決結果の型
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
  /**
   * content_hash から cNFT を検索し、オフチェーンデータを含む完全なレコードを返す。
   * コレクション内の cNFT を取得し、content_hash 属性でマッチングする。
   */
  resolveByContentHash(contentHash: string): Promise<ResolvedContent | null>;

  /**
   * asset_id (cNFT mint address) から直接取得する高速パス。
   * サーバーが asset_id を保持している場合に使用。
   */
  resolveByAssetId(assetId: string): Promise<ResolvedContent | null>;
}
