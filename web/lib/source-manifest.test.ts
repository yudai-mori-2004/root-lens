import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalSourceManifest, sourceManifestSha256 } from "./source-manifest";

describe("source manifest", () => {
  it("is stable regardless of input file order", () => {
    const files = [
      { name: "metadata.json", bytes: 12, sha256: "b".repeat(64) },
      { name: "rgb.mp4", bytes: 99, sha256: "a".repeat(64) },
    ];
    const reversed = [...files].reverse();
    expect(canonicalSourceManifest("unit_demo_20260930T044055123Z_7K2M9Q4R", files))
      .toEqual(canonicalSourceManifest("unit_demo_20260930T044055123Z_7K2M9Q4R", reversed));
    expect(sourceManifestSha256("unit_demo_20260930T044055123Z_7K2M9Q4R", files))
      .toBe(sourceManifestSha256("unit_demo_20260930T044055123Z_7K2M9Q4R", reversed));
  });

  it("hashes the exact canonical JSON bytes", () => {
    const unitId = "unit_demo_20260930T044055123Z_7K2M9Q4R";
    const files = [{ name: "rgb.mp4", bytes: 99, sha256: "a".repeat(64) }];
    const expected = createHash("sha256")
      .update(JSON.stringify(canonicalSourceManifest(unitId, files)), "utf8")
      .digest("hex");
    expect(sourceManifestSha256(unitId, files)).toBe(expected);
  });
});
