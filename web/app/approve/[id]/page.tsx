import type { Metadata } from "next";
import ApproveClient from "./ApproveClient";

export const metadata: Metadata = {
  title: "撮影データの提供承認 | RootLens",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApproveClient approvalId={id} />;
}
