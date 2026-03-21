"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";

const DEMO_URL = "/p/demo";

function PageHero() {
  const t = useTranslations("pages.why");
  return (
    <section className={s.pageHero}>
      <div className={s.pageHeroInner}>
        <h1 className={s.pageHeroTitle}>{t("heroTitle")}</h1>
        <p className={s.pageHeroSubtitle}>{t("heroSubtitle")}</p>
      </div>
    </section>
  );
}

function SocialIssues() {
  const t = useTranslations("lp.issues");
  const issues = ["sns", "media", "insurance", "ai"] as const;

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.sectionSubtitle}>{t("intro")}</p>
        <div className={s.issuesGrid}>
          {issues.map((key) => (
            <div key={key} className={s.issueItem}>
              <div className={s.issueLabel}>{t(`${key}.label`)}</div>
              <div className={s.issueText}>{t(`${key}.text`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RootCause() {
  const tC2pa = useTranslations("lp.c2pa");

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{tC2pa("title")}</h2>
        <p className={s.prose}>{tC2pa("p1")}</p>
        <p className={s.prose}>{tC2pa("p2")}</p>
        <p className={s.prose}>{tC2pa("p3")}</p>
        <p className={s.prose}>
          <span className={s.emphasis}>{tC2pa("p4")}</span>
        </p>
        <p className={s.prose}>{tC2pa("p5")}</p>
      </div>
    </section>
  );
}

function ClosingCTA() {
  const t = useTranslations("pages.why");
  return (
    <section className={s.closingCta}>
      <div className={s.closingCtaInner}>
        <div className={s.closingCtaTitle}>{t("closingTitle")}</div>
        <div className={s.closingCtaDesc}>{t("closingDesc")}</div>
        <div className={s.closingCtaButtons}>
          <a href="/technology" className={s.ctaPrimary}>
            {t("closingCtaTech")}
          </a>
          <a href={DEMO_URL} className={s.ctaSecondary}>
            {useTranslations("common")("seeVerifiedPhoto")}
          </a>
        </div>
      </div>
    </section>
  );
}

export default function WhyPage() {
  return (
    <div className={s.page}>
      <PageHero />
      <SocialIssues />
      <RootCause />
      <ClosingCTA />
    </div>
  );
}
