import { NextRequest, NextResponse } from "next/server";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import {
    createChatGeneration,
    ensureConversationOwnedByUser,
    getAllowedIndexesForUser,
    markChatGenerationCompleted,
    markChatGenerationFailed,
    resolveActiveIndexes,
    saveChatMessage,
    setChatGenerationTaskId,
    getConversationHistoryForRag,
} from "@/lib/server/conversations";
import { startChatGenerationMonitor } from "@/lib/server/chat-generation-monitor";
import {
    buildBackendHeaders,
    buildBackendUrl,
    extractUpstreamErrorMessage,
    readUpstreamPayload,
} from "@/lib/server/backend";
import { consumeDailyQuota, type QuotaResult } from "@/lib/server/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatProxyRequest {
    question: string;
    session_id: string;
    top_k?: number;
    temperature?: number;
    response_mode?: "auto" | "light" | "heavy";
}

function errorResponse(message: string, status: number, quota?: QuotaResult) {
    const response = NextResponse.json(
        quota
            ? {
                error: message,
                quota: {
                    limit: quota.limit,
                    used: quota.used,
                    remaining: quota.remaining,
                    reset_at: quota.resetAt,
                },
            }
            : { error: message },
        { status, headers: { "Cache-Control": "no-store" } }
    );
    if (quota) {
        attachQuotaHeaders(response, quota);
    }
    return response;
}

function attachQuotaHeaders(response: NextResponse, quota: QuotaResult) {
    response.headers.set("X-RateLimit-Limit", String(quota.limit));
    response.headers.set("X-RateLimit-Remaining", String(quota.remaining));
    response.headers.set("X-RateLimit-Used", String(quota.used));
    response.headers.set("X-RateLimit-Reset", quota.resetAt);
}

