"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./operator.module.css";

type Site = { id: string; name: string; role: string };
export default function ManageClient() {
  const [sites, setSites] = useState<Site[] | null>(null);
  useEffect(() => { fetch("/api/operator/sites").then(async (response) => {
    if (response.status === 401) return location.assign("/login?next=/manage");
    setSites((await response.json()).sites ?? []);
  }); }, []);
  return <div className={styles.shell}>
    <header className={styles.header}><Link className={styles.brand} href="/">RootLens</Link><button className={`${styles.button} ${styles.buttonSecondary}`} onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.assign("/"); }}>ログアウト</button></header>
    <main className={styles.main}>
      <div className={styles.row}><div><h1 className={styles.title}>管理している事業所</h1><p className={styles.lead}>撮影に参加する事業所とスタッフを管理します。</p></div><Link className={styles.button} href="/manage/new">新しい事業所を登録</Link></div>
      <section className={styles.section}><div className={styles.stack}>
        {sites === null ? <p>読み込み中…</p> : sites.length === 0 ? <p>管理している事業所はありません。</p> : sites.map((site) => <a className={styles.card} href={`/manage/${site.id}`} key={site.id}><strong>{site.name}</strong><div className={styles.meta}>{site.role === "supervisor" ? "現場監督者" : "管理者"}</div></a>)}
      </div></section>
    </main>
  </div>;
}
