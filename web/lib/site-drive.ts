import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnections, sites } from "@/db/schema";
import { GoogleDriveClient } from "./google-drive";
import { googleSession } from "./google-oauth";

export async function siteDrive(siteId: string) {
  const [[site], [connection]] = await Promise.all([
    db.select().from(sites).where(eq(sites.id, siteId)).limit(1),
    db.select().from(driveConnections).where(eq(driveConnections.siteId, siteId)).limit(1),
  ]);
  if (!site || !connection) throw new Error("site Drive is not connected");
  return { site, drive: new GoogleDriveClient(await googleSession(connection.encryptedRefreshToken)) };
}
