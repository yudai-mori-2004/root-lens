import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { infoStyles as s } from "../../components/info/PageFrame";
import SampleViewer from "../../components/lp/sample/SampleViewer";
import SiteLayout from "../../components/shared/SiteLayout";
import { publicLocale, publicPages } from "../../content/publicPages";
import { buildSamplePipelines, DRIVE_SAMPLES_URL } from "../../lib/samplePipelines";

export async function generateMetadata(): Promise<Metadata> {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].buy;
  return { title: copy.title, description: copy.overview[0], alternates: { canonical: "/buy" } };
}

export default async function BuyPage() {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].buy;
  const pipelines = await buildSamplePipelines();

  return (
    <SiteLayout>
      <main className={s.accordionPage}>
        <header className={s.contributeOverview}>
          <h1>{copy.label}</h1>
          {copy.overview.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </header>

        <section className={s.accordionList} aria-label={copy.label}>
          <details className={s.accordionItem}>
            <summary>{copy.designTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.designBody}</p>
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.provenanceTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.provenanceBody}</p>
              <p>{locale === "ja" ? "収集から提供までの手順は、データポリシーをご覧ください。" : "See the data policy for the process from collection through delivery."}</p>
              <Link className={s.editorialLink} href="/data-policy">{copy.provenanceAction} →</Link>
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.previewTitle}</summary>
            <div className={s.accordionPreviewBody}>
              <SampleViewer pipelines={pipelines} driveUrl={DRIVE_SAMPLES_URL} embedded />
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.contactTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.contactBody}</p>
              <Link className={s.editorialLink} href="/contact">{copy.contactAction} →</Link>
            </div>
          </details>
        </section>
      </main>
    </SiteLayout>
  );
}
