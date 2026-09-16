"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import SiteHeader from "@/components/shared/SiteHeader";
import AgreementDocument from "@/components/operator/AgreementDocument";
import { agreementBodyForSite } from "@/lib/agreement-body";
import styles from "../operator.module.css";

const registrationKey = "rootlens-site-registration";

function registrationRequestId(siteName: string, signerName: string): string {
  const saved = sessionStorage.getItem(registrationKey);
  if (saved) {
    try {
      const entry = JSON.parse(saved);
      if (entry.siteName === siteName && entry.signerName === signerName && typeof entry.requestId === "string") {
        return entry.requestId;
      }
    } catch { /* A corrupt draft starts a new registration. */ }
  }
  const requestId = crypto.randomUUID();
  sessionStorage.setItem(registrationKey, JSON.stringify({ requestId, siteName, signerName }));
  return requestId;
}

export default function NewSiteClient({ agreement }: { agreement: string }) {
  const router = useRouter();
  const [siteName, setSiteName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [siteAgreed, setSiteAgreed] = useState(false);
  const [phase, setPhase] = useState<"editing" | "saving" | "complete">("editing");
  const [createdSiteId, setCreatedSiteId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "editing") return;
    setPhase("saving");
    setError("");
    try {
      const requestId = registrationRequestId(siteName.trim(), signerName.trim());
      const response = await fetch("/api/operator/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, siteName, signerName, agreed: siteAgreed }),
      });
      const value = await response.json();
      if (response.status === 401) {
        router.replace("/login?next=/manage/new");
        return;
      }
      if (!response.ok) {
        setError(value.error ?? "事業所を登録できませんでした。もう一度お試しください。");
        setPhase("editing");
        return;
      }
      sessionStorage.removeItem(registrationKey);
      setCreatedSiteId(value.siteId);
      setPhase("complete");
      router.replace(`/manage/${value.siteId}`);
    } catch {
      setError("通信に失敗しました。同じ内容で再度お試しください。");
      setPhase("editing");
    }
  }

  return <div className={styles.shell}><SiteHeader /><main className={styles.main}>
    <Link className={styles.backLink} href="/manage">← 事業所一覧</Link>
    <h1 className={styles.title}>新しい事業所を登録</h1>
    <p className={styles.lead}>実店舗ごとに現場合意書へ同意します。登録する方が最初の現場監督者になります。撮影に参加するスタッフの同意は、撮影開始前に別途取得します。</p>

    {createdSiteId ? <div className={styles.registrationComplete} role="status">
      <h2 className={styles.sectionTitle}>事業所を登録しました</h2>
      <p>事業所ページへ移動しています。自動で開かない場合は、下のボタンからお進みください。</p>
      <Link className={styles.button} href={`/manage/${createdSiteId}`}>事業所ページを開く</Link>
    </div> : <form onSubmit={register}>
      <div className={styles.field}><label htmlFor="siteName">店舗・事業所名</label><input id="siteName" value={siteName} disabled={phase === "saving"} onChange={(event) => { setSiteName(event.target.value); setSiteAgreed(false); }} /></div>
      <div className={styles.field}><label htmlFor="signerName">現場監督者氏名</label><input id="signerName" value={signerName} disabled={phase === "saving"} onChange={(event) => { setSignerName(event.target.value); setSiteAgreed(false); }} /></div>
      <AgreementDocument body={agreementBodyForSite(agreement, siteName.trim() || "店舗・事業所名")} />
      <label className={styles.check}><input type="checkbox" checked={siteAgreed} disabled={phase === "saving"} onChange={(event) => setSiteAgreed(event.target.checked)} /><span>事業所を代表して現場合意書の全内容に合意します。</span></label>
      {phase === "saving" && <p className={styles.registrationProgress} role="status"><LoaderCircle size={20} aria-hidden="true" />事業所と同意記録を保存しています。完了後、事業所ページへ進みます。</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.button} disabled={phase === "saving" || !siteAgreed || !siteName.trim() || !signerName.trim()}>{phase === "saving" ? "登録中…" : "同意して事業所を登録"}</button>
    </form>}
  </main></div>;
}
