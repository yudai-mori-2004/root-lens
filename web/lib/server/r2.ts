/**
 * 仕様書 §6.2 パイプラインB: データ保存 — R2ストレージ
 *
 * Cloudflare R2 (S3互換) クライアント。
 * - 公開バケット: 表示用コンテンツ + OGP画像
 * - 非公開バケット: オリジナル生データ (将来実装)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// クライアント初期化
// ---------------------------------------------------------------------------

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET || "rootlens-public";
const PUBLIC_URL = process.env.R2_PUBLIC_URL!; // e.g. https://cdn.rootlens.io or R2 public URL

// ---------------------------------------------------------------------------
// 公開バケット操作
// ---------------------------------------------------------------------------

/**
 * 公開バケットにファイルをアップロードし、公開URLを返す。
 */
export async function uploadPublic(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

/**
 * 公開バケットへのpresigned PUT URLを発行する。
 * クライアントがR2に直接アップロードするために使用。
 */
export async function createPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn: number = 600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: PUBLIC_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * 公開バケットからファイルを削除する。
 */
export async function deletePublic(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
    })
  );
}

/**
 * コンテンツ画像のR2キーを生成する。
 * 形式: content/{fileId}.{ext}
 * fileId は content_hash とは独立のランダム識別子。
 */
export function contentKey(fileId: string, ext: string = "jpg"): string {
  return `content/${fileId}.${ext}`;
}

/**
 * OGP画像のR2キーを生成する。
 * 形式: ogp/{fileId}.jpg
 */
export function ogpKey(fileId: string): string {
  return `ogp/${fileId}.jpg`;
}

/**
 * メディア本体（動画・音声等）のR2キーを生成する。
 * 形式: media/{fileId}.{ext}
 */
export function mediaKey(fileId: string, ext: string): string {
  return `media/${fileId}.${ext}`;
}
