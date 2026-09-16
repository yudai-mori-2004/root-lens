"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/shared/SiteHeader";
import AgreementDocument from "@/components/operator/AgreementDocument";
import styles from "../../manage/operator.module.css";

type Invite = { personName: string; siteName: string };
export default function InviteClient({ token, agreement }: { token: string; agreement: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/operator/invites/${token}`).then(async (response) => response.ok ? setInvite(await response.json()) : setError((await response.json()).error));
    fetch("/api/operator/me").then((response) => setAuthenticated(response.ok));
  }, [token]);
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/operator/invites/${token}/accept`, { method: "POST" });
      if (response.status === 401) return location.assign(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
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
        <label className={styles.check}><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>本文書の全内容を確認し、同意します。</span></label>
        <button className={styles.button} disabled={!agreed || busy} onClick={accept}>{busy ? "同意を記録中…" : "同意する"}</button>
      </> : authenticated === false && <a className={styles.button} href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>SMSでログインして同意する</a>}
    </>}
    {error && <p className={styles.error}>{error}</p>}
  </main></div>;
}
