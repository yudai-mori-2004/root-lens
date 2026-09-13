import type { ReactNode } from "react";
import s from "./info.module.css";

export function InfoHero({
  label,
  title,
  lead,
  facts,
}: {
  label: string;
  title: string;
  lead: string;
  facts: readonly string[];
}) {
  return (
    <header className={s.hero}>
      <div className={s.heroMain}>
        <p className={s.heroLabel}>{label}</p>
        <h1 className={s.heroTitle}>{title}</h1>
        <p className={s.heroLead}>{lead}</p>
      </div>
      <ul className={s.factList} aria-label={label}>
        {facts.map((fact) => <li key={fact}>{fact}</li>)}
      </ul>
    </header>
  );
}

export function InfoSection({
  title,
  lead,
  children,
  id,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className={s.section} id={id}>
      <div className={s.sectionHeading}>
        <h2>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ActionLink({
  href,
  children,
  secondary = false,
  download = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  download?: boolean;
}) {
  return (
    <a className={secondary ? s.buttonSecondary : s.buttonPrimary} href={href} download={download || undefined}>
      {children}
      <span aria-hidden="true">→</span>
    </a>
  );
}

export function ClosingContact({
  title,
  body,
  actionLabel,
}: {
  title: string;
  body: string;
  actionLabel: string;
}) {
  return (
    <section className={s.closing}>
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <ActionLink href="/contact">{actionLabel}</ActionLink>
    </section>
  );
}

export { s as infoStyles };
