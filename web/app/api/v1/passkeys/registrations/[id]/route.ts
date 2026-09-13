import { and, eq, gt } from "drizzle-orm";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db/client";
import { passkeyCredentials, passkeyRegistrations } from "@/db/schema";
import { webauthnConfig } from "@/lib/approval";
import { secureEqual } from "@/lib/desktop-auth-values";
import { base64url, sha256 } from "@/lib/encoding";
import { authenticateOperatorBrowser } from "@/lib/operator-browser";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { token?: unknown; response?: unknown } | null;
  const [registration] = await db.select().from(passkeyRegistrations).where(and(
    eq(passkeyRegistrations.id, id),
    gt(passkeyRegistrations.expiresAt, new Date()),
    eq(passkeyRegistrations.completed, false),
  )).limit(1);
  if (!registration || typeof body?.token !== "string"
      || !secureEqual(sha256(body.token), registration.tokenSha256)) {
    return Response.json({ error: "registration is invalid or expired" }, { status: 410 });
  }
  if (!await authenticateOperatorBrowser(request, registration.personId)) {
    return Response.json({ error: "browser login is required" }, { status: 401 });
  }
  try {
    const { origin, rpID } = webauthnConfig();
    const verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: registration.challenge!,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified) throw new Error("registration failed");
    const credential = verification.registrationInfo.credential;
    await db.transaction(async (transaction) => {
      const won = await transaction.update(passkeyRegistrations).set({ completed: true }).where(and(
        eq(passkeyRegistrations.id, registration.id),
        eq(passkeyRegistrations.completed, false),
      )).returning({ id: passkeyRegistrations.id });
      if (won.length !== 1) throw new Error("registration already used");
      await transaction.insert(passkeyCredentials).values({
        id: credential.id,
        personId: registration.personId,
        publicKey: base64url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
      });
    });
    return Response.json({ registered: true });
  } catch {
    return Response.json({ error: "passkey registration failed" }, { status: 400 });
  }
}
