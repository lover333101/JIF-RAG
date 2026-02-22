import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const url = new URL(request.url);
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json(
        { ok: true, redirect: `${url.origin}/login` },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
