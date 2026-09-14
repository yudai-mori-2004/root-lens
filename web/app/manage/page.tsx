import type { Metadata } from "next";
import ManageClient from "./ManageClient";

export const metadata: Metadata = { title: "事業所管理", robots: { index: false, follow: false } };
export default function ManagePage() { return <ManageClient />; }
