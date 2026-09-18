import { getLocale } from "next-intl/server";
import { publicLocale, publicPages } from "../../content/publicPages";
import LifecycleAnimation from "./LifecycleAnimation";
import s from "./home.module.css";

export default async function HomePage() {
  const locale = publicLocale(await getLocale());
  const pageCopy = publicPages[locale].home;
  return (
    <main className={s.page}>
      <header className={s.intro}>
        <div className={s.introTitle}>
          <h1>
            {pageCopy.title.map((line) => <span className={s.introTitleLine} key={line}>{line}</span>)}
          </h1>
        </div>
        <div className={s.introBody}>
          {pageCopy.intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </header>

      <LifecycleAnimation locale={locale} />

      <section className={s.overview} aria-label={locale === "ja" ? "RootLensについて" : "About RootLens"}>
        <div className={s.overviewContent}>
          <article className={s.overviewBlock}>
            <h2>{pageCopy.backgroundTitle}</h2>
            <div className={s.overviewText}>
              {pageCopy.background.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </article>
          <article className={s.overviewBlock}>
            <h2>{pageCopy.businessTitle}</h2>
            <div className={s.overviewText}>
              {pageCopy.business.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </article>
        </div>
      </section>

      <nav className={s.entrySection} aria-label={locale === "ja" ? "案内" : "Explore"}>
        <div className={s.entryInner}>
          <div className={s.entryList}>
            {pageCopy.entries.map(([title, href], index) => (
              <a className={index === 2 ? s.entrySecondary : s.entry} href={href} key={href}>
                <span>{title}</span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        </div>
      </nav>
    </main>
  );
}
