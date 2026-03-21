"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import s from "./lp.module.css";
import GapDiagram from "./GapDiagram";

/* ---- C2PA + Gap (combined) ---- */
function ProblemSection() {
  const tC2pa = useTranslations("lp.c2pa");
  const tGap = useTranslations("lp.gap");

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

      <div className={s.diagramInner} style={{ marginTop: 48 }}>
        <h3
          className={s.sectionTitle}
          style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)", marginBottom: 16 }}
        >
          {tGap("title")}
        </h3>
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
  const scenarios = [
    "scenario1",
    "scenario2",
    "scenario3",
    "scenario4",
  ] as const;

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

/* ---- Main ---- */
export default function TechnologyPage() {
  return (
    <div className={s.page}>
      <ProblemSection />
      <TitleProtocolSection />
      <ComparisonSection />
    </div>
  );
}
