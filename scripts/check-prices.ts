import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run check -- [--dry-run]

Check every active product. A price observation is stored when the price, stock, size, or error changed.
Running the check again on the same result does not add a row or send another alert.

  --dry-run   Record the alert and do not call Resend
`);
  process.exit(0);
}

if (args.includes("--dry-run")) {
  process.env.ALERT_DRY_RUN = "1";
}

function loggedOnly(note: string | null): boolean {
  return note === "dry-run" || note === "RESEND_API_KEY not set";
}

function lineFor(result: {
  title: string | null;
  itemId: string;
  error?: string;
  alerted: boolean;
  emailed: boolean;
  emailNote: string | null;
  recorded: boolean;
  price: number | null;
  alertReason: string | null;
}): string {
  const name = result.title ?? result.itemId;
  if (result.error) return `- ${name}: ERROR ${result.error}`;
  const price = result.price == null ? "n/a" : `$${result.price.toFixed(2)}`;
  if (result.alerted) {
    const delivery = result.emailed
      ? "email sent"
      : loggedOnly(result.emailNote)
        ? "logged, email not sent"
        : `email failed: ${result.emailNote ?? "unknown error"}`;
    return `- ${name}: ALERT ${price}: ${result.alertReason ?? "price drop"} (${delivery})`;
  }
  if (result.recorded) return `- ${name}: recorded ${price}`;
  return `- ${name}: unchanged ${price}`;
}

async function main() {
  const { readConfig } = await import("../src/lib/config");
  readConfig(process.env);

  const { checkAllActive } = await import("../src/lib/check");
  const { closeBrowser } = await import("../src/lib/scrapers/browser");

  console.log(`[price-watcher] Checking active products ${new Date().toISOString()}`);
  const results = await checkAllActive();

  if (results.length === 0) {
    console.log("No active products. Add one in the app, then run this again.");
  }

  for (const result of results) {
    console.log(lineFor(result));
  }

  const recorded = results.filter((result) => result.recorded).length;
  const unchanged = results.filter(
    (result) => !result.recorded && !result.error
  ).length;
  const alerts = results.filter((result) => result.alerted).length;
  const errors = results.filter((result) => result.error).length;
  const mailFailures = results.filter(
    (result) => result.alerted && !result.emailed && !loggedOnly(result.emailNote)
  ).length;
  console.log(
    `[price-watcher] Done. ${results.length} product(s). recorded ${recorded}, unchanged ${unchanged}, alerts ${alerts}, errors ${errors}, email failures ${mailFailures}.`
  );

  await closeBrowser();
  if (errors > 0 || mailFailures > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  const { closeBrowser } = await import("../src/lib/scrapers/browser");
  await closeBrowser();
  process.exit(1);
});
