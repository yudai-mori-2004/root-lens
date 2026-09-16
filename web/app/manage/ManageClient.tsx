"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Settings, Trash2 } from "lucide-react";
import SiteHeader from "@/components/shared/SiteHeader";
import type { managedSites } from "@/lib/operator-data";
import styles from "./operator.module.css";

type Site = Awaited<ReturnType<typeof managedSites>>[number];

export default function ManageClient({ sites, phoneLast4 }: { sites: Site[]; phoneLast4: string | null }) {
  const router = useRouter();
  const [settingsSiteId, setSettingsSiteId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const selectedSite = sites.find((site) => site.id === settingsSiteId);

  async function deleteSite(siteId: string) {
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/operator/sites/${siteId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        setDeleteError(result.error ?? "事業所を削除できませんでした。");
        return;
      }
      setSettingsSiteId(null);
      setConfirmDelete(false);
      router.refresh();
    } catch {
      setDeleteError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setDeleting(false);
    }
  }

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
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>事業所リスト（{sites.length}）</h2><Link className={styles.addIconButton} href="/manage/new" aria-label="新しい事業所を登録" title="新しい事業所を登録"><Plus size={20} strokeWidth={1.8} aria-hidden="true" /></Link></div>
        {sites.length === 0 ? <p className={styles.empty}>管理している事業所はありません。</p> : <div className={styles.stack}>{sites.map((site) => <div className={`${styles.card} ${styles.row}`} key={site.id}>
          <div><Link className={styles.siteNameLink} href={`/manage/${site.id}`} prefetch><strong>{site.name}</strong></Link><div className={styles.meta}>{site.personName} · {site.role === "supervisor" ? "現場監督者" : "管理者"}{site.jobTitle ? ` · ${site.jobTitle}` : ""}</div></div>
          {site.role === "supervisor" ? <button type="button" className={styles.editLink} aria-label={`${site.name}の設定`} onClick={() => { setSettingsSiteId(site.id); setConfirmDelete(false); setDeleteError(""); }}><Settings size={18} strokeWidth={1.8} aria-hidden="true" />設定</button>
            : <Link className={styles.editLink} href={`/manage/${site.id}`} prefetch><ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" />開く</Link>}
        </div>)}</div>}
      </section>
      {selectedSite && <div className={styles.profileOverlay} role="dialog" aria-modal="true" aria-labelledby="siteSettingsTitle" onKeyDown={(event) => { if (event.key === "Escape") setSettingsSiteId(null); }}>
        <div className={styles.profileDialog}>
          <div className={styles.dialogHead}><h2 id="siteSettingsTitle" className={styles.sectionTitle}>{selectedSite.name}の設定</h2><button type="button" className={styles.textButton} disabled={deleting} onClick={() => setSettingsSiteId(null)}>閉じる</button></div>
          <div className={styles.settingsList}>
            {selectedSite.siteAgreementId && <Link className={styles.settingsItem} href={`/verify/${selectedSite.siteAgreementId}`} target="_blank" rel="noopener noreferrer">現場合意の記録を確認 <ExternalLink size={18} strokeWidth={1.8} aria-hidden="true" /></Link>}
            {/* 振込先情報は実装後に表示する。 */}
            <button type="button" className={styles.settingsItem} onClick={() => setConfirmDelete(true)}><span className={styles.dangerLabel}><Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />事業所を削除</span></button>
          </div>
          {confirmDelete && <div className={styles.confirmPanel}>
            <p><strong>{selectedSite.name}を削除しますか？</strong></p>
            <p>この事業所へのアクセス、招待、撮影データの新規提出ができなくなります。保存済みデータと同意原本は証跡として保持します。この操作は取り消せません。</p>
            <div className={styles.actions}>
              <button type="button" className={styles.deleteButton} disabled={deleting} onClick={() => deleteSite(selectedSite.id)}>{deleting ? "削除中…" : "事業所を削除する"}</button>
              <button type="button" className={styles.button + " " + styles.buttonSecondary} disabled={deleting} onClick={() => setConfirmDelete(false)}>キャンセル</button>
            </div>
          </div>}
          {deleteError && <p className={styles.error} role="alert">{deleteError}</p>}
        </div>
      </div>}
    </main>
  </div>;
}
