import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PAYLOAD = "price-watcher-session";

export const SESSION_COOKIE = "pw_auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export function sessionExpiry(nowMs: number): number {
  return nowMs + SESSION_MAX_AGE_SECONDS * 1000;
}

export function signSession(secret: string, expiresAtMs: number): string {
  const body = `${PAYLOAD}.${expiresAtMs}`;
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(
  secret: string,
  token: string,
  nowMs: number
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [prefix, expiryRaw, mac] = parts;
  if (prefix !== PAYLOAD || expiryRaw === undefined || mac === undefined) {
    return false;
  }
  const expiresAt = Number(expiryRaw);
  if (!Number.isInteger(expiresAt) || expiresAt <= nowMs) return false;
  const expected = createHmac("sha256", secret)
    .update(`${prefix}.${expiryRaw}`)
    .digest("base64url");
  return macsMatch(expected, mac);
}

export function passwordsMatch(given: string, expected: string): boolean {
  const givenHash = createHash("sha256").update(given).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(givenHash, expectedHash);
}

export function sessionCookieOptions(nodeEnv: string | undefined): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: nodeEnv === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function macsMatch(expected: string, given: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const givenBytes = Buffer.from(given);
  if (expectedBytes.length !== givenBytes.length) return false;
  return timingSafeEqual(expectedBytes, givenBytes);
}
