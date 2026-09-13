import s from "./shared.module.css";

export default function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footerMeta}>
        <span>RootLens</span>
        <div className={s.footerLinks}>
          <a href="https://x.com/rootlens_sol" target="_blank" rel="noopener noreferrer" className={s.footerLink}>
            X ↗
          </a>
          <a href="https://x.com/moodai0119" target="_blank" rel="noopener noreferrer" className={s.footerLink}>
            Yudai Mori
          </a>
          <a href="https://x.com/KonoAkito" target="_blank" rel="noopener noreferrer" className={s.footerLink}>
            Akito Kono
          </a>
        </div>
      </div>
    </footer>
  );
}
