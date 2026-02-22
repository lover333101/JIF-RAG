import { NextRequest, NextResponse } from "next/server";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
    params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    const { id } = await params;
    const conversationId = (id || "").trim();
    if (!conversationId || !isValidConversationId(conversationId)) {
        return NextResponse.json(
            { error: "Conversation id must be a valid UUID." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const admin = getSupabaseAdminClient();
    const { error } = await admin
        .from("conversations")
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .eq("user_id", user.id);

    if (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    return NextResponse.json(
        { ok: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
