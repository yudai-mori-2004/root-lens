import { randomUUID } from "node:crypto";
import { sha256 } from "./encoding";
import type { GoogleAccountSession } from "./google-oauth";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  driveId?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
  size?: string;
  sha256Checksum?: string;
};

export class GoogleDriveClient {
  constructor(
    private readonly session: GoogleAccountSession,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.session.accessToken}`);
    const response = await this.request(url, { ...init, headers, redirect: "error" });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
    return response;
  }

  async file(fileId: string): Promise<DriveFile> {
    const query = new URLSearchParams({
      supportsAllDrives: "true",
      fields: "id,name,mimeType,parents,driveId,trashed,appProperties,size,sha256Checksum",
    });
    return this.send(`${API}/files/${encodeURIComponent(fileId)}?${query}`).then((response) => response.json());
  }

  async fileOrNull(fileId: string): Promise<DriveFile | null> {
    const query = new URLSearchParams({
      supportsAllDrives: "true",
      fields: "id,name,mimeType,parents,driveId,trashed,appProperties,size,sha256Checksum",
    });
    const headers = new Headers({ authorization: `Bearer ${this.session.accessToken}` });
    const response = await this.request(`${API}/files/${encodeURIComponent(fileId)}?${query}`, {
      headers, redirect: "error",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
    return response.json();
  }

  async generateId(): Promise<string> {
    const query = new URLSearchParams({ count: "1", space: "drive" });
    const value = await this.send(`${API}/files/generateIds?${query}`).then((response) => response.json()) as { ids?: unknown };
    if (!Array.isArray(value.ids) || value.ids.length !== 1 || typeof value.ids[0] !== "string") {
      throw new Error("Drive returned no file id");
    }
    return value.ids[0];
  }

  async createFolder(input: {
    id: string;
    name: string;
    parentId: string;
    appProperties: Record<string, string>;
  }): Promise<DriveFile> {
    const query = new URLSearchParams({ supportsAllDrives: "true", fields: "id,name,mimeType,parents,driveId,trashed,appProperties" });
    return this.send(`${API}/files?${query}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [input.parentId],
        appProperties: input.appProperties,
      }),
    }).then((response) => response.json());
  }

  async startResumableUpload(input: {
    id: string;
    name: string;
    bytes: number;
    mimeType: string;
    parentId: string;
    appProperties: Record<string, string>;
  }): Promise<string> {
    const query = new URLSearchParams({ uploadType: "resumable", supportsAllDrives: "true", fields: "id" });
    const response = await this.send(`${UPLOAD_API}/files?${query}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": input.mimeType,
        "x-upload-content-length": String(input.bytes),
      },
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        parents: [input.parentId],
        appProperties: input.appProperties,
      }),
    });
    const location = response.headers.get("location");
    if (!location) throw new Error("Drive returned no resumable upload URL");
    const url = new URL(location);
    if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com"
        || url.pathname !== "/upload/drive/v3/files" || url.searchParams.get("uploadType") !== "resumable"
        || !url.searchParams.get("upload_id")) {
      throw new Error("Drive returned an invalid resumable upload URL");
    }
    return location;
  }

  async assertFolder(fileId: string, sharedDriveId: string): Promise<void> {
    const file = await this.file(fileId);
    if (file.mimeType !== "application/vnd.google-apps.folder" || file.trashed || file.driveId !== sharedDriveId) {
      throw new Error("Configured Drive folder is not in the expected shared drive");
    }
  }

  async uploadPdf(input: {
    id: string;
    name: string;
    bytes: Uint8Array;
    parentId: string;
    sharedDriveId: string;
    appProperties: Record<string, string>;
  }): Promise<{ fileId: string; sha256: string }> {
    await this.assertFolder(input.parentId, input.sharedDriveId);
    const expected = sha256(input.bytes);
    const existing = await this.fileOrNull(input.id);
    if (existing) {
      const propertiesMatch = Object.entries(input.appProperties)
        .every(([key, value]) => existing.appProperties?.[key] === value);
      if (existing.name !== input.name || existing.mimeType !== "application/pdf"
          || existing.parents?.[0] !== input.parentId || existing.driveId !== input.sharedDriveId
          || existing.trashed || existing.size !== String(input.bytes.length) || !propertiesMatch
          || sha256(await this.download(input.id)) !== expected) {
        throw new Error("Existing Drive agreement file does not match its record");
      }
      return { fileId: input.id, sha256: expected };
    }
    const boundary = `rootlens-${randomUUID()}`;
    const metadata = JSON.stringify({
      id: input.id,
      name: input.name,
      mimeType: "application/pdf",
      parents: [input.parentId],
      appProperties: input.appProperties,
    });
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([head, Buffer.from(input.bytes), tail]);
    const query = new URLSearchParams({ uploadType: "multipart", supportsAllDrives: "true", fields: "id" });
    const uploaded = await this.send(`${UPLOAD_API}/files?${query}`, {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    }).then((response) => response.json()) as { id?: unknown };
    if (typeof uploaded.id !== "string") throw new Error("Drive upload returned no file id");
    const downloaded = await this.download(uploaded.id);
    if (sha256(downloaded) !== expected) throw new Error("Drive file verification failed");
    return { fileId: uploaded.id, sha256: expected };
  }

  async download(fileId: string): Promise<Uint8Array> {
    const query = new URLSearchParams({ alt: "media", supportsAllDrives: "true" });
    const response = await this.send(`${API}/files/${encodeURIComponent(fileId)}?${query}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
