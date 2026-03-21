import HomePage from "../components/lp/HomePage";
import SiteLayout from "../components/shared/SiteLayout";

export default async function Home() {
  return (
    <SiteLayout>
      <HomePage />
    </SiteLayout>
  );
}
