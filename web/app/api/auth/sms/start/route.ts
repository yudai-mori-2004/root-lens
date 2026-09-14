import { z } from "zod";
import { sendSmsCode } from "@/lib/sms-auth";

const bodySchema = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "国番号を含む電話番号を入力してください。" }, { status: 400 });
  try {
    await sendSmsCode(parsed.data.phone);
    return Response.json({ sent: true });
  } catch {
    return Response.json({ error: "確認コードを送信できませんでした。しばらくしてからお試しください。" }, { status: 503 });
  }
}