function parseChatRequest(raw: unknown): ChatProxyRequest | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;

    const question = typeof record.question === "string" ? record.question.trim() : "";
    const sessionId =
        typeof record.session_id === "string" ? record.session_id.trim() : "";
    const topK =
        typeof record.top_k === "number" && Number.isFinite(record.top_k)
            ? record.top_k
            : undefined;
    const temperature =
        typeof record.temperature === "number" && Number.isFinite(record.temperature)
            ? record.temperature
            : undefined;

    const responseModeRaw =
        typeof record.response_mode === "string"
            ? record.response_mode.trim().toLowerCase()
            : "auto";
    const responseMode =
        responseModeRaw === "light" || responseModeRaw === "heavy"
            ? responseModeRaw
            : "auto";

    if (
        !question ||
        question.length > 4000 ||
        !sessionId ||
        !isValidConversationId(sessionId)
    ) {
        return null;
    }
    if (topK !== undefined && (topK < 8 || topK > 12)) {
        return null;
    }
    if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
        return null;
    }

    return {
        question,
        session_id: sessionId,
        top_k: topK,
        temperature,
        response_mode: responseMode,
    };
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return errorResponse("Authentication required.", 401);
    }

    let parsedRequest: ChatProxyRequest | null = null;
    try {
        const rawBody = await request.json();
        parsedRequest = parseChatRequest(rawBody);
    } catch {
        parsedRequest = null;
    }
    if (!parsedRequest) {
        return errorResponse("Invalid chat request payload.", 400);
    }

    let allowedIndexes: string[] = [];
    try {
        allowedIndexes = await getAllowedIndexesForUser(user.id);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to validate index access.";
        return errorResponse(message, 500);
    }

    const activeIndexes = resolveActiveIndexes({
        requested: undefined,
        allowed: allowedIndexes,
    });

    try {
        await ensureConversationOwnedByUser(
            user.id,
            parsedRequest.session_id,
            parsedRequest.question
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to create or access conversation.";
        return errorResponse(message, 500);
    }

    let quota: QuotaResult;
    try {
        quota = await consumeDailyQuota(user.id);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to evaluate daily quota.";
        return errorResponse(message, 500);
    }

    if (!quota.allowed) {
        return errorResponse(
            `Daily quota exceeded. You have reached ${quota.limit} requests today.`,
            429,
            quota
        );
    }

    try {
        await saveChatMessage({
            conversationId: parsedRequest.session_id,
            userId: user.id,
            role: "user",
            content: parsedRequest.question,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to persist user message.";
        return errorResponse(message, 500);
    }

    let generationId: string;
    try {
        const generation = await createChatGeneration({
            conversationId: parsedRequest.session_id,
            userId: user.id,
        });
        generationId = generation.id;
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to initialize chat generation.";
        return errorResponse(message, 500, quota);
    }

    let chatHistory: { role: string; content: string }[] = [];
    try {
        chatHistory = await getConversationHistoryForRag(parsedRequest.session_id, 10);
    } catch (error) {
        console.error("Failed to fetch chat history, proceeding with empty history:", error);
    }

    const backendPayload = {
        ...parsedRequest,
        chat_history: chatHistory,
        active_index_names: activeIndexes.length > 0 ? activeIndexes : undefined,
        response_mode: parsedRequest.response_mode ?? "auto",
    };

    // ── Try SSE streaming first ──
    let upstream: Response;
    try {
        upstream = await fetch(buildBackendUrl("/chat/stream"), {
            method: "POST",
            headers: buildBackendHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(backendPayload),
            cache: "no-store",
        });
    } catch {
        // Streaming endpoint unavailable — fall back to polling
        return fallbackToPolling(backendPayload, generationId, user.id, quota);
    }

    if (!upstream.ok || !upstream.body) {
        // Streaming failed — fall back to polling
        return fallbackToPolling(backendPayload, generationId, user.id, quota);
    }

    // Mark generation as associated with streaming (no task_id needed)
    try {
        await setChatGenerationTaskId({
            generationId,
            userId: user.id,
            taskId: `stream-${generationId}`,
        });
    } catch {
        // Non-critical, continue
    }

    // ── Proxy SSE stream to client, intercept events for persistence ──
    console.info("[chat/route] Streaming path active for generation=%s", generationId);

    const quotaHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
        "X-RateLimit-Limit": String(quota.limit),
        "X-RateLimit-Remaining": String(quota.remaining),
        "X-RateLimit-Used": String(quota.used),
        "X-RateLimit-Reset": quota.resetAt,
    };

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const metaEvent = `data: ${JSON.stringify({
        type: "meta",
        generation_id: generationId,
        quota: {
            limit: quota.limit,
            used: quota.used,
            remaining: quota.remaining,
            reset_at: quota.resetAt,
        },
    })}\n\n`;

    const upstreamReader = upstream.body!.getReader();

    // Track stream content for persistence
    let sseBuffer = "";
    let streamAnswer = "";
    let streamSources: string[] = [];
    let streamMatches: unknown[] = [];
    let gotDoneEvent = false;

    function parseSSEChunk(raw: Uint8Array) {
        sseBuffer += decoder.decode(raw, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
                const event = JSON.parse(data) as Record<string, unknown>;
                if (event.type === "token" && typeof event.token === "string") {
                    streamAnswer += event.token;
                }
                if (event.type === "done") {
                    gotDoneEvent = true;
                    if (typeof event.answer === "string") streamAnswer = event.answer;
                    if (Array.isArray(event.sources)) streamSources = event.sources as string[];
                    if (Array.isArray(event.matches)) streamMatches = event.matches as unknown[];
                }
            } catch {
                // Ignore parse errors for individual events
            }
        }
    }

    async function persistStreamResult() {
        if (!gotDoneEvent || !streamAnswer.trim()) return;
        const sessionId = parsedRequest!.session_id;
        const userId = user!.id;
        try {
            const inserted = await saveChatMessage({
                conversationId: sessionId,
                userId,
                role: "assistant",
                content: streamAnswer,
                markdownContent: streamAnswer,
                citations: streamSources.length > 0 ? streamSources : undefined,
                matches: streamMatches.length > 0 ? streamMatches : undefined,
                generationId,
            });
            await markChatGenerationCompleted({
                generationId,
                userId,
                assistantMessageId: inserted.id,
            });
            console.info("[chat/route] Stream result persisted for generation=%s", generationId);
        } catch (err) {
            // If duplicate key (already persisted), that's fine
            const message = err instanceof Error ? err.message : String(err);
            if (!/duplicate key/i.test(message)) {
                console.error("[chat/route] Failed to persist stream result:", message);
            }
        }
    }

    const stream = new ReadableStream({
        async start(controller) {
            controller.enqueue(encoder.encode(metaEvent));
        },
        async pull(controller) {
            try {
                const { done, value } = await upstreamReader.read();
                if (done) {
                    // Stream complete — persist result in background
                    persistStreamResult().catch(() => { });
                    controller.close();
                    return;
                }
                // Forward to client immediately
                controller.enqueue(value);
                // Also parse for Supabase persistence
                parseSSEChunk(value);
            } catch (error) {
                console.error("[chat/route] SSE proxy read error:", error);
                controller.close();
            }
        },
        cancel() {
            upstreamReader.cancel().catch(() => { });
        },
    });

    return new Response(stream, {
        status: 200,
        headers: quotaHeaders,
    });
}

