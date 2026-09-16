import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { desktopAuthorizationCodes, desktopSessions } from "@/db/schema";
import { desktopSites } from "@/lib/desktop-auth";
import { operatorPhoneLast4 } from "@/lib/operator-identity";
import { codeChallenge, randomToken, secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";

const bodySchema = z.object({
  code: z.string().min(32).max(200),
  codeVerifier: z.string().min(43).max(128),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid authorization code" }, { status: 400 });
  try {
    const [authorization] = await db.select().from(desktopAuthorizationCodes).where(and(
      eq(desktopAuthorizationCodes.codeSha256, sha256(parsed.data.code)),
      gt(desktopAuthorizationCodes.expiresAt, new Date()),
      isNull(desktopAuthorizationCodes.usedAt),
    )).limit(1);
    if (!authorization || !secureEqual(codeChallenge(parsed.data.codeVerifier), authorization.codeChallenge)) {
      return Response.json({ error: "invalid authorization code" }, { status: 401 });
    }
    const sessionToken = randomToken();
    const sessionId = `session_${randomUUID()}`;
    const won = await db.transaction(async (transaction) => {
      const consumed = await transaction.update(desktopAuthorizationCodes).set({ usedAt: new Date() }).where(and(
        eq(desktopAuthorizationCodes.id, authorization.id), isNull(desktopAuthorizationCodes.usedAt),
      )).returning({ id: desktopAuthorizationCodes.id });
      if (consumed.length !== 1) return false;
      await transaction.insert(desktopSessions).values({
        id: sessionId,
        identityId: authorization.identityId,
        tokenSha256: sha256(sessionToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      });
      return true;
    });
    if (!won) return Response.json({ error: "invalid authorization code" }, { status: 401 });
    const [sites, phoneLast4] = await Promise.all([
      desktopSites(authorization.identityId),
      operatorPhoneLast4(authorization.identityId).catch(() => null),
    ]);
    return Response.json({ sessionToken, sites, phoneLast4 });
  } catch {
    return Response.json({ error: "invalid authorization code" }, { status: 401 });
  }
}
