/**
 * POST /api/v1/store-json
 *
 * Title Protocol SDK の storeSignedJson コールバックから呼ばれる。
 * signed_json を R2 に保存し、公開 URI を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadPublic } from "@/lib/server/r2";
import { createHash } from "node:crypto";

export async function POST(req: NextRequest) {
  try {
    const { json } = await req.json();
    if (!json || typeof json !== "string") {
      return NextResponse.json(
        { error: "json field is required" },
        { status: 400 },
      );
    }

    // content-addressable key
    const hash = createHash("sha256")
      .update(json)
      .digest("hex")
      .slice(0, 32);
    const key = `signed-json/${hash}.json`;

    const uri = await uploadPublic(key, Buffer.from(json), "application/json");

    return NextResponse.json({ uri });
  } catch (e: unknown) {
    console.error("[store-json] Error:", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
