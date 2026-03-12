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
  contentHash: string;
  /** R2 パブリックバケットの表示用画像URL */
  thumbnailUrl: string;
  /** OGP用バナー付き画像URL */
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
  /** 撮影日時 (ISO 8601) */
  capturedAt: string;
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

/** クライアントサイド検証の各ステップ結果 */
export interface VerificationResult {
  /** cNFT が正規コレクションに属するか */
  collectionVerified: VerifyStepStatus;
  /** Arweave off-chain データの TEE 署名検証 */
  teeSignatureVerified: VerifyStepStatus;
  /** pHash が一致するか */
  phashMatched: VerifyStepStatus;
  /** C2PA 署名チェーン検証 */
  c2paChainVerified: VerifyStepStatus;
  /** 全体の状態 */
  overall: VerifyStepStatus;
  /** pHash の Hamming distance */
  phashDistance?: number;
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
