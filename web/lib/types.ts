/**
 * 仕様書 §7 公開ページ — データモデル
 *
 * content_hash とサムネイルURLのみ RootLens サーバーから取得。
 * それ以外は Title Protocol (Solana cNFT + Arweave) からクライアントサイドで取得する。
 */

// --- サーバーから取得するデータ（最小限） ---

/** サーバーが shortId から解決するページ情報 */
export interface PageMeta {
  shortId: string;
  /** SHA-256(Active Manifest COSE署名) — TEE算出 */
  contentHash: string;
  /** R2 表示用画像URL */
  thumbnailUrl: string;
  /** R2 OGP画像URL */
  ogpImageUrl: string;
}

// --- Title Protocol (Solana / Arweave) から取得するデータ ---

/** 検証ステップの状態 */
export type VerifyStepStatus = "pending" | "verified" | "failed" | "skipped";

/** cNFT + Extension から取得できるコンテンツ情報 */
export interface ContentRecord {
  /** 撮影デバイス名 (C2PA manifest → hardware extension) */
  deviceName: string;
  /** アプリ名 */
  appName: string;
  /** アプリバージョン */
  appVersion: string;
  /** 撮影日時 (ISO 8601)。TSAまたはcaptured_at属性から取得。不明な場合はnull */
  capturedAt: string | null;
  /** メディアタイプ */
  mediaType: "image" | "video";
  /** 元の解像度 */
  sourceDimensions: { width: number; height: number };
  /** TEE Assurance Level (1 = iOS Secure Enclave, 2 = Android StrongBox) */
  assuranceLevel: 1 | 2;
  /** TEE 種別 */
  teeType: string;
  /** 署名アルゴリズム */
  signingAlgorithm: string;
  /** TSA プロバイダ（なければ null） */
  tsaProvider: string | null;
  /** TSA タイムスタンプ (ISO 8601, なければ null) */
  tsaTimestamp: string | null;
  /** 編集操作（あれば） */
  editOperations: EditOperation[];
}

/** 編集操作の記録 */
export interface EditOperation {
  type: "crop" | "mask" | "resize" | "trim";
  label: string;
}

/** Extension 検証結果 */
export interface ExtensionVerification {
  extensionId: string;
  /** ext_collection_mint に属するか */
  collectionVerified: VerifyStepStatus;
  /** TEE署名検証 */
  teeSignatureVerified: VerifyStepStatus;
  /** wasm_hash が Global Config に含まれるか */
  wasmHashVerified: VerifyStepStatus;
  /** extension固有の検証結果 */
  detail?: string;
}

/** クライアントサイド検証の各ステップ結果 */
export interface VerificationResult {
  // --- Core cNFT ---
  /** cNFT が正規 core_collection に属するか */
  collectionVerified: VerifyStepStatus;
  /** Core Arweave off-chain データの TEE 署名検証 */
  teeSignatureVerified: VerifyStepStatus;
  /** C2PA 署名チェーン検証 */
  c2paChainVerified: VerifyStepStatus;

  // --- Extension cNFTs ---
  /** pHash が一致するか（image-phash extension） */
  phashMatched: VerifyStepStatus;
  /** pHash の Hamming distance */
  phashDistance?: number;
  /** ハードウェア署名検証（hardware-google 等） */
  hardwareVerified: VerifyStepStatus;
  /** 各 Extension の個別検証結果 */
  extensions: ExtensionVerification[];

  // --- 全体 ---
  overall: VerifyStepStatus;
  /** cNFT Asset ID */
  assetId?: string;
  /** Arweave URI */
  arweaveUri?: string;
}

/** ContentPage に渡す全データ */
export interface ContentPageData {
  page: PageMeta;
  record: ContentRecord | null;
  verification: VerificationResult;
}
