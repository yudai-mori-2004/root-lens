#!/usr/bin/env node
// Publish one verified build per platform to the shared Drive and every site folder.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { GoogleAuth } from "google-auth-library";

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const apply = args.includes("--apply");
const macPath = value("--mac");
const windowsPath = value("--windows");
if (!macPath || !windowsPath || args.some((arg) => arg.startsWith("--") && !["--mac", "--windows", "--apply"].includes(arg))) {
  throw new Error("Usage: node scripts/sync-desktop-installers.mjs --mac PATH.dmg --windows PATH.exe [--apply]");
}

const installers = await Promise.all([macPath, windowsPath].map(async (path) => {
  const name = basename(path);
  if (!/^RootLens-Import-\d+\.\d+\.\d+-macOS-(arm64|x86_64|universal2)\.dmg$/.test(name)
      && !/^RootLens-Import-Setup-\d+\.\d+\.\d+-windows-x64\.exe$/.test(name)) {
    throw new Error(`Unexpected installer filename: ${name}`);
  }
  const bytes = await readFile(path);
  return { name, bytes, md5: createHash("md5").update(bytes).digest("hex"), size: bytes.length };
}));
if (!installers[0].name.includes("-macOS-") || !installers[1].name.includes("-windows-")) {
  throw new Error("Pass the macOS installer to --mac and the Windows installer to --windows");
}
const version = (name) => name.match(/\d+\.\d+\.\d+/)[0];
function isNewer(current, requested) {
  const left = current.split(".").map(Number);
  const right = requested.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}
if (version(installers[0].name) !== version(installers[1].name)) {
  throw new Error("macOS and Windows installers must have the same version");
}

const encoded = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64;
if (!encoded) throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 is not set");
const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
const token = (await (await auth.getClient()).getAccessToken()).token;
if (!token) throw new Error("Google Drive access token is unavailable");

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...options.headers },
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}): ${url.split("?")[0]}`);
  return response;
}

const api = "https://www.googleapis.com/drive/v3";
const uploadApi = "https://www.googleapis.com/upload/drive/v3";
async function listFiles(parentId, driveId) {
  const result = [];
  let pageToken;
  do {
    const query = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`, corpora: "drive", driveId,
      includeItemsFromAllDrives: "true", supportsAllDrives: "true", pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,md5Checksum,parents,driveId)",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await (await request(`${api}/files?${query}`)).json();
    result.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return result;
}

const drives = await (await request(`${api}/drives?${new URLSearchParams({
  q: "name = 'RootLens Submit'", fields: "drives(id,name)", pageSize: "10",
})}`)).json();
if (drives.drives?.length !== 1) throw new Error("Expected exactly one RootLens Submit shared Drive");
const driveId = drives.drives[0].id;
const folderType = "application/vnd.google-apps.folder";
function onlyNamedFolder(files, name) {
  const matches = files.filter((file) => file.name === name && file.mimeType === folderType);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${name} folder`);
  return matches[0];
}
const root = await listFiles(driveId, driveId);
const collection = onlyNamedFolder(root, "現場データ収集");
const sites = (await listFiles(collection.id, driveId)).filter((file) => file.mimeType === folderType);
if (!sites.length) throw new Error("No site folders found");
let distribution = root.find((file) => file.name === "アプリ配布" && file.mimeType === folderType);
if (distribution) {
  const published = await listFiles(distribution.id, driveId);
  const publishedVersions = published
    .filter((file) => /^RootLens-Import-(Setup-)?\d+\.\d+\.\d+-(macOS|windows)-/.test(file.name))
    .map((file) => version(file.name));
  if (publishedVersions.some((current) => isNewer(current, version(installers[0].name)))) {
    throw new Error("Refusing to replace a newer published installer with an older version");
  }
}
if (!distribution && apply) {
  distribution = await (await request(`${api}/files?${new URLSearchParams({ supportsAllDrives: "true", fields: "id,name,mimeType" })}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "アプリ配布", mimeType: folderType, parents: [driveId] }),
  })).json();
}
console.log(`RootLens Submit: ${sites.map((site) => site.name).join(", ")}`);
if (!apply) {
  console.log(`Dry run: ${installers.map((file) => `${file.name} (${file.size} bytes)`).join(", ")}`);
  process.exit(0);
}

async function upload(file, parentId) {
  const query = new URLSearchParams({ uploadType: "resumable", supportsAllDrives: "true", fields: "id,name,md5Checksum" });
  const response = await request(`${uploadApi}/files?${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "application/octet-stream",
      "x-upload-content-length": String(file.size),
    },
    body: JSON.stringify({ name: file.name, parents: [parentId], mimeType: "application/octet-stream" }),
  });
  const location = response.headers.get("location");
  const target = new URL(location);
  if (target.protocol !== "https:" || target.hostname !== "www.googleapis.com"
      || target.pathname !== "/upload/drive/v3/files" || target.searchParams.get("uploadType") !== "resumable") {
    throw new Error("Drive returned an unexpected upload URL");
  }
  const uploaded = await (await fetch(location, {
    method: "PUT", headers: { "content-type": "application/octet-stream", "content-length": String(file.size) },
    body: file.bytes, redirect: "error",
  })).json();
  if (uploaded.md5Checksum !== file.md5) throw new Error(`Drive checksum mismatch for ${file.name}`);
  return uploaded;
}

async function copy(source, parentId, file) {
  const query = new URLSearchParams({ supportsAllDrives: "true", fields: "id,name,md5Checksum,parents" });
  const copied = await (await request(`${api}/files/${source.id}/copy?${query}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, parents: [parentId] }),
  })).json();
  if (copied.md5Checksum !== file.md5 || copied.parents?.[0] !== parentId) {
    throw new Error(`Drive copy verification failed for ${file.name}`);
  }
  return copied;
}

async function retireOld(files, currentId, pattern) {
  for (const previous of files.filter((file) => pattern.test(file.name) && file.id !== currentId)) {
    await request(`${api}/files/${previous.id}?supportsAllDrives=true`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }),
    });
  }
}

for (const file of installers) {
  const pattern = file.name.includes("-macOS-")
    ? /^RootLens-Import-\d+\.\d+\.\d+-macOS-(arm64|x86_64|universal2)\.dmg$/
    : /^RootLens-Import-Setup-\d+\.\d+\.\d+-windows-x64\.exe$/;
  const existing = await listFiles(distribution.id, driveId);
  let canonical = existing.find((item) => item.name === file.name && item.md5Checksum === file.md5);
  if (!canonical) canonical = await upload(file, distribution.id);
  await retireOld(existing, canonical.id, pattern);
  for (const site of sites) {
    const contents = await listFiles(site.id, driveId);
    let siteFile = contents.find((item) => item.name === file.name && item.md5Checksum === file.md5);
    if (!siteFile) siteFile = await copy(canonical, site.id, file);
    await retireOld(contents, siteFile.id, pattern);
    console.log(`${site.name}: ${file.name} verified`);
  }
}
