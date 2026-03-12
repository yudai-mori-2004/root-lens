import styles from "./page.module.css";

/** ランディングページ — 最小限。公開ページへのルーティングが主目的 */
export default function Home() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>RootLens</h1>
      <p className={styles.tagline}>撮影の事実を、そのままに</p>
    </div>
  );
}
