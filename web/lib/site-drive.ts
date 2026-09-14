import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { GoogleDriveClient } from "./google-drive";
import { googleDriveSession } from "./google-drive-session";

export async function siteDrive(siteId: string) {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new Error("site does not exist");
  return { site, drive: new GoogleDriveClient(await googleDriveSession()) };
}
