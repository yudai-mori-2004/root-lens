import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "@/db/client";
import {
  approvalEvents, approvalSignatures, consentSnapshots, passkeyCredentials,
} from "@/db/schema";
import { webauthnConfig } from "@/lib/approval";
import {
  approvalWebAuthnChallenge, createApprovalChallenge, createApprovalReceipt,
} from "@/lib/approval-receipt";
import { secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperatorBrowser } from "@/lib/operator-browser";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { token?: unknown; response?: AuthenticationResponseJSON } | null;
  const [approval] = await db.select({
    id: approvalSignatures.id,
    tokenSha256: approvalSignatures.tokenSha256,
    siteId: approvalSignatures.siteId,
    personId: approvalSignatures.personId,
    unitId: approvalSignatures.unitId,
    sourceManifestSha256: approvalSignatures.sourceManifestSha256,
    sourceFiles: approvalSignatures.sourceFiles,
    consentSnapshotId: approvalSignatures.consentSnapshotId,
    consentSnapshotSha256: consentSnapshots.snapshotSha256,
    statementVersion: approvalSignatures.statementVersion,
    challenge: approvalSignatures.challenge,
    createdAt: approvalSignatures.createdAt,
    expiresAt: approvalSignatures.expiresAt,
  }).from(approvalSignatures)
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalSignatures.consentSnapshotId))
    .where(and(
      eq(approvalSignatures.id, id),
      gt(approvalSignatures.expiresAt, new Date()),
      eq(approvalSignatures.completed, false),
    )).limit(1);
  if (!approval || typeof body?.token !== "string" || !body.response || !approval.challenge
      || !secureEqual(sha256(body.token), approval.tokenSha256)) {
    return Response.json({ error: "approval is invalid or expired" }, { status: 410 });
  }
  if (!await authenticateOperatorBrowser(request, approval.personId)) {
    return Response.json({ error: "browser login is required" }, { status: 401 });
  }
  const [credential] = await db.select().from(passkeyCredentials).where(and(
    eq(passkeyCredentials.id, body.response.id),
    eq(passkeyCredentials.personId, approval.personId),
  )).limit(1);
  if (!credential) return Response.json({ error: "passkey is not registered" }, { status: 403 });

  try {
    const { origin, rpID } = webauthnConfig();
    const signedPayload = createApprovalChallenge({
      signatureId: approval.id,
      personId: approval.personId,
      siteId: approval.siteId,
      unitId: approval.unitId,
      sourceManifestSha256: approval.sourceManifestSha256,
      sourceFiles: approval.sourceFiles,
      consentSnapshotId: approval.consentSnapshotId,
      consentSnapshotSha256: approval.consentSnapshotSha256,
      issuedAt: approval.createdAt,
      expiresAt: approval.expiresAt,
    });
    if (!secureEqual(approvalWebAuthnChallenge(signedPayload), approval.challenge)) {
      throw new Error("approval challenge does not match its payload");
    }
    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: approval.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey, "base64url"),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    });
    if (!verification.verified) throw new Error("approval failed");
    const eventId = `apv_${randomUUID()}`;
    const approvedAt = new Date();
    const receipt = createApprovalReceipt({
      eventId,
      signedPayload,
      credentialId: credential.id,
      credentialPublicKey: credential.publicKey,
      credentialCounterBefore: credential.counter,
      credentialCounterAfter: verification.authenticationInfo.newCounter,
      rpId: rpID,
      origin,
      assertion: body.response,
      approvedAt,
    });
    await db.transaction(async (transaction) => {
      const won = await transaction.update(approvalSignatures).set({ completed: true }).where(and(
        eq(approvalSignatures.id, approval.id),
        eq(approvalSignatures.completed, false),
      )).returning({ id: approvalSignatures.id });
      if (won.length !== 1) throw new Error("approval already completed");
      const counterUpdated = await transaction.update(passkeyCredentials)
        .set({ counter: verification.authenticationInfo.newCounter })
        .where(and(
          eq(passkeyCredentials.id, credential.id),
          eq(passkeyCredentials.counter, credential.counter),
        )).returning({ id: passkeyCredentials.id });
      if (counterUpdated.length !== 1) throw new Error("passkey counter changed during approval");
      await transaction.insert(approvalEvents).values({
        id: eventId,
        signatureId: approval.id,
        siteId: approval.siteId,
        unitId: approval.unitId,
        sourceManifestSha256: approval.sourceManifestSha256,
        personId: approval.personId,
        credentialId: credential.id,
        signedPayloadSha256: receipt.signed_payload_sha256,
        assertionSha256: receipt.webauthn.assertion_sha256,
        receipt,
        approvedAt,
      });
    });
    return Response.json({ approved: true, approvalEventId: eventId, receipt });
  } catch {
    return Response.json({ error: "passkey approval failed" }, { status: 400 });
  }
}
