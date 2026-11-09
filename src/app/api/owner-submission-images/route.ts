import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteImageKitFile, getImageKitFileDetails, uploadImageKitFile } from "@/lib/server/imagekit";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase-server";

const MAX_OWNER_PHOTO_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const [rateCheck, dailyCheck] = await Promise.all([
    rateLimit(ip, RATE_LIMITS.ownerImageUpload),
    rateLimit(ip, RATE_LIMITS.ownerImageUploadDaily),
  ]);
  if (!rateCheck.success || !dailyCheck.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (file.size > MAX_OWNER_PHOTO_BYTES) {
    return NextResponse.json({ error: "Each photo must be under 5 MB" }, { status: 400 });
  }

  try {
    const uploaded = await uploadImageKitFile({
      file,
      fileName: file.name.replace(/[^\w.-]+/g, "-").replace(/\.{2,}/g, ".") || "owner_submission.jpg",
      folder: `/owner-submissions/${user.id}/`,
    });

    // Track the upload so it can be deleted if the form is never submitted.
    await supabaseServer
      .from("pending_uploads" as never)
      .upsert({ file_id: uploaded.fileId, url: uploaded.url, user_id: user.id } as never);

    return NextResponse.json(uploaded);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/allowed|under \d+ MB|No image/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to upload owner submission image:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { fileId?: string } | null;
  const fileId = String(body?.fileId ?? "").trim();
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  try {
    const fileDetails = await getImageKitFileDetails(fileId);
    if (!fileDetails?.filePath || !fileDetails.filePath.includes(`/owner-submissions/${user.id}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteImageKitFile(fileId);
    await supabaseServer.from("pending_uploads" as never).delete().eq("file_id" as never, fileId as never);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete owner submission image:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
