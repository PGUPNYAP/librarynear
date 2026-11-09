import "server-only";

import { getSiteUrl } from "@/lib/site-url";

/**
 * IndexNow: tells Bing (which powers ChatGPT search), Yandex and others that a
 * URL changed, so they recrawl it within minutes instead of days.
 * Enabled when INDEXNOW_KEY is set (any random 8-128 char string). The key is
 * served at /indexnow-key.txt for verification.
 */
export async function pingIndexNow(paths: string[]) {
  const key = process.env.INDEXNOW_KEY;
  if (!key || process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production") return;

  const siteUrl = getSiteUrl();
  const host = new URL(siteUrl).host;
  const urlList = [...new Set(paths.filter((path) => path.startsWith("/")).map((path) => `${siteUrl}${path}`))].slice(0, 100);
  if (urlList.length === 0) return;

  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${siteUrl}/indexnow-key.txt`, urlList }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("IndexNow ping failed:", error instanceof Error ? error.message : error);
  }
}
