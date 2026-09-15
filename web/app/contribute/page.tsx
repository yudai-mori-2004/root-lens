import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { infoStyles as s } from "../../components/info/PageFrame";
import SiteLayout from "../../components/shared/SiteLayout";
import { publicLocale, publicPages } from "../../content/publicPages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].contribute;
  return { title: copy.title, description: copy.lead, alternates: { canonical: "/contribute" } };
}

export default async function ContributePage() {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].contribute;

  return (
    <SiteLayout>
      <main className={s.accordionPage}>
        <header className={s.contributeOverview}>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </header>

        <section className={s.accordionList} aria-label={copy.label}>
          <details className={s.accordionItem}>
            <summary>{copy.captureTitle}</summary>
            <div className={s.accordionBody}>
              {copy.captureBody.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.preparationTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.preparationLead}</p>
              <div className={s.accordionSections}>
                {copy.preparation.map((item) => (
                  <section key={item.title}>
                    <h2>{item.title}</h2>
                    <p>{item.body}</p>
                  </section>
                ))}
              </div>
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.equipmentTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.equipmentBody}</p>
              <section className={s.deviceSection}>
                <h2>{copy.equipmentListTitle}</h2>
                <ul className={s.deviceScroller}>
                  {copy.equipment.map((device) => (
                    <li key={device.name}>
                      <Image
                        src={device.src}
                        alt={device.name}
                        width={device.width}
                        height={device.height}
                        sizes="(max-width: 640px) 76vw, 24rem"
                      />
                      <p className={s.deviceName}>{device.name}</p>
                      {"specs" in device ? <p className={s.deviceSpecs}>{device.specs}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
              <section className={s.noticeSection}>
                <h2>{copy.equipmentNoticeTitle}</h2>
                <p>{copy.equipmentNotice}</p>
              </section>
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.useTitle}</summary>
            <div className={s.accordionBody}>
              <p>{copy.useBody}</p>
              <p>{copy.prohibitedLead}</p>
              <ul className={s.plainList}>
                {copy.prohibited.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p>{copy.outsourcingBody}</p>
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.feeTitle}</summary>
            <div className={s.accordionBody}>
              {copy.feeBody.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </details>

          <details className={s.accordionItem}>
            <summary>{copy.controlTitle}</summary>
            <div className={s.accordionBody}>
              <div className={s.accordionSections}>
                {copy.controls.map((item) => (
                  <section key={item.title}>
                    <h2>{item.title}</h2>
                    {item.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </section>
                ))}
              </div>
            </div>
          </details>
        </section>
      </main>
    </SiteLayout>
  );
}
