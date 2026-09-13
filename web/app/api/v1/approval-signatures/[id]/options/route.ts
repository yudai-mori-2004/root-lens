import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "@/db/client";
import { approvalSignatures, consentSnapshots, passkeyCredentials, passkeyRegistrations } from "@/db/schema";
import { webauthnConfig } from "@/lib/approval";
import {
  approvalWebAuthnChallenge, APPROVAL_STATEMENT, createApprovalChallenge,
} from "@/lib/approval-receipt";
import { randomToken, secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperatorBrowser } from "@/lib/operator-browser";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const [approval] = await db.select({
    id: approvalSignatures.id,
    personId: approvalSignatures.personId,
    siteId: approvalSignatures.siteId,
    unitId: approvalSignatures.unitId,
    sourceManifestSha256: approvalSignatures.sourceManifestSha256,
    sourceFiles: approvalSignatures.sourceFiles,
    consentSnapshotId: approvalSignatures.consentSnapshotId,
    tokenSha256: approvalSignatures.tokenSha256,
    createdAt: approvalSignatures.createdAt,
    expiresAt: approvalSignatures.expiresAt,
    snapshotSha256: consentSnapshots.snapshotSha256,
    snapshotRecords: consentSnapshots.records,
  }).from(approvalSignatures)
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalSignatures.consentSnapshotId))
    .where(and(
      eq(approvalSignatures.id, id),
      gt(approvalSignatures.expiresAt, new Date()),
      eq(approvalSignatures.completed, false),
    )).limit(1);
  if (!approval || !secureEqual(sha256(token), approval.tokenSha256)) {
    return Response.json({ error: "approval link is invalid or expired" }, { status: 410 });
  }
  const signedPayload = createApprovalChallenge({
    signatureId: approval.id,
    personId: approval.personId,
    siteId: approval.siteId,
    unitId: approval.unitId,
    sourceManifestSha256: approval.sourceManifestSha256,
    sourceFiles: approval.sourceFiles,
    consentSnapshotId: approval.consentSnapshotId,
    consentSnapshotSha256: approval.snapshotSha256,
    issuedAt: approval.createdAt,
    expiresAt: approval.expiresAt,
  });
  if (!await authenticateOperatorBrowser(request, approval.personId)) {
    return Response.json({ error: "browser login is required" }, { status: 401 });
  }
  const credentials = await db.select().from(passkeyCredentials)
    .where(eq(passkeyCredentials.personId, approval.personId));
  const { rpID } = webauthnConfig();
  const snapshotRecords = Array.isArray(approval.snapshotRecords)
    ? approval.snapshotRecords as Array<{ kind?: unknown }> : [];
  const siteAgreementCount = snapshotRecords.filter((record) => record.kind === "site_agreement").length;
  const staffConsentCount = snapshotRecords.filter((record) => record.kind === "staff_consent").length;
  if (siteAgreementCount !== 1 || staffConsentCount < 1) {
    return Response.json({ error: "consent snapshot is incomplete" }, { status: 409 });
  }
  const common = {
    statement: APPROVAL_STATEMENT,
    unitId: approval.unitId,
    files: approval.sourceFiles,
    consentSnapshot: {
      id: approval.consentSnapshotId,
      siteAgreementCount,
      staffConsentCount,
      verificationUrl: `/verify/${encodeURIComponent(approval.consentSnapshotId)}`,
    },
  };
  if (credentials.length === 0) {
    const registrationToken = randomToken();
    const options = await generateRegistrationOptions({
      rpName: "RootLens",
      rpID,
      userID: Buffer.from(approval.personId, "utf8"),
      userName: approval.personId,
      userDisplayName: "現場監督者",
      attestationType: "none",
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    const registrationId = `passkey_registration_${randomUUID()}`;
    await db.insert(passkeyRegistrations).values({
      id: registrationId,
      tokenSha256: sha256(registrationToken),
      personId: approval.personId,
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    return Response.json({
      ...common,
      mode: "register",
      registrationId,
      registrationToken,
      options,
    });
  }
  const options = await generateAuthenticationOptions({
    rpID,
    challenge: Buffer.from(approvalWebAuthnChallenge(signedPayload), "base64url"),
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
  });
  await db.update(approvalSignatures).set({ challenge: options.challenge }).where(and(
    eq(approvalSignatures.id, approval.id),
    eq(approvalSignatures.completed, false),
  ));
  return Response.json({ ...common, mode: "authenticate", options });
}
