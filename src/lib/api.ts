import type {
    AccountSummary,
    ChatRequest,
    ChatResponse,
    ConversationRecord,
    QuotaSummary,
    StoredMessageRecord,
    ThinkingStep,
} from "@/types/chat";
import {
    normalizeMatches,
    normalizeSources,
    normalizeQuota,
    normalizeThinkingSteps,
    normalizeResponseMode,
} from "@/lib/normalize";

const BASE_URL = "/api";

export interface ChatProgressUpdate {
    status: "processing" | "pending";
    thinkingStatus?: string;
    thinkingSteps?: ThinkingStep[];
    mode?: "auto" | "light" | "heavy";
    routingReason?: string;
}

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonText(text: string): unknown {
    if (!text.trim()) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function toErrorPayload(body: unknown, fallback: string): string {
    if (typeof body === "string" && body.trim()) {
        return body;
    }
    if (body && typeof body === "object") {
        return JSON.stringify(body);
    }
    return fallback;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    const text = await response.text().catch(() => "");
    const parsed = parseJsonText(text);

    if (!response.ok) {
        throw new ApiError(
            toErrorPayload(parsed, response.statusText || "Request failed"),
            response.status
        );
    }

    return parsed as T;
}

function toProgressUpdate(raw: unknown): ChatProgressUpdate | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const status =
        typeof record.status === "string" ? record.status.trim().toLowerCase() : "";

    if (status !== "processing" && status !== "pending") {
        return null;
    }

    const thinkingStatus =
        typeof record.thinking_status === "string" && record.thinking_status.trim()
            ? record.thinking_status.trim()
            : undefined;

    return {
        status: status as "processing" | "pending",
        thinkingStatus,
        thinkingSteps: normalizeThinkingSteps(record.thinking_steps),
        mode: normalizeResponseMode(record.mode),
        routingReason:
            typeof record.routing_reason === "string" &&
                record.routing_reason.trim()
                ? record.routing_reason.trim()
                : undefined,
    };
}

function toCompletedChatResponse(
    raw: unknown,
    fallbackQuota?: ChatResponse["quota"]
): ChatResponse | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;

    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    if (!answer) return null;

    return {
        answer,
        sources: normalizeSources(record.sources),
        matches: normalizeMatches(record.matches),
        quota: normalizeQuota(record.quota) ?? fallbackQuota,
    };
}

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 502, 503, 504]);

function isRetryablePollError(error: unknown): boolean {
    if (error instanceof ApiError) {
        return RETRYABLE_STATUS_CODES.has(error.status);
    }
    return error instanceof Error;
}

// ── SSE streaming types ──────────────────────────────────────────────

export interface StreamEvent {
    type: "progress" | "token" | "done" | "error";
    [key: string]: unknown;
}

// ── sendChat — SSE streaming with polling fallback ───────────────────

