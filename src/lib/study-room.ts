import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export const STUDY_MAX_MINUTES = 180;
export const STUDY_MIN_MINUTES = 5;

const secret = () => createHash("sha256").update(`study-room:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev"}`).digest();

/** A signed start time: the server can later confirm how long a session really ran. */
export function createStartToken(now = Date.now()) {
  const payload = `${now}.${Math.random().toString(36).slice(2, 12)}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function readStartToken(token: string): { startedAt: number; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 200) return null;
  const expected = createHmac("sha256", secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const startedAt = Number(parts[0]);
  if (!Number.isFinite(startedAt)) return null;
  return { startedAt, hash: createHash("sha256").update(token).digest("hex").slice(0, 32) };
}

export type LeaderRow = { city: string; locality: string; minutes: number; sessions: number };
export type Leaderboard = { available: boolean; rows: LeaderRow[] };

function currentWeekStart() {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - day);
  return ist.toISOString().slice(0, 10);
}

async function loadLeaderboard(city: string | null): Promise<Leaderboard> {
  let query = supabaseServer
    .from("study_locality_weekly" as never)
    .select("city, locality, minutes, sessions")
    .eq("week_start" as never, currentWeekStart() as never)
    .order("minutes" as never, { ascending: false })
    .limit(20);
  if (city) query = query.eq("city" as never, city as never);
  const { data, error } = await query;
  if (error) return { available: false, rows: [] };
  return { available: true, rows: (data ?? []) as unknown as LeaderRow[] };
}

const cached = unstable_cache(loadLeaderboard, ["study-leaderboard-v1"], { revalidate: 300, tags: ["study-leaderboard"] });

export function getStudyLeaderboard(city: string | null) {
  return process.env.NODE_ENV === "development" ? loadLeaderboard(city) : cached(city);
}
