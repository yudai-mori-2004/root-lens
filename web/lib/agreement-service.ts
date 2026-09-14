import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { agreementTemplates, type AgreementKind } from "@/content/agreementTemplates.generated";
import { db } from "@/db/client";
import { agreementRecords } from "@/db/schema";
import { createAgreementPdf } from "./agreement-original";
import { canonicalJson, sha256 } from "./encoding";
import type { GoogleDriveClient } from "./google-drive";

export const ACCEPTED_STATEMENT = "上記内容を確認し、同意します";

type SiteFolders = Readonly<{
  id: string;
  name: string;
  sharedDriveId: string;
  siteAgreementsFolderId: string;
  staffConsentsFolderId: string;
}>;

type AgreementInput = Readonly<{
  site: SiteFolders;
  drive: GoogleDriveClient;
  kind: AgreementKind;
  personId?: string;
  identityId: string;
  signerName: string;
  phoneLast4: string;
  acceptedAt?: Date;
}>;

export async function storeAgreementOriginal(input: AgreementInput) {
  const acceptedAt = input.acceptedAt ?? new Date();
  const agreementId = `agr_${randomUUID()}`;
  const template = agreementTemplates[input.kind];
  const acceptancePayloadSha256 = sha256(canonicalJson({
    site_id: input.site.id,
    kind: input.kind,
    person_id: input.personId ?? null,
    signer_identity_id: input.identityId,
    signer_name: input.signerName,
    phone_last4: input.phoneLast4,
    accepted_statement: ACCEPTED_STATEMENT,
    accepted_at: acceptedAt.toISOString(),
    document_version: template.version,
    template_sha256: template.sha256,
  }));
  const pdf = await createAgreementPdf({
    agreementId,
    kind: input.kind,
    siteId: input.site.id,
    siteName: input.site.name,
    signer: { identityId: input.identityId, name: input.signerName, phoneLast4: input.phoneLast4 },
    acceptedAt,
    acceptedStatement: ACCEPTED_STATEMENT,
  });
  const fileId = await input.drive.generateId();
  const folderId = input.kind === "site_agreement"
    ? input.site.siteAgreementsFolderId : input.site.staffConsentsFolderId;
  const baseName = input.kind === "site_agreement" ? "site-agreement" : "staff-consent";
  const saved = await input.drive.uploadPdf({
    id: fileId,
    name: `${baseName}__${agreementId}.pdf`,
    bytes: pdf,
    parentId: folderId,
    sharedDriveId: input.site.sharedDriveId,
    appProperties: {
      rootlens_artifact: "signed_original",
      rootlens_agreement_record_id: agreementId,
      rootlens_site_id: input.site.id,
      rootlens_agreement_kind: input.kind,
      rootlens_document_version: template.version,
    },
  });
  return {
    id: agreementId,
    siteId: input.site.id,
    personId: input.personId ?? null,
    kind: input.kind,
    documentVersion: template.version,
    templateSha256: template.sha256,
    acceptancePayloadSha256,
    signerIdentityId: input.identityId,
    signerName: input.signerName,
    phoneLast4: input.phoneLast4,
    authenticationMethod: "sms_otp",
    acceptedStatement: ACCEPTED_STATEMENT,
    signedPdfFileId: saved.fileId,
    signedPdfSha256: saved.sha256,
    signedAt: acceptedAt,
    storedAt: new Date(),
    status: "active",
  } as const;
}

export async function activateAgreement(record: Awaited<ReturnType<typeof storeAgreementOriginal>>) {
  await db.transaction(async (transaction) => {
    const scope = record.kind === "site_agreement"
      ? and(eq(agreementRecords.siteId, record.siteId), eq(agreementRecords.kind, "site_agreement"))
      : and(eq(agreementRecords.personId, record.personId!), eq(agreementRecords.kind, "staff_consent"));
    await transaction.update(agreementRecords).set({ status: "superseded" }).where(and(
      scope, eq(agreementRecords.status, "active"), ne(agreementRecords.id, record.id),
    ));
    await transaction.insert(agreementRecords).values(record);
  });
}
