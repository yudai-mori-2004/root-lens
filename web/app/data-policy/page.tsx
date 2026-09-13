import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ActionLink, infoStyles as s } from "../../components/info/PageFrame";
import SiteLayout from "../../components/shared/SiteLayout";
import { publicLocale, publicPages } from "../../content/publicPages";

const SITE_AGREEMENT = "/documents/rootlens-site-agreement.pdf";
const STAFF_CONSENT = "/documents/rootlens-staff-consent.pdf";

export async function generateMetadata(): Promise<Metadata> {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].policy;
  return { title: copy.label, description: copy.summary };
}

export default async function DataPolicyPage() {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].policy;
  const macDownload = process.env.NEXT_PUBLIC_ROOTLENS_IMPORT_MAC_URL;
  const windowsDownload = process.env.NEXT_PUBLIC_ROOTLENS_IMPORT_WINDOWS_URL;
  const hasDownload = Boolean(macDownload || windowsDownload);

  return (
    <SiteLayout>
      <main className={s.accordionPage}>
        <header className={s.contributeOverview}>
          <h1>{copy.label}</h1>
          <p>{copy.summary}</p>
        </header>

        <section className={s.policySummary} aria-label={locale === "ja" ? "データ提供の三段階" : "Three stages of data provision"}>
          <ol className={s.policyOverviewList}>
            {copy.steps.map((step, index) => (
              <li key={step.title}>
                <a href={`#policy-step-${index + 1}`}>{step.title}</a>
                <p>{step.short}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.accordionList} aria-label={copy.label}>
          <details className={s.accordionItem} id="policy-step-1">
            <summary>{copy.agreementTitle}</summary>
            <div className={s.accordionBody}>
              {copy.agreementBody.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <div className={s.accordionSections}>
                <section>
                  <h2>{copy.siteDoc[0]}</h2>
                  <p>{copy.siteDoc[1]}</p>
                  <ActionLink href={SITE_AGREEMENT} download>
                    {locale === "ja" ? "PDFをダウンロード" : "Download PDF"}
                  </ActionLink>
                </section>
                <section>
                  <h2>{copy.staffDoc[0]}</h2>
                  <p>{copy.staffDoc[1]}</p>
                  <ActionLink href={STAFF_CONSENT} download>
                    {locale === "ja" ? "PDFをダウンロード" : "Download PDF"}
                  </ActionLink>
                </section>
              </div>
            </div>
          </details>

          <details className={s.accordionItem} id="policy-step-2">
            <summary>{copy.approvalTitle}</summary>
            <div className={s.accordionBody}>
              {copy.approvalBody.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <section className={s.inlineSection}>
                <h2>{copy.appTitle}</h2>
                <p>{copy.appBody}</p>
                <div className={s.buttonRow}>
                  {macDownload ? <ActionLink href={macDownload}>{copy.appAction}（macOS）</ActionLink> : null}
                  {windowsDownload ? <ActionLink href={windowsDownload}>{copy.appAction}（Windows）</ActionLink> : null}
                  {!hasDownload ? (
                    <ActionLink href="/contact">
                      {locale === "ja" ? "アプリを受け取る" : "Get the app"}
                    </ActionLink>
                  ) : null}
                </div>
              </section>
            </div>
          </details>

          <details className={s.accordionItem} id="policy-step-3">
            <summary>{copy.evidenceTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.evidenceLead}</p>
              <ul className={s.plainList}>
                {copy.evidenceFields.map((field) => <li key={field}>{field}</li>)}
              </ul>
              <p>{copy.evidenceBody}</p>
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.processingAndLimitsTitle}</summary>
            <div className={s.accordionBody}>
              <div className={s.accordionSections}>
                <section>
                  <h2>{copy.processingTitle}</h2>
                  {copy.processingBody.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </section>
                <section>
                  <h2>{copy.limitsTitle}</h2>
                  <p>{copy.limitsLead}</p>
                  <ul className={s.plainList}>
                    {copy.limits.map((limit) => <li key={limit}>{limit}</li>)}
                  </ul>
                </section>
              </div>
            </div>
          </details>
        </section>
      </main>
    </SiteLayout>
  );
}
