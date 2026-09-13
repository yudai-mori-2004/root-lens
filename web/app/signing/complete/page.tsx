export const metadata = { robots: { index: false, follow: false } };

export default function SigningCompletePage() {
  return (
    <main style={{ maxWidth: "44rem", margin: "0 auto", padding: "clamp(3rem, 10vw, 7rem) 1.25rem", color: "#111" }}>
      <h1 style={{ fontSize: "clamp(1.7rem, 4vw, 2.4rem)", margin: "0 0 1.5rem" }}>署名を受け付けました。</h1>
      <p style={{ lineHeight: 1.8 }}>この画面を閉じていただいて構いません。</p>
    </main>
  );
}
