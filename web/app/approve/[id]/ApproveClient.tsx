"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

type CommonOptions = {
  statement: string;
  unitId: string;
  files: { name: string; bytes: number; sha256: string }[];
  consentSnapshot: {
    id: string;
    siteAgreementCount: number;
    staffConsentCount: number;
    verificationUrl: string;
  };
};

type Options = CommonOptions & ({
  mode: "register";
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
  registrationId: string;
  registrationToken: string;
} | {
  mode: "authenticate";
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
});

export default function ApproveClient({ approvalId }: { approvalId: string }) {
  const [details, setDetails] = useState<Options | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("承認内容を読み込んでいます…");
  const [working, setWorking] = useState(false);

  async function load(approvalToken: string) {
    const response = await fetch(`/api/v1/approval-signatures/${encodeURIComponent(approvalId)}/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: approvalToken }),
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) {
      setDetails(null);
      setMessage(response.status === 401
        ? "ブラウザのログインを確認できません。Desktopの設定から、もう一度Googleでログインしてください。"
        : "この承認リンクは使用できないか、有効期限が切れています。");
      return;
    }
    setDetails(value as Options);
    setMessage("");
  }

  useEffect(() => {
    const approvalToken = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(null, "", `/approve/${encodeURIComponent(approvalId)}`);
    queueMicrotask(() => {
      setToken(approvalToken);
      void load(approvalToken);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve() {
    if (!details || working) return;
    setWorking(true);
    try {
      if (details.mode === "register") {
        const registration = await startRegistration({ optionsJSON: details.options });
        const response = await fetch(`/api/v1/passkeys/registrations/${encodeURIComponent(details.registrationId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: details.registrationToken, response: registration }),
        });
        if (!response.ok) throw new Error("registration failed");
        setMessage("パスキーを登録しました。承認内容を再確認しています…");
        await load(token);
        return;
      }
      const authentication = await startAuthentication({ optionsJSON: details.options });
      const response = await fetch(`/api/v1/approval-signatures/${encodeURIComponent(approvalId)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, response: authentication }),
      });
      if (!response.ok) throw new Error("approval failed");
      setDetails(null);
      setMessage("承認を記録しました。この画面を閉じてRootLensへ戻ってください。");
    } catch (error) {
      setMessage(error instanceof Error && error.name === "NotAllowedError"
        ? "パスキーの操作が中止されました。内容を確認して、もう一度お試しください。"
        : "承認を記録できませんでした。もう一度お試しください。");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main style={{ maxWidth: "46rem", margin: "0 auto", padding: "clamp(2rem, 7vw, 5rem) 1.25rem", color: "#111" }}>
      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", margin: "0 0 2rem" }}>撮影データの提供承認</h1>
      {details ? (
        <>
          <p style={{ lineHeight: 1.8 }}>{details.statement}</p>
          <dl style={{ margin: "2rem 0", padding: "1.25rem 0", borderTop: "1px solid #111", borderBottom: "1px solid #111" }}>
            <dt style={{ fontWeight: 700 }}>撮影単位</dt>
            <dd style={{ margin: ".4rem 0 1.25rem", overflowWrap: "anywhere" }}>{details.unitId}</dd>
            <dt style={{ fontWeight: 700 }}>確認対象</dt>
            <dd style={{ margin: ".4rem 0 1.25rem" }}>{details.files.map((file) => file.name).join(" / ")}</dd>
            <dt style={{ fontWeight: 700 }}>適用される事前同意</dt>
            <dd style={{ margin: ".4rem 0 0" }}>
              現場合意 {details.consentSnapshot.siteAgreementCount}件・スタッフ同意 {details.consentSnapshot.staffConsentCount}件
              {" "}<a href={details.consentSnapshot.verificationUrl} target="_blank" rel="noreferrer">記録一覧を確認</a>
            </dd>
          </dl>
          <button type="button" disabled={working} onClick={approve}
            style={{ border: "1px solid #111", background: "#f5db74", color: "#111", padding: ".8rem 1.1rem", font: "inherit", cursor: working ? "wait" : "pointer" }}>
            {details.mode === "register" ? "パスキーを登録する" : "パスキーで署名して承認"}
          </button>
        </>
      ) : null}
      {message ? <p style={{ lineHeight: 1.8 }}>{message}</p> : null}
    </main>
  );
}
