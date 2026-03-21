import AboutPage from "../../components/lp/AboutPage";
import SiteLayout from "../../components/shared/SiteLayout";

export const metadata = {
  title: "About",
  description: "RootLens: the reason we built Title Protocol.",
};

export default function About() {
  return (
    <SiteLayout>
      <AboutPage />
    </SiteLayout>
  );
}
