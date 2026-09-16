import { agreementTemplates } from "@/content/agreementTemplates.generated";
import { operatorPage } from "@/lib/operator-page";
import NewSiteClient from "./NewSiteClient";

export default async function NewSitePage() {
  await operatorPage("/manage/new");
  return <NewSiteClient agreement={agreementTemplates.site_agreement.body} />;
}
