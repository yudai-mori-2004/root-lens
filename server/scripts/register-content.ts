/**
 * Title Protocol SDK でコンテンツを devnet に登録する
 *
 * signed_json は Irys 経由で Arweave devnet に保存。
 * delegateMint: false → partial TX を自分で co-sign して broadcast。
 */

import "dotenv/config";
import * as fs from "node:fs";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto?.subtle) {
  (globalThis as any).crypto = webcrypto;
}

import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { fetchGlobalConfig, TitleClient } from "@title-protocol/sdk";

const IMAGE_PATH = "/Users/forest/WebCreations/title-protocol/integration-tests/fixtures/pixel_photo_ramen.jpg";
const WALLET_PATH = "/Users/forest/WebCreations/title-protocol/keys/operator.json";
const RPC_URL = "https://api.devnet.solana.com";

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
    const deficit = price.minus(balance);
    console.log(`  Irys残高不足: ${irys.utils.fromAtomic(balance)} < ${irys.utils.fromAtomic(price)} SOL`);
    console.log(`  ${irys.utils.fromAtomic(deficit)} SOL をfundします...`);
    await irys.fund(price.multipliedBy(2));
    console.log("  fund完了");
  }

  const tags = [{ name: "Content-Type", value: contentType }];
  const receipt = await irys.upload(data, { tags });
  return `https://gateway.irys.xyz/${receipt.id}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  const connection = new Connection(RPC_URL, "confirmed");
  console.log("Wallet:", keypair.publicKey.toBase58());
  console.log("Balance:", ((await connection.getBalance(keypair.publicKey)) / LAMPORTS_PER_SOL).toFixed(4), "SOL");

  // 1. GlobalConfig
  console.log("\nFetching GlobalConfig...");
  const config = await fetchGlobalConfig("devnet");
  console.log("TEE nodes:", config.trusted_tee_nodes.length);

  // 2. Client
  const client = new TitleClient(config);

  // 3. Irys uploader を暗号化の後に初期化 (crypto.subtle 破壊を回避)
  console.log("\nInitializing Irys uploader...");
  const irys = await createIrysUploader(keypair, RPC_URL);
  console.log("Irys address:", irys.address);

  // 4. Register (delegateMint: false → partial TX)
  const imageBytes = fs.readFileSync(IMAGE_PATH);
  console.log(`\nImage: pixel_photo_ramen.jpg (${(imageBytes.length / 1024).toFixed(0)} KB)`);

  const { blockhash } = await connection.getLatestBlockhash();
  console.log("Blockhash:", blockhash);

  let signedJsonCount = 0;
  console.log("Registering via SDK...");
  const result = await client.register({
    content: new Uint8Array(imageBytes),
    ownerWallet: keypair.publicKey.toBase58(),
    processorIds: ["core-c2pa", "phash-v1"],
    storeSignedJson: async (json: string) => {
      // ローカルにも保存（デバッグ用）
      const idx = signedJsonCount++;
      fs.writeFileSync(`e2e-signed-json-${idx}.json`, json);
      console.log("  signed_json received, uploading to Arweave via Irys...");
      const arweaveUrl = await uploadToIrys(irys, json, "application/json");
      console.log(`  → ${arweaveUrl}`);
      return arweaveUrl;
    },
    delegateMint: false,
    recentBlockhash: blockhash,
  });

  console.log("\nRegistration result:");
  console.log("  contents:", result.contents.length);
  for (const c of result.contents) {
    console.log(`  - contentHash: ${c.contentHash}`);
    console.log(`    storageUri: ${c.storageUri}`);
  }

  // 5. Co-sign + broadcast partial TXs
  if (result.partialTxs && result.partialTxs.length > 0) {
    console.log(`\nBroadcasting ${result.partialTxs.length} transaction(s)...`);
    const signatures: string[] = [];

    for (let i = 0; i < result.partialTxs.length; i++) {
      const txBytes = Buffer.from(result.partialTxs[i], "base64");
      const tx = Transaction.from(txBytes);

      // ユーザーwalletで共同署名
      tx.partialSign(keypair);

      console.log(`  tx[${i}]: sending...`);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      console.log(`  tx[${i}]: ${sig}`);
      console.log(`  confirming...`);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  tx[${i}]: confirmed!`);
      console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      signatures.push(sig);
    }

    fs.writeFileSync("e2e-register-result.json", JSON.stringify({ ...result, txSignatures: signatures }, null, 2));
  } else {
    fs.writeFileSync("e2e-register-result.json", JSON.stringify(result, null, 2));
  }

  console.log("\nSaved to e2e-register-result.json");
}

main().catch((e) => { console.error("Error:", e); process.exit(1); });
