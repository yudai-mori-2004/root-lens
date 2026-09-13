import { getImageProps } from "next/image";
import { getLocale } from "next-intl/server";
import { publicLocale, publicPages } from "../../content/publicPages";
import s from "./home.module.css";

export default async function HomePage() {
  const locale = publicLocale(await getLocale());
  const pageCopy = publicPages[locale].home;
  const illustrationAlt = locale === "ja"
    ? "パンを並べながら撮影機材を装着して働くスタッフのイラスト"
    : "Illustration of a worker arranging bread while wearing capture equipment";
  const { props: { srcSet: desktopSrcSet } } = getImageProps({
    src: "/illustrations/bakery-work-desktop.jpg",
    alt: illustrationAlt,
    width: 1536,
    height: 1024,
    sizes: "(min-width: 1024px) 1024px, 100vw",
    priority: true,
  });
  const { props: mobileImageProps } = getImageProps({
    src: "/illustrations/bakery-work-mobile.jpg",
    alt: illustrationAlt,
    width: 1536,
    height: 1024,
    sizes: "100vw",
    priority: true,
  });

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
        <picture>
          <source
            media="(min-width: 641px)"
            sizes="(min-width: 1024px) 1024px, 100vw"
            srcSet={desktopSrcSet}
          />
          <img {...mobileImageProps} alt={illustrationAlt} className={s.workplaceIllustration} />
        </picture>
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
