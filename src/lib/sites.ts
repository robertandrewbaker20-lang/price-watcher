import type { Site } from "./domain";

export function detectSite(url: string): Site {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "generic";
  }
  if (host === "duluthtrading.com" || host.endsWith(".duluthtrading.com")) {
    return "duluth";
  }
  if (host === "bambulab.com" || host.endsWith(".bambulab.com")) {
    return "bambu";
  }
  return "generic";
}
