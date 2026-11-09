/** Recent searches kept in this browser only (never sent anywhere). */
export type RecentSearch = { label: string; href: string; type: string; city?: string };

const KEY = "ln_recent_searches";
const MAX = 8;

export function readRecentSearches(): RecentSearch[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentSearch[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.href === "string" && item.href.startsWith("/")) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(item: RecentSearch): RecentSearch[] {
  const next = [item, ...readRecentSearches().filter((existing) => existing.href !== item.href)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked
  }
  return next;
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked
  }
}
