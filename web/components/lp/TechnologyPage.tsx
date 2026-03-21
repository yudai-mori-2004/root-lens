"use client";

/**
 * /technology — 元の1枚LPの全ストーリーをそのまま展開する「読ませる」ページ。
 * 課題 → C2PA → Gap(図解付き) → Title Protocol → 比較 → RootLens → OSS → フッター
 */

import { useTranslations } from "next-intl";
import { useState } from "react";
import s from "./lp.module.css";
import GapDiagram from "./GapDiagram";

const GITHUB_TP = "https://github.com/yudai-mori-2004/title-protocol";
const GITHUB_RL = "https://github.com/yudai-mori-2004/root-lens";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Hero() {
  const t = useTranslations("pages.technology");
  return (
    <section className={s.hero}>
      <div className={s.heroInner}>
        <h1 className={s.heroTitle}>{t("heroTitle")}</h1>
        <p className={s.heroDescription}>{t("heroSubtitle")}</p>
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

function C2PASection() {
  const t = useTranslations("lp.c2pa");
  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.prose}>{t("p1")}</p>
        <p className={s.prose}>{t("p2")}</p>
        <p className={s.prose}>{t("p3")}</p>
        <p className={s.prose}>
          <span className={s.emphasis}>{t("p4")}</span>
        </p>
        <p className={s.prose}>{t("p5")}</p>
      </div>
    </section>
  );
}

function GapSection() {
  const t = useTranslations("lp.gap");
  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.prose}>{t("p1")}</p>
        <p className={s.prose}>{t("p2")}</p>
      </div>
      <div style={{ maxWidth: 680, margin: "32px auto 0" }}>
        <GapDiagram />
      </div>
      <div className={s.sectionInner} style={{ marginTop: 32 }}>
        <p className={s.prose}>{t("p3")}</p>
        <p className={s.prose}>{t("p4")}</p>
        <p className={s.prose}>
          <span className={s.emphasis}>{t("p5")}</span>
        </p>
      </div>
    </section>
  );
}

function TitleProtocolSection() {
  const t = useTranslations("lp.tp");
  const [techOpen, setTechOpen] = useState(false);

  const steps = ["step1", "step2", "step3", "step4"] as const;
  const techItems = ["stateless", "e2ee", "coreExt", "cost", "security"] as const;

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
                  <div className={s.techLabel}>{t(`techDetails.${key}.label`)}</div>
                  <div className={s.techText}>{t(`techDetails.${key}.text`)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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

function RootLensSection() {
  const t = useTranslations("lp.rootlens");
  const flowSteps = ["step1", "step2", "step3", "step4"] as const;

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <h2 className={s.sectionTitle}>{t("title")}</h2>
        <p className={s.sectionSubtitle}>{t("subtitle")}</p>
        <p className={s.prose}>{t("p1")}</p>

        <div className={s.rootlensFlow}>
          {flowSteps.map((key, i) => (
            <div key={key} className={s.flowStep}>
              <span className={s.flowNumber}>{i + 1}.</span>
              <span>{t(key)}</span>
            </div>
          ))}
        </div>

        <p className={s.prose} style={{ marginTop: 32 }}>
          {t("permanence")}
        </p>
        <p className={s.prose}>
          <span className={s.emphasis}>{t("targets")}</span>
        </p>
      </div>
    </section>
  );
}

function OpenSourceSection() {
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

export default function TechnologyPage() {
  return (
    <div className={s.page}>
      <Hero />
      <C2PASection />
      <GapSection />
      <TitleProtocolSection />
      <ComparisonSection />
      <RootLensSection />
      <OpenSourceSection />
    </div>
  );
}
