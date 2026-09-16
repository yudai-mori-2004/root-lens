import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { desktopSessions } from "@/db/schema";
import { desktopSites } from "@/lib/desktop-auth";
import { sha256 } from "@/lib/encoding";
import { operatorPhoneLast4 } from "@/lib/operator-identity";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return Response.json({ error: "invalid or expired session" }, { status: 401 });
  const [session] = await db.select().from(desktopSessions).where(and(
    eq(desktopSessions.tokenSha256, sha256(token)),
    gt(desktopSessions.expiresAt, new Date()),
    isNull(desktopSessions.revokedAt),
  )).limit(1);
  if (!session) return Response.json({ error: "invalid or expired session" }, { status: 401 });
  const [sites, phoneLast4] = await Promise.all([
    desktopSites(session.identityId),
    operatorPhoneLast4(session.identityId).catch(() => null),
  ]);
  return Response.json({ sites, phoneLast4 });
}

export async function DELETE(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token) {
    await db.update(desktopSessions).set({ revokedAt: new Date() })
      .where(and(eq(desktopSessions.tokenSha256, sha256(token)), isNull(desktopSessions.revokedAt)));
  }
  return new Response(null, { status: 204 });
}
