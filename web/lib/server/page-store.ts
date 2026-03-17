/**
 * 仕様書 §7.1 URL構造, §10.4 データベース設計
 *
 * ページメタデータのストレージ (Supabase)。
 * service_role キーを使用し、RLS をバイパスして読み書きする。
 */

import { createClient } from "@supabase/supabase-js";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Supabase クライアント (service_role)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface PageRecord {
  shortId: string;
  contentHash: string;
  assetId: string;
  thumbnailUrl: string;
  ogpImageUrl: string;
  createdAt: string;
}

export interface CreatePageInput {
  contentHash: string;
  assetId: string;
  thumbnailUrl: string;
  ogpImageUrl: string;
  address?: string;
}

// ---------------------------------------------------------------------------
// shortId 生成
// ---------------------------------------------------------------------------

/** 7〜11文字のランダム英数字 shortId を生成 */
function generateShortId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const length = 7 + Math.floor(Math.random() * 5);
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPage(input: CreatePageInput): Promise<PageRecord> {
  const shortId = generateShortId();

  // address → user_id 解決
  let userId: string | null = null;
  if (input.address) {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("address", input.address)
      .single();
    userId = user?.id ?? null;
  }

  // pages テーブルにレコード作成
  const { data: page, error: pageError } = await supabase
    .from("pages")
    .insert({ short_id: shortId, ...(userId ? { user_id: userId } : {}) })
    .select("id, short_id, created_at")
    .single();

  if (pageError) throw new Error(`pages insert failed: ${pageError.message}`);

  // contents テーブルにコンテンツレコード作成
  const { error: contentError } = await supabase.from("contents").insert({
    page_id: page.id,
    content_hash: input.contentHash,
    title_protocol_asset_id: input.assetId,
    thumbnail_url: input.thumbnailUrl,
    ogp_image_url: input.ogpImageUrl,
  });

  if (contentError)
    throw new Error(`contents insert failed: ${contentError.message}`);

  return {
    shortId: page.short_id,
    contentHash: input.contentHash,
    assetId: input.assetId,
    thumbnailUrl: input.thumbnailUrl,
    ogpImageUrl: input.ogpImageUrl,
    createdAt: page.created_at,
  };
}

export async function findByShortId(
  shortId: string
): Promise<PageRecord | null> {
  const { data, error } = await supabase
    .from("pages")
    .select(
      `
      short_id,
      created_at,
      contents (
        content_hash,
        title_protocol_asset_id,
        thumbnail_url,
        ogp_image_url
      )
    `
    )
    .eq("short_id", shortId)
    .eq("status", "published")
    .single();

  if (error || !data) return null;

  const content = (data.contents as unknown as Array<{
    content_hash: string;
    title_protocol_asset_id: string;
    thumbnail_url: string;
    ogp_image_url: string;
  }>)?.[0];
  if (!content) return null;

  return {
    shortId: data.short_id,
    contentHash: content.content_hash,
    assetId: content.title_protocol_asset_id,
    thumbnailUrl: content.thumbnail_url,
    ogpImageUrl: content.ogp_image_url,
    createdAt: data.created_at,
  };
}

export async function updatePageContent(
  shortId: string,
  contentHash: string,
  assetId: string,
): Promise<void> {
  // pages テーブルからpage_idを取得
  const { data: page, error: pageError } = await supabase
    .from("pages")
    .select("id")
    .eq("short_id", shortId)
    .single();

  if (pageError || !page) throw new Error(`Page not found: ${shortId}`);

  // contents テーブルを更新
  const { error } = await supabase
    .from("contents")
    .update({
      content_hash: contentHash,
      title_protocol_asset_id: assetId,
    })
    .eq("page_id", page.id);

  if (error) throw new Error(`contents update failed: ${error.message}`);
}

export async function softDeletePage(shortId: string): Promise<void> {
  const { error } = await supabase
    .from("pages")
    .update({ status: "deleted" })
    .eq("short_id", shortId);

  if (error) throw new Error(`delete failed: ${error.message}`);
}

export async function findByContentHash(
  contentHash: string
): Promise<PageRecord | null> {
  const { data, error } = await supabase
    .from("contents")
    .select(
      `
      content_hash,
      title_protocol_asset_id,
      thumbnail_url,
      ogp_image_url,
      pages!inner (
        short_id,
        status,
        created_at
      )
    `
    )
    .eq("content_hash", contentHash)
    .single();

  if (error || !data) return null;

  const page = (data.pages as unknown as {
    short_id: string;
    status: string;
    created_at: string;
  });
  if (page.status !== "published") return null;

  return {
    shortId: page.short_id,
    contentHash: data.content_hash,
    assetId: data.title_protocol_asset_id,
    thumbnailUrl: data.thumbnail_url,
    ogpImageUrl: data.ogp_image_url,
    createdAt: page.created_at,
  };
}
