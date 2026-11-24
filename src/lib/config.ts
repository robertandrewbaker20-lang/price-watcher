import { z } from "zod";
import { DROP_THRESHOLD_PCT } from "./domain";

export { DROP_THRESHOLD_PCT };

const DEFAULT_FROM = "Price Watcher <onboarding@resend.dev>";

const MIN_SESSION_SECRET = 16;

export type AppConfig = {
  alertEmail: string | null;
  alertFrom: string;
  resendApiKey: string | null;
  dryRun: boolean;
  dataDir: string | null;
  pwChannel: "chrome" | "chromium" | null;
  appPassword: string | null;
  sessionSecret: string | null;
  dropThresholdPct: number;
};

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? undefined : trimmed;
}

export function readConfig(
  env: Readonly<Record<string, string | undefined>>
): AppConfig {
  const alertEmail = blankToUndefined(env.ALERT_EMAIL);
  if (alertEmail !== undefined && !z.email().safeParse(alertEmail).success) {
    throw new Error(
      "Invalid configuration: ALERT_EMAIL must be an email address"
    );
  }

  const resendApiKey = blankToUndefined(env.RESEND_API_KEY) ?? null;
  if (resendApiKey && !alertEmail) {
    throw new Error(
      "Invalid configuration: ALERT_EMAIL is required when RESEND_API_KEY is set"
    );
  }

  const dryRaw = blankToUndefined(env.ALERT_DRY_RUN)?.toLowerCase();
  const channelRaw = blankToUndefined(env.PW_CHANNEL);
  if (
    channelRaw !== undefined &&
    channelRaw !== "chrome" &&
    channelRaw !== "chromium"
  ) {
    throw new Error(
      "Invalid configuration: PW_CHANNEL must be chrome or chromium"
    );
  }

  const appPassword = blankToUndefined(env.APP_PASSWORD) ?? null;
  const sessionSecret = blankToUndefined(env.SESSION_SECRET) ?? null;
  if (appPassword && (!sessionSecret || sessionSecret.length < MIN_SESSION_SECRET)) {
    throw new Error(
      "Invalid configuration: SESSION_SECRET of at least 16 characters is required when APP_PASSWORD is set"
    );
  }

  return {
    alertEmail: alertEmail ?? null,
    alertFrom: blankToUndefined(env.ALERT_FROM) ?? DEFAULT_FROM,
    resendApiKey,
    dryRun: dryRaw === "1" || dryRaw === "true" || dryRaw === "yes",
    dataDir: blankToUndefined(env.DATA_DIR) ?? null,
    pwChannel: channelRaw === "chrome" || channelRaw === "chromium" ? channelRaw : null,
    appPassword,
    sessionSecret,
    dropThresholdPct: DROP_THRESHOLD_PCT,
  };
}
