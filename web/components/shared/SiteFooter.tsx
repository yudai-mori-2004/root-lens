import { useTranslations } from "next-intl";
import s from "./shared.module.css";

const GITHUB_TP = "https://github.com/yudai-mori-2004/title-protocol";

export default function SiteFooter() {
  const t = useTranslations("lp.footer");

  return (
    <footer className={s.siteFooter}>
      <div className={s.siteFooterInner}>
        <div className={s.footerLeft}>
          <div className={s.footerBrand}>RootLens</div>
          <div className={s.footerBuiltBy}>{t("builtBy")}</div>
        </div>
        <div className={s.footerRight}>
          <div className={s.footerNavGroup}>
            <a href="/technology" className={s.footerNavLink}>Technology</a>
            <a href="/why" className={s.footerNavLink}>Why</a>
            <a href="/developers" className={s.footerNavLink}>Developers</a>
            <a href="/about" className={s.footerNavLink}>About</a>
          </div>
          <div className={s.footerNavGroup}>
            <a href={GITHUB_TP} target="_blank" rel="noopener noreferrer" className={s.footerNavLink}>
              GitHub
            </a>
          </div>
        </div>
      </div>
      <div className={s.footerBottom}>
        {t("license")}
      </div>
    </footer>
  );
}
