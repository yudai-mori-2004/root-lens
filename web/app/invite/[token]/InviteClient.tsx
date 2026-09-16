"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import AgreementDocument from "@/components/operator/AgreementDocument";
import styles from "../../manage/operator.module.css";

type Invite = { personName: string; siteName: string };
export default function InviteClient({ token, agreement, confirmations }: { token: string; agreement: string; confirmations: string[] }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<boolean[]>(() => confirmations.map(() => false));
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/operator/invites/${token}`).then(async (response) => {
      const value = await response.json();
      if (!response.ok) setError(value.error);
      else if (value.accepted) setComplete(true);
      else setInvite(value);
    });
    fetch("/api/operator/me").then((response) => setAuthenticated(response.ok));
  }, [token]);
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/operator/invites/${token}/accept`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmations: checked }),
      });
      if (response.status === 401) return router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      const value = await response.json();
      if (!response.ok) { setError(value.error); return; }
      setComplete(true);
    } catch {
      setError("同意を保存できませんでした。再度お試しください。");
    } finally { setBusy(false); }
  }
  return <div className={styles.shell}><SiteHeader /><main className={`${styles.main} ${styles.narrow}`}>
    <h1 className={styles.title}>撮影参加への同意</h1>
    {complete ? <p className={styles.success}>同意を記録しました。これで手続きは完了です。</p> : invite && <>
      <p className={styles.lead}>{invite.siteName}から{invite.personName}さんへ届いた案内です。ご本人が以下の内容を確認してください。</p>
      <AgreementDocument body={agreement} />
      {authenticated === true ? <>
        <fieldset className={styles.consentChecklist}>
          <legend>第4条（同意の確認）</legend>
          {confirmations.map((statement, index) => <label className={styles.check} key={index}>
            <input type="checkbox" checked={checked[index]} onChange={(event) => setChecked((current) => current.map((value, item) => item === index ? event.target.checked : value))} />
            <span>{index + 1}　{statement}</span>
          </label>)}
        </fieldset>
        <button className={styles.button} disabled={!checked.every(Boolean) || busy} onClick={accept}>{busy ? "同意を記録中…" : "同意する"}</button>
      </> : authenticated === false && <a className={styles.button} href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>SMSでログインして同意する</a>}
    </>}
    {error && <p className={styles.error}>{error}</p>}
  </main></div>;
}
