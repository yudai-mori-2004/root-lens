/**
 * 仕様書 §7.4 クライアントサイド検証
 *
 * コレクションアドレスはオンチェーンの globalConfig から毎回取得する。
 * ハードコードやキャッシュは使わない。クライアントが直接オンチェーンデータを
 * 参照することで、サーバーに依存しない検証の信頼チェーンを維持する。
 */

import { fetchGlobalConfig } from '@title-protocol/sdk';
import { Connection } from '@solana/web3.js';

/** DAS (Digital Asset Standard) API エンドポイント */
export const DAS_RPC_URL = process.env.NEXT_PUBLIC_DAS_RPC_URL!;

/** pHash照合の閾値 (ハミング距離)
 * 公開ページのthumbnailはリサイズ+再圧縮されているため、元画像との距離が出る。
 * DCT 64bitで10以下なら十分に同一コンテンツと判断できる。 */
export const PHASH_THRESHOLD = 10;

/** Title Protocol コレクションアドレスをオンチェーンから取得 */
export async function getCollectionMints(): Promise<{ core: string; ext: string }> {
  const connection = new Connection(DAS_RPC_URL);
  const config = await fetchGlobalConfig(connection, 'devnet');

  return {
    core: config.core_collection_mint,
    ext: config.ext_collection_mint,
  };
}
