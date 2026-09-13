import { RAW_SESSION_MANIFEST, type RecordingConfigId } from "./r2-keys";
import {
  SHA256_RE,
  sourceManifestSha256,
  type SourceFileIntegrity,
} from "./source-manifest";

export function validateRawSourceManifest(input: {
  unitId: string;
  recordingConfig: RecordingConfigId;
  sourceManifestSha256: string;
  sourceFiles: SourceFileIntegrity[];
}): string | null {
  const contract = RAW_SESSION_MANIFEST[input.recordingConfig];
  const allowed = new Set<string>(contract.map((file) => file.filename));
  const required = contract.filter((file) => file.required).map((file) => file.filename);
  const names = input.sourceFiles.map((file) => file.name);
  if (new Set(names).size !== names.length) return "duplicate source filename";
  if (required.some((name) => !names.includes(name))) return "required source file missing";
  if (names.some((name) => !allowed.has(name))) return "unsupported source filename";
  if (input.sourceFiles.some((file) => (
    !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256_RE.test(file.sha256)
  ))) return "invalid source file integrity";
  if (sourceManifestSha256(input.unitId, input.sourceFiles) !== input.sourceManifestSha256) {
    return "source manifest SHA-256 mismatch";
  }
  return null;
}
