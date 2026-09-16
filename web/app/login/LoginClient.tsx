"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/shared/SiteHeader";
import styles from "../manage/operator.module.css";

export default function LoginClient() {
  const search = useSearchParams();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = search.get("next")?.startsWith("/") ? search.get("next")! : "/manage";
  const normalizedPhone = phone.replace(/[\s-]/g, "");
  const internationalPhone = /^0[789]0\d{8}$/.test(normalizedPhone) ? `+81${normalizedPhone.slice(1)}` : "";
  async function submit(path: string, body: object) {
    setBusy(true); setError("");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json();
    setBusy(false);
    if (!response.ok) { setError(value.error ?? "処理できませんでした。"); return false; }
    return true;
  }
  return <div className={styles.shell}>
    <SiteHeader />
    <main className={`${styles.main} ${styles.narrow}`}>
      <h1 className={styles.title}>SMSでログイン</h1>
      <p className={styles.lead}>携帯電話に届く6桁の確認コードを使います。</p>
      {!sent ? <form onSubmit={async (event) => { event.preventDefault(); if (await submit("/api/auth/sms/start", { phone: internationalPhone })) setSent(true); }}>
        <div className={styles.field}><label htmlFor="phone">電話番号</label><input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09012345678" /></div>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} disabled={busy || !internationalPhone}>{busy ? "送信中…" : "確認コードを送る"}</button>
      </form> : <form onSubmit={async (event) => { event.preventDefault(); if (await submit("/api/auth/sms/verify", { phone: internationalPhone, code })) location.assign(next); }}>
        <div className={styles.field}><label htmlFor="code">確認コード</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}><button className={styles.button} disabled={busy || code.length !== 6}>{busy ? "確認中…" : "ログイン"}</button><button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => { setSent(false); setCode(""); setError(""); }}>番号を変更</button></div>
      </form>}
    </main>
  </div>;
}
