import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, consentSnapshots } from "@/db/schema";
import { canonicalJson, sha256 } from "./encoding";

export function webauthnConfig() {
  const origin = process.env.WEBAUTHN_ORIGIN || "https://www.rootlens.io";
  const rpID = process.env.WEBAUTHN_RP_ID || "rootlens.io";
  const parsed = new URL(origin);
  const validProduction = parsed.protocol === "https:" && (parsed.hostname === rpID || parsed.hostname.endsWith(`.${rpID}`));
  const validDevelopment = process.env.NODE_ENV !== "production" && parsed.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(parsed.hostname) && rpID === parsed.hostname;
  if (!validProduction && !validDevelopment) throw new Error("Invalid WebAuthn origin or RP ID");
  return { origin, rpID };
}

export async function createConsentSnapshot(siteId: string) {
  const agreements = await db.select({
    id: agreementRecords.id,
    kind: agreementRecords.kind,
    documentVersion: agreementRecords.documentVersion,
    templateSha256: agreementRecords.templateSha256,
    signedPdfSha256: agreementRecords.signedPdfSha256,
    authenticationMethod: agreementRecords.authenticationMethod,
    signedAt: agreementRecords.signedAt,
  }).from(agreementRecords).where(and(
    eq(agreementRecords.siteId, siteId),
    eq(agreementRecords.status, "active"),
  ));
  const siteAgreements = agreements.filter((item) => item.kind === "site_agreement");
  const staffConsents = agreements.filter((item) => item.kind === "staff_consent");
  if (siteAgreements.length !== 1 || staffConsents.length === 0
      || agreements.some((item) => !item.signedPdfSha256 || !item.signedAt)) {
    throw new Error("Active agreements are incomplete");
  }
  const records = agreements.map((item) => ({
    record_id: item.id,
    kind: item.kind,
    document_version: item.documentVersion,
    template_sha256: item.templateSha256,
    signed_pdf_sha256: item.signedPdfSha256,
    authentication_method: item.authenticationMethod,
    signed_at: item.signedAt!.toISOString(),
    status: "active",
  })).sort((a, b) => a.record_id.localeCompare(b.record_id));
  const snapshotSha256 = sha256(canonicalJson(records));
  const id = `csp_${randomUUID()}`;
  await db.insert(consentSnapshots).values({ id, siteId, snapshotSha256, records });
  return { id, snapshotSha256, records };
}
