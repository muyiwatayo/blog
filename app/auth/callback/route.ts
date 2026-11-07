import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next") || "/dashboard";
  const fallbackUrl = new URL("/dashboard", requestUrl.origin);
  const candidateUrl =
    nextPath.startsWith("/") && URL.canParse(nextPath, requestUrl.origin)
      ? new URL(nextPath, requestUrl.origin)
      : fallbackUrl;
  const nextUrl =
    candidateUrl.origin === requestUrl.origin ? candidateUrl : fallbackUrl;

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=confirmation", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=confirmation", requestUrl.origin));
  }

  return NextResponse.redirect(nextUrl);
}
