import { describe, expect, it } from "vitest";

import { sourceManifestSha256, type SourceFileIntegrity } from "./source-manifest";
import { validateRawSourceManifest } from "./raw-source";

const unitId = "unit_bakery-01_20260930T044055123Z_7K2M9Q4R";
const files: SourceFileIntegrity[] = [
  { name: "rgb.mp4", bytes: 100, sha256: "a".repeat(64) },
  { name: "frames.jsonl", bytes: 20, sha256: "b".repeat(64) },
  { name: "imu.jsonl", bytes: 30, sha256: "c".repeat(64) },
  { name: "metadata.json", bytes: 40, sha256: "d".repeat(64) },
];

describe("raw source manifest contract", () => {
  it("accepts the complete iPhone file set", () => {
    expect(validateRawSourceManifest({
      unitId,
      recordingConfig: "iphone",
      sourceFiles: files,
      sourceManifestSha256: sourceManifestSha256(unitId, files),
    })).toBeNull();
  });

  it("rejects missing, duplicate, unsupported, and altered manifests", () => {
    const cases = [
      files.filter((file) => file.name !== "imu.jsonl"),
      [...files, files[0]],
      [...files, { name: "unknown.bin", bytes: 1, sha256: "e".repeat(64) }],
    ];
    for (const sourceFiles of cases) {
      expect(validateRawSourceManifest({
        unitId,
        recordingConfig: "iphone",
        sourceFiles,
        sourceManifestSha256: sourceManifestSha256(unitId, sourceFiles),
      })).not.toBeNull();
    }
    expect(validateRawSourceManifest({
      unitId,
      recordingConfig: "iphone",
      sourceFiles: files,
      sourceManifestSha256: "f".repeat(64),
    })).toBe("source manifest SHA-256 mismatch");
  });
});
