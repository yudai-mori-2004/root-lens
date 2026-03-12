// 仕様書 §6.1 パイプラインA: Title Protocol登録
// 実行主体: アプリ（Title Protocol SDK）
// delegateMint: true でGatewayにTXブロードキャストを委譲

import { fetchGlobalConfig, TitleClient } from '@title-protocol/sdk';
import { config } from '../config';

// devnet MVP: Privy未実装のためオペレーターウォレットを使用
const OWNER_WALLET = 'wrVwsTuRzbsDutybqqpf9tBE7JUqRPYzJ3iPUgcFmna';

export interface TitleProtocolResult {
  contentHash: string;
  assetId: string;
  txSignature: string;
}

/**
 * storeSignedJson コールバック: サーバー経由でストレージに保存しURIを返す
 */
async function storeSignedJson(json: string): Promise<string> {
  const response = await fetch(`${config.serverUrl}/api/v1/store-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`storeSignedJson failed: ${err}`);
  }
  const { uri } = await response.json();
  return uri;
}

/**
 * Title Protocol にコンテンツを登録する（クライアント側）
 * 仕様書 §6.1 ステップ1-9
 */
export async function registerOnTitleProtocol(
  content: Uint8Array,
): Promise<TitleProtocolResult> {
  // 1. GlobalConfig取得
  const globalConfig = await fetchGlobalConfig('devnet');
  const client = new TitleClient(globalConfig);

  // 2-7. SDK が一括実行: ノード選択 → E2EE → アップロード → 検証 → signed_json保存
  // 8-9. delegateMint: true でGatewayがcNFTをミント
  const result = await client.register({
    content,
    ownerWallet: OWNER_WALLET,
    processorIds: ['core-c2pa'],
    storeSignedJson,
    delegateMint: true,
  });

  const contentHash = result.contents[0]?.contentHash || '';

  // delegateMint: true の場合、txSignatures が返る
  const txSignature = result.txSignatures?.[0] || '';

  // assetId はトランザクションログから取得するか、contents から取得
  const assetId = result.contents[0]?.assetId || '';

  return { contentHash, assetId, txSignature };
}
