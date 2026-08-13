import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  getPasswordChangeState,
  PasswordStateUnavailableError,
} from "@/lib/forced-password";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const pathname = request.nextUrl.pathname;
  const allowedWhileForced = new Set([
    "/change-password",
    "/reset-password",
    "/forgot-password",
    "/login",
    "/auth/callback",
  ]);
  if (userId && !allowedWhileForced.has(pathname)) {
    try {
      if (await getPasswordChangeState(supabase, userId)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "PASSWORD_CHANGE_REQUIRED" },
            { status: 423 },
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/change-password";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } catch (error) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "PASSWORD_STATE_UNAVAILABLE" },
          { status: 503 },
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set(
        "error",
        error instanceof PasswordStateUnavailableError
          ? "password-state"
          : "authentication-state",
      );
      return NextResponse.redirect(url);
    }
  }
  return response;
}
