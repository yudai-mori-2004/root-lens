import { agreementTemplates } from "@/content/agreementTemplates.generated";
import InviteClient from "./InviteClient";
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return <InviteClient token={(await params).token} agreement={agreementTemplates.staff_consent.body} />;
}
