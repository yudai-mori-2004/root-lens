/**
 * POST /api/v1/users — ユーザー作成 or 更新（upsert）
 * GET  /api/v1/users?address=xxx — アドレスでプロフィール取得
 *
 * アプリからプロフィール保存時に呼ばれる。
 * 公開ページからのプロフィール表示にも使用。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, address, display_name, bio, avatar_url, device_name, created_at")
    .eq("address", address)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    address: data.address,
    displayName: data.display_name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    deviceName: data.device_name,
    createdAt: data.created_at,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, displayName, bio, deviceName } = body;

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        address,
        display_name: displayName || "",
        bio: bio || "",
        device_name: deviceName || "",
      },
      { onConflict: "address" },
    )
    .select("id, address, display_name, bio, device_name, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: `upsert failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: data.id,
    address: data.address,
    displayName: data.display_name,
    bio: data.bio,
    deviceName: data.device_name,
    createdAt: data.created_at,
  });
}
