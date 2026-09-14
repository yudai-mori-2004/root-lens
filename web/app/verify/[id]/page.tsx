import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, consentSnapshots, evidenceBundles } from "@/db/schema";

export const metadata = { robots: { index: false, follow: false } };

const pageStyle = { maxWidth: "52rem", margin: "0 auto", padding: "clamp(2.5rem, 8vw, 6rem) 1.25rem", color: "#111" };
const hashStyle = { overflowWrap: "anywhere" as const, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

function AgreementView({ record }: { record: typeof agreementRecords.$inferSelect }) {
  return (
    <main style={pageStyle}>
      <h1>署名記録</h1>
      <p>状態：{record.status}</p>
      <p>文書：{record.kind === "site_agreement" ? "現場合意書" : "撮影参加に関する同意書"}</p>
      <p>文書版：{record.documentVersion}</p>
      <p>署名完了：{record.signedAt?.toISOString() ?? "未完了"}</p>
      <p>本人確認：{record.authenticationMethod === "sms_otp" ? "SMSワンタイムパスワード" : record.authenticationMethod}</p>
      <p style={hashStyle}>署名済みPDF SHA-256：{record.signedPdfSha256 ?? "未確定"}</p>
      {record.signedPdfFileId ? (
        <p><a href={`https://drive.google.com/open?id=${encodeURIComponent(record.signedPdfFileId)}`}>権限のあるGoogleアカウントで原本を開く</a></p>
      ) : null}
    </main>
  );
}

function SnapshotView({ snapshot }: { snapshot: typeof consentSnapshots.$inferSelect }) {
  const records = Array.isArray(snapshot.records) ? snapshot.records as Array<{ record_id?: unknown }> : [];
  return (
    <main style={pageStyle}>
      <h1>同意記録のスナップショット</h1>
      <p>承認時点で、この事業所に適用されていた記録の集合です。</p>
      <p style={hashStyle}>SHA-256：{snapshot.snapshotSha256}</p>
      <ul>{records.map((record) => typeof record.record_id === "string" ? (
        <li key={record.record_id}><Link href={`/verify/${encodeURIComponent(record.record_id)}`}>{record.record_id}</Link></li>
      ) : null)}</ul>
    </main>
  );
}

function EvidenceView({ row }: { row: typeof evidenceBundles.$inferSelect }) {
  return (
    <main style={pageStyle}>
      <h1>RootLensデータ証跡</h1>
      <p>RootLensの保存記録と照合済みです。</p>
      <p>撮影単位：{row.unitId}</p>
      <p>提供日時：{row.providedAt.toISOString()}</p>
      <p style={hashStyle}>証跡payload SHA-256：{row.payloadSha256}</p>
      <p style={hashStyle}>納品manifest SHA-256：{row.deliveryManifestSha256}</p>
    </main>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("agr_")) {
    const [record] = await db.select().from(agreementRecords).where(eq(agreementRecords.id, id)).limit(1);
    if (!record) notFound();
    return <AgreementView record={record} />;
  }
  if (id.startsWith("csp_")) {
    const [snapshot] = await db.select().from(consentSnapshots).where(eq(consentSnapshots.id, id)).limit(1);
    if (!snapshot) notFound();
    return <SnapshotView snapshot={snapshot} />;
  }
  if (id.startsWith("evd_")) {
    const [row] = await db.select().from(evidenceBundles).where(eq(evidenceBundles.id, id)).limit(1);
    if (!row) notFound();
    return <EvidenceView row={row} />;
  }
  notFound();
}
