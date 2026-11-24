import { NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import {
  passwordsMatch,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionExpiry,
  signSession,
} from "@/lib/session";

export async function POST(request: Request) {
  const config = readConfig(process.env);
  if (!config.appPassword || !config.sessionSecret) {
    return NextResponse.json({ ok: true });
  }

  let password = "";
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && "password" in raw && typeof raw.password === "string") {
      password = raw.password;
    }
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!passwordsMatch(password, config.appPassword)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = signSession(config.sessionSecret, sessionExpiry(Date.now()));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(process.env.NODE_ENV));
  return res;
}
