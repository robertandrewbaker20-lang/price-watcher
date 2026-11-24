import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readConfig } from "@/lib/config";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export function proxy(request: NextRequest) {
  const config = readConfig(process.env);
  if (!config.appPassword || !config.sessionSecret) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (
    cookie &&
    verifySession(config.sessionSecret, cookie, Date.now())
  ) {
    return NextResponse.next();
  }

  const isPageRequest = request.method === "GET" || request.method === "HEAD";
  if (pathname.startsWith("/api") || !isPageRequest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
