import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnections, driveOAuthRequests } from "@/db/schema";
import { sha256 } from "@/lib/encoding";
import { encryptRefreshToken, exchangeGoogleCode, googleAccountSubject } from "@/lib/google-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const state = url.searchParams.get("state") ?? "";
    const [oauthRequest] = await db.select().from(driveOAuthRequests).where(and(
      eq(driveOAuthRequests.stateSha256, sha256(state)),
      gt(driveOAuthRequests.expiresAt, new Date()),
      isNull(driveOAuthRequests.usedAt),
    )).limit(1);
    if (!oauthRequest) throw new Error("expired state");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("missing code");
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) throw new Error("Google returned no refresh token");
    const session = { accessToken: tokens.access_token };
    const accountSubject = await googleAccountSubject(session);
    const encryptedRefreshToken = encryptRefreshToken(tokens.refresh_token);
    const saved = await db.transaction(async (transaction) => {
      const consumed = await transaction.update(driveOAuthRequests).set({ usedAt: new Date() }).where(and(
        eq(driveOAuthRequests.id, oauthRequest.id), isNull(driveOAuthRequests.usedAt),
      )).returning({ id: driveOAuthRequests.id });
      if (consumed.length !== 1) return false;
      await transaction.insert(driveConnections).values({
        id: "rootlens",
        encryptedRefreshToken,
        googleAccountSubject: accountSubject,
      }).onConflictDoUpdate({
        target: driveConnections.id,
        set: {
          encryptedRefreshToken,
          googleAccountSubject: accountSubject,
          connectedAt: new Date(),
        },
      });
      return true;
    });
    if (!saved) throw new Error("OAuth request already used");
    return new Response("Google Driveへの接続が完了しました。この画面を閉じてください。", { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch {
    return new Response("Google Driveへ接続できませんでした。最初からやり直してください。", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
