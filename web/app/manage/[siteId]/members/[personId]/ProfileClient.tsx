"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import styles from "../../../operator.module.css";

type Role = "staff" | "admin" | "supervisor";
type Member = { id: string; name: string; jobTitle: string | null; note: string | null; role: Role; identityId: string | null; consentId: string | null; consentSignedAt: string | null; phoneLast4: string | null; createdAt: string };
type Data = { site: { name: string; role: "admin" | "supervisor"; personId: string }; members: Member[] };

export default function ProfileClient({ siteId, personId }: { siteId: string; personId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [note, setNote] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/operator/sites/${siteId}`).then(async (response) => {
      if (response.status === 401) return router.replace(`/login?next=/manage/${siteId}/members/${personId}`);
      if (!response.ok) return setError((await response.json()).error);
      const value: Data = await response.json();
      const member = value.members.find((item) => item.id === personId);
      if (!member) return setError("スタッフが見つかりません。");
      setData(value); setName(member.name); setJobTitle(member.jobTitle ?? ""); setNote(member.note ?? ""); setRole(member.role);
    }).catch(() => setError("プロフィールを読み込めませんでした。"));
  }, [router, siteId, personId]);
  const member = data?.members.find((item) => item.id === personId);
  const lastSupervisor = member?.role === "supervisor" && data?.members.filter((item) => item.role === "supervisor" && item.identityId).length === 1;
  const canChangeSupervisor = data?.site.role === "supervisor";
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/operator/sites/${siteId}/members/${personId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, jobTitle, note, role }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "保存できませんでした。");
      router.push(data?.site.personId === personId && role === "staff" ? "/manage" : `/manage/${siteId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/operator/sites/${siteId}/members/${personId}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "削除できませんでした。");
      router.push(data?.site.personId === personId ? "/manage" : `/manage/${siteId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "削除できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div className={styles.shell}><SiteHeader /><main className={`${styles.main} ${styles.narrow}`}>
    <Link className={styles.backLink} href={`/manage/${siteId}`}>← {data?.site.name ?? "事業所"}</Link>
    <h1 className={styles.title}>スタッフのプロフィール</h1>
    {member && <>
      <form onSubmit={save}>
        <div className={styles.field}><label htmlFor="memberName">氏名</label><input id="memberName" value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="jobTitle">担当・役職</label><input id="jobTitle" value={jobTitle} maxLength={100} onChange={(event) => setJobTitle(event.target.value)} placeholder="例：調理担当" /></div>
        <div className={styles.field}><label htmlFor="role">権限</label><select id="role" value={role} disabled={Boolean(lastSupervisor) || (member.role === "supervisor" && !canChangeSupervisor)} onChange={(event) => setRole(event.target.value as Role)}><option value="staff">スタッフ</option><option value="admin">管理者</option><option value="supervisor" disabled={!canChangeSupervisor}>現場監督者</option></select>{lastSupervisor && <span className={styles.roleHint}>最後の現場監督者は変更できません</span>}</div>
        <div className={styles.field}><label htmlFor="memberNote">現場用メモ</label><textarea id="memberNote" value={note} maxLength={1000} rows={4} onChange={(event) => setNote(event.target.value)} placeholder="担当業務などを記録できます" /></div>
        <button className={styles.button} disabled={busy || !name.trim()}>{busy ? "保存中…" : "変更を保存"}</button>
      </form>
      <section className={styles.profileRecord}>
        <h2 className={styles.sectionTitle}>登録と同意</h2>
        <dl className={styles.details}>
          <dt>登録日</dt><dd>{new Date(member.createdAt).toLocaleDateString("ja-JP")}</dd>
          <dt>SMSアカウント</dt><dd>{member.identityId ? (member.phoneLast4 ? `登録済み · 末尾 ${member.phoneLast4}` : "登録済み") : "招待待ち"}</dd>
          <dt>撮影参加への同意</dt><dd>{member.consentId ? <>{new Date(member.consentSignedAt!).toLocaleString("ja-JP")}<br /><a className={styles.link} href={`/verify/${member.consentId}`} target="_blank">同意記録を確認</a></> : "未同意"}</dd>
        </dl>
        <p className={styles.meta}>氏名の変更は、成立済みの同意記録には反映されません。</p>
      </section>
      <section className={styles.deleteSection}>
        <button type="button" className={styles.deleteButton} disabled={busy || Boolean(lastSupervisor)} onClick={() => setConfirmDelete(true)}><Image src="/trash.svg" alt="" width={18} height={18} />スタッフを削除</button>
        {confirmDelete && <div className={styles.confirmPanel} role="alertdialog" aria-labelledby="deleteTitle" aria-describedby="deleteDescription">
          <h2 id="deleteTitle" className={styles.sectionTitle}>このスタッフを削除しますか？</h2>
          <p id="deleteDescription">{member.name}さんの事業所へのアクセスと未使用の招待リンクを無効にします。過去の同意記録は保存されます。</p>
          <div className={styles.actions}><button type="button" className={styles.deleteButton} disabled={busy} onClick={remove}>削除する</button><button type="button" className={`${styles.button} ${styles.buttonSecondary}`} disabled={busy} onClick={() => setConfirmDelete(false)}>キャンセル</button></div>
        </div>}
      </section>
    </>}
    {error && <p className={styles.error}>{error}</p>}
  </main></div>;
}
