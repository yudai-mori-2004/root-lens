import { getLocale } from "next-intl/server";
import NavBar from "./NavBar";
import SiteFooter from "./SiteFooter";

// 公開サイトの入口は、撮影先・購入者・データ運用の三者に固定する。
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const ja = locale === "ja";
  const navItems = [
    { href: "/contribute", label: ja ? "撮影に協力" : "Contribute" },
    { href: "/buy", label: ja ? "データの購入" : "Buy data" },
    { href: "/data-policy", label: ja ? "データポリシー" : "Data policy" },
  ];
  const secondaryNavItems = [
    { href: "/privacy", label: ja ? "プライバシーポリシー" : "Privacy policy" },
    { href: "/terms", label: ja ? "利用規約" : "Terms" },
    { href: "/safety", label: ja ? "児童保護基準" : "Child safety" },
  ];

  return (
    <>
      <NavBar items={navItems} secondaryItems={secondaryNavItems} locale={ja ? "ja" : "en"} />
      {children}
      <SiteFooter />
    </>
  );
}
