/**
 * Anonymous search telemetry: what was typed and which result was picked.
 * Feeds the nightly job that learns aliases (e.g. "orn" -> Old Rajinder Nagar)
 * and ranks popular results higher. No personal data: a random per-tab id only.
 */
export type SearchEvent = {
  query: string;
  city: string;
  result_count: number;
  clicked_slug?: string;
  clicked_type?: string;
  clicked_label?: string;
  position?: number;
  source?: string;
};

function sessionId() {
  try {
    let id = sessionStorage.getItem("ln_search_sid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("ln_search_sid", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function logSearchEvent(event: SearchEvent) {
  const query = event.query.trim();
  if (query.length < 2 || query.toLowerCase() === "nearby") return;
  const body = JSON.stringify({ ...event, query: query.slice(0, 200), session_id: sessionId() });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/log-search", blob)) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/log-search", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}
