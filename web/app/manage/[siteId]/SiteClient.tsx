"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import type { ManagedSiteData } from "@/lib/operator-data";
import ProfileClient from "./members/[personId]/ProfileClient";
import styles from "../operator.module.css";

export default function SiteClient({ siteId, initialData }: { siteId: string; initialData: ManagedSiteData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  return <div className={styles.shell}><SiteHeader /><main className={styles.main}>
    <Link className={styles.backLink} href="/manage">← 事業所一覧</Link>
    <h1 className={styles.title}>{data.site.name}</h1>
    <p className={styles.lead}>スタッフと撮影参加への同意を管理します。</p>
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>スタッフを追加</h2>
      <form className={`${styles.row} ${styles.inviteForm}`} onSubmit={async (event) => {
        event.preventDefault(); setError(""); setInviteUrl(""); setAdding(true);
        try {
          const response = await fetch(`/api/operator/sites/${siteId}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
          const value = await response.json();
          if (response.status === 401) return router.push(`/login?next=/manage/${siteId}`);
          if (!response.ok) return setError(value.error);
          setData((current) => ({ ...current, members: [{
            id: value.personId, name, jobTitle: null, note: null, createdAt: new Date().toISOString(),
            role: "staff", identityId: null, consentId: null, consentSignedAt: null, phoneLast4: null,
          }, ...current.members] }));
          setInviteUrl(value.inviteUrl); setName("");
        } catch { setError("スタッフを追加できませんでした。もう一度お試しください。"); }
        finally { setAdding(false); }
      }}>
        <div className={styles.field} style={{ flex: 1, margin: 0 }}><label htmlFor="name">氏名</label><input id="name" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <button className={styles.button} disabled={!name.trim() || adding}>{adding ? "追加中…" : "招待リンクを作成"}</button>
      </form>
      {inviteUrl && <div className={styles.card} style={{ marginTop: 16 }}><p>このリンクを本人へ送ってください。</p><p className={styles.meta} style={{ overflowWrap: "anywhere" }}>{inviteUrl}</p><button className={`${styles.button} ${styles.buttonSecondary}`} onClick={async () => { await navigator.clipboard.writeText(inviteUrl); }}>リンクをコピー</button></div>}
    </section>
    <section className={styles.section}><h2 className={styles.sectionTitle}>スタッフ</h2>
      <div className={styles.stack}>{data.members.map((member) => <div className={`${styles.card} ${styles.row}`} key={member.id}>
        <div><strong>{member.name}</strong>{member.jobTitle && <span className={styles.memberTitle}> · {member.jobTitle}</span>}
          <div className={styles.meta}>{member.consentId ? `同意済み · ${new Date(member.consentSignedAt!).toLocaleString("ja-JP")}` : "同意待ち"}</div>
        </div>
        <button type="button" className={styles.editLink} onClick={() => setEditingId(member.id)} aria-label={`${member.name}のプロフィールを編集`}><Image src="/pencil.svg" alt="" width={18} height={18} />編集</button>
      </div>)}</div>
    </section>
    {error && <p className={styles.error}>{error}</p>}
    {editingId && <ProfileClient key={editingId} siteId={siteId} personId={editingId} initialData={data} embedded
      onClose={() => setEditingId(null)}
      onChanged={(changed) => {
        if (changed.id === data.site.personId && changed.role === "staff") return router.push("/manage");
        setData((current) => ({ ...current,
          site: changed.id === current.site.personId ? { ...current.site, role: changed.role as "admin" | "supervisor" } : current.site,
          members: current.members.map((member) => member.id === changed.id ? changed : member),
        }));
        setEditingId(null);
      }}
      onRemoved={() => {
        if (editingId === data.site.personId) return router.push("/manage");
        setData((current) => ({ ...current, members: current.members.filter((member) => member.id !== editingId) }));
        setEditingId(null);
      }} />}
  </main></div>;
}
