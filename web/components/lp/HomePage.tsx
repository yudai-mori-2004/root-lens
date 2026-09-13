import Image from "next/image";
import { getLocale } from "next-intl/server";
import { publicLocale, publicPages } from "../../content/publicPages";
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

      <figure className={s.workplaceFigure}>
        <Image
          className={s.workplacePhoto}
          src="/photos/workplace-capture-satokaede.jpg"
          alt={locale === "ja" ? "ベーカリーの厨房で撮影機材を装着して作業する様子" : "A worker wearing capture equipment in a bakery kitchen"}
          width={1536}
          height={2048}
          sizes="(max-width: 64rem) 100vw, 64rem"
          priority
        />
      </figure>

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

      <nav className={s.entryGrid} aria-label={locale === "ja" ? "案内" : "Explore"}>
        {pageCopy.entries.map(([title, href]) => (
          <a className={s.entry} href={href} key={href}>
            <span>{title}</span>
          </a>
        ))}
      </nav>
    </main>
  );
}
