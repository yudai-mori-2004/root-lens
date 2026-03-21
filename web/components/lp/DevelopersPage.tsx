"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";

const GITHUB_TP = "https://github.com/yudai-mori-2004/title-protocol";
const GITHUB_RL = "https://github.com/yudai-mori-2004/root-lens";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function PageHero() {
  const t = useTranslations("pages.developers");
  return (
    <section className={s.pageHero}>
      <div className={s.pageHeroInner}>
        <h1 className={s.pageHeroTitle}>{t("heroTitle")}</h1>
        <p className={s.pageHeroSubtitle}>{t("heroSubtitle")}</p>
      </div>
    </section>
  );
}

function OpenSource() {
  const t = useTranslations("lp.openSource");

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.prose}>{t("spec")}</p>
        <p className={s.prose}>{t("node")}</p>

        <div className={s.repoLinks}>
          <a href={GITHUB_TP} target="_blank" rel="noopener noreferrer" className={s.repoLink}>
            <GitHubIcon className={s.repoIcon} />
            {t("tpRepo")}
          </a>
          <a href={GITHUB_RL} target="_blank" rel="noopener noreferrer" className={s.repoLink}>
            <GitHubIcon className={s.repoIcon} />
            {t("rlRepo")}
          </a>
        </div>

        <p className={s.prose}>{t("code")}</p>
      </div>
    </section>
  );
}

function GetInvolved() {
  const t = useTranslations("pages.developers");
  const items = ["involved1", "involved2", "involved3"] as const;

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("involvedTitle")}</h2>
        <div className={s.involveGrid}>
          {items.map((key) => (
            <div key={key} className={s.involveItem}>
              <div className={s.involveLabel}>{t(`${key}Label`)}</div>
              <div className={s.involveText}>{t(`${key}Text`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCTA() {
  const t = useTranslations("pages.developers");
  return (
    <section className={s.closingCta}>
      <div className={s.closingCtaInner}>
        <div className={s.closingCtaTitle}>{t("closingTitle")}</div>
        <div className={s.closingCtaDesc}>{t("closingDesc")}</div>
        <div className={s.closingCtaButtons}>
          <a href={GITHUB_TP} target="_blank" rel="noopener noreferrer" className={s.ctaPrimary}>
            <GitHubIcon className={s.repoIcon} />
            Title Protocol
          </a>
          <a href={GITHUB_RL} target="_blank" rel="noopener noreferrer" className={s.ctaSecondary}>
            <GitHubIcon className={s.repoIcon} />
            RootLens
          </a>
        </div>
      </div>
    </section>
  );
}

export default function DevelopersPage() {
  return (
    <div className={s.page}>
      <PageHero />
      <OpenSource />
      <GetInvolved />
      <ClosingCTA />
    </div>
  );
}
