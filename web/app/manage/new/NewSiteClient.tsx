"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../operator.module.css";

export default function NewSiteClient({ agreement, consent }: { agreement: string; consent: string }) {
  const [siteName, setSiteName] = useState(""); const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/manage">RootLens</Link></header><main className={styles.main}>
    <h1 className={styles.title}>新しい事業所を登録</h1><p className={styles.lead}>事業所を登録する方が最初の現場監督者になります。現場合意と、ご本人の撮影参加への同意を同時に記録します。</p>
    <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); const response = await fetch("/api/operator/sites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteName, signerName, agreed }) }); const value = await response.json(); setBusy(false); if (response.status === 401) return location.assign("/login?next=/manage/new"); if (!response.ok) return setError(value.error); location.assign(`/manage/${value.siteId}`); }}>
      <div className={styles.field}><label htmlFor="siteName">店舗・事業所名</label><input id="siteName" value={siteName} onChange={(event) => setSiteName(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="signerName">氏名</label><input id="signerName" value={signerName} onChange={(event) => setSignerName(event.target.value)} /></div>
      <h2 className={styles.sectionTitle}>現場合意書</h2><div className={styles.agreement}>{agreement}</div>
      <h2 className={styles.sectionTitle}>撮影参加に関する同意書</h2><div className={styles.agreement}>{consent}</div>
      <label className={styles.check}><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>事業所を代表して現場合意書に合意し、自身の撮影参加についても同意します。</span></label>
      {error && <p className={styles.error}>{error}</p>}<button className={styles.button} disabled={busy || !agreed || !siteName.trim() || !signerName.trim()}>{busy ? "原本を保存中…" : "同意して事業所を登録"}</button>
    </form>
  </main></div>;
}
