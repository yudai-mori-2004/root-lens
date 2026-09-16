import { agreementTemplates } from "@/content/agreementTemplates.generated";
import NewSiteClient from "./NewSiteClient";

export default function NewSitePage() { return <NewSiteClient agreement={agreementTemplates.site_agreement.body} consent={agreementTemplates.staff_consent.body} />; }
