/**
 * 仕様書 §7.4 クライアントサイド検証
 */

/** DAS (Digital Asset Standard) API エンドポイント */
export const DAS_RPC_URL = process.env.NEXT_PUBLIC_DAS_RPC_URL!;

/** Title Protocol コレクションアドレス (devnet) */
export const CORE_COLLECTION_MINT = "H51zy5FPdoePeV4CHgB724SiuoUMfaRnFgYtxCTni9xv";
export const EXT_COLLECTION_MINT = "5cJGwZXp3YRM22hqHRPYNTfA528rfMv9TNZL9mZJLXFY";

/** pHash照合の閾値 (ハミング距離) — 仕様書 §6.3.3 */
export const PHASH_THRESHOLD = 5;
