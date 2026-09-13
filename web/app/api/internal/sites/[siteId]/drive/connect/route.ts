import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveOAuthRequests, sites } from "@/db/schema";
import { randomToken } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { googleAuthorizationUrl } from "@/lib/google-oauth";
import { authenticateInternalRequest } from "@/lib/internal-auth";

export async function POST(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const { siteId } = await context.params;
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return Response.json({ error: "site not found" }, { status: 404 });
  const state = randomToken();
  await db.insert(driveOAuthRequests).values({
    id: `drive_oauth_${randomUUID()}`,
    siteId,
    stateSha256: sha256(state),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return Response.json({ authorizationUrl: googleAuthorizationUrl(state) });
}
