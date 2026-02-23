import {
    buildBackendHeaders,
    buildBackendUrl,
    extractUpstreamErrorMessage,
    readUpstreamPayload,
} from "@/lib/server/backend";
import {
    getAssistantMessageForGeneration,
    getChatGenerationById,
    markChatGenerationCompleted,
    markChatGenerationFailed,
    saveChatMessage,
} from "@/lib/server/conversations";
import type { MatchItem } from "@/types/chat";

const MONITOR_INITIAL_INTERVAL_MS = 500;
const MONITOR_BACKOFF_FACTOR = 1.5;
const MONITOR_MAX_INTERVAL_MS = 5000;
const MONITOR_MAX_DURATION_MS = 1000 * 60 * 10; // 10 minutes (down from 25)
const MAX_CONCURRENT_MONITORS = 50;
const RETRYABLE_BACKEND_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const activeMonitors = new Map<string, Promise<void>>();

type UpstreamMatch = {
    id?: unknown;
    score?: unknown;
    source?: unknown;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        .filter(Boolean) as MatchItem[];

    const answer = sanitizeAnswerCitations(rawAnswer, aliasMap);
    return { answer, sources, matches };
}

function isExpired(expiresAt: string): boolean {
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed)) return false;
    return Date.now() > parsed;
}

async function persistCompletedGeneration(params: {
    generationId: string;
    userId: string;
    conversationId: string;
    answer: string;
    sources: string[];
    matches: MatchItem[];
}): Promise<void> {
    let assistantMessageId: string | null = null;
    try {
        const inserted = await saveChatMessage({
            conversationId: params.conversationId,
            userId: params.userId,
            role: "assistant",
            content: params.answer,
            markdownContent: params.answer,
            citations: params.sources,
            matches: params.matches,
            generationId: params.generationId,
        });
        assistantMessageId = inserted.id;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to persist assistant response.";
        if (!/duplicate key value violates unique constraint/i.test(message)) {
            throw error;
        }

        const existing = await getAssistantMessageForGeneration({
            generationId: params.generationId,
            userId: params.userId,
        });
        assistantMessageId = existing?.id ?? null;
    }

    if (!assistantMessageId) {
        throw new Error(
            "Failed to resolve assistant message for completed generation."
        );
    }

    await markChatGenerationCompleted({
        generationId: params.generationId,
        userId: params.userId,
        assistantMessageId,
    });
}

async function runChatGenerationMonitor(params: {
    generationId: string;
    userId: string;
}): Promise<void> {
    const startedAt = Date.now();
    let interval = MONITOR_INITIAL_INTERVAL_MS;

    while (Date.now() - startedAt < MONITOR_MAX_DURATION_MS) {
        const generation = await getChatGenerationById({
            generationId: params.generationId,
            userId: params.userId,
        });
        if (!generation) {
            return;
        }

        if (generation.status === "completed") {
            return;
        }
        if (generation.status === "failed" || generation.status === "expired") {
            return;
        }

        if (isExpired(generation.expiresAt)) {
            await markChatGenerationFailed({
                generationId: generation.id,
                userId: params.userId,
                status: "expired",
                errorMessage: "Generation expired before completion.",
            });
            return;
        }

        if (!generation.taskId) {
            await sleep(interval);
            interval = Math.min(interval * MONITOR_BACKOFF_FACTOR, MONITOR_MAX_INTERVAL_MS);
            continue;
        }

        let upstream: Response;
        try {
            upstream = await fetch(
                buildBackendUrl(`/chat/status/${encodeURIComponent(generation.taskId)}`),
                {
                    method: "GET",
                    headers: buildBackendHeaders(),
                    cache: "no-store",
                }
            );
        } catch {
            await sleep(interval);
            interval = Math.min(interval * MONITOR_BACKOFF_FACTOR, MONITOR_MAX_INTERVAL_MS);
            continue;
        }

        const payload = await readUpstreamPayload(upstream);
        if (!upstream.ok) {
            if (upstream.status === 404) {
                await markChatGenerationFailed({
                    generationId: generation.id,
                    userId: params.userId,
                    errorMessage: "Task not found.",
                });
                return;
            }

            if (RETRYABLE_BACKEND_STATUS_CODES.has(upstream.status)) {
                await sleep(interval);
                interval = Math.min(interval * MONITOR_BACKOFF_FACTOR, MONITOR_MAX_INTERVAL_MS);
                continue;
            }

            const fallback =
                upstream.status >= 500
                    ? "Backend failed to process status request."
                    : "Status request was rejected by backend.";
            const detail = extractUpstreamErrorMessage(payload, fallback);
            await markChatGenerationFailed({
                generationId: generation.id,
                userId: params.userId,
                errorMessage: detail,
            });
            return;
        }

        if (!payload || typeof payload !== "object") {
            await sleep(interval);
            interval = Math.min(interval * MONITOR_BACKOFF_FACTOR, MONITOR_MAX_INTERVAL_MS);
            continue;
        }

        const record = payload as Record<string, unknown>;
        const status = typeof record.status === "string" ? record.status : "";

        if (status === "pending" || status === "processing") {
            await sleep(interval);
            interval = Math.min(interval * MONITOR_BACKOFF_FACTOR, MONITOR_MAX_INTERVAL_MS);
            continue;
        }

        if (status === "failed") {
            const detail =
                typeof record.detail === "string" && record.detail.trim()
                    ? record.detail.trim()
                    : "RAG generation failed in background.";
            await markChatGenerationFailed({
                generationId: generation.id,
                userId: params.userId,
                errorMessage: detail,
            });
            return;
        }

        if (status !== "completed") {
            await sleep(interval);
            interval = Math.min(interval * MONITOR_BACKOFF_FACTOR, MONITOR_MAX_INTERVAL_MS);
            continue;
        }

        const sanitized = sanitizeEvidence(record);
        if (!sanitized) {
            await markChatGenerationFailed({
                generationId: generation.id,
                userId: params.userId,
                errorMessage: "Backend response is missing answer.",
            });
            return;
        }

        await persistCompletedGeneration({
            generationId: generation.id,
            userId: params.userId,
            conversationId: generation.conversationId,
            answer: sanitized.answer,
            sources: sanitized.sources,
            matches: sanitized.matches,
        });
        return;
    }

    await markChatGenerationFailed({
        generationId: params.generationId,
        userId: params.userId,
        status: "expired",
        errorMessage: "Generation monitor timeout.",
    }).catch(() => undefined);
}

export function startChatGenerationMonitor(params: {
    generationId: string;
    userId: string;
}): void {
    if (activeMonitors.has(params.generationId)) {
        return;
    }

    // Safety limit: prevent unbounded monitor accumulation
    if (activeMonitors.size >= MAX_CONCURRENT_MONITORS) {
        console.warn(
            "Chat generation monitor limit reached (%d). Skipping monitor for generation=%s",
            MAX_CONCURRENT_MONITORS,
            params.generationId
        );
        return;
    }

    const runner = runChatGenerationMonitor(params)
        .catch((error) => {
            const message =
                error instanceof Error ? error.message : "Unknown monitor error";
            console.error(
                "Chat generation monitor failed for generation=%s: %s",
                params.generationId,
                message
            );
        })
        .finally(() => {
            activeMonitors.delete(params.generationId);
        });

    activeMonitors.set(params.generationId, runner);
}
