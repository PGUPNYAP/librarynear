import "server-only";

import { supabaseServer } from "@/lib/supabase-server";

/**
 * Calls a set-returning RPC and pages through every row. PostgREST caps each
 * response at 1000 rows, including RPC results.
 */
export async function rpcAll<T>(fn: string, args: Record<string, unknown>, maxRows = 20_000) {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await supabaseServer
      .rpc(fn as never, args as never)
      .range(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { data: rows, error: null };
}
