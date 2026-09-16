"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import styles from "../operator.module.css";

type Member = { id: string; name: string; jobTitle: string | null; consentId: string | null; consentSignedAt: string | null };
type Data = { site: { name: string }; members: Member[] };

export default function SiteClient({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/operator/sites/${siteId}`);
    if (response.status === 401) return router.replace(`/login?next=/manage/${siteId}`);
    if (!response.ok) return setError((await response.json()).error);
    setData(await response.json());
  }, [router, siteId]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return <div className={styles.shell}><SiteHeader /><main className={styles.main}>
    <Link className={styles.backLink} href="/manage">← 事業所一覧</Link>
    <h1 className={styles.title}>{data?.site.name ?? "事業所"}</h1>
    <p className={styles.lead}>スタッフと撮影参加への同意を管理します。</p>
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>スタッフを追加</h2>
      <form className={`${styles.row} ${styles.inviteForm}`} onSubmit={async (event) => {
        event.preventDefault(); setError(""); setInviteUrl("");
        const response = await fetch(`/api/operator/sites/${siteId}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
        const value = await response.json();
        if (!response.ok) return setError(value.error);
        setInviteUrl(value.inviteUrl); setName(""); await load();
      }}>
        <div className={styles.field} style={{ flex: 1, margin: 0 }}><label htmlFor="name">氏名</label><input id="name" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <button className={styles.button} disabled={!name.trim()}>招待リンクを作成</button>
      </form>
      {inviteUrl && <div className={styles.card} style={{ marginTop: 16 }}><p>このリンクを本人へ送ってください。</p><p className={styles.meta} style={{ overflowWrap: "anywhere" }}>{inviteUrl}</p><button className={`${styles.button} ${styles.buttonSecondary}`} onClick={async () => { await navigator.clipboard.writeText(inviteUrl); }}>リンクをコピー</button></div>}
    </section>
    <section className={styles.section}><h2 className={styles.sectionTitle}>スタッフ</h2>
      <div className={styles.stack}>{data?.members.map((member) => <div className={`${styles.card} ${styles.row}`} key={member.id}>
        <div><strong>{member.name}</strong>{member.jobTitle && <span className={styles.memberTitle}> · {member.jobTitle}</span>}
          <div className={styles.meta}>{member.consentId ? `同意済み · ${new Date(member.consentSignedAt!).toLocaleString("ja-JP")}` : "同意待ち"}</div>
        </div>
        <Link className={styles.editLink} href={`/manage/${siteId}/members/${member.id}`} aria-label={`${member.name}のプロフィールを編集`}><Image src="/pencil.svg" alt="" width={18} height={18} />編集</Link>
      </div>)}</div>
    </section>
    {error && <p className={styles.error}>{error}</p>}
  </main></div>;
}
