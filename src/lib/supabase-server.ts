import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * fetch with retries for dropped connections ("TypeError: fetch failed",
 * ECONNRESET, timeouts). Only reads (GET/HEAD) are retried, so a write is
 * never sent twice. Responses with an HTTP status are returned as-is.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const retryable = method === "GET" || method === "HEAD";
  const attempts = retryable ? 3 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted) break;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

// Server-side client using the service role for trusted backend operations.
export const supabaseServer = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: fetchWithRetry },
  }
);
