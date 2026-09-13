import { createHash } from "node:crypto";

export const SHA256_RE = /^[0-9a-f]{64}$/;

export interface SourceFileIntegrity {
  name: string;
  bytes: number;
  sha256: string;
}

export interface SourceManifest {
  schema: "io.rootlens.source-manifest.v1";
  unit_id: string;
  files: SourceFileIntegrity[];
}

export function canonicalSourceManifest(unitId: string, files: SourceFileIntegrity[]): SourceManifest {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    schema: "io.rootlens.source-manifest.v1",
    unit_id: unitId,
    files: sorted.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  };
}

export function sourceManifestSha256(unitId: string, files: SourceFileIntegrity[]): string {
  const manifest = canonicalSourceManifest(unitId, files);
  return createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
}
