"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";
import { PhoneMockup } from "./Placeholder";

const DEMO_URL = "/p/demo";

function Hero() {
  const t = useTranslations("lp.hero");
  return (
    <section className={s.heroSplit}>
      <div className={s.heroSplitInner}>
        <div>
          <h1 className={s.heroTitle}>{t("title")}</h1>
          <p className={s.heroTagline}>{t("tagline")}</p>
          <p className={s.heroDescription}>{t("description")}</p>
          <div className={s.heroCtas}>
            <a href={DEMO_URL} className={s.ctaPrimary}>
              {t("ctaDemo")}
            </a>
            <a href="#how-it-works" className={s.ctaSecondary}>
              {t("ctaHow")} &darr;
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
  const steps = ["step1", "step2", "step3"] as const;

  return (
    <section id="how-it-works" className={s.section}>
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
          See a verified photo in action &rarr;
        </a>
      </div>
    </section>
  );
}

function ClosingCTA() {
  const t = useTranslations("pages.home");
  return (
    <section className={s.closingCta}>
      <div className={s.closingCtaInner}>
        <div className={s.closingCtaTitle}>{t("closingTitle")}</div>
        <div className={s.closingCtaDesc}>{t("closingDesc")}</div>
        <div className={s.closingCtaButtons}>
          <a href={DEMO_URL} className={s.ctaPrimary}>
            See a verified photo
          </a>
          <a href="/why" className={s.ctaSecondary}>
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
      <ClosingCTA />
    </div>
  );
}
