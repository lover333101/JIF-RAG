import { NextRequest, NextResponse } from "next/server";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import {
    ensureConversationOwnedByUser,
    getAllowedIndexesForUser,
    hasUnauthorizedRequestedIndexes,
    resolveActiveIndexes,
    saveChatMessage,
} from "@/lib/server/conversations";
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
    active_index_names?: string[];
}

type UpstreamMatch = {
    id?: unknown;
    score?: unknown;
    source?: unknown;
};

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

function sourceAlias(index: number): string {
    return `Source #${String(index + 1).padStart(2, "0")}`;
}

function normalizeSourceToken(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase().startsWith("source=")) {
        return trimmed.slice(7).trim();
    }
    return trimmed;
}

function sanitizeAnswerCitations(
    answer: string,
    aliasMap: Map<string, string>
): string {
    return answer.replace(/\[([^\]\n]+)\](?!\()/g, (full, tokenValue: string) => {
        const normalized = normalizeSourceToken(tokenValue);
        const alias = aliasMap.get(normalized);
        if (!alias) return full;
        return `[${alias}]`;
    });
}

function sanitizeEvidence(payload: Record<string, unknown>) {
    const rawAnswer = typeof payload.answer === "string" ? payload.answer : "";
    if (!rawAnswer.trim()) {
        return null;
    }

    const upstreamMatches = Array.isArray(payload.matches)
        ? (payload.matches as UpstreamMatch[])
        : [];

    const aliasMap = new Map<string, string>();
    const sources: string[] = [];

    for (const item of upstreamMatches) {
        const source =
            typeof item?.source === "string" ? item.source.trim() : "";
        if (!source || aliasMap.has(source)) continue;
        const alias = sourceAlias(aliasMap.size);
        aliasMap.set(source, alias);
        sources.push(alias);
    }

    const matches = upstreamMatches
        .map((item, index) => {
            const source =
                typeof item?.source === "string" ? item.source.trim() : "";
            const alias = source ? aliasMap.get(source) : undefined;
            const score =
                typeof item?.score === "number" && Number.isFinite(item.score)
                    ? item.score
                    : 0;
            if (!alias) return null;
            return {
                id: `m-${index + 1}`,
                score,
                source: alias,
            };
        })
        .filter(Boolean);

    const answer = sanitizeAnswerCitations(rawAnswer, aliasMap);
    return { answer, sources, matches };
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

    const rawIndexes = Array.isArray(record.active_index_names)
        ? record.active_index_names
        : undefined;
    const activeIndexNames =
        rawIndexes
            ?.filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean) ?? undefined;

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
        active_index_names: activeIndexNames,
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

    if (
        hasUnauthorizedRequestedIndexes({
            requested: parsedRequest.active_index_names,
            allowed: allowedIndexes,
        })
    ) {
        return errorResponse("Requested index is not allowed for this account.", 403);
    }

    const activeIndexes = resolveActiveIndexes({
        requested: parsedRequest.active_index_names,
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

    let upstream: Response;
    try {
        upstream = await fetch(buildBackendUrl("/chat"), {
            method: "POST",
            headers: buildBackendHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                ...parsedRequest,
                active_index_names: activeIndexes.length > 0 ? activeIndexes : undefined,
            }),
            cache: "no-store",
        });
    } catch {
        return errorResponse("Backend is unavailable.", 502, quota);
    }

    const payload = await readUpstreamPayload(upstream);
    if (!upstream.ok) {
        const fallback =
            upstream.status >= 500
                ? "Backend failed to process request."
                : "Request was rejected by backend.";
        const message = extractUpstreamErrorMessage(payload, fallback);
        return errorResponse(
            message,
            upstream.status >= 500 ? 502 : upstream.status,
            quota
        );
    }

    if (payload === null || typeof payload === "string") {
        return errorResponse("Unexpected backend response format.", 502, quota);
    }

    const sanitized = sanitizeEvidence(payload as Record<string, unknown>);
    if (!sanitized) {
        return errorResponse("Backend response is missing answer.", 502, quota);
    }

    try {
        await saveChatMessage({
            conversationId: parsedRequest.session_id,
            userId: user.id,
            role: "assistant",
            content: sanitized.answer,
            markdownContent: sanitized.answer,
            citations: sanitized.sources,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to persist assistant response.";
        return errorResponse(message, 500, quota);
    }

    const response = NextResponse.json(
        {
            ...sanitized,
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
