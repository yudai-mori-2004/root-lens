import { canonicalJson, sha256 } from "./encoding";

export const SHA256_RE = /^[0-9a-f]{64}$/;

export type UnitFile = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export function sortedUnitFiles(files: readonly UnitFile[]): UnitFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

export function unitFilesSha256(unitId: string, files: readonly UnitFile[]): string {
  return sha256(canonicalJson({ unit_id: unitId, files: sortedUnitFiles(files) }));
}

export function validateUnitFiles(unitId: string, digest: string, files: readonly UnitFile[]): string | null {
  if (!unitId || !SHA256_RE.test(digest) || files.length < 1 || files.length > 1000) {
    return "invalid unit files";
  }
  const paths = new Set<string>();
  for (const file of files) {
    if (!file.path || file.path.length > 240 || file.path.startsWith("/")
        || file.path.split(/[\\/]/).includes("..") || paths.has(file.path)
        || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256_RE.test(file.sha256)) {
      return "invalid unit file";
    }
    paths.add(file.path);
  }
  return unitFilesSha256(unitId, files) === digest ? null : "unit files SHA-256 mismatch";
}
