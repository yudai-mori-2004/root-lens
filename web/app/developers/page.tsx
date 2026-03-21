import DevelopersPage from "../../components/lp/DevelopersPage";
import SiteLayout from "../../components/shared/SiteLayout";

export const metadata = {
  title: "Developers",
  description:
    "Build on Title Protocol. Open source specification, SDKs, and node software.",
};

export default function Developers() {
  return (
    <SiteLayout>
      <DevelopersPage />
    </SiteLayout>
  );
}
