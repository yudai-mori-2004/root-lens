"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/shared/SiteHeader";
import styles from "@/app/manage/operator.module.css";

type Details = {
  statement: string;
  siteName: string;
  unitId: string;
  files: { path: string; bytes: number; sha256: string }[];
  consentSnapshot: { siteAgreementCount: number; staffConsentCount: number };
};

export default function ApproveClient({ approvalId }: { approvalId: string }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("承認内容を読み込んでいます…");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const approvalToken = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(null, "", `/approve/${encodeURIComponent(approvalId)}`);
    queueMicrotask(() => setToken(approvalToken));
    fetch(`/api/v1/approval-requests/${encodeURIComponent(approvalId)}/options`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: approvalToken }), cache: "no-store",
    }).then(async (response) => {
      if (response.status === 401) return location.assign(`/login?next=${encodeURIComponent(`/approve/${approvalId}#token=${approvalToken}`)}`);
      if (!response.ok) return setMessage("この承認リンクは使用できないか、有効期限が切れています。");
      setDetails(await response.json()); setMessage("");
    });
  }, [approvalId]);

  async function approve() {
    setWorking(true);
    const response = await fetch(`/api/v1/approval-requests/${encodeURIComponent(approvalId)}/complete`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
    });
    setWorking(false);
    if (!response.ok) return setMessage("承認を記録できませんでした。もう一度お試しください。");
    setDetails(null); setMessage("承認を記録しました。この画面を閉じてRootLens Importerへ戻ってください。");
  }

  return <div className={styles.shell}><SiteHeader /><main className={styles.main}>
    <h1 className={styles.title}>撮影データの提供承認</h1>
    {details && <><p className={styles.lead}>{details.statement}</p><dl className={styles.details}><dt>事業所（保存先）</dt><dd>{details.siteName}</dd><dt>撮影単位</dt><dd>{details.unitId}</dd><dt>確認対象</dt><dd>{details.files.map((file) => file.path).join(" / ")}</dd><dt>適用される事前同意</dt><dd>現場合意 {details.consentSnapshot.siteAgreementCount}件・スタッフ同意 {details.consentSnapshot.staffConsentCount}件</dd></dl><button type="button" className={styles.button} disabled={working} onClick={approve}>{working ? "記録中…" : "確認して提供を承認"}</button></>}
    {message && <p className={styles.lead}>{message}</p>}
  </main></div>;
}
