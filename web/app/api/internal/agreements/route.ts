import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { agreementTemplates } from "@/content/agreementTemplates.generated";
import { db } from "@/db/client";
import { agreementRecords, operatorIdentities, people, sites } from "@/db/schema";
import { createAgreementPdf } from "@/lib/agreement-original";
import { canonicalJson, sha256 } from "@/lib/encoding";
import { authenticateInternalRequest } from "@/lib/internal-auth";
import { siteDrive } from "@/lib/site-drive";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  siteId: z.string().min(1),
  kind: z.enum(["site_agreement", "staff_consent"]),
  personId: z.string().min(1).optional(),
  signer: z.object({
    identityId: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    phoneLast4: z.string().regex(/^\d{4}$/),
  }),
  acceptedStatement: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid signing request" }, { status: 400 });
  const input = parsed.data;
  const agreementId = `agr_${input.requestId}`;
  const [site] = await db.select().from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) return Response.json({ error: "site not found" }, { status: 404 });
  const [identity] = await db.select({ id: operatorIdentities.id }).from(operatorIdentities)
    .where(eq(operatorIdentities.id, input.signer.identityId)).limit(1);
  if (!identity) return Response.json({ error: "signer identity not found" }, { status: 404 });
  if (input.kind === "staff_consent") {
    if (!input.personId) return Response.json({ error: "staff consent requires a person" }, { status: 400 });
    const [person] = await db.select({ id: people.id }).from(people).where(and(
      eq(people.id, input.personId), eq(people.siteId, site.id),
    )).limit(1);
    if (!person) return Response.json({ error: "staff member not found at this site" }, { status: 404 });
  }

  const acceptancePayloadSha256 = sha256(canonicalJson({
    site_id: site.id,
    kind: input.kind,
    person_id: input.personId ?? null,
    signer: input.signer,
    accepted_statement: input.acceptedStatement,
  }));
  const { drive } = await siteDrive(site.id);
  let [record] = await db.select().from(agreementRecords).where(eq(agreementRecords.id, agreementId)).limit(1);
  if (!record) {
    await db.insert(agreementRecords).values({
      id: agreementId,
      siteId: site.id,
      personId: input.personId ?? null,
      kind: input.kind,
      documentVersion: agreementTemplates[input.kind].version,
      templateSha256: agreementTemplates[input.kind].sha256,
      acceptancePayloadSha256,
      signerIdentityId: identity.id,
      signerName: input.signer.name,
      phoneLast4: input.signer.phoneLast4,
      authenticationMethod: "sms_otp",
      acceptedStatement: input.acceptedStatement,
      signedPdfFileId: await drive.generateId(),
      signedAt: new Date(),
    }).onConflictDoNothing();
    [record] = await db.select().from(agreementRecords).where(eq(agreementRecords.id, agreementId)).limit(1);
  }
  if (!record || record.acceptancePayloadSha256 !== acceptancePayloadSha256 || !record.signedPdfFileId) {
    return Response.json({ error: "signing request conflicts with an existing record" }, { status: 409 });
  }
  if (record.storedAt) return Response.json({ agreementRecordId: record.id, completed: true });

  const pdf = await createAgreementPdf({
    agreementId: record.id,
    kind: input.kind,
    siteId: site.id,
    siteName: site.name,
    signer: {
      identityId: record.signerIdentityId,
      name: record.signerName,
      phoneLast4: record.phoneLast4,
    },
    acceptedAt: record.signedAt,
    acceptedStatement: record.acceptedStatement,
  });
  const folderId = input.kind === "site_agreement" ? site.siteAgreementsFolderId : site.staffConsentsFolderId;
  const baseName = input.kind === "site_agreement" ? "site-agreement" : "staff-consent";
  const saved = await drive.uploadPdf({
    id: record.signedPdfFileId,
    name: `${baseName}__${record.id}.pdf`,
    bytes: pdf,
    parentId: folderId,
    sharedDriveId: site.sharedDriveId,
    appProperties: {
      rootlens_artifact: "signed_original",
      rootlens_agreement_record_id: record.id,
      rootlens_site_id: site.id,
      rootlens_agreement_kind: input.kind,
      rootlens_document_version: record.documentVersion,
    },
  });

  await db.transaction(async (transaction) => {
    const scope = input.kind === "site_agreement"
      ? and(eq(agreementRecords.siteId, site.id), eq(agreementRecords.kind, "site_agreement"))
      : and(eq(agreementRecords.personId, input.personId!), eq(agreementRecords.kind, "staff_consent"));
    await transaction.update(agreementRecords).set({ status: "superseded" }).where(and(
      scope, eq(agreementRecords.status, "active"), ne(agreementRecords.id, record.id),
    ));
    await transaction.update(agreementRecords).set({
      signedPdfSha256: saved.sha256,
      storedAt: new Date(),
      status: "active",
    }).where(eq(agreementRecords.id, record.id));
  });
  return Response.json({ agreementRecordId: record.id, completed: true }, { status: 201 });
}
