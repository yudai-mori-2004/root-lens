import TechnologyPage from "../../components/lp/TechnologyPage";
import SiteLayout from "../../components/shared/SiteLayout";

export const metadata = {
  title: "Technology",
  description:
    "How Title Protocol separates verified attributes from content and records them as independent, trustworthy records.",
};

export default function Technology() {
  return (
    <SiteLayout>
      <TechnologyPage />
    </SiteLayout>
  );
}
