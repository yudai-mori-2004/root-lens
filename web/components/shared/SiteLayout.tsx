import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import s from "./shared.module.css";

// 公開サイトの入口は、撮影先・購入者・データ運用の三者に固定する。
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={s.siteLayout}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
