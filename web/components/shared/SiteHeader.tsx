"use client";

import { useLocale } from "next-intl";
import NavBar from "./NavBar";

export default function SiteHeader() {
  const ja = useLocale() === "ja";
  return <NavBar
    locale={ja ? "ja" : "en"}
    items={[
      { href: "/contribute", label: ja ? "撮影に協力" : "Contribute" },
      { href: "/buy", label: ja ? "データの購入" : "Buy data" },
      { href: "/data-policy", label: ja ? "データポリシー" : "Data policy" },
    ]}
    secondaryItems={[
      { href: "/manage", label: ja ? "事業所管理" : "Manage sites" },
      { href: "/privacy", label: ja ? "プライバシーポリシー" : "Privacy policy" },
      { href: "/terms", label: ja ? "利用規約" : "Terms" },
      { href: "/safety", label: ja ? "児童保護基準" : "Child safety" },
    ]}
  />;
}
