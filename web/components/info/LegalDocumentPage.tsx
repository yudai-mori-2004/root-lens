import SiteLayout from "../shared/SiteLayout";
import s from "./legalDocument.module.css";

export default function LegalDocumentPage({
  title,
  lead,
  html,
}: {
  title: string;
  lead?: string;
  html: string;
}) {
  return (
    <SiteLayout>
      <main className={s.page}>
        <header className={s.header}>
          <h1>{title}</h1>
          {lead ? <p>{lead}</p> : null}
        </header>
        <article className={s.document} dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </SiteLayout>
  );
}
