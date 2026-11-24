import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../src/lib/config";

test("missing email config does not invent a recipient", () => {
  const config = readConfig({});
  assert.equal(config.alertEmail, null);
  assert.equal(config.resendApiKey, null);
  assert.equal(config.dryRun, false);
  assert.equal(config.dropThresholdPct, 20);
});

test("a blank email is treated as unset", () => {
  const config = readConfig({ ALERT_EMAIL: "   " });
  assert.equal(config.alertEmail, null);
});

test("an invalid email is rejected", () => {
  assert.throws(
    () => readConfig({ ALERT_EMAIL: "not-an-email" }),
    /ALERT_EMAIL must be an email address/
  );
});

test("a Resend key requires an inbox", () => {
  assert.throws(
    () => readConfig({ RESEND_API_KEY: "test-key" }),
    /ALERT_EMAIL is required/
  );
});

test("dry-run and browser channel are explicit", () => {
  const config = readConfig({
    ALERT_EMAIL: "alerts@example.com",
    ALERT_DRY_RUN: "1",
    PW_CHANNEL: "chromium",
  });
  assert.equal(config.alertEmail, "alerts@example.com");
  assert.equal(config.dryRun, true);
  assert.equal(config.pwChannel, "chromium");
  assert.throws(
    () => readConfig({ PW_CHANNEL: "firefox" }),
    /PW_CHANNEL must be chrome or chromium/
  );
});
