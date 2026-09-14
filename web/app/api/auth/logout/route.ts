import { NextResponse } from "next/server";
import { OPERATOR_COOKIE } from "@/lib/operator-browser";

export async function POST() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(OPERATOR_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
