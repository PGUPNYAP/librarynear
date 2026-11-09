import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STAFF_LOGIN_PATH = "/staff-access";

// Public paths are served lowercase only. The matcher below only invokes the
// proxy for paths that contain an uppercase letter (plus /admin), so normal
// traffic never pays for a proxy invocation.
function lowercaseRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") || pathname.startsWith("/studio") || pathname.startsWith("/api")) {
    return null;
  }
  const lower = pathname.toLowerCase();
  if (lower === pathname) return null;
  const url = request.nextUrl.clone();
  url.pathname = lower;
  return NextResponse.redirect(url, 308);
}

export async function proxy(request: NextRequest) {
  const lowercase = lowercaseRedirect(request);
  if (lowercase) return lowercase;

  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = STAFF_LOGIN_PATH;
      return NextResponse.redirect(url);
    }

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (adminEmail && user.email !== adminEmail) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = STAFF_LOGIN_PATH;
      url.searchParams.set("error", "Unauthorized. Admin access only.");
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/admin/:path*",
    // Any path with an uppercase letter, excluding Next internals, API routes,
    // the Sanity studio and static files (anything with a file extension).
    "/((?!_next/|api/|studio|.*\\.[A-Za-z0-9]+$).*[A-Z].*)",
  ],
};
