import "server-only";

import { getTranslations } from "next-intl/server";
import type { PipelineOption } from "../components/lp/sample/types";

export const DRIVE_SAMPLES_URL = "https://drive.google.com/drive/folders/13ej8wsVq3LdC99pT21mIPj5nv50mkeJM";

const R2_PUBLIC = "https://pub-494b37dbfc9645299042fcf51236d1fc.r2.dev";

const sessions = {
  arkit: {
    hash8: "24aa0d6f",
    domain: "bakery",
    stamp: "2026-07-18_0441",
    driveId: "1tUahNWo_dg9_QHYWDDTg9REK5kUUQrjB",
    range: { startSec: 14 * 60 + 49, endSec: 23 * 60 + 50 },
  },
  mentra: {
    hash8: "78c34fce",
    domain: "bakery",
    stamp: "2026-08-14_0235",
  },
} as const;

function stampLabel(stamp: string): string {
  const [date, hm] = stamp.split("_");
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)} ${hm.slice(0, 2)}:${hm.slice(2)}`;
}

function assetsFor(slug: string, hasLidar: boolean) {
  const base = `${R2_PUBLIC}/lp-sample/${slug}`;
  return {
    slug,
    rgb: `${base}/rgb.mp4`,
    depth: hasLidar ? `${base}/depth.mp4` : null,
    mesh: hasLidar ? `${base}/mesh.glb` : null,
    trajectory: `${base}/trajectory.json`,
    timeseries: `${base}/timeseries.json`,
    summary: `${base}/summary.json`,
  };
}

export async function buildSamplePipelines(): Promise<PipelineOption[]> {
  const t = await getTranslations("pages.sample.pipelines");
  const td = await getTranslations("pages.sample.domains");
  const arkit = sessions.arkit;
  const mentra = sessions.mentra;
  const mentraAssets = assetsFor(mentra.hash8, false);

  return [
    {
      id: "arkit",
      label: t("arkit.label"),
      description: t("arkit.description"),
      available: true,
      sessions: [{
        id: arkit.hash8,
        domainLabel: td(arkit.domain),
        when: stampLabel(arkit.stamp),
        assets: assetsFor(arkit.hash8, true),
        drive: {
          path: `samples/${arkit.domain}/arkit/${arkit.stamp}_${arkit.hash8}`,
          url: `https://drive.google.com/drive/folders/${arkit.driveId}`,
        },
        range: arkit.range,
      }],
    },
    {
      id: "mentra",
      label: t("mentra.label"),
      description: t("mentra.description"),
      available: true,
      sessions: [{
        id: mentra.hash8,
        domainLabel: td(mentra.domain),
        when: stampLabel(mentra.stamp),
        assets: mentraAssets,
        drive: {
          path: `public sample/${mentra.hash8}`,
          url: mentraAssets.rgb,
        },
        range: { startSec: 0, endSec: 65.03662 },
      }],
    },
  ];
}
