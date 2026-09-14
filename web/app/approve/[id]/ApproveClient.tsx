"use client";

import { useEffect, useState } from "react";

type Details = {
  statement: string;
  unitId: string;
  files: { name: string; bytes: number; sha256: string }[];
  consentSnapshot: { siteAgreementCount: number; staffConsentCount: number; verificationUrl: string };
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
    fetch(`/api/v1/approval-signatures/${encodeURIComponent(approvalId)}/options`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: approvalToken }), cache: "no-store",
    }).then(async (response) => {
      if (response.status === 401) return location.assign(`/login?next=${encodeURIComponent(`/approve/${approvalId}#token=${approvalToken}`)}`);
      if (!response.ok) return setMessage("この承認リンクは使用できないか、有効期限が切れています。");
      setDetails(await response.json()); setMessage("");
    });
  }, [approvalId]);

  async function approve() {
    setWorking(true);
    const response = await fetch(`/api/v1/approval-signatures/${encodeURIComponent(approvalId)}/complete`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
    });
    setWorking(false);
    if (!response.ok) return setMessage("承認を記録できませんでした。もう一度お試しください。");
    setDetails(null); setMessage("承認を記録しました。この画面を閉じてRootLens Importerへ戻ってください。");
  }

  return <main style={{ maxWidth: "46rem", margin: "0 auto", padding: "clamp(2rem, 7vw, 5rem) 1.25rem", color: "#111" }}>
    <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", margin: "0 0 2rem" }}>撮影データの提供承認</h1>
    {details && <><p style={{ lineHeight: 1.8 }}>{details.statement}</p><dl style={{ margin: "2rem 0", padding: "1.25rem 0", borderTop: "1px solid #111", borderBottom: "1px solid #111" }}><dt style={{ fontWeight: 700 }}>撮影単位</dt><dd style={{ margin: ".4rem 0 1.25rem", overflowWrap: "anywhere" }}>{details.unitId}</dd><dt style={{ fontWeight: 700 }}>確認対象</dt><dd style={{ margin: ".4rem 0 1.25rem" }}>{details.files.map((file) => file.name).join(" / ")}</dd><dt style={{ fontWeight: 700 }}>適用される事前同意</dt><dd style={{ margin: ".4rem 0 0" }}>現場合意 {details.consentSnapshot.siteAgreementCount}件・スタッフ同意 {details.consentSnapshot.staffConsentCount}件 <a href={details.consentSnapshot.verificationUrl} target="_blank">記録一覧を確認</a></dd></dl><button type="button" disabled={working} onClick={approve} style={{ border: "1px solid #111", background: "#f5db74", color: "#111", padding: ".8rem 1.1rem", font: "inherit" }}>{working ? "記録中…" : "確認して提供を承認"}</button></>}
    {message && <p style={{ lineHeight: 1.8 }}>{message}</p>}
  </main>;
}
