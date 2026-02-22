import { randomUUID } from "node:crypto";
import { isValidConversationId } from "@/lib/conversation-id";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function nowIso(): string {
    return new Date().toISOString();
}

function normalizeIndexNames(names: unknown): string[] {
    if (!Array.isArray(names)) return [];
    const out = new Set<string>();
    for (const item of names) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (trimmed) out.add(trimmed);
    }
    return [...out];
}

export async function ensureConversationOwnedByUser(
    userId: string,
    conversationId: string,
    titleSeed?: string
): Promise<void> {
    if (!isValidConversationId(conversationId)) {
        throw new Error("Conversation id must be a valid UUID.");
    }

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
        .from("conversations")
        .select("id,user_id,title")
        .eq("id", conversationId)
        .maybeSingle();
    if (error) {
        throw new Error(`Conversation lookup failed: ${error.message}`);
    }

    if (data && data.user_id !== userId) {
        throw new Error("Conversation does not belong to authenticated user.");
    }

    if (!data) {
        const title = (titleSeed || "New Session").slice(0, 120);
        const { error: insertError } = await admin.from("conversations").insert({
            id: conversationId,
            user_id: userId,
            title,
            active_index_names: [],
            created_at: nowIso(),
            updated_at: nowIso(),
        });
        if (insertError) {
            throw new Error(`Conversation create failed: ${insertError.message}`);
        }
        return;
    }

    const nextTitle = (titleSeed || "").trim().slice(0, 120);
    const patch: { updated_at: string; title?: string } = {
        updated_at: nowIso(),
    };
    if (
        nextTitle &&
        (typeof data.title !== "string" || data.title.trim() === "" || data.title === "New Session")
    ) {
        patch.title = nextTitle;
    }

    const { error: updateError } = await admin
        .from("conversations")
        .update(patch)
        .eq("id", conversationId)
        .eq("user_id", userId);
    if (updateError) {
        throw new Error(`Conversation update failed: ${updateError.message}`);
    }
}

export async function saveChatMessage(params: {
    conversationId: string;
    userId: string;
    role: "user" | "assistant";
    content: string;
    markdownContent?: string;
    citations?: unknown;
}): Promise<void> {
    const admin = getSupabaseAdminClient();
    const payload = {
        id: randomUUID(),
        conversation_id: params.conversationId,
        user_id: params.userId,
        role: params.role,
        content: params.content,
        markdown_content: params.markdownContent ?? params.content,
        citations: params.citations ?? [],
        created_at: nowIso(),
    };
    const { error } = await admin.from("messages").insert(payload);
    if (error) {
        throw new Error(`Message persistence failed: ${error.message}`);
    }
}

export async function getAllowedIndexesForUser(
    userId: string
): Promise<string[]> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
        .from("user_index_access")
        .select("index_name")
        .eq("user_id", userId);
    if (error) {
        throw new Error(`Index access lookup failed: ${error.message}`);
    }
    if (!data || data.length === 0) return [];

    const out = new Set<string>();
    for (const row of data) {
        const value =
            row && typeof row.index_name === "string" ? row.index_name : "";
        const trimmed = value.trim();
        if (trimmed) out.add(trimmed);
    }
    return [...out];
}

export function resolveActiveIndexes(params: {
    requested: unknown;
    allowed: string[];
}): string[] {
    const requested = normalizeIndexNames(params.requested);
    const allowed = normalizeIndexNames(params.allowed);

    if (allowed.length === 0) {
        return requested;
    }

    if (requested.length === 0) {
        return allowed;
    }

    const allowedSet = new Set(allowed);
    return requested.filter((name) => allowedSet.has(name));
}

export function hasUnauthorizedRequestedIndexes(params: {
    requested: unknown;
    allowed: string[];
}): boolean {
    const requested = normalizeIndexNames(params.requested);
    const allowed = normalizeIndexNames(params.allowed);
    if (allowed.length === 0 || requested.length === 0) return false;
    const allowedSet = new Set(allowed);
    return requested.some((name) => !allowedSet.has(name));
}
