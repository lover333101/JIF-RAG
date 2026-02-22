import { NextResponse } from "next/server";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
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
    const { data: convo, error: convoError } = await admin
        .from("conversations")
        .select("id,user_id")
        .eq("id", conversationId)
        .maybeSingle();
    if (convoError) {
        return NextResponse.json(
            { error: convoError.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }
    if (!convo || convo.user_id !== user.id) {
        return NextResponse.json(
            { error: "Conversation not found." },
            { status: 404, headers: { "Cache-Control": "no-store" } }
        );
    }

    const { data, error } = await admin
        .from("messages")
        .select("id,conversation_id,role,content,markdown_content,citations,created_at")
        .eq("user_id", user.id)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
    if (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    return NextResponse.json(
        { messages: data ?? [] },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
