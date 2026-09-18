"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import type { ManagedSiteData } from "@/lib/operator-data";
import styles from "../../../operator.module.css";

type Role = "staff" | "admin" | "supervisor";
type Draft = { jobTitle: string; note: string; role: Role };

export default function ProfileClient({ siteId, personId, initialData, embedded = false, onClose, onChanged, onRemoved }: {
  siteId: string; personId: string; initialData: ManagedSiteData; embedded?: boolean;
  onClose?: () => void; onChanged?: (member: ManagedSiteData["members"][number]) => void; onRemoved?: () => void;
}) {
  const router = useRouter();
  const data = initialData;
  const initialMember = data.members.find((item) => item.id === personId)!;
  const [jobTitle, setJobTitle] = useState(initialMember.jobTitle ?? "");
  const [note, setNote] = useState(initialMember.note ?? "");
  const [role, setRole] = useState<Role>(initialMember.role as Role);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const draft = useRef<Draft>({ jobTitle: initialMember.jobTitle ?? "", note: initialMember.note ?? "", role: initialMember.role as Role });
  const saved = useRef(JSON.stringify(draft.current));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean>>(Promise.resolve(true));
  const member = initialMember;
  async function persist(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const snapshot = { ...draft.current };
    const serialized = JSON.stringify(snapshot);
    const previous = inFlight.current;
    const request = previous.then(async () => {
      if (saved.current === serialized) return true;
      setSaveState("saving"); setError("");
      try {
        const response = await fetch(`/api/operator/sites/${siteId}/members/${personId}`, {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        if (response.status === 401) { router.push(`/login?next=/manage/${siteId}`); return false; }
        if (!response.ok) throw new Error((await response.json()).error ?? "保存できませんでした。");
        saved.current = serialized;
        onChanged?.({ ...member, jobTitle: snapshot.jobTitle || null, note: snapshot.note || null, role: snapshot.role });
        if (!embedded && data.site.personId === personId && snapshot.role === "staff") router.replace("/manage");
        if (JSON.stringify(draft.current) === serialized) setSaveState("saved");
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "保存できませんでした。");
        setSaveState("error");
        return false;
      }
    });
    inFlight.current = request;
    return request;
  }
  function updateDraft(next: Draft, immediate = false) {
    draft.current = next;
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = immediate ? null : setTimeout(() => { void persist(); }, 450);
    if (immediate) void persist();
  }
  async function close() {
    if (busy) return;
    if (await persist()) onClose?.();
  }
  useEffect(() => {
    if (!embedded) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") void close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const lastSupervisor = member.role === "supervisor" && data.members.filter((item) => item.role === "supervisor" && item.identityId).length === 1;
  const canChangeSupervisor = data.site.role === "supervisor";
  async function remove() {
    setBusy(true); setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await inFlight.current;
    try {
      const response = await fetch(`/api/operator/sites/${siteId}/members/${personId}`, { method: "DELETE" });
      if (response.status === 401) return router.push(`/login?next=/manage/${siteId}`);
      if (!response.ok) throw new Error((await response.json()).error ?? "削除できませんでした。");
      if (embedded) onRemoved?.();
      else router.push(data.site.personId === personId ? "/manage" : `/manage/${siteId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "削除できませんでした。"); }
    finally { setBusy(false); }
  }
  const content = <>
    {embedded ? <button type="button" className={styles.backLink} onClick={() => { void close(); }}>← スタッフ一覧に戻る</button>
      : <Link className={styles.backLink} href={`/manage/${siteId}`} onClick={(event) => { if (saveState !== "saved") { event.preventDefault(); void persist().then((ok) => { if (ok) router.push(`/manage/${siteId}`); }); } }}>← {data.site.name}</Link>}
    <h1 className={styles.title}>{member.name}</h1>
    <>
      <div className={styles.profileForm}>
        <div className={styles.profileFormGrid}>
        <div className={styles.field}><label htmlFor="jobTitle">担当・役職</label><input id="jobTitle" value={jobTitle} maxLength={100} onChange={(event) => { const value = event.target.value; setJobTitle(value); updateDraft({ ...draft.current, jobTitle: value }); }} onBlur={() => { if (saveState !== "saved") void persist(); }} placeholder="例：調理担当" /></div>
        <div className={styles.field}><label htmlFor="role">権限</label><select id="role" value={role} disabled={Boolean(lastSupervisor) || (member.role === "supervisor" && !canChangeSupervisor)} onChange={(event) => { const value = event.target.value as Role; setRole(value); updateDraft({ ...draft.current, role: value }, true); }}><option value="staff">スタッフ</option><option value="admin">管理者</option><option value="supervisor" disabled={!canChangeSupervisor}>現場監督者</option></select>{lastSupervisor && <span className={styles.roleHint}>最後の現場監督者は変更できません</span>}</div>
        </div>
        <div className={styles.field}><label htmlFor="memberNote">現場用メモ</label><textarea id="memberNote" value={note} maxLength={1000} rows={2} onChange={(event) => { const value = event.target.value; setNote(value); updateDraft({ ...draft.current, note: value }); }} onBlur={() => { if (saveState !== "saved") void persist(); }} placeholder="担当業務などを記録できます" /></div>
        <p className={styles.saveStatus} role="status">{saveState === "saved" ? "保存済み" : saveState === "saving" ? "保存中…" : saveState === "error" ? "保存できませんでした。閉じると再試行します。" : "変更を保存します…"}</p>
      </div>
      <section className={styles.profileRecord}>
        <h2 className={styles.sectionTitle}>登録と同意</h2>
        <dl className={styles.details}>
          <dt>登録日</dt><dd>{new Date(member.createdAt).toLocaleDateString("ja-JP")}</dd>
          <dt>SMSアカウント</dt><dd>{member.identityId ? (member.phoneLast4 ? `登録済み · 末尾 ${member.phoneLast4}` : "登録済み") : "招待待ち"}</dd>
          <dt>撮影参加への同意</dt><dd>{member.consentId ? <>{new Date(member.consentSignedAt!).toLocaleString("ja-JP")}<br /><a className={styles.link} href={`/verify/${member.consentId}`} target="_blank">同意記録を確認</a></> : "未同意"}</dd>
        </dl>
      </section>
      <section className={styles.deleteSection}>
        <button type="button" className={styles.deleteButton} disabled={busy || Boolean(lastSupervisor)} onClick={() => setConfirmDelete(true)}><Image src="/trash.svg" alt="" width={18} height={18} />スタッフを削除</button>
        {confirmDelete && <div className={styles.confirmPanel} role="alertdialog" aria-labelledby="deleteTitle" aria-describedby="deleteDescription">
          <h2 id="deleteTitle" className={styles.sectionTitle}>このスタッフを削除しますか？</h2>
          <p id="deleteDescription">{member.name}さんの事業所へのアクセスと未使用の招待リンクを無効にします。過去の同意記録は保存されます。</p>
          <div className={styles.actions}><button type="button" className={styles.deleteButton} disabled={busy} onClick={remove}>削除する</button><button type="button" className={`${styles.button} ${styles.buttonSecondary}`} disabled={busy} onClick={() => setConfirmDelete(false)}>キャンセル</button></div>
        </div>}
      </section>
    </>
    {error && <p className={styles.error}>{error}</p>}
  </>;
  return embedded ? <div className={styles.profileOverlay} role="dialog" aria-modal="true" aria-label={`${member.name}のプロフィール`}>
    <div className={styles.profileDialog}>{content}</div>
  </div> : <div className={styles.shell}><SiteHeader /><main className={`${styles.main} ${styles.narrow}`}>{content}</main></div>;
}
