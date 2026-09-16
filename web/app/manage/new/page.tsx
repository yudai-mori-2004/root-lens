import { agreementTemplates } from "@/content/agreementTemplates.generated";
import NewSiteClient from "./NewSiteClient";

export default function NewSitePage() { return <NewSiteClient agreement={agreementTemplates.site_agreement.electronicBody} consent={agreementTemplates.staff_consent.electronicBody} />; }
