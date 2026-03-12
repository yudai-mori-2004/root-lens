/**
 * 仕様書 §6.1 パイプラインA: Title Protocol登録
 *
 * C2PA署名済みコンテンツを Title Protocol devnet に登録する。
 * - fetchGlobalConfig → TitleClient → register
 * - storeSignedJson: Irys 経由で Arweave にアップロード
 * - delegateMint: false → partial TX を co-sign して broadcast
 */

import { webcrypto } from "node:crypto";
if (!globalThis.crypto?.subtle) {
  (globalThis as any).crypto = webcrypto;
}

import * as fs from "node:fs";
import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { fetchGlobalConfig, TitleClient } from "@title-protocol/sdk";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const WALLET_PATH = process.env.OPERATOR_WALLET_PATH
  || "/Users/forest/WebCreations/title-protocol/keys/operator.json";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// ---------------------------------------------------------------------------
// Keypair (lazy init)
// ---------------------------------------------------------------------------

let _keypair: Keypair | null = null;

function getKeypair(): Keypair {
  if (!_keypair) {
    const raw = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
    _keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  return _keypair;
}

// ---------------------------------------------------------------------------
// Irys helpers (動的importで crypto.subtle 破壊を回避)
// ---------------------------------------------------------------------------

async function createIrysUploader(keypair: Keypair, rpcUrl: string) {
  const { Uploader } = await import("@irys/upload");
  const { Solana } = await import("@irys/upload-solana");
  const secretKeyBs58 = bs58.encode(keypair.secretKey);
  const irys = await Uploader(Solana)
    .withWallet(secretKeyBs58)
    .withRpc(rpcUrl)
    .devnet()
    .build();
  return irys;
}

async function uploadToIrys(
  irys: Awaited<ReturnType<typeof createIrysUploader>>,
  data: string,
  contentType: string,
): Promise<string> {
  const size = Buffer.byteLength(data);
  const price = await irys.getPrice(size);
  const balance = await irys.getBalance();

  if (balance.isLessThan(price)) {
    await irys.fund(price.multipliedBy(2));
  }

  const tags = [{ name: "Content-Type", value: contentType }];
  const receipt = await irys.upload(data, { tags });
  return `https://gateway.irys.xyz/${receipt.id}`;
}

// ---------------------------------------------------------------------------
// 登録結果
// ---------------------------------------------------------------------------

export interface RegisterResult {
  contentHash: string;
  assetId: string;
  arweaveUri: string;
  txSignature: string;
}

// ---------------------------------------------------------------------------
// Title Protocol 登録
// ---------------------------------------------------------------------------

export async function registerContent(
  content: Uint8Array,
): Promise<RegisterResult> {
  const keypair = getKeypair();
  const connection = new Connection(RPC_URL, "confirmed");

  // 1. GlobalConfig
  const config = await fetchGlobalConfig("devnet");
  const client = new TitleClient(config);

  // 2. Irys uploader
  const irys = await createIrysUploader(keypair, RPC_URL);

  // 3. Register
  const { blockhash } = await connection.getLatestBlockhash();

  let arweaveUri = "";
  const result = await client.register({
    content,
    ownerWallet: keypair.publicKey.toBase58(),
    processorIds: ["core-c2pa"],
    storeSignedJson: async (json: string) => {
      const url = await uploadToIrys(irys, json, "application/json");
      arweaveUri = url;
      return url;
    },
    delegateMint: false,
    recentBlockhash: blockhash,
  });

  const contentHash = result.contents[0]?.contentHash || "";

  // 4. Co-sign + broadcast
  let txSignature = "";
  if (result.partialTxs && result.partialTxs.length > 0) {
    for (const txBase64 of result.partialTxs) {
      const tx = Transaction.from(Buffer.from(txBase64, "base64"));
      tx.partialSign(keypair);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      txSignature = sig;
    }
  }

  // 5. Asset ID をトランザクションログから取得
  let assetId = "";
  if (txSignature) {
    const txInfo = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });
    const logs = txInfo?.meta?.logMessages || [];
    for (const log of logs) {
      const match = log.match(/Leaf asset ID: (\w+)/);
      if (match) {
        assetId = match[1];
        break;
      }
    }
  }

  return { contentHash, assetId, arweaveUri, txSignature };
}
