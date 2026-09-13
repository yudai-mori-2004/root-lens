import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SiteLayout from "../../components/shared/SiteLayout";
import SampleViewer from "../../components/lp/sample/SampleViewer";
import { buildSamplePipelines, DRIVE_SAMPLES_URL } from "../../lib/samplePipelines";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.sample.meta");
  return { title: t("title"), description: t("description") };
}

export default async function Page() {
  const pipelines = await buildSamplePipelines();
  return (
    <SiteLayout>
      <SampleViewer pipelines={pipelines} driveUrl={DRIVE_SAMPLES_URL} />
    </SiteLayout>
  );
}
