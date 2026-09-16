import InviteClient from "./InviteClient";
import { staffConsentDocument, staffConsentConfirmations } from "@/lib/staff-consent-confirmations";
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return <InviteClient token={(await params).token} agreement={staffConsentDocument} confirmations={staffConsentConfirmations} />;
}
