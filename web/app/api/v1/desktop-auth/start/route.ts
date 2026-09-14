import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db/client";
import { desktopLoginRequests } from "@/db/schema";
import { randomToken, validateCodeChallenge, validateLoopbackRedirect } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";

const bodySchema = z.object({
  redirectUri: z.string().max(200),
  codeChallenge: z.string().max(128),
  clientState: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid login request" }, { status: 400 });
  try {
    const state = randomToken();
    const id = `login_${randomUUID()}`;
    await db.insert(desktopLoginRequests).values({
      id,
      stateSha256: sha256(state),
      clientState: parsed.data.clientState,
      codeChallenge: validateCodeChallenge(parsed.data.codeChallenge),
      redirectUri: validateLoopbackRedirect(parsed.data.redirectUri),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const origin = new URL(request.url).origin;
    const query = new URLSearchParams({ request: id, state });
    return Response.json({ authorizationUrl: `${origin}/desktop/authorize?${query}` }, { status: 201 });
  } catch {
    return Response.json({ error: "invalid login request" }, { status: 400 });
  }
}
