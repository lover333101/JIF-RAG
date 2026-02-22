import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeIndexNames(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out = new Set<string>();
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (trimmed) out.add(trimmed);
    }
    return [...out];
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
    const { data, error } = await admin
        .from("conversations")
        .select("id,title,active_index_names,created_at,updated_at")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });

    if (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    const rows = Array.isArray(data) ? data : [];
    const validRows = rows.filter(
        (row) => typeof row?.id === "string" && isValidConversationId(row.id)
    );

    return NextResponse.json(
        { conversations: validRows },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }

    const idInput =
        typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
    if (idInput && !isValidConversationId(idInput)) {
        return NextResponse.json(
            { error: "Conversation id must be a valid UUID." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const id = idInput || randomUUID();
    const title =
        typeof body.title === "string" && body.title.trim()
            ? body.title.trim().slice(0, 120)
            : "New Session";
    const activeIndexNames = normalizeIndexNames(body.active_index_names);

    const admin = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
        .from("conversations")
        .insert({
            id,
            user_id: user.id,
            title,
            active_index_names: activeIndexNames,
            created_at: now,
            updated_at: now,
        })
        .select("id,title,active_index_names,created_at,updated_at")
        .single();

    if (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    return NextResponse.json(
        { conversation: data },
        { status: 201, headers: { "Cache-Control": "no-store" } }
    );
}
