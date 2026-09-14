"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../../manage/operator.module.css";

type Invite = { personName: string; siteName: string };
export default function InviteClient({ token, agreement }: { token: string; agreement: string }) {
  const [invite, setInvite] = useState<Invite | null>(null); const [agreed, setAgreed] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/operator/invites/${token}`).then(async (response) => response.ok ? setInvite(await response.json()) : setError((await response.json()).error)); }, [token]);
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/">RootLens</Link></header><main className={styles.main}>
    <h1 className={styles.title}>撮影参加への同意</h1>{invite && <p className={styles.lead}>{invite.siteName}から{invite.personName}さんへ届いた案内です。SMSでログインした本人が内容を確認し、同意してください。</p>}
    {invite && <><div className={styles.agreement}>{agreement}</div><label className={styles.check}><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>上記内容を確認し、同意します。</span></label><button className={styles.button} disabled={!agreed || busy} onClick={async () => { setBusy(true); const response = await fetch(`/api/operator/invites/${token}/accept`, { method: "POST" }); setBusy(false); if (response.status === 401) return location.assign(`/login?next=/invite/${token}`); const value = await response.json(); if (!response.ok) return setError(value.error); location.assign("/manage"); }}>{busy ? "原本を保存中…" : "同意する"}</button></>}
    {error && <p className={styles.error}>{error}</p>}
  </main></div>;
}
