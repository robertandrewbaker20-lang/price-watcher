import { Resend } from "resend";
import { readConfig } from "./config";

export type EmailSendResult = {
  ok: boolean;
  delivered: boolean;
  error?: string;
};

export async function sendPriceDropEmail(params: {
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  const config = readConfig(process.env);
  if (config.dryRun) {
    return { ok: true, delivered: false, error: "dry-run" };
  }
  if (!config.resendApiKey) {
    return {
      ok: true,
      delivered: false,
      error: "RESEND_API_KEY not set",
    };
  }
  if (!config.alertEmail) {
    return { ok: false, delivered: false, error: "ALERT_EMAIL is not set" };
  }

  try {
    const resend = new Resend(config.resendApiKey);
    const { error } = await resend.emails.send({
      from: config.alertFrom,
      to: config.alertEmail,
      subject: params.subject,
      text: params.text,
      html: params.text.replace(/\n/g, "<br/>"),
    });
    if (error) {
      return { ok: false, delivered: false, error: error.message };
    }
    return { ok: true, delivered: true };
  } catch (err) {
    return {
      ok: false,
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
