"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import styles from "../../manage/operator.module.css";

export default function DesktopAuthorizeClient() {
  const search = useSearchParams(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const requestId = search.get("request") ?? ""; const state = search.get("state") ?? "";
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/">RootLens</Link></header><main className={`${styles.main} ${styles.narrow}`}><h1 className={styles.title}>RootLens Importerへログイン</h1><p className={styles.lead}>このアカウントが管理する事業所をRootLens Importerで利用できるようにします。</p><button className={styles.button} disabled={busy || !requestId || !state} onClick={async () => { setBusy(true); const response = await fetch("/api/v1/desktop-auth/authorize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, state }) }); const value = await response.json(); setBusy(false); if (response.status === 401) return location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); if (!response.ok) return setError(value.error); location.assign(value.redirectUrl); }}>{busy ? "接続中…" : "Importerへの接続を許可"}</button>{error && <p className={styles.error}>{error}</p>}</main></div>;
}
