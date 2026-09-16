"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import styles from "./operator.module.css";

type Site = { id: string; name: string; role: string };
export default function ManageClient({ sites, phoneLast4 }: { sites: Site[]; phoneLast4: string | null }) {
  const router = useRouter();
  return <div className={styles.shell}>
    <SiteHeader />
    <main className={styles.main}>
      <div className={styles.pageHead}><div><h1 className={styles.title}>事業所管理</h1><p className={styles.lead}>撮影に参加する事業所とスタッフを管理します。</p></div><Link className={styles.button} href="/manage/new">新しい事業所を登録</Link></div>
      <section className={styles.account} aria-label="ログイン中のアカウント">
        <div><span className={styles.accountLabel}>ログイン中のアカウント</span><strong className={styles.accountName}>{phoneLast4 ? `SMS認証 · 電話番号末尾 ${phoneLast4}` : "SMS認証済み"}</strong></div>
        <button className={styles.accountLogout} onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }}>ログアウト</button>
      </section>
      <section className={styles.section}><h2 className={styles.sectionTitle}>管理している事業所</h2><div className={styles.stack}>
        {sites.length === 0 ? <p className={styles.empty}>管理している事業所はありません。</p> : sites.map((site) => <Link className={styles.siteRow} href={`/manage/${site.id}`} prefetch key={site.id}><strong>{site.name}</strong><span className={styles.meta}>{site.role === "supervisor" ? "現場監督者" : "管理者"}</span><span aria-hidden="true">→</span></Link>)}
      </div></section>
    </main>
  </div>;
}
