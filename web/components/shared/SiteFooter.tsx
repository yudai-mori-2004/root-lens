import { getTranslations } from "next-intl/server";
import s from "../lp/lp.module.css";

export default async function SiteFooter() {
  const t = await getTranslations("lp.footer");

  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <div className={s.footerBuiltBy}>
          <a href="https://moodai.jp" target="_blank" rel="noopener noreferrer" className={s.footerLink}>
            Yudai Mori
          </a>
          {" & "}
          <a href="https://akitozizi818.github.io/portfolio/" target="_blank" rel="noopener noreferrer" className={s.footerLink}>
            Akito Kono
          </a>
        </div>
        <div className={s.footerLicense}>{t("license")}</div>
      </div>
    </footer>
  );
}
