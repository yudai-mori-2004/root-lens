/**
 * 仕様書 §7 公開ページ — データモデル
 *
 * content_hash とサムネイルURLのみ RootLens サーバーから取得。
 * それ以外は Title Protocol (Solana cNFT + Arweave) からクライアントサイドで取得する。
 */

// --- サーバーから取得するデータ（最小限） ---

/** 1件のコンテンツ情報 */
export interface ContentMeta {
  contentHash: string;
  thumbnailUrl: string;
  ogpImageUrl: string;
  /** 動画・音声等の元ファイルURL。画像の場合は空文字 */
  mediaUrl: string;
  /** image / video / audio */
  mediaType: string;
}

/** 投稿者のプロフィール */
export interface UserProfile {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
}

/** サーバーが shortId から解決するページ情報 */
export interface PageMeta {
  shortId: string;
  contents: ContentMeta[];
  user: UserProfile | null;
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

/** NFT固有の検証ステップ（共通2ステップ以外） */
export interface SpecificCheck {
  /** キー名（check.* で翻訳、フォールバックはそのまま表示） */
  label: string;
  status: VerifyStepStatus;
  /** 英語の詳細文（表示側で check.{label}_pass/fail で翻訳を試みる） */
  detail: string;
}

/** 1つのNFT（CoreでもExtensionでも）の検証結果 */
export interface NftVerification {
  /** NFTの種別ラベル（"c2pa", "image-phash", "hardware-google" など） */
  id: string;
  /** コレクション所属（共通ステップ1） */
  collectionVerified: VerifyStepStatus;
  /** TEE署名（共通ステップ2） */
  teeSignatureVerified: VerifyStepStatus;
  /** このNFT固有の検証ステップ */
  specificChecks: SpecificCheck[];
}

/** @deprecated 後方互換。NftVerification を使用 */
export type ExtensionVerification = NftVerification;

/** クライアントサイド検証の全体結果 */
export interface VerificationResult {
  /** 全NFTの検証結果（Core + Extension） */
  nfts: NftVerification[];
  /** 全体判定 */
  overall: VerifyStepStatus;
  /** Core cNFT Asset ID */
  assetId?: string;
  /** Core Arweave URI */
  arweaveUri?: string;
}

/** ContentPage に渡す全データ */
export interface ContentPageData {
  page: PageMeta;
  record: ContentRecord | null;
  verification: VerificationResult;
}