export async function sendChat(
    payload: ChatRequest,
    options?: {
        onProgress?: (progress: ChatProgressUpdate) => void;
        onToken?: (token: string) => void;
    }
): Promise<ChatResponse> {
    // Try SSE streaming first
    const response = await fetch(`${BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        const parsed = parseJsonText(text);
        throw new ApiError(
            toErrorPayload(parsed, response.statusText || "Request failed"),
            response.status
        );
    }

    const contentType = response.headers.get("content-type") || "";

    // ── SSE stream path ──
    if (contentType.includes("text/event-stream") && response.body) {
        return consumeSSEStream(response.body, options);
    }

    // ── Legacy polling fallback ──
    const text = await response.text().catch(() => "");
    const initial = parseJsonText(text);

    const immediate = toCompletedChatResponse(initial);
    if (immediate) return immediate;

    if (!initial || typeof initial !== "object") {
        throw new Error("Unexpected chat response format.");
    }

    const initialRecord = initial as Record<string, unknown>;
    const generationId =
        typeof initialRecord.generation_id === "string"
            ? initialRecord.generation_id.trim()
            : "";
    if (!generationId) {
        throw new Error("Chat request did not return generation id.");
    }

    const quota = normalizeQuota(initialRecord.quota);
    const CHAT_STATUS_POLL_INTERVAL_MS = 600;
    const CHAT_STATUS_TIMEOUT_MS = 1000 * 60 * 3;
    const deadline = Date.now() + CHAT_STATUS_TIMEOUT_MS;
    let lastPollError: unknown = null;
    let lastProgressSnapshot = "";

    while (Date.now() < deadline) {
        try {
            const statusPayload = await request<unknown>(
                `/chat/status?generationId=${encodeURIComponent(
                    generationId
                )}&sessionId=${encodeURIComponent(payload.session_id)}`
            );

            if (!statusPayload || typeof statusPayload !== "object") {
                throw new Error("Invalid status payload from server.");
            }

            const statusRecord = statusPayload as Record<string, unknown>;
            const status =
                typeof statusRecord.status === "string"
                    ? statusRecord.status
                    : "processing";

            if (options?.onProgress) {
                const progress = toProgressUpdate(statusPayload);
                if (progress) {
                    const snapshot = JSON.stringify(progress);
                    if (snapshot !== lastProgressSnapshot) {
                        lastProgressSnapshot = snapshot;
                        options.onProgress(progress);
                    }
                }
            }

            if (status === "completed") {
                const completed = toCompletedChatResponse(statusPayload, quota);
                if (!completed) {
                    throw new Error(
                        "Generation completed but response payload was invalid."
                    );
                }
                return completed;
            }

            if (status === "failed" || status === "expired") {
                const detail =
                    typeof statusRecord.error === "string" &&
                        statusRecord.error.trim()
                        ? statusRecord.error.trim()
                        : "RAG generation failed.";
                throw new Error(detail);
            }

            if (status !== "processing" && status !== "pending" && status !== "idle") {
                const completed = toCompletedChatResponse(statusPayload, quota);
                if (completed) return completed;
            }
        } catch (error) {
            if (!isRetryablePollError(error)) {
                throw error;
            }
            lastPollError = error;
        }

        await sleep(CHAT_STATUS_POLL_INTERVAL_MS);
    }

    if (lastPollError instanceof Error) {
        throw new Error(
            `Timed out waiting for assistant response: ${lastPollError.message}`
        );
    }
    throw new Error("Timed out waiting for assistant response.");
}

// ── SSE stream consumer ──────────────────────────────────────────────

async function consumeSSEStream(
    body: ReadableStream<Uint8Array>,
    options?: {
        onProgress?: (progress: ChatProgressUpdate) => void;
        onToken?: (token: string) => void;
    }
): Promise<ChatResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResponse: ChatResponse | null = null;
    let accumulatedAnswer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (!data || data === "[DONE]") continue;

                let event: StreamEvent;
                try {
                    event = JSON.parse(data) as StreamEvent;
                } catch {
                    continue;
                }

                switch (event.type) {
                    case "progress": {
                        if (options?.onProgress) {
                            const progress: ChatProgressUpdate = {
                                status: "processing",
                                thinkingStatus:
                                    typeof event.label === "string" ? event.label : undefined,
                                thinkingSteps: normalizeThinkingSteps(event.thinking_steps),
                                mode: normalizeResponseMode(event.mode),
                                routingReason:
                                    typeof event.routing_reason === "string"
                                        ? event.routing_reason
                                        : undefined,
                            };
                            options.onProgress(progress);
                        }
                        break;
                    }
                    case "token": {
                        const token = typeof event.token === "string" ? event.token : "";
                        if (token) {
                            accumulatedAnswer += token;
                            options?.onToken?.(token);
                        }
                        break;
                    }
                    case "done": {
                        const record = event as Record<string, unknown>;
                        const answer =
                            typeof record.answer === "string"
                                ? record.answer
                                : accumulatedAnswer;
                        finalResponse = {
                            answer,
                            sources: normalizeSources(record.sources),
                            matches: normalizeMatches(record.matches),
                            quota: normalizeQuota(record.quota),
                        };
                        break;
                    }
                    case "error": {
                        const detail =
                            typeof event.detail === "string"
                                ? event.detail
                                : "Streaming generation failed.";
                        throw new Error(detail);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (finalResponse) return finalResponse;

    if (accumulatedAnswer) {
        return { answer: accumulatedAnswer };
    }

    throw new Error("Stream ended without a completed response.");
}

// ── Sync pending task state (recovery) ───────────────────────────────

type PendingChatTaskState =
    | "idle"
    | "processing"
    | "completed"
    | "failed";

export async function syncPendingChatTask(
    sessionId: string
): Promise<PendingChatTaskState> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) return "idle";

    try {
        const payload = await request<unknown>(
            `/chat/status?sessionId=${encodeURIComponent(normalizedSessionId)}`
        );
        if (!payload || typeof payload !== "object") return "idle";

        const record = payload as Record<string, unknown>;
        const status = typeof record.status === "string" ? record.status : "";
        if (status === "completed") return "completed";
        if (status === "failed" || status === "expired") return "failed";
        if (status === "processing" || status === "pending") return "processing";
        if (status === "idle") return "idle";

        if (typeof record.answer === "string" && record.answer.trim()) {
            return "completed";
        }
        return "processing";
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
            return "idle";
        }
        return "failed";
    }
}

// ── Simple endpoints ─────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string }> {
    return request<{ status: string }>("/health");
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
