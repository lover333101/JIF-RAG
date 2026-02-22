import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ONBOARDING_COOKIE_NAME = "jiff_onboarding_user";

export async function POST() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401 }
        );
    }

    const { error: updateError } = await supabase.auth.updateUser({
        data: {
            ...user.user_metadata,
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
        },
    });

    if (updateError) {
        return NextResponse.json(
            { error: "Failed to complete onboarding." },
            { status: 500 }
        );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ONBOARDING_COOKIE_NAME, user.id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
    });
    return response;
}
