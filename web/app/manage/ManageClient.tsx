"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Settings } from "lucide-react";
import SiteHeader from "@/components/shared/SiteHeader";
import type { managedSites } from "@/lib/operator-data";
import styles from "./operator.module.css";

type Site = Awaited<ReturnType<typeof managedSites>>[number];

export default function ManageClient({ sites, phoneLast4 }: { sites: Site[]; phoneLast4: string | null }) {
  const router = useRouter();
  const [settingsSiteId, setSettingsSiteId] = useState<string | null>(null);
  const [pendingSetting, setPendingSetting] = useState<string | null>(null);
  const selectedSite = sites.find((site) => site.id === settingsSiteId);

  return <div className={styles.shell}>
    <SiteHeader />
    <main className={styles.main}>
      <h1 className={styles.title}>事業所管理</h1>
      <section className={styles.account} aria-label="ログイン中のアカウント">
        <div className={styles.accountHeader}>
          <div><span className={styles.accountLabel}>ログイン中のアカウント</span><strong className={styles.accountName}>{phoneLast4 ? `********${phoneLast4}` : "SMSアカウント"}</strong></div>
          <button className={styles.accountLogout} onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }}>ログアウト</button>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>管理している事業所</h2><Link className={styles.addIconButton} href="/manage/new" aria-label="新しい事業所を登録" title="新しい事業所を登録"><Plus size={20} strokeWidth={1.8} aria-hidden="true" /></Link></div>
        {sites.length === 0 ? <p className={styles.empty}>管理している事業所はありません。</p> : <div className={styles.stack}>{sites.map((site) => <div className={`${styles.card} ${styles.row}`} key={site.id}>
          <div><Link className={styles.siteNameLink} href={`/manage/${site.id}`} prefetch><strong>{site.name}</strong></Link><div className={styles.meta}>{site.personName} · {site.role === "supervisor" ? "現場監督者" : "管理者"}{site.jobTitle ? ` · ${site.jobTitle}` : ""}</div></div>
          {site.role === "supervisor" ? <button type="button" className={styles.editLink} aria-label={`${site.name}の設定`} onClick={() => { setSettingsSiteId(site.id); setPendingSetting(null); }}><Settings size={18} strokeWidth={1.8} aria-hidden="true" />設定</button>
            : <Link className={styles.editLink} href={`/manage/${site.id}`} prefetch><ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" />開く</Link>}
        </div>)}</div>}
      </section>
      {selectedSite && <div className={styles.profileOverlay} role="dialog" aria-modal="true" aria-labelledby="siteSettingsTitle" onKeyDown={(event) => { if (event.key === "Escape") setSettingsSiteId(null); }}>
        <div className={styles.profileDialog}>
          <div className={styles.dialogHead}><h2 id="siteSettingsTitle" className={styles.sectionTitle}>{selectedSite.name}の設定</h2><button type="button" className={styles.textButton} onClick={() => setSettingsSiteId(null)}>閉じる</button></div>
          <div className={styles.settingsList}>
            {selectedSite.siteAgreementId && <Link className={styles.settingsItem} href={`/verify/${selectedSite.siteAgreementId}`} target="_blank" rel="noopener noreferrer">現場合意の記録を確認 <ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" /></Link>}
            <button type="button" className={styles.settingsItem} onClick={() => setPendingSetting("振込先情報は準備中です。")}>振込先情報 <span>準備中</span></button>
            <button type="button" className={styles.settingsItem} onClick={() => setPendingSetting("事業所の削除は準備中です。")}>事業所を削除 <span>準備中</span></button>
          </div>
          {pendingSetting && <p className={styles.meta} role="status">{pendingSetting}</p>}
        </div>
      </div>}
    </main>
  </div>;
}
