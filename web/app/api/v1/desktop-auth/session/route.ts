import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { desktopSessions } from "@/db/schema";
import { desktopSites } from "@/lib/desktop-auth";
import { sha256 } from "@/lib/encoding";

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
  return Response.json({ sites: await desktopSites(session.identityId) });
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
