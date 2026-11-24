import { NextResponse } from "next/server";

/** Lightweight health check for Render / load balancers (no auth). */
export async function GET() {
  return NextResponse.json({ ok: true, service: "price-watcher" });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
