import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import type { ActivityPoint } from "@/components/admin/activity-chart";

export const RANGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 28, label: "Last 28 days" },
  { value: 90, label: "Last 3 months" },
] as const;

export function parseRange(value: string | undefined): number {
  const parsed = Number(value);
  return RANGE_OPTIONS.some((option) => option.value === parsed) ? parsed : 28;
}

export type StaffSummary = {
  actor_user_id: string;
  total: number;
  edits: number;
  verifications: number;
  last_action_at: string | null;
};

export async function getStaffSummary(days: number | null) {
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const { data, error } = await supabaseServer.rpc("staff_activity_summary" as never, { p_since: since } as never);
  if (error) {
    console.error("staff_activity_summary failed:", error.message);
    return { rows: new Map<string, StaffSummary>(), missingRpc: true };
  }
  const rows = new Map<string, StaffSummary>();
  for (const row of (data ?? []) as StaffSummary[]) {
    rows.set(row.actor_user_id, {
      ...row,
      total: Number(row.total),
      edits: Number(row.edits),
      verifications: Number(row.verifications),
    });
  }
  return { rows, missingRpc: false };
}

export async function getDailyActivity(userId: string | null, days: number): Promise<ActivityPoint[]> {
  const { data, error } = await supabaseServer.rpc(
    "staff_activity_daily" as never,
    { p_user: userId, p_days: days } as never,
  );
  if (error) {
    console.error("staff_activity_daily failed:", error.message);
    return [];
  }
  return ((data ?? []) as Array<{ day: string; total: number; edits: number; verifications: number }>).map((row) => ({
    day: String(row.day).slice(0, 10),
    total: Number(row.total),
    edits: Number(row.edits),
    verifications: Number(row.verifications),
  }));
}
