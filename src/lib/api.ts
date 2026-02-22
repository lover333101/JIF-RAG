/* --- API client for Jiff backend --- */

import type {
    AccountSummary,
    ChatRequest,
    ChatResponse,
    ConversationRecord,
    IndexInfo,
    QuotaSummary,
    StoredMessageRecord,
} from "@/types/chat";

const BASE_URL = "/api";

class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "Unknown error");
        throw new ApiError(body, res.status);
    }

    return res.json();
}

function normalizeIndexNames(raw: unknown): string[] {
    const collect = (value: unknown): string[] => {
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === "string") {
                        return item;
                    }
                    if (
                        item &&
                        typeof item === "object" &&
                        "name" in item &&
                        typeof (item as { name?: unknown }).name === "string"
                    ) {
                        return (item as { name: string }).name;
                    }
                    return "";
                })
                .filter(Boolean);
        }

        if (value && typeof value === "object") {
            const record = value as Record<string, unknown>;
            if ("indexes" in record) {
                return collect(record.indexes);
            }
            if ("data" in record) {
                return collect(record.data);
            }
            if ("items" in record) {
                return collect(record.items);
            }
            if ("names" in record) {
                return collect(record.names);
            }
        }

        return [];
    };

    const seen = new Set<string>();
    for (const name of collect(raw)) {
        const trimmed = name.trim();
        if (trimmed) {
            seen.add(trimmed);
        }
    }
    return [...seen];
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
    return request<ChatResponse>("/chat", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function checkHealth(): Promise<{ status: string }> {
    return request<{ status: string }>("/health");
}

export async function getIndexes(): Promise<IndexInfo[]> {
    try {
        const data = await request<unknown>("/indexes");
        return normalizeIndexNames(data).map((name) => ({ name }));
    } catch {
        // /indexes endpoint is optional - fallback gracefully.
        return [];
    }
}

export async function getAccountSummary(): Promise<AccountSummary> {
    return request<AccountSummary>("/account/summary");
}

export async function getQuotaSummary(): Promise<QuotaSummary> {
    return request<QuotaSummary>("/quota");
}

export async function listConversations(): Promise<ConversationRecord[]> {
    const data = await request<{ conversations?: ConversationRecord[] }>(
        "/conversations"
    );
    return Array.isArray(data.conversations) ? data.conversations : [];
}

export async function createConversation(payload?: {
    id?: string;
    title?: string;
    active_index_names?: string[];
}): Promise<ConversationRecord> {
    const data = await request<{ conversation: ConversationRecord }>(
        "/conversations",
        {
            method: "POST",
            body: JSON.stringify(payload ?? {}),
        }
    );
    return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
    await request<{ ok: true }>(`/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
}

export async function getConversationMessages(
    id: string
): Promise<StoredMessageRecord[]> {
    const data = await request<{ messages?: StoredMessageRecord[] }>(
        `/conversations/${encodeURIComponent(id)}/messages`
    );
    return Array.isArray(data.messages) ? data.messages : [];
}

export { ApiError };
