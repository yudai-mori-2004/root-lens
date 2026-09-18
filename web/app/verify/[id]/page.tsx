import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, consentSnapshots, evidenceBundles } from "@/db/schema";
import styles from "./verify.module.css";

export const metadata = { robots: { index: false, follow: false } };

function Detail({ label, value, technical = false }: { label: string; value: React.ReactNode; technical?: boolean }) {
  return <div className={styles.detail}><dt>{label}</dt><dd className={technical ? styles.technical : undefined}>{value}</dd></div>;
}

function OriginalLink({ fileId }: { fileId: string }) {
  return <a className={styles.actionLink} href={`https://drive.google.com/open?id=${encodeURIComponent(fileId)}`}>
    <span>同意記録の原本を開く</span><span aria-hidden="true">↗</span>
  </a>;
}

function AgreementView({ record }: { record: typeof agreementRecords.$inferSelect }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>同意記録</h1>
      <dl className={styles.details}>
        <Detail label="状態" value={record.status} />
        <Detail label="文書" value={record.kind === "site_agreement" ? "現場合意書" : "撮影参加に関する同意書"} />
        <Detail label="文書版" value={record.documentVersion} />
        <Detail label="同意日時" value={record.signedAt?.toISOString() ?? "未完了"} />
        <Detail label="本人確認" value={record.authenticationMethod === "sms_otp" ? "SMSワンタイムパスワード" : record.authenticationMethod} />
        <Detail label="同意記録PDF SHA-256" value={record.signedPdfSha256 ?? "未確定"} technical />
      </dl>
      {record.signedPdfFileId ? <div className={styles.actions}>
        <OriginalLink fileId={record.signedPdfFileId} />
        <p className={styles.note}>原本の表示には、権限のあるGoogleアカウントが必要です。</p>
      </div> : null}
    </main>
  );
}

function SnapshotView({ snapshot }: { snapshot: typeof consentSnapshots.$inferSelect }) {
  const records = Array.isArray(snapshot.records) ? snapshot.records as Array<{ record_id?: unknown }> : [];
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>同意記録のスナップショット</h1>
      <p className={styles.lead}>承認時点で、この事業所に適用されていた記録の集合です。</p>
      <dl className={styles.details}><Detail label="SHA-256" value={snapshot.snapshotSha256} technical /></dl>
      <ul className={styles.linkList}>{records.map((record) => typeof record.record_id === "string" ? (
        <li key={record.record_id}><Link href={`/verify/${encodeURIComponent(record.record_id)}`}><span>{record.record_id}</span><span aria-hidden="true">→</span></Link></li>
      ) : null)}</ul>
    </main>
  );
}

function EvidenceView({ row }: { row: typeof evidenceBundles.$inferSelect }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>RootLensデータ証跡</h1>
      <p className={styles.lead}>RootLensの保存記録と照合済みです。</p>
      <dl className={styles.details}>
        <Detail label="撮影単位" value={row.unitId} />
        <Detail label="発行日時" value={row.issuedAt.toISOString()} />
        <Detail label="証跡payload SHA-256" value={row.payloadSha256} technical />
        <Detail label="承認対象ファイル一式 SHA-256" value={row.filesSha256} technical />
      </dl>
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
