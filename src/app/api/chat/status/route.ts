import { NextRequest, NextResponse } from "next/server";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import {
    buildBackendHeaders,
    buildBackendUrl,
    readUpstreamPayload,
} from "@/lib/server/backend";
import {
    getAssistantMessageForGeneration,
    getChatGenerationById,
    getLatestProcessingChatGenerationForConversation,
    markChatGenerationFailed,
    type ChatGenerationRecord,
} from "@/lib/server/conversations";
import { startChatGenerationMonitor } from "@/lib/server/chat-generation-monitor";
import {
    normalizeMatches,
    normalizeCitations,
    normalizeThinkingSteps,
    normalizeResponseMode,
} from "@/lib/normalize";
import type { MatchItem, ThinkingStep } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERATION_EXPIRY_GRACE_MS = 1000 * 60 * 20;
const STALE_GENERATION_MS = 1000 * 60 * 5;

async function fetchUpstreamThinking(taskId: string): Promise<
    | {
        status: string;
        thinkingStatus?: string;
        thinkingSteps: ThinkingStep[];
        mode?: "auto" | "light" | "heavy";
        routingReason?: string;
        error?: string;
    }
    | null
> {
    let upstream: Response;
    try {
        upstream = await fetch(
            buildBackendUrl(`/chat/status/${encodeURIComponent(taskId)}`),
            {
                method: "GET",
                headers: buildBackendHeaders(),
                cache: "no-store",
            }
        );
    } catch {
        return null;
    }

    const payload = await readUpstreamPayload(upstream);
    if (!upstream.ok || !payload || typeof payload !== "object") {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const status = typeof record.status === "string" ? record.status : "processing";
    const thinkingStatus =
        typeof record.thinking_status === "string" && record.thinking_status.trim()
            ? record.thinking_status.trim()
            : undefined;

    const routingReason =
        typeof record.routing_reason === "string" && record.routing_reason.trim()
            ? record.routing_reason.trim()
            : undefined;

    const error =
        typeof record.detail === "string" && record.detail.trim()
            ? record.detail.trim()
            : undefined;

    const thinkingSteps = normalizeThinkingSteps(record.thinking_steps) ?? [];

    return {
        status,
        thinkingStatus,
        thinkingSteps,
        mode: normalizeResponseMode(record.mode) ?? normalizeResponseMode(record.mode_hint),
        routingReason,
        error,
    };
}

function isGenerationExpired(generation: ChatGenerationRecord): boolean {
    const expiresAt = Date.parse(generation.expiresAt);
    if (!Number.isFinite(expiresAt)) return false;
    return Date.now() - expiresAt > GENERATION_EXPIRY_GRACE_MS;
}

async function buildCompletedResponse(
    userId: string,
    generationId: string
): Promise<
    | {
        status: "completed";
        generation_id: string;
        answer: string;
        sources: string[];
        matches: MatchItem[];
    }
    | null
> {
    const message = await getAssistantMessageForGeneration({
        generationId,
        userId,
    });
    if (!message) return null;

    return {
        status: "completed",
        generation_id: generationId,
        answer: message.markdownContent || message.content,
        sources: normalizeCitations(message.citations) ?? [],
        matches: normalizeMatches(message.matches) ?? [],
    };
}

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required." },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    const { searchParams } = new URL(request.url);
    const generationId = (searchParams.get("generationId") || "").trim();
    const sessionId = (searchParams.get("sessionId") || "").trim();

    if (!generationId && !sessionId) {
        return NextResponse.json(
            { error: "Missing generationId or sessionId." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    if (sessionId && !isValidConversationId(sessionId)) {
        return NextResponse.json(
            { error: "Conversation id must be a valid UUID." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    let generation: ChatGenerationRecord | null = null;
    try {
        if (generationId) {
            generation = await getChatGenerationById({
                generationId,
                userId: user.id,
            });
            if (!generation) {
                return NextResponse.json(
                    { error: "Generation not found." },
                    { status: 404, headers: { "Cache-Control": "no-store" } }
                );
            }
        } else if (sessionId) {
            generation = await getLatestProcessingChatGenerationForConversation({
                conversationId: sessionId,
                userId: user.id,
            });
        }
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to resolve generation status.";
        return NextResponse.json(
            { error: message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }

    if (!generation) {
        return NextResponse.json(
            { status: "idle" },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    if (generation.status === "completed") {
        try {
            const completed = await buildCompletedResponse(user.id, generation.id);
            if (!completed) {
                return NextResponse.json(
                    {
                        error:
                            "Generation completed but assistant message was not found.",
                    },
                    { status: 500, headers: { "Cache-Control": "no-store" } }
                );
            }
            return NextResponse.json(completed, {
                status: 200,
                headers: { "Cache-Control": "no-store" },
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to load completed generation.";
            return NextResponse.json(
                { error: message },
                { status: 500, headers: { "Cache-Control": "no-store" } }
            );
        }
    }

    // ── Failed / expired generation → 422 (not 500) ──
    if (generation.status === "failed" || generation.status === "expired") {
        return NextResponse.json(
            { error: generation.errorMessage || "Generation failed." },
            { status: 422, headers: { "Cache-Control": "no-store" } }
        );
    }

    // ── Expired by clock → 422 (not 500) ──
    if (isGenerationExpired(generation)) {
        await markChatGenerationFailed({
            generationId: generation.id,
            userId: user.id,
            status: "expired",
            errorMessage: "Generation expired before completion.",
        }).catch(() => undefined);
        return NextResponse.json(
            { error: "Generation expired before completion." },
            { status: 422, headers: { "Cache-Control": "no-store" } }
        );
    }

    startChatGenerationMonitor({
        generationId: generation.id,
        userId: user.id,
    });

    let thinkingStatus: string | undefined;
    let thinkingSteps: ThinkingStep[] = [];
    let mode: "auto" | "light" | "heavy" | undefined;
    let routingReason: string | undefined;
    if (generation.taskId) {
        const thinking = await fetchUpstreamThinking(generation.taskId).catch(
            () => null
        );
        if (thinking) {
            thinkingStatus = thinking.thinkingStatus;
            thinkingSteps = thinking.thinkingSteps;
            mode = thinking.mode;
            routingReason = thinking.routingReason;

            // ── Upstream task failed → 422 (not 500) ──
            if (thinking.status === "failed") {
                await markChatGenerationFailed({
                    generationId: generation.id,
                    userId: user.id,
                    errorMessage: thinking.error || "Generation failed.",
                }).catch(() => undefined);
                return NextResponse.json(
                    { error: thinking.error || "Generation failed." },
                    { status: 422, headers: { "Cache-Control": "no-store" } }
                );
            }
        } else {
            // Upstream unreachable or task not found (e.g. interrupted stream).
            // If the generation has been processing for too long, expire it.
            const createdAt = Date.parse(generation.createdAt);
            if (
                Number.isFinite(createdAt) &&
                Date.now() - createdAt > STALE_GENERATION_MS
            ) {
                await markChatGenerationFailed({
                    generationId: generation.id,
                    userId: user.id,
                    status: "expired",
                    errorMessage:
                        "Generation stalled — the response could not be recovered. Please try again.",
                }).catch(() => undefined);
                return NextResponse.json(
                    {
                        error:
                            "Generation stalled — the response could not be recovered. Please try again.",
                    },
                    { status: 422, headers: { "Cache-Control": "no-store" } }
                );
            }
        }
    }

    return NextResponse.json(
        {
            status: "processing",
            generation_id: generation.id,
            thinking_status: thinkingStatus,
            thinking_steps: thinkingSteps,
            mode,
            routing_reason: routingReason,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
