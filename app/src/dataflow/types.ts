// Core types for the UI-independent recording upload pipeline.

export type ClipState =
  | 'recorded'
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'error';

/** Durable checkpoints for a resumable upload. */
export type UploadStage = 'pending' | 'manifested' | 'registered';

export interface SourceFileIntegrity {
  name: string;
  bytes: number;
  sha256: string;
}

export interface Clip {
  /** Local ledger key until the server-issued unit id is adopted. */
  id: string;
  state: ClipState;
  /** Recording completion time (ms epoch). */
  createdAt: number;
  recordingConfigId?: string;
  sessionDir?: string;
  stage?: UploadStage;

  /** Stable recording-unit identity, independent of file bytes and delivery format. */
  unitId?: string;
  /** Size of the primary rgb.mp4. */
  videoBytes?: number;
  /** Integrity of every source file after metadata receives unit_id. */
  sourceManifestSha256?: string;
  sourceFiles?: SourceFileIntegrity[];

  consentEventId?: string;
  durationMs?: number | null;
  deviceModel?: string | null;
  errorMessage?: string | null;
  uploadProgress?: number;
}

export interface SourceManifestResult {
  unitId: string;
  videoBytes: number;
  sourceManifestSha256: string;
  sourceFiles: SourceFileIntegrity[];
  files: Record<string, string>;
}

export interface UploadInput {
  unitId: string;
  recordingConfig: string;
  sourceManifestSha256: string;
  sourceFiles: SourceFileIntegrity[];
  files: Record<string, string>;
}

export interface UploadResult {
  uploadedKeys: string[];
}

export interface RegisterInput {
  unitId: string;
  videoBytes: number;
  sourceManifestSha256: string;
  sourceFiles: SourceFileIntegrity[];
  recordingConfig: string;
  durationMs?: number | null;
  deviceModel?: string | null;
  consentEventId?: string | null;
}

export interface RegisterResult {
  clipId: string;
}

export interface ServerClipStatus {
  unitId: string;
  createdAt?: string;
  durationMs?: number | null;
  recordingConfig?: string | null;
  deviceModel?: string | null;
  videoBytes?: number | null;
  sourceManifestSha256?: string | null;
  sourceFiles?: SourceFileIntegrity[] | null;
  consentEventId?: string | null;
}
