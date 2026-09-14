import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, sites } from "@/db/schema";
import { DocumensoClient } from "@/lib/documenso";
import { documensoCompletion, verifyDocumensoWebhook } from "@/lib/documenso-webhook";
import { siteDrive } from "@/lib/site-drive";

export async function POST(request: Request) {
  if (!verifyDocumensoWebhook(request.headers.get("x-documenso-secret"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as unknown;
  if (body && typeof body === "object" && "event" in body && body.event !== "DOCUMENT_COMPLETED") {
    return Response.json({ ignored: true });
  }
  const completion = documensoCompletion(body);
  if (!completion) return Response.json({ error: "invalid envelope" }, { status: 400 });
  const { envelopeId, externalId } = completion;

  const [record] = await db.select().from(agreementRecords).where(and(
    eq(agreementRecords.signatureProvider, "documenso"),
    eq(agreementRecords.providerEnvelopeId, envelopeId),
  )).limit(1);
  if (!record || (externalId !== null && externalId !== record.id)) {
    return Response.json({ error: "agreement not found" }, { status: 404 });
  }
  if (record.status === "active" || record.status === "superseded") {
    return Response.json({ completed: true, agreementRecordId: record.id });
  }

  const documenso = new DocumensoClient();
  const envelope = await documenso.envelope(envelopeId);
  if (envelope.status !== "COMPLETED" || !envelope.completedAt || envelope.externalId !== record.id) {
    return Response.json({ error: "envelope is not complete" }, { status: 409 });
  }
  if (envelope.envelopeItems.length !== 1) {
    return Response.json({ error: "agreement envelope must contain one PDF" }, { status: 409 });
  }
  const completedAt = new Date(envelope.completedAt);
  if (Number.isNaN(completedAt.getTime())) {
    return Response.json({ error: "envelope completion time is invalid" }, { status: 409 });
  }

  const { site, drive } = await siteDrive(record.siteId);
  const folderId = record.kind === "site_agreement" ? site.siteAgreementsFolderId : site.staffConsentsFolderId;
  const properties = {
    rootlens_agreement_record_id: record.id,
    rootlens_site_id: site.id,
    rootlens_agreement_kind: record.kind,
    rootlens_document_version: record.documentVersion,
  };
  const [signedPdf, certificate] = await Promise.all([
    documenso.downloadSignedPdf(envelope.envelopeItems[0].id),
    documenso.downloadCertificate(envelope.id),
  ]);

  let claimedRecord = record;
  if (!record.signedPdfFileId || !record.certificateFileId) {
    const [signedPdfFileId, certificateFileId] = await Promise.all([drive.generateId(), drive.generateId()]);
    const claimed = await db.update(agreementRecords).set({
      signedPdfFileId,
      certificateFileId,
      status: "processing",
    }).where(and(
      eq(agreementRecords.id, record.id),
      eq(agreementRecords.status, "pending"),
    )).returning();
    if (claimed.length === 1) {
      [claimedRecord] = claimed;
    } else {
      [claimedRecord] = await db.select().from(agreementRecords)
        .where(eq(agreementRecords.id, record.id)).limit(1);
    }
  }
  if (!claimedRecord?.signedPdfFileId || !claimedRecord.certificateFileId) {
    return Response.json({ error: "agreement file allocation failed" }, { status: 409 });
  }
  if (claimedRecord.kind === "staff_consent" && !claimedRecord.personId) {
    return Response.json({ error: "staff consent has no staff member" }, { status: 409 });
  }

  const [savedPdf, savedCertificate] = await Promise.all([
    drive.uploadPdf({
      id: claimedRecord.signedPdfFileId,
      name: `${claimedRecord.kind === "site_agreement" ? "site-agreement" : "staff-consent"}__${claimedRecord.id}__${claimedRecord.documentVersion}.pdf`,
      bytes: signedPdf, parentId: folderId, sharedDriveId: site.sharedDriveId, appProperties: properties,
    }),
    drive.uploadPdf({
      id: claimedRecord.certificateFileId,
      name: `${claimedRecord.kind === "site_agreement" ? "site-agreement" : "staff-consent"}-certificate__${claimedRecord.id}.pdf`,
      bytes: certificate, parentId: folderId, sharedDriveId: site.sharedDriveId,
      appProperties: { ...properties, rootlens_artifact: "signature_certificate" },
    }),
  ]);

  await db.transaction(async (transaction) => {
    const scope = claimedRecord.kind === "site_agreement"
      ? and(eq(agreementRecords.siteId, site.id), eq(agreementRecords.kind, "site_agreement"))
      : and(eq(agreementRecords.personId, claimedRecord.personId!), eq(agreementRecords.kind, "staff_consent"));
    const active = await transaction.select({
      id: agreementRecords.id,
      signedAt: agreementRecords.signedAt,
    }).from(agreementRecords).where(and(scope, eq(agreementRecords.status, "active"))).for("update");
    const newerActiveExists = active.some((item) => item.signedAt && (
      item.signedAt > completedAt || (item.signedAt.getTime() === completedAt.getTime() && item.id > claimedRecord.id)
    ));
    if (!newerActiveExists) {
      await transaction.update(agreementRecords).set({ status: "superseded" }).where(and(
        scope,
        eq(agreementRecords.status, "active"),
        ne(agreementRecords.id, claimedRecord.id),
      ));
    }
    if (claimedRecord.kind === "site_agreement") {
      await transaction.update(sites).set({ status: "active" }).where(eq(sites.id, site.id));
    }
    await transaction.update(agreementRecords).set({
      signedPdfFileId: savedPdf.fileId,
      signedPdfSha256: savedPdf.sha256,
      certificateFileId: savedCertificate.fileId,
      certificateSha256: savedCertificate.sha256,
      signedAt: completedAt,
      status: newerActiveExists ? "superseded" : "active",
    }).where(eq(agreementRecords.id, claimedRecord.id));
  });
  return Response.json({ completed: true, agreementRecordId: claimedRecord.id });
}
