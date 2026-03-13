/**
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * 公開ページの設定。検証に使うRPCエンドポイントやコレクションアドレスを管理する。
 */

/** DAS (Digital Asset Standard) API エンドポイント */
export const DAS_RPC_URL =
  process.env.NEXT_PUBLIC_DAS_RPC_URL ||
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY || ""}`;

/** Solana RPC (DAS非対応の標準RPCが必要な場合) */
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

/** Title Protocol コレクションアドレス (devnet) */
export const CORE_COLLECTION_MINT =
  process.env.NEXT_PUBLIC_CORE_COLLECTION_MINT ||
  "H51zy5FPdoePeV4CHgB724SiuoUMfaRnFgYtxCTni9xv";

export const EXT_COLLECTION_MINT =
  process.env.NEXT_PUBLIC_EXT_COLLECTION_MINT ||
  "5cJGwZXp3YRM22hqHRPYNTfA528rfMv9TNZL9mZJLXFY";

/** pHash照合の閾値 (ハミング距離) — 仕様書 §6.3.3 */
export const PHASH_THRESHOLD = 5;
