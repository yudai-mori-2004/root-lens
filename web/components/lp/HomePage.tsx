import { getTranslations } from "next-intl/server";
import s from "./lp.module.css";
import PhoneCarousel from "./PhoneCarousel";

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
            <div className={s.storeBadges}>
              <div className={s.storeBadge}>
                <AppleIcon />
                <div className={s.storeBadgeText}>
                  <span className={s.storeBadgeLabel}>{tc("comingSoon")}</span>
                  <span className={s.storeBadgeName}>App Store</span>
                </div>
              </div>
              <div className={s.storeBadge}>
                <PlayIcon />
                <div className={s.storeBadgeText}>
                  <span className={s.storeBadgeLabel}>{tc("comingSoon")}</span>
                  <span className={s.storeBadgeName}>Google Play</span>
                </div>
              </div>
            </div>
            <div className={s.heroCtas}>
              <a href={DEMO_URL} className={s.ctaSecondary}>
                {tc("seeVerifiedPhoto")}
              </a>
              <a href="/technology" className={s.ctaSecondary}>
                {t("ctaHow")}
              </a>
            </div>
          </div>
          <div className={s.heroPhoneWrap}>
            <div className={s.phoneFrame}>
              <div className={s.phoneDynamicIsland} />
              <div className={s.phoneScreen}>
                <img src="/app-verify.png" alt="RootLens verification page" className={s.phoneSlide} style={{ opacity: 1 }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={s.section}>
        <div className={s.sectionInner}>
          <h2 className={s.sectionTitle}>{tFlow("title")}</h2>
          <PhoneCarousel slides={[
            { src: "/app-camera.png", alt: "RootLens camera", label: tFlow("step1.label") },
            { src: "/app-verify.png", alt: "Verified content", label: tFlow("step2.label") },
            { src: "/app-gallery.png", alt: "Published gallery", label: tFlow("step3.label") },
          ]} />
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

function AppleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 20.5v-17c0-.83.52-1.28 1.09-1.28.18 0 .37.05.56.15l15.32 8.5c.55.31.72.77.72 1.13s-.17.82-.72 1.13L4.65 21.63c-.19.1-.38.15-.56.15C3.52 21.78 3 21.33 3 20.5z" />
    </svg>
  );
}
