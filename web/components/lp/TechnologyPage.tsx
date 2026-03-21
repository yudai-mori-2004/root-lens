"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import s from "./lp.module.css";
import GapDiagram from "./GapDiagram";

const DEMO_URL = "/p/demo";
const GITHUB_TP = "https://github.com/yudai-mori-2004/title-protocol";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* ---- Page Hero ---- */
function PageHero() {
  const t = useTranslations("pages.technology");
  return (
    <section className={s.pageHero}>
      <div className={s.pageHeroInner}>
        <h1 className={s.pageHeroTitle}>{t("heroTitle")}</h1>
        <p className={s.pageHeroSubtitle}>{t("heroSubtitle")}</p>
      </div>
    </section>
  );
}

/* ---- Gap section (with lead-in replacing C2PA p1-p5) ---- */
function GapSection() {
  const tPage = useTranslations("pages.technology");
  const tGap = useTranslations("lp.gap");

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        {/* One-line lead-in replaces the full C2PA explanation */}
        <p className={s.prose}>
          <span className={s.emphasis}>{tPage("leadIn")}</span>
        </p>
      </div>

      <div className={s.diagramInner} style={{ marginTop: 32 }}>
        <h2 className={s.sectionTitle}>{tGap("title")}</h2>
        <p className={s.prose} style={{ maxWidth: 680, marginBottom: 16 }}>
          {tGap("p1")}
        </p>
        <p className={s.prose} style={{ maxWidth: 680, marginBottom: 32 }}>
          {tGap("p2")}
        </p>
        <GapDiagram />
        <p className={s.prose} style={{ maxWidth: 680, marginTop: 24 }}>
          {tGap("p3")}
        </p>
        <p className={s.prose} style={{ maxWidth: 680, marginTop: 16 }}>
          {tGap("p4")}
        </p>
        <p className={s.prose} style={{ maxWidth: 680, marginTop: 16 }}>
          <span className={s.emphasis}>{tGap("p5")}</span>
        </p>
      </div>
    </section>
  );
}

/* ---- Title Protocol ---- */
function TitleProtocolSection() {
  const t = useTranslations("lp.tp");
  const [techOpen, setTechOpen] = useState(false);

  const steps = ["step1", "step2", "step3", "step4"] as const;
  const techItems = [
    "stateless",
    "e2ee",
    "coreExt",
    "cost",
    "security",
  ] as const;

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.sectionSubtitle}>{t("subtitle")}</p>
        <p className={s.prose}>{t("p1")}</p>
        <p className={s.prose}>{t("p2")}</p>

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

        <div className={s.techDetails}>
          <button
            className={s.techToggle}
            data-open={techOpen}
            onClick={() => setTechOpen(!techOpen)}
          >
            {t("techDetails.title")}
          </button>
          {techOpen && (
            <div>
              {techItems.map((key) => (
                <div key={key} className={s.techItem}>
                  <div className={s.techLabel}>
                    {t(`techDetails.${key}.label`)}
                  </div>
                  <div className={s.techText}>
                    {t(`techDetails.${key}.text`)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---- Comparison ---- */
function ComparisonSection() {
  const t = useTranslations("lp.comparison");
  const scenarios = ["scenario1", "scenario2", "scenario3", "scenario4"] as const;

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.sectionSubtitle}>{t("intro")}</p>
        <div className={s.comparisonList}>
          {scenarios.map((key) => (
            <div key={key} className={s.comparisonItem}>
              <div className={s.comparisonLabel}>{t(`${key}.label`)}</div>
              <div className={s.comparisonText}>{t(`${key}.text`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- Closing CTA ---- */
function ClosingCTA() {
  const t = useTranslations("pages.technology");
  return (
    <section className={s.closingCta}>
      <div className={s.closingCtaInner}>
        <div className={s.closingCtaTitle}>{t("closingTitle")}</div>
        <div className={s.closingCtaDesc}>{t("closingDesc")}</div>
        <div className={s.closingCtaButtons}>
          <a href={DEMO_URL} className={s.ctaPrimary}>
            See a verified photo
          </a>
          <a href={GITHUB_TP} target="_blank" rel="noopener noreferrer" className={s.ctaSecondary}>
            <GitHubIcon className={s.repoIcon} />
            {t("closingCtaCode")}
          </a>
        </div>
      </div>
    </section>
  );
}

export default function TechnologyPage() {
  return (
    <div className={s.page}>
      <PageHero />
      <GapSection />
      <TitleProtocolSection />
      <ComparisonSection />
      <ClosingCTA />
    </div>
  );
}
