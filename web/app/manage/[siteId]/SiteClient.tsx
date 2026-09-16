"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  return <div className={styles.shell}><SiteHeader /><main className={styles.main}>
    <Link className={styles.backLink} href="/manage">← 事業所一覧</Link>
    <h1 className={styles.title}>{data.site.name}</h1>
    <p className={styles.lead}>各スタッフの撮影参加への同意管理を行うページです。</p>
    <section className={styles.section}>
      <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>スタッフ</h2><button type="button" className={styles.addIconButton} aria-label="スタッフを追加" title="スタッフを追加" onClick={() => { setError(""); setInviteUrl(""); setShowAdd(true); }}><Plus size={20} strokeWidth={1.8} aria-hidden="true" /></button></div>
      <div className={styles.stack}>{data.members.map((member) => <div className={`${styles.card} ${styles.row} ${styles.memberCard} ${member.consentId ? styles.memberConsented : styles.memberPending}`} key={member.id}>
        <div className={styles.memberSummary}>
          <div className={styles.memberHeading}><strong>{member.name}</strong><span className={styles.memberRole}>{member.role === "supervisor" ? "現場監督者" : member.role === "admin" ? "管理者" : "スタッフ"}</span><span className={styles.memberConsent}>{member.consentId ? "同意済み" : "同意待ち"}</span></div>
          <div className={styles.memberDetails} title={[member.jobTitle, member.note].filter(Boolean).join(" · ")}>{[member.jobTitle, member.note].filter(Boolean).join(" · ") || "担当・メモ未設定"}</div>
        </div>
        <button type="button" className={styles.editLink} onClick={() => setEditingId(member.id)} aria-label={`${member.name}のプロフィールを編集`}><Image src="/pencil.svg" alt="" width={18} height={18} />編集</button>
      </div>)}</div>
    </section>
    {showAdd && <div className={styles.profileOverlay} role="dialog" aria-modal="true" aria-labelledby="addStaffTitle" onKeyDown={(event) => { if (event.key === "Escape" && !adding) { setShowAdd(false); setName(""); setInviteUrl(""); } }}>
      <div className={styles.profileDialog}>
      <div className={styles.dialogHead}><h2 id="addStaffTitle" className={styles.sectionTitle}>スタッフを追加</h2><button type="button" className={styles.textButton} disabled={adding} onClick={() => { setShowAdd(false); setName(""); setInviteUrl(""); }}>閉じる</button></div>
      {!inviteUrl ? <form className={styles.addForm} onSubmit={async (event) => {
        event.preventDefault(); setError(""); setInviteUrl(""); setAdding(true);
        const submittedName = name.trim();
        try {
          const response = await fetch(`/api/operator/sites/${siteId}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: submittedName }) });
          const value = await response.json();
          if (response.status === 401) return router.push(`/login?next=/manage/${siteId}`);
          if (!response.ok) return setError(value.error);
          setData((current) => ({ ...current, members: [{
            id: value.personId, name: submittedName, jobTitle: null, note: null, createdAt: new Date().toISOString(),
            role: "staff", identityId: null, consentId: null, consentSignedAt: null, phoneLast4: null,
          }, ...current.members] }));
          setInviteUrl(value.inviteUrl); setName("");
        } catch { setError("スタッフを追加できませんでした。もう一度お試しください。"); }
        finally { setAdding(false); }
      }}>
        <div className={styles.field}><label htmlFor="name">氏名</label><input id="name" value={name} autoFocus onChange={(event) => setName(event.target.value)} /></div>
        <button className={styles.button} disabled={!name.trim() || adding}>{adding ? "追加中…" : "招待リンクを作成"}</button>
      </form> : <div><p>このリンクを本人へ送ってください。</p><p className={styles.inviteUrl}>{inviteUrl}</p><button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={async () => { await navigator.clipboard.writeText(inviteUrl); }}>リンクをコピー</button></div>}
      {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>}
    {!showAdd && error && <p className={styles.error}>{error}</p>}
    {editingId && <ProfileClient key={editingId} siteId={siteId} personId={editingId} initialData={data} embedded
      onClose={() => setEditingId(null)}
      onChanged={(changed) => {
        if (changed.id === data.site.personId && changed.role === "staff") return router.push("/manage");
        setData((current) => ({ ...current,
          site: changed.id === current.site.personId ? { ...current.site, role: changed.role as "admin" | "supervisor" } : current.site,
          members: current.members.map((member) => member.id === changed.id ? changed : member),
        }));
      }}
      onRemoved={() => {
        if (editingId === data.site.personId) return router.push("/manage");
        setData((current) => ({ ...current, members: current.members.filter((member) => member.id !== editingId) }));
        setEditingId(null);
      }} />}
  </main></div>;
}
