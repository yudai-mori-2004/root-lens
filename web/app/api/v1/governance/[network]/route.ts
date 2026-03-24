/**
 * GET /api/v1/governance/:network
 * 仕様書 §8 ホワイトリスト管理
 *
 * ネットワーク別（devnet / mainnet）のRootLensガバナンス情報を返す。
 * 認証不要（公開情報）。アプリ起動時にフェッチしてローカルキャッシュする想定。
 */

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// ガバナンスデータ定義
// ---------------------------------------------------------------------------

interface TrustedExtension {
  extension_id: string;
  label: string;
  category: "hardware" | "app";
}

interface PHashExtension {
  extension_id: string;
  version: string;
}

interface TsaProvider {
  url: string;
  label: string;
}

interface IntermediateCaInfo {
  platform: "ios" | "android";
  fingerprint: string;
  status: "active" | "revoked";
}

interface GovernanceResponse {
  network: string;
  version: string;
  trusted_extensions: TrustedExtension[];
  phash_extensions: PHashExtension[];
  tsa_policy: {
    required: boolean;
    trusted_providers: TsaProvider[];
  };
  pki: {
    root_ca_fingerprint: string;
    intermediate_cas: IntermediateCaInfo[];
  };
  solana: {
    cluster: string;
    rpc_url: string;
  };
}

// ---------------------------------------------------------------------------
// 仕様書 §8.2 ホワイトリスト内容 — 信頼する Extension ID
// ---------------------------------------------------------------------------

const TRUSTED_EXTENSIONS: TrustedExtension[] = [
  { extension_id: "hardware-google", label: "Google Pixel", category: "hardware" },
  { extension_id: "hardware-nikon", label: "Nikon", category: "hardware" },
  { extension_id: "hardware-canon", label: "Canon", category: "hardware" },
  { extension_id: "hardware-sony", label: "Sony", category: "hardware" },
  { extension_id: "rootlens-app", label: "RootLens", category: "app" },
];

const PHASH_EXTENSIONS: PHashExtension[] = [
  { extension_id: "image-phash", version: "1.0" },
  { extension_id: "video-phash", version: "1.0" },
];

const TSA_PROVIDERS: TsaProvider[] = [
  { url: "http://timestamp.digicert.com", label: "DigiCert" },
];

// ---------------------------------------------------------------------------
// ネットワーク別設定
// ---------------------------------------------------------------------------

const NETWORK_CONFIG: Record<string, { cluster: string; rpc_url: string }> = {
  devnet: {
    cluster: "devnet",
    rpc_url: process.env.NEXT_PUBLIC_DAS_RPC_URL || "https://api.devnet.solana.com",
  },
  mainnet: {
    cluster: "mainnet-beta",
    rpc_url: process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com",
  },
};

// ---------------------------------------------------------------------------
// PKI — 中間CAフィンガープリントは環境変数から読み込み
// Phase 4 (3層PKI) 実装後に実際のフィンガープリントを設定する
// ---------------------------------------------------------------------------

function getPkiInfo(): GovernanceResponse["pki"] {
  return {
    root_ca_fingerprint: process.env.ROOT_CA_FINGERPRINT || "pending",
    intermediate_cas: [
      {
        platform: "ios",
        fingerprint: process.env.IOS_INTERMEDIATE_CA_FINGERPRINT || "pending",
        status: "active",
      },
      {
        platform: "android",
        fingerprint: process.env.ANDROID_INTERMEDIATE_CA_FINGERPRINT || "pending",
        status: "active",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ network: string }> },
) {
  const { network } = await params;

  if (!NETWORK_CONFIG[network]) {
    return NextResponse.json(
      { error: `Unknown network: ${network}. Use 'devnet' or 'mainnet'.` },
      { status: 400 },
    );
  }

  const solanaConfig = NETWORK_CONFIG[network];

  const response: GovernanceResponse = {
    network,
    version: "0.1.0",
    trusted_extensions: TRUSTED_EXTENSIONS,
    phash_extensions: PHASH_EXTENSIONS,
    tsa_policy: {
      required: true,
      trusted_providers: TSA_PROVIDERS,
    },
    pki: getPkiInfo(),
    solana: solanaConfig,
  };

  return NextResponse.json(response, {
    headers: {
      // CDNキャッシュ: 5分。ガバナンス変更は即時性を要求しない
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
