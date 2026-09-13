import { describe, expect, it } from "vitest";

import fixture from "../../fixtures/source-manifest-v1.json";

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

  it("matches the cross-runtime contract fixture", () => {
    const manifest = canonicalSourceManifest(fixture.unitId, fixture.files);
    expect(JSON.stringify(manifest)).toBe(fixture.canonicalJson);
    expect(sourceManifestSha256(fixture.unitId, fixture.files)).toBe(fixture.sha256);
  });
});
