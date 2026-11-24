import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/login/route";
import { readConfig } from "../src/lib/config";
import { proxy } from "../src/proxy";
import {
  passwordsMatch,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "../src/lib/session";

const SECRET = "test-session-secret";
const PASSWORD = "correct horse";

function withAuthEnv(run: () => Promise<void> | void): Promise<void> | void {
  const previous = {
    APP_PASSWORD: process.env.APP_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  process.env.APP_PASSWORD = PASSWORD;
  process.env.SESSION_SECRET = SECRET;
  const finish = () => {
    if (previous.APP_PASSWORD === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = previous.APP_PASSWORD;
    if (previous.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous.SESSION_SECRET;
  };
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(finish);
    }
    finish();
  } catch (err) {
    finish();
    throw err;
  }
}

function cookieValue(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

describe("session gate", { concurrency: false }, () => {
test("a good login sets a cookie that passes the gate", async () => {
  await withAuthEnv(async () => {
    const res = await POST(
      new Request("http://localhost/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      })
    );
    assert.equal(res.status, 200);
    const header = res.headers.get("set-cookie");
    assert.match(header ?? "", /httponly/i);
    assert.match(header ?? "", /samesite=lax/i);
    const token = cookieValue(header);
    assert.ok(token);
    assert.equal(token.includes(PASSWORD), false);
    assert.equal(verifySession(SECRET, token, Date.now()), true);

    const allowed = proxy(
      new NextRequest("http://localhost/", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      })
    );
    assert.equal(allowed.headers.get("location"), null);
    assert.notEqual(allowed.status, 401);
  });
});

test("a wrong password does not set a session", async () => {
  await withAuthEnv(async () => {
    const res = await POST(
      new Request("http://localhost/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "nope" }),
      })
    );
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(passwordsMatch("nope", PASSWORD), false);
    assert.equal(passwordsMatch(PASSWORD, PASSWORD), true);
  });
});

test("a tampered or expired cookie is rejected", async () => {
  await withAuthEnv(async () => {
    const now = Date.now();
    const token = signSession(SECRET, now + 60_000);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const expired = signSession(SECRET, now - 1_000);
    const [prefix, expiry, mac] = token.split(".");
    const extended = `${prefix}.${Number(expiry) + 86_400_000}.${mac}`;

    assert.equal(verifySession(SECRET, tampered, now), false);
    assert.equal(verifySession(SECRET, expired, now), false);
    assert.equal(verifySession(SECRET, extended, now), false);

    for (const bad of [tampered, expired]) {
      const res = proxy(
        new NextRequest("http://localhost/watch", {
          headers: { cookie: `${SESSION_COOKIE}=${bad}` },
        })
      );
      const location = res.headers.get("location");
      assert.ok(location);
      assert.equal(new URL(location).pathname, "/login");
    }

    const api = proxy(
      new NextRequest("http://localhost/api/items", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${tampered}` },
      })
    );
    assert.equal(api.status, 401);
  });
});

test("health stays open and a missing cookie redirects", async () => {
  await withAuthEnv(async () => {
    const health = proxy(new NextRequest("http://localhost/api/health"));
    assert.equal(health.headers.get("location"), null);
    assert.notEqual(health.status, 401);

    const page = proxy(new NextRequest("http://localhost/"));
    const location = page.headers.get("location");
    assert.ok(location);
    assert.equal(new URL(location).pathname, "/login");
  });
});

test("the session cookie is secure only in production", () => {
  assert.equal(sessionCookieOptions("production").secure, true);
  assert.equal(sessionCookieOptions("production").httpOnly, true);
  assert.equal(sessionCookieOptions("production").sameSite, "lax");
  assert.equal(sessionCookieOptions("development").secure, false);
});

test("a password requires a session secret", () => {
  assert.throws(
    () => readConfig({ APP_PASSWORD: "secret" }),
    /SESSION_SECRET/
  );
  assert.throws(
    () => readConfig({ APP_PASSWORD: "secret", SESSION_SECRET: "short" }),
    /SESSION_SECRET/
  );
  const config = readConfig({
    APP_PASSWORD: "secret",
    SESSION_SECRET: "long-enough-secret",
  });
  assert.equal(config.appPassword, "secret");
  assert.equal(config.sessionSecret, "long-enough-secret");
});
});
