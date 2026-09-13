import Image from "next/image";
import { getLocale } from "next-intl/server";
import { publicLocale, publicPages } from "../../content/publicPages";
import s from "./home.module.css";

export default async function HomePage() {
  const locale = publicLocale(await getLocale());
  const pageCopy = publicPages[locale].home;
  const illustrationColumns = [
    {
      className: s.illustrationLeft,
      frames: [
        "/illustrations/work-bakery.jpg",
        "/illustrations/extraction-cut-1.jpg",
        "/illustrations/payment-into-rootlens.jpg",
      ],
    },
    {
      className: s.illustrationCenter,
      frames: [
        "/illustrations/work-grocery.jpg",
        "/illustrations/robot-research-use.jpg",
        "/illustrations/rootlens-distribution-hub.jpg",
      ],
    },
    {
      className: s.illustrationRight,
      frames: [
        "/illustrations/work-restaurant.jpg",
        "/illustrations/robot-development.jpg",
        "/illustrations/revenue-cut-3.jpg",
      ],
    },
  ];
  const frameClasses = [s.frameWork, s.frameExtraction, s.frameRevenue];

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

      <figure
        className={s.workplaceFigure}
        aria-label={locale === "ja"
          ? "現場作業の撮影、データの取得、ロボット開発、収益還元の流れ"
          : "The flow from workplace capture and data collection to robot development and revenue return"}
      >
        <div className={s.illustrationCluster}>
          {illustrationColumns.map((column) => (
            <div className={`${s.illustrationCircle} ${column.className}`} key={column.frames[0]}>
              {column.frames.map((src, frameIndex) => (
                <Image
                  className={`${s.illustrationFrame} ${frameClasses[frameIndex]}`}
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 33vw, 21rem"
                  preload
                  key={src}
                />
              ))}
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
