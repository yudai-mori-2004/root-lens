import { describe, expect, it } from "vitest";

import testVector from "../../tests/source-manifest-v1.json";

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

  it("matches the cross-runtime test vector", () => {
    const manifest = canonicalSourceManifest(testVector.unitId, testVector.files);
    expect(JSON.stringify(manifest)).toBe(testVector.canonicalJson);
    expect(sourceManifestSha256(testVector.unitId, testVector.files)).toBe(testVector.sha256);
  });
});
