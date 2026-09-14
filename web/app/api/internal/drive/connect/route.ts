import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { driveOAuthRequests } from "@/db/schema";
import { randomToken } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { googleAuthorizationUrl } from "@/lib/google-oauth";
import { authenticateInternalRequest } from "@/lib/internal-auth";

export async function POST(request: Request) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const state = randomToken();
  await db.insert(driveOAuthRequests).values({
    id: `drive_oauth_${randomUUID()}`,
    stateSha256: sha256(state),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return Response.json({ authorizationUrl: googleAuthorizationUrl(state) });
}
