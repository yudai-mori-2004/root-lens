import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, driveConnections, sites } from "@/db/schema";
import { DocuSealClient } from "@/lib/docuseal";
import { verifyDocuSealWebhook } from "@/lib/docuseal-webhook";
import { GoogleDriveClient } from "@/lib/google-drive";
import { googleSession } from "@/lib/google-oauth";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyDocuSealWebhook(rawBody, request.headers.get("x-docuseal-signature"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const notification = (() => {
    try { return JSON.parse(rawBody); } catch { return null; }
  })() as { event_type?: unknown; data?: { id?: unknown } } | null;
  if (notification?.event_type !== "submission.completed" || !Number.isInteger(notification.data?.id)) {
    return Response.json({ ignored: true });
  }
  const submissionId = notification.data?.id as number;
  let [record] = await db.select().from(agreementRecords)
    .where(eq(agreementRecords.docusealSubmissionId, submissionId)).limit(1);
  if (!record) return Response.json({ error: "agreement not found" }, { status: 404 });
  if (record.status === "active" || record.status === "superseded") {
    return Response.json({ completed: true, agreementRecordId: record.id });
  }

  const docuseal = new DocuSealClient();
  const submission = await docuseal.submission(submissionId);
  if (submission.status !== "completed" || !submission.completed_at) {
    return Response.json({ error: "submission is not complete" }, { status: 409 });
  }
  const signedAt = submission.completed_at;
  const completedAt = new Date(signedAt);
  if (Number.isNaN(completedAt.getTime())) {
    return Response.json({ error: "submission completion time is invalid" }, { status: 409 });
  }
  const documentUrl = submission.combined_document_url ?? submission.documents?.[0]?.url;
  if (!documentUrl || !submission.audit_log_url) {
    return Response.json({ error: "completed documents are unavailable" }, { status: 409 });
  }
  const [[site], [connection]] = await Promise.all([
    db.select().from(sites).where(eq(sites.id, record.siteId)).limit(1),
    db.select().from(driveConnections).where(eq(driveConnections.id, "rootlens")).limit(1),
  ]);
  if (!site || !connection) return Response.json({ error: "RootLens Drive is not connected" }, { status: 409 });
  const drive = new GoogleDriveClient(await googleSession(connection.encryptedRefreshToken));
  const folderId = record.kind === "site_agreement" ? site.siteAgreementsFolderId : site.staffConsentsFolderId;
  const properties = {
    rootlens_agreement_record_id: record.id,
    rootlens_site_id: site.id,
    rootlens_agreement_kind: record.kind,
    rootlens_document_version: record.documentVersion,
  };
  const [signedPdf, certificate] = await Promise.all([
    docuseal.download(documentUrl),
    docuseal.download(submission.audit_log_url),
  ]);
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
      [record] = claimed;
    } else {
      [record] = await db.select().from(agreementRecords).where(eq(agreementRecords.id, record.id)).limit(1);
    }
  }
  if (!record?.signedPdfFileId || !record.certificateFileId) {
    return Response.json({ error: "agreement file allocation failed" }, { status: 409 });
  }
  if (record.kind === "staff_consent" && !record.personId) {
    return Response.json({ error: "staff consent has no staff member" }, { status: 409 });
  }
  const [savedPdf, savedCertificate] = await Promise.all([
    drive.uploadPdf({
      id: record.signedPdfFileId,
      name: `${record.kind === "site_agreement" ? "site-agreement" : "staff-consent"}__${record.id}__${record.documentVersion}.pdf`,
      bytes: signedPdf, parentId: folderId, sharedDriveId: site.sharedDriveId, appProperties: properties,
    }),
    drive.uploadPdf({
      id: record.certificateFileId,
      name: `${record.kind === "site_agreement" ? "site-agreement" : "staff-consent"}-certificate__${record.id}.pdf`,
      bytes: certificate, parentId: folderId, sharedDriveId: site.sharedDriveId,
      appProperties: { ...properties, rootlens_artifact: "signature_certificate" },
    }),
  ]);
  await db.transaction(async (transaction) => {
    const scope = record.kind === "site_agreement"
      ? and(eq(agreementRecords.siteId, site.id), eq(agreementRecords.kind, "site_agreement"))
      : and(eq(agreementRecords.personId, record.personId!), eq(agreementRecords.kind, "staff_consent"));
    const active = await transaction.select({
      id: agreementRecords.id,
      signedAt: agreementRecords.signedAt,
    }).from(agreementRecords).where(and(scope, eq(agreementRecords.status, "active"))).for("update");
    const newerActiveExists = active.some((item) => item.signedAt && (
      item.signedAt > completedAt || (item.signedAt.getTime() === completedAt.getTime() && item.id > record.id)
    ));
    if (!newerActiveExists) {
      await transaction.update(agreementRecords).set({ status: "superseded" }).where(and(
        scope,
        eq(agreementRecords.status, "active"),
        ne(agreementRecords.id, record.id),
      ));
    }
    if (record.kind === "site_agreement") {
      await transaction.update(sites).set({ status: "active" }).where(eq(sites.id, site.id));
    }
    await transaction.update(agreementRecords).set({
      signedPdfFileId: savedPdf.fileId,
      signedPdfSha256: savedPdf.sha256,
      certificateFileId: savedCertificate.fileId,
      certificateSha256: savedCertificate.sha256,
      signedAt: completedAt,
      status: newerActiveExists ? "superseded" : "active",
    }).where(eq(agreementRecords.id, record.id));
  });
  return Response.json({ completed: true, agreementRecordId: record.id });
}
