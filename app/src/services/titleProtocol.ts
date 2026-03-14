// 仕様書 §6.1 パイプラインA: Title Protocol登録
// 実行主体: アプリ（Title Protocol SDK）
// delegateMint: true でGatewayにTXブロードキャスト + signed_json保存を委譲

import { fetchGlobalConfig, TitleClient } from '@title-protocol/sdk';
import { Connection } from '@solana/web3.js';

// devnet MVP: Privy未実装のためオペレーターウォレットを使用
const OWNER_WALLET = 'wrVwsTuRzbsDutybqqpf9tBE7JUqRPYzJ3iPUgcFmna';
const SOLANA_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=7bdef7b8-8661-4449-840c-aa835168f2b1';

export interface TitleProtocolResult {
  /** content_hash = SHA-256(Active Manifest の COSE 署名) — TEE が算出 (§2.1) */
  contentHash: string;
  txSignature: string;
}

/**
 * Title Protocol にコンテンツを登録する（クライアント側）
 * 仕様書 §6.1 ステップ1-9
 *
 * Gateway が signed_json の保存（Irys/S3）と cNFT ミントを全て代行する。
 * アプリ側はSDKの register() を呼ぶだけで完結する。
 */
export async function registerOnTitleProtocol(
  content: Uint8Array,
): Promise<TitleProtocolResult> {
  const connection = new Connection(SOLANA_RPC_URL);
  const globalConfig = await fetchGlobalConfig(connection, 'devnet');
  const client = new TitleClient(globalConfig);

  const result = await client.register({
    content,
    ownerWallet: OWNER_WALLET,
    processorIds: ['core-c2pa', 'phash-v1'],
    delegateMint: true,
  });

  const contentHash = result.contents[0]?.contentHash || '';
  const txSignature = result.txSignatures?.[0] || '';

  return { contentHash, txSignature };
}
