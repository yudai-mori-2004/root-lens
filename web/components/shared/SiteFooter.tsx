"use client";

import { useTranslations } from "next-intl";
import s from "./shared.module.css";

const GITHUB_TP = "https://github.com/yudai-mori-2004/title-protocol";

export default function SiteFooter() {
  const tFooter = useTranslations("lp.footer");
  const tNav = useTranslations("nav");

  return (
    <footer className={s.siteFooter}>
      <div className={s.siteFooterInner}>
        <div className={s.footerLeft}>
          <div className={s.footerBrand}>RootLens</div>
          <div className={s.footerBuiltBy}>{tFooter("builtBy")}</div>
        </div>
        <div className={s.footerRight}>
          <div className={s.footerNavGroup}>
            <a href="/technology" className={s.footerNavLink}>{tNav("technology")}</a>
            <a href="/why" className={s.footerNavLink}>{tNav("why")}</a>
            <a href="/developers" className={s.footerNavLink}>{tNav("developers")}</a>
            <a href="/about" className={s.footerNavLink}>{tNav("about")}</a>
          </div>
          <div className={s.footerNavGroup}>
            <a href={GITHUB_TP} target="_blank" rel="noopener noreferrer" className={s.footerNavLink}>
              GitHub
            </a>
          </div>
        </div>
      </div>
      <div className={s.footerBottom}>
        {tFooter("license")}
      </div>
    </footer>
  );
}
