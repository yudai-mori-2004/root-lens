import { describe, expect, it } from "vitest";

import { RAW_SESSION_MANIFEST, rawSessionFileKey } from "./r2-keys";

describe("raw upload keys", () => {
  it("uses the recording-unit raw prefix", () => {
    const unitId = "unit_bakery-01_20260930T044055123Z_7K2M9Q4R";
    expect(rawSessionFileKey(unitId, "frames.jsonl")).toBe(
      `raw/${unitId}/frames.jsonl`,
    );
  });
});

describe("iPhone RGB+IMU raw upload contract", () => {
  it("presigns its complete four-file source manifest", () => {
    expect(RAW_SESSION_MANIFEST.iphone).toEqual([
      { filename: "rgb.mp4", contentType: "video/mp4", required: true },
      { filename: "frames.jsonl", contentType: "application/x-ndjson", required: true },
      { filename: "imu.jsonl", contentType: "application/x-ndjson", required: true },
      { filename: "metadata.json", contentType: "application/json", required: true },
    ]);
  });
});

describe("ARKit raw upload contract", () => {
  it("presigns the complete current iPhone delivery manifest", () => {
    expect(RAW_SESSION_MANIFEST.arkit).toEqual([
      { filename: "rgb.mp4", contentType: "video/mp4", required: true },
      { filename: "frames.jsonl", contentType: "application/x-ndjson", required: true },
      { filename: "realtime_handpose.jsonl", contentType: "application/x-ndjson", required: false },
      { filename: "imu.jsonl", contentType: "application/x-ndjson", required: true },
      { filename: "metadata.json", contentType: "application/json", required: true },
      { filename: "depth.tar", contentType: "application/x-tar", required: false },
      { filename: "pointcloud.jsonl", contentType: "application/x-ndjson", required: false },
      { filename: "mesh.jsonl", contentType: "application/x-ndjson", required: false },
      { filename: "arkit_imu.jsonl", contentType: "application/x-ndjson", required: false },
      { filename: "device_metrics.jsonl", contentType: "application/x-ndjson", required: false },
    ]);
  });
});