// ── Fallback to polling architecture ──

async function fallbackToPolling(
    backendPayload: Record<string, unknown>,
    generationId: string,
    userId: string,
    quota: QuotaResult
): Promise<NextResponse> {
    let upstream: Response;
    try {
        upstream = await fetch(buildBackendUrl("/chat"), {
            method: "POST",
            headers: buildBackendHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(backendPayload),
            cache: "no-store",
        });
    } catch {
        await markChatGenerationFailed({
            generationId,
            userId,
            errorMessage: "Backend is unavailable.",
        }).catch(() => undefined);
        return errorResponse("Backend is unavailable.", 502, quota);
    }

    const payload = await readUpstreamPayload(upstream);
    if (!upstream.ok) {
        const fallback =
            upstream.status >= 500
                ? "Backend failed to process request."
                : "Request was rejected by backend.";
        const message = extractUpstreamErrorMessage(payload, fallback);
        await markChatGenerationFailed({
            generationId,
            userId,
            errorMessage: message,
        }).catch(() => undefined);
        return errorResponse(
            message,
            upstream.status >= 500 ? 502 : upstream.status,
            quota
        );
    }

    if (!payload || typeof payload !== "object" || !("task_id" in payload)) {
        await markChatGenerationFailed({
            generationId,
            userId,
            errorMessage: "Unexpected backend response format.",
        }).catch(() => undefined);
        return errorResponse("Unexpected backend response format.", 502, quota);
    }
    const taskId = (payload as Record<string, unknown>).task_id;
    if (typeof taskId !== "string" && typeof taskId !== "number") {
        await markChatGenerationFailed({
            generationId,
            userId,
            errorMessage: "Backend response is missing task id.",
        }).catch(() => undefined);
        return errorResponse("Backend response is missing task id.", 502, quota);
    }

    try {
        await setChatGenerationTaskId({
            generationId,
            userId,
            taskId: String(taskId),
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to store chat task id.";
        await markChatGenerationFailed({
            generationId,
            userId,
            errorMessage: message,
        }).catch(() => undefined);
        return errorResponse(message, 500, quota);
    }

    startChatGenerationMonitor({
        generationId,
        userId,
    });

    const response = NextResponse.json(
        {
            status: "processing",
            generation_id: generationId,
            quota: {
                limit: quota.limit,
                used: quota.used,
                remaining: quota.remaining,
                reset_at: quota.resetAt,
            },
        },
        {
            status: 200,
            headers: { "Cache-Control": "no-store" },
        }
    );
    attachQuotaHeaders(response, quota);
    return response;
}
