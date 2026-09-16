"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/shared/SiteHeader";
import styles from "../operator.module.css";

type Member = { id: string; name: string; role: "staff" | "admin" | "supervisor"; identityId: string | null; inviteAcceptedAt: string | null; consentId: string | null; consentSignedAt: string | null };
type Data = { site: { id: string; name: string; role: "admin" | "supervisor" }; members: Member[] };
export default function SiteClient({ siteId }: { siteId: string }) {
  const [data, setData] = useState<Data | null>(null); const [name, setName] = useState(""); const [error, setError] = useState(""); const [inviteUrl, setInviteUrl] = useState("");
  const load = useCallback(async () => { const response = await fetch(`/api/operator/sites/${siteId}`); if (response.status === 401) return location.assign(`/login?next=/manage/${siteId}`); if (!response.ok) return setError((await response.json()).error); setData(await response.json()); }, [siteId]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect
  async function changeRole(personId: string, role: Member["role"]) { const response = await fetch(`/api/operator/sites/${siteId}/members/${personId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) }); if (!response.ok) return setError((await response.json()).error); await load(); }
  return <div className={styles.shell}><SiteHeader /><main className={styles.main}>
    <Link className={styles.backLink} href="/manage">← 事業所一覧</Link>
    <h1 className={styles.title}>{data?.site.name ?? "事業所"}</h1><p className={styles.lead}>スタッフの同意状況と、管理権限を確認できます。</p>
    <section className={styles.section}><h2 className={styles.sectionTitle}>スタッフを追加</h2><form className={styles.row} onSubmit={async (event) => { event.preventDefault(); setError(""); setInviteUrl(""); const response = await fetch(`/api/operator/sites/${siteId}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); const value = await response.json(); if (!response.ok) return setError(value.error); setInviteUrl(value.inviteUrl); setName(""); await load(); }}><div className={styles.field} style={{ flex: 1, margin: 0 }}><label htmlFor="name">氏名</label><input id="name" value={name} onChange={(event) => setName(event.target.value)} /></div><button className={styles.button} disabled={!name.trim()}>招待リンクを作成</button></form>
      {inviteUrl && <div className={styles.card} style={{ marginTop: 16 }}><p>このリンクを本人へ送ってください。</p><p className={styles.meta} style={{ overflowWrap: "anywhere" }}>{inviteUrl}</p><button className={`${styles.button} ${styles.buttonSecondary}`} onClick={async () => { await navigator.clipboard.writeText(inviteUrl); }}>リンクをコピー</button></div>}
    </section>
    <section className={styles.section}><h2 className={styles.sectionTitle}>スタッフ</h2><div className={styles.stack}>{data?.members.map((member) => <div className={`${styles.card} ${styles.row}`} key={member.id}><div><strong>{member.name}</strong><div className={styles.meta}>{member.consentId ? `同意済み · ${new Date(member.consentSignedAt!).toLocaleString("ja-JP")}` : "同意待ち"}</div>{member.consentId && <a className={styles.link} href={`/verify/${member.consentId}`} target="_blank">同意記録を確認</a>}</div><select aria-label={`${member.name}の権限`} value={member.role} onChange={(event) => changeRole(member.id, event.target.value as Member["role"])} disabled={data.site.role !== "supervisor" && member.role === "supervisor"}><option value="staff">スタッフ</option><option value="admin">管理者</option>{data.site.role === "supervisor" && <option value="supervisor">現場監督者</option>}</select></div>)}</div></section>
    {error && <p className={styles.error}>{error}</p>}
  </main></div>;
}
