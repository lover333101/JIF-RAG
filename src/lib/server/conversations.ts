import { randomUUID } from "node:crypto";
import { isValidConversationId } from "@/lib/conversation-id";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function nowIso(): string {
    return new Date().toISOString();
}

const CHAT_GENERATION_TIMEOUT_MS = 1000 * 60 * 20;

export type ChatGenerationStatus =
    | "processing"
    | "completed"
    | "failed"
    | "expired";

export interface ChatGenerationRecord {
    id: string;
    conversationId: string;
    userId: string;
    taskId: string | null;
    status: ChatGenerationStatus;
    errorMessage: string | null;
    assistantMessageId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    expiresAt: string;
}

interface ChatGenerationRow {
    id: string;
    conversation_id: string;
    user_id: string;
    task_id: string | null;
    status: ChatGenerationStatus;
    error_message: string | null;
    assistant_message_id: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    expires_at: string;
}

function toChatGenerationRecord(row: ChatGenerationRow): ChatGenerationRecord {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        userId: row.user_id,
        taskId: row.task_id,
        status: row.status,
        errorMessage: row.error_message,
        assistantMessageId: row.assistant_message_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        expiresAt: row.expires_at,
    };
}

function generationExpiresAtIso(): string {
    return new Date(Date.now() + CHAT_GENERATION_TIMEOUT_MS).toISOString();
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
        (typeof data.title !== "string" ||
            data.title.trim() === "" ||
            data.title === "New Session")
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
    matches?: unknown;
    generationId?: string;
}): Promise<{ id: string }> {
    const admin = getSupabaseAdminClient();
    const payload: Record<string, unknown> = {
        id: randomUUID(),
        conversation_id: params.conversationId,
        user_id: params.userId,
        role: params.role,
        content: params.content,
        markdown_content: params.markdownContent ?? params.content,
        citations: params.citations ?? [],
        created_at: nowIso(),
    };
    if (params.matches != null) {
        payload.matches = params.matches;
    }
    if (params.generationId) {
        payload.generation_id = params.generationId;
    }
    const { data, error } = await admin
        .from("messages")
        .insert(payload)
        .select("id")
        .single();
    if (error) {
        throw new Error(`Message persistence failed: ${error.message}`);
    }
    if (!data || typeof data.id !== "string") {
        throw new Error("Message persistence failed: missing inserted id.");
    }
    return { id: data.id };
}

export async function getAssistantMessageForGeneration(params: {
    generationId: string;
    userId: string;
}): Promise<
    | {
        id: string;
        content: string;
        markdownContent: string;
        citations: unknown;
        matches: unknown;
    }
    | null
> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
        .from("messages")
        .select("id,content,markdown_content,citations,matches")
        .eq("user_id", params.userId)
        .eq("generation_id", params.generationId)
        .eq("role", "assistant")
        .maybeSingle();
    if (error) {
        throw new Error(
            `Failed to read assistant message for generation: ${error.message}`
        );
    }
    if (!data || typeof data.id !== "string") return null;

    return {
        id: data.id,
        content: typeof data.content === "string" ? data.content : "",
        markdownContent:
            typeof data.markdown_content === "string"
                ? data.markdown_content
                : typeof data.content === "string"
                    ? data.content
                    : "",
        citations: data.citations,
        matches: data.matches,
    };
}

export async function createChatGeneration(params: {
    conversationId: string;
    userId: string;
}): Promise<ChatGenerationRecord> {
    const admin = getSupabaseAdminClient();
    const payload = {
        id: randomUUID(),
        conversation_id: params.conversationId,
        user_id: params.userId,
        status: "processing" as ChatGenerationStatus,
        created_at: nowIso(),
        updated_at: nowIso(),
        expires_at: generationExpiresAtIso(),
    };

    const { data, error } = await admin
        .from("chat_generations")
        .insert(payload)
        .select(
            "id,conversation_id,user_id,task_id,status,error_message,assistant_message_id,created_at,updated_at,completed_at,expires_at"
        )
        .single();

    if (error) {
        throw new Error(`Failed to create chat generation: ${error.message}`);
    }
    if (!data) {
        throw new Error("Failed to create chat generation: missing row.");
    }

    return toChatGenerationRecord(data as ChatGenerationRow);
}

export async function setChatGenerationTaskId(params: {
    generationId: string;
    userId: string;
    taskId: string;
}): Promise<void> {
    const admin = getSupabaseAdminClient();
    const { error } = await admin
        .from("chat_generations")
        .update({
            task_id: params.taskId,
            updated_at: nowIso(),
        })
        .eq("id", params.generationId)
        .eq("user_id", params.userId)
        .eq("status", "processing");
    if (error) {
        throw new Error(`Failed to store chat task id: ${error.message}`);
    }
}

export async function getChatGenerationById(params: {
    generationId: string;
    userId: string;
}): Promise<ChatGenerationRecord | null> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
        .from("chat_generations")
        .select(
            "id,conversation_id,user_id,task_id,status,error_message,assistant_message_id,created_at,updated_at,completed_at,expires_at"
        )
        .eq("id", params.generationId)
        .eq("user_id", params.userId)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to read chat generation: ${error.message}`);
    }
    if (!data) return null;
    return toChatGenerationRecord(data as ChatGenerationRow);
}

export async function getLatestProcessingChatGenerationForConversation(params: {
    conversationId: string;
    userId: string;
}): Promise<ChatGenerationRecord | null> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
        .from("chat_generations")
        .select(
            "id,conversation_id,user_id,task_id,status,error_message,assistant_message_id,created_at,updated_at,completed_at,expires_at"
        )
        .eq("conversation_id", params.conversationId)
        .eq("user_id", params.userId)
        .eq("status", "processing")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Failed to read latest processing generation: ${error.message}`
        );
    }
    if (!data) return null;
    return toChatGenerationRecord(data as ChatGenerationRow);
}

export async function markChatGenerationCompleted(params: {
    generationId: string;
    userId: string;
    assistantMessageId: string;
}): Promise<void> {
    const admin = getSupabaseAdminClient();
    const { error } = await admin
        .from("chat_generations")
        .update({
            status: "completed",
            assistant_message_id: params.assistantMessageId,
            error_message: null,
            updated_at: nowIso(),
            completed_at: nowIso(),
        })
        .eq("id", params.generationId)
        .eq("user_id", params.userId);
    if (error) {
        throw new Error(`Failed to mark generation completed: ${error.message}`);
    }
}

export async function markChatGenerationFailed(params: {
    generationId: string;
    userId: string;
    errorMessage: string;
    status?: "failed" | "expired";
}): Promise<void> {
    const admin = getSupabaseAdminClient();
    const status = params.status ?? "failed";
    const { error } = await admin
        .from("chat_generations")
        .update({
            status,
            error_message: params.errorMessage.slice(0, 2000),
            updated_at: nowIso(),
            completed_at: nowIso(),
        })
        .eq("id", params.generationId)
        .eq("user_id", params.userId)
        .neq("status", "completed");
    if (error) {
        throw new Error(`Failed to mark generation failed: ${error.message}`);
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

export async function getConversationHistoryForRag(
    conversationId: string,
    limit = 10
): Promise<{ role: string; content: string }[]> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
        .from("messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(`Failed to fetch conversation history: ${error.message}`);
    }

    return (data || []).reverse().map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
    }));
}
