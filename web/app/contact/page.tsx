import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SiteLayout from "../../components/shared/SiteLayout";
import ContactCard from "../../components/contact/ContactCard";
import { infoStyles as s } from "../../components/info/PageFrame";

const CONTACT_EMAIL = "contact@rootlens.io";

export const metadata: Metadata = {
  title: "RootLens – Contact",
  description: "Contact RootLens by email.",
};

export default async function ContactPage() {
  const t = await getTranslations("pages.contact");

  return (
    <SiteLayout>
      <main className={s.accordionPage}>
        <header className={s.contributeOverview}>
          <h1>{t("title")}</h1>
          <p>{t("lead")}</p>
        </header>
        <ContactCard email={CONTACT_EMAIL} copyLabel={t("copy")} copiedLabel={t("copied")} />
      </main>
    </SiteLayout>
  );
}
