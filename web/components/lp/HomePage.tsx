"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";
import { PhoneMockup } from "./Placeholder";

const DEMO_URL = "/p/demo";

function Hero() {
  const t = useTranslations("lp.hero");
  const tc = useTranslations("common");
  return (
    <section className={s.heroSplit}>
      <div className={s.heroSplitInner}>
        <div>
          <h1 className={s.heroTitle}>{t("title")}</h1>
          <p className={s.heroTagline}>{t("tagline")}</p>
          <p className={s.heroDescription}>{t("description")}</p>
          <div className={s.heroCtas}>
            <a href={DEMO_URL} className={s.ctaPrimary}>
              {tc("seeVerifiedPhoto")}
            </a>
            <a href="/technology" className={s.ctaSecondary}>
              {t("ctaHow")}
            </a>
          </div>
        </div>
        <PhoneMockup
          label="App screenshot"
          sublabel="Camera → Verify → Share link"
        />
      </div>
    </section>
  );
}

function AppFlow() {
  const t = useTranslations("lp.appFlow");
  const tc = useTranslations("common");
  const steps = ["step1", "step2", "step3"] as const;

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <div className={s.steps}>
          {steps.map((key, i) => (
            <div key={key} className={s.step}>
              <div className={s.stepNumber}>{i + 1}</div>
              <div>
                <div className={s.stepLabel}>{t(`${key}.label`)}</div>
                <div className={s.stepText}>{t(`${key}.text`)}</div>
              </div>
            </div>
          ))}
        </div>
        <p className={s.prose} style={{ marginTop: 24 }}>
          <span className={s.emphasis}>{t("editing")}</span>
        </p>
        <a href={DEMO_URL} className={s.demoLink}>
          {tc("demoLink")} &rarr;
        </a>
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

function ClosingCTA() {
  const t = useTranslations("pages.home");
  const tc = useTranslations("common");
  return (
    <section className={s.closingCta}>
      <div className={s.closingCtaInner}>
        <div className={s.closingCtaTitle}>{t("closingTitle")}</div>
        <div className={s.closingCtaDesc}>{t("closingDesc")}</div>
        <div className={s.closingCtaButtons}>
          <a href={DEMO_URL} className={s.ctaPrimary}>
            {tc("seeVerifiedPhoto")}
          </a>
          <a href="/technology" className={s.ctaSecondary}>
            {t("closingCtaWhy")}
          </a>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className={s.page}>
      <Hero />
      <AppFlow />
      <SocialIssues />
      <ClosingCTA />
    </div>
  );
}
