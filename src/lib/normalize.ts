import type { MatchItem, ThinkingStep } from "@/types/chat";

const SOURCE_ALIAS_REGEX = /^source\s*#\s*\d{1,3}$/i;

function isPublicSourceLabel(value: string): boolean {
    return SOURCE_ALIAS_REGEX.test(value.trim());
}

// Match normalization
export function normalizeMatches(raw: unknown): MatchItem[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const matches: MatchItem[] = [];
    raw.forEach((item, index) => {
        if (!item || typeof item !== "object") return;

        const record = item as Record<string, unknown>;
        const source =
            typeof record.source === "string" ? record.source.trim() : "";
        if (!source || !isPublicSourceLabel(source)) return;

        const score =
            typeof record.score === "number" && Number.isFinite(record.score)
                ? record.score
                : 0;
        const id =
            typeof record.id === "string" && record.id.trim()
                ? record.id.trim()
                : `m-${index + 1}`;
        const metadata =
            record.metadata &&
            typeof record.metadata === "object" &&
            !Array.isArray(record.metadata)
                ? (record.metadata as Record<string, unknown>)
                : undefined;

        matches.push({ id, score, source, metadata });
    });

    return matches.length > 0 ? matches : undefined;
}

// Source normalization
export function normalizeSources(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out = new Set<string>();
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (!trimmed || !isPublicSourceLabel(trimmed)) continue;
        out.add(trimmed);
    }
    return out.size > 0 ? [...out] : undefined;
}

// Citations normalization
export function normalizeCitations(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: string[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (!trimmed || !isPublicSourceLabel(trimmed)) continue;
        const key = trimmed
            .normalize("NFKC")
            .replace(/[\u2010-\u2015]/g, "-")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
    }

    return out.length > 0 ? out : undefined;
}

// Thinking steps normalization
export function normalizeThinkingSteps(raw: unknown): ThinkingStep[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: ThinkingStep[] = [];

    raw.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const record = item as Record<string, unknown>;
        const id =
            typeof record.id === "string" && record.id.trim()
                ? record.id.trim()
                : `step-${index + 1}`;
        const label =
            typeof record.label === "string" && record.label.trim()
                ? record.label.trim()
                : "Working...";
        const detail =
            typeof record.detail === "string" && record.detail.trim()
                ? record.detail.trim()
                : undefined;
        const stateRaw =
            typeof record.state === "string" ? record.state.trim().toLowerCase() : "";
        const state =
            stateRaw === "pending" || stateRaw === "done" ? stateRaw : "active";
        const updatedAt =
            typeof record.updated_at_ms === "number" &&
            Number.isFinite(record.updated_at_ms)
                ? record.updated_at_ms
                : undefined;
        out.push({
            id,
            label,
            detail,
            state,
            updated_at_ms: updatedAt,
        });
    });

    return out.length > 0 ? out : undefined;
}

// Response mode normalization
export function normalizeResponseMode(
    raw: unknown
): "auto" | "light" | "heavy" | undefined {
    if (typeof raw !== "string") return undefined;
    const normalized = raw.trim().toLowerCase();
    if (normalized === "auto" || normalized === "light" || normalized === "heavy") {
        return normalized;
    }
    return undefined;
}

// Quota normalization
export interface NormalizedQuota {
    limit: number;
    used: number;
    remaining: number;
    reset_at: string;
}

export function normalizeQuota(raw: unknown): NormalizedQuota | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const record = raw as Record<string, unknown>;

    if (
        typeof record.limit !== "number" ||
        typeof record.used !== "number" ||
        typeof record.remaining !== "number" ||
        typeof record.reset_at !== "string"
    ) {
        return undefined;
    }

    return {
        limit: record.limit,
        used: record.used,
        remaining: record.remaining,
        reset_at: record.reset_at,
    };
}
