import WhyPage from "../../components/lp/WhyPage";
import SiteLayout from "../../components/shared/SiteLayout";

export const metadata = {
  title: "Why",
  description:
    "Why content authenticity matters: deepfakes, unauthorized reposting, insurance fraud, and the structural failure of post-hoc detection.",
};

export default function Why() {
  return (
    <SiteLayout>
      <WhyPage />
    </SiteLayout>
  );
}
