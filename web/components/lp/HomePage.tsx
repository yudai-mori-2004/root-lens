import { getTranslations } from "next-intl/server";
import s from "./lp.module.css";
import { PhoneMockup } from "./Placeholder";

const DEMO_URL = "/p/BatH5xy";

export default async function HomePage() {
  const t = await getTranslations("lp.hero");
  const tFlow = await getTranslations("lp.appFlow");
  const tIssues = await getTranslations("lp.issues");
  const tHome = await getTranslations("pages.home");
  const tc = await getTranslations("common");

  const flowSteps = ["step1", "step2", "step3"] as const;
  const issues = ["sns", "media", "insurance", "ai"] as const;

  return (
    <div className={s.page}>
      {/* Hero */}
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

      {/* How it works */}
      <section className={s.section}>
        <div className={s.sectionInner}>
          <h2 className={s.sectionTitle}>{tFlow("title")}</h2>
          <div className={s.steps}>
            {flowSteps.map((key, i) => (
              <div key={key} className={s.step}>
                <div className={s.stepNumber}>{i + 1}</div>
                <div>
                  <div className={s.stepLabel}>{tFlow(`${key}.label`)}</div>
                  <div className={s.stepText}>{tFlow(`${key}.text`)}</div>
                </div>
              </div>
            ))}
          </div>
          <p className={s.prose} style={{ marginTop: 24 }}>
            <span className={s.emphasis}>{tFlow("editing")}</span>
          </p>
          <a href={DEMO_URL} className={s.demoLink}>
            {tc("demoLink")} &rarr;
          </a>
        </div>
      </section>

      {/* Social issues */}
      <section className={s.section}>
        <div className={s.sectionInner}>
          <h2 className={s.sectionTitle}>{tIssues("title")}</h2>
          <p className={s.sectionSubtitle}>{tIssues("intro")}</p>
          <div className={s.issuesGrid}>
            {issues.map((key) => (
              <div key={key} className={s.issueItem}>
                <div className={s.issueLabel}>{tIssues(`${key}.label`)}</div>
                <div className={s.issueText}>{tIssues(`${key}.text`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className={s.closingCta}>
        <div className={s.closingCtaInner}>
          <div className={s.closingCtaTitle}>{tHome("closingTitle")}</div>
          <div className={s.closingCtaDesc}>{tHome("closingDesc")}</div>
          <div className={s.closingCtaButtons}>
            <a href={DEMO_URL} className={s.ctaPrimary}>
              {tc("seeVerifiedPhoto")}
            </a>
            <a href="/technology" className={s.ctaSecondary}>
              {tHome("closingCtaWhy")}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
