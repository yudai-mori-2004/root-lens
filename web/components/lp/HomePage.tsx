import Image from "next/image";
import { getLocale } from "next-intl/server";
import { publicLocale, publicPages } from "../../content/publicPages";
import s from "./home.module.css";

export default async function HomePage() {
  const locale = publicLocale(await getLocale());
  const pageCopy = publicPages[locale].home;
  const workplaceIllustrations = [
    {
      src: "/illustrations/work-bakery.jpg",
      alt: locale === "ja" ? "パンを並べる作業のイラスト" : "Illustration of arranging bread",
      className: s.illustrationLeft,
    },
    {
      src: "/illustrations/work-grocery.jpg",
      alt: locale === "ja" ? "青果を陳列する作業のイラスト" : "Illustration of stocking produce",
      className: s.illustrationCenter,
    },
    {
      src: "/illustrations/work-restaurant.jpg",
      alt: locale === "ja" ? "料理を盛り付ける作業のイラスト" : "Illustration of plating food",
      className: s.illustrationRight,
    },
  ];

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
        <div className={s.illustrationCluster}>
          {workplaceIllustrations.map((illustration) => (
            <div className={`${s.illustrationCircle} ${illustration.className}`} key={illustration.src}>
              <Image
                src={illustration.src}
                alt={illustration.alt}
                fill
                sizes="(max-width: 640px) 34vw, 17rem"
                priority
              />
            </div>
          ))}
        </div>
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
