"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const STAFF_LOGIN_PATH = "/staff-access";

export async function login(formData: FormData) {
  const ip = getClientIp(await headers());
  const rateCheck = await rateLimit(ip, RATE_LIMITS.staffLogin);
  if (!rateCheck.success) {
    redirect(`${STAFF_LOGIN_PATH}?error=` + encodeURIComponent("Too many login attempts. Please try again later."));
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || email.length > 320 || !password || password.length > 128) {
    redirect(`${STAFF_LOGIN_PATH}?error=` + encodeURIComponent("Invalid email or password."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message to avoid account enumeration; details stay server-side.
    console.error("Staff login failed:", error.message);
    redirect(`${STAFF_LOGIN_PATH}?error=` + encodeURIComponent("Invalid email or password."));
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(STAFF_LOGIN_PATH);
}
