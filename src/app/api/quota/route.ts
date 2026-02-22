import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextUtcMidnightIso(now: Date): string {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.toISOString();
}

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    const admin = getSupabaseAdminClient();
    const now = new Date();
    const usageDate = now.toISOString().slice(0, 10);

    const { data: limitRow, error: limitError } = await admin
        .from("user_limits")
        .select("daily_limit")
        .eq("user_id", user.id)
        .maybeSingle();
    if (limitError) {
        return NextResponse.json(
            { error: limitError.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    const { data: usageRow, error: usageError } = await admin
        .from("daily_usage")
        .select("request_count")
        .eq("user_id", user.id)
        .eq("usage_date", usageDate)
        .maybeSingle();
    if (usageError) {
        return NextResponse.json(
            { error: usageError.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    const limit =
        limitRow && typeof limitRow.daily_limit === "number"
            ? Math.max(1, Math.floor(limitRow.daily_limit))
            : 10;
    const used =
        usageRow && typeof usageRow.request_count === "number"
            ? Math.max(0, Math.floor(usageRow.request_count))
            : 0;

    return NextResponse.json(
        {
            limit,
            used,
            remaining: Math.max(0, limit - used),
            reset_at: nextUtcMidnightIso(now),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
