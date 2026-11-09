import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { cleanupImageKitFiles } from "@/lib/server/imagekit";

/**
 * Daily (Vercel Cron, see vercel.json): delete owner photos uploaded more than
 * 24 hours ago that never became part of a submitted form.
 * Protected by CRON_SECRET; Vercel sends it as a Bearer token.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseServer
    .from("pending_uploads" as never)
    .select("file_id")
    .lt("created_at" as never, cutoff as never)
    .limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fileIds = ((data ?? []) as Array<{ file_id: string }>).map((row) => row.file_id);
  if (fileIds.length > 0) {
    await cleanupImageKitFiles(fileIds);
    await supabaseServer.from("pending_uploads" as never).delete().in("file_id" as never, fileIds as never);
  }

  return NextResponse.json({ deleted: fileIds.length });
}
