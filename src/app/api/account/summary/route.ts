import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    const admin = getSupabaseAdminClient();

    const [profileResult, countResult] = await Promise.all([
        admin
            .from("profiles")
            .select("display_name")
            .eq("id", user.id)
            .maybeSingle(),
        admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
    ]);

    if (profileResult.error) {
        return NextResponse.json(
            { error: `Profile lookup failed: ${profileResult.error.message}` },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    if (countResult.error) {
        return NextResponse.json(
            { error: `Message count lookup failed: ${countResult.error.message}` },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    return NextResponse.json(
        {
            user_id: user.id,
            email: user.email ?? "",
            display_name:
                profileResult.data &&
                typeof profileResult.data.display_name === "string" &&
                profileResult.data.display_name.trim()
                    ? profileResult.data.display_name.trim()
                    : null,
            message_count: countResult.count ?? 0,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
