import NavBar from "./NavBar";
import SiteFooter from "./SiteFooter";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavBar />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
