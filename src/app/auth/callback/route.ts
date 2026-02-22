import { NextResponse } from "next/server";
import { sanitizeNextPath, shouldShowOnboarding, toOnboardingPath } from "@/lib/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const nextParam = url.searchParams.get("next");
    const nextPath = sanitizeNextPath(nextParam, "/");

    if (code) {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            const loginUrl = new URL("/login", url.origin);
            loginUrl.searchParams.set("error", "oauth_callback_failed");
            return NextResponse.redirect(loginUrl);
        }

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (shouldShowOnboarding(user)) {
            const onboardingPath = toOnboardingPath(nextPath);
            return NextResponse.redirect(new URL(onboardingPath, url.origin));
        }
    }

    return NextResponse.redirect(new URL(nextPath, url.origin));
}
