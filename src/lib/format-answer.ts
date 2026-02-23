import type { CitationMention } from "@/types/chat";

// ── Shared constants ─────────────────────────────────────────────────

export const NON_SOURCE_TAGS = new Set([
    "KB",
    "Inference",
    "Suggested baseline (inference)",
]);

export const BRACKET_TOKEN_REGEX = /\[([^\]\n]+)\](?!\()/g;
export const RELIABILITY_TAG_REGEX =
    /\[(KB|Inference|Suggested baseline \(inference\))\]/g;
export const RELIABILITY_CAPTURE_REGEX =
    /\[(KB|Inference|Suggested baseline \(inference\))\]/g;

// ── Utility functions ────────────────────────────────────────────────

export function normalizeCitationToken(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase().startsWith("source=")) {
        return trimmed.slice(7).trim();
    }
    return trimmed;
}

export function normalizeSourceLabelKey(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[\u2010-\u2015]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function stripMarkdownDecorators(text: string): string {
    return text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/^[\s>*-]+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/^#+\s+/, "");
}

export function cleanAnswerWhitespace(text: string): string {
    return text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

export function stripReliabilityTags(text: string): string {
    return text.replace(RELIABILITY_TAG_REGEX, "");
}

export function stripStoredTokens(text: string): string {
    return cleanAnswerWhitespace(
        text
            .replace(BRACKET_TOKEN_REGEX, (full, tokenValue: string) => {
                const token = tokenValue.trim();
                if (NON_SOURCE_TAGS.has(token)) return "";
                if (/^source\s*#/i.test(token)) return "";
                if (/^source\s*=/i.test(token)) return "";
                return full;
            })
            .replace(RELIABILITY_TAG_REGEX, "")
    );
}

// ── Citation extraction ──────────────────────────────────────────────

export function extractCitationSnippet(answer: string, tokenIndex: number): string {
    const lineStart = answer.lastIndexOf("\n", tokenIndex) + 1;
    const rawLine = answer.slice(lineStart, tokenIndex);
    let candidate = stripMarkdownDecorators(
        rawLine
            .replace(BRACKET_TOKEN_REGEX, "")
            .replace(RELIABILITY_TAG_REGEX, "")
            .replace(/\s+/g, " ")
            .trim()
    );

    if (!candidate) {
        const windowSize = 320;
        const start = Math.max(0, tokenIndex - windowSize);
        const windowText = answer.slice(start, tokenIndex);
        const lines = windowText
            .split("\n")
            .filter((line) => line.trim().length > 0);
        candidate = stripMarkdownDecorators(
            (lines.at(-1) ?? windowText)
                .replace(BRACKET_TOKEN_REGEX, "")
                .replace(RELIABILITY_TAG_REGEX, "")
                .replace(/\s+/g, " ")
                .trim()
        );
    }

    if (!candidate) return "";

    const sentences = candidate
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
    if (sentences.length > 1) {
        const lastSentence = sentences.at(-1) ?? "";
        if (lastSentence.length >= 35) {
            return lastSentence;
        }
    }

    return candidate.length > 220 ? candidate.slice(0, 220).trim() : candidate;
}

export function detectReliabilityNearToken(
    answer: string,
    tokenIndex: number
): CitationMention["reliability"] {
    const lineStart = answer.lastIndexOf("\n", tokenIndex) + 1;
    const nextNewline = answer.indexOf("\n", tokenIndex);
    const lineEnd = nextNewline === -1 ? answer.length : nextNewline;
    const line = answer.slice(lineStart, lineEnd);

    if (line.includes("[Suggested baseline (inference)]")) {
        return "Suggested baseline (inference)";
    }
    if (line.includes("[Inference]")) {
        return "Inference";
    }
    if (line.includes("[KB]")) {
        return "KB";
    }

    const windowStart = Math.max(0, tokenIndex - 320);
    const nearby = answer.slice(windowStart, tokenIndex + 1);
    const matches = [...nearby.matchAll(RELIABILITY_CAPTURE_REGEX)];
    const last = matches.at(-1)?.[1];
    if (last === "Inference") return "Inference";
    if (last === "Suggested baseline (inference)") {
        return "Suggested baseline (inference)";
    }
    if (last === "KB") return "KB";

    const heuristicWindow = nearby.toLowerCase();
    if (
        /\b(infer|inference|implies|suggest|likely|probably|assume|recommend|interpret|could|may|might)\b/.test(
            heuristicWindow
        )
    ) {
        return "Inference";
    }
    if (
        /\b(target|baseline|threshold|kpi|cutoff|minimum|maximum)\b/.test(
            heuristicWindow
        ) &&
        /\d/.test(heuristicWindow)
    ) {
        return "Suggested baseline (inference)";
    }

    return "KB";
}

// ── Citation extraction from stored messages ─────────────────────────

export function extractCitationMentionsFromStored(
    text: string,
    citations: string[]
): CitationMention[] {
    if (!text || citations.length === 0) return [];

    const citationLookup = new Map<string, string>();
    for (const source of citations) {
        const normalized = source.trim();
        if (!normalized) continue;
        citationLookup.set(normalizeSourceLabelKey(normalized), normalized);
    }

    const mentions: CitationMention[] = [];
    const mentionSeen = new Set<string>();
    const tokenRegex = new RegExp(BRACKET_TOKEN_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(text)) !== null) {
        const token = normalizeCitationToken(match[1]);
        if (!token || NON_SOURCE_TAGS.has(token)) continue;

        const sourceLabel = citationLookup.get(normalizeSourceLabelKey(token));
        if (!sourceLabel) continue;

        const snippet = extractCitationSnippet(text, match.index);
        if (!snippet) continue;

        const reliability = detectReliabilityNearToken(text, match.index);
        const mentionKey = `${sourceLabel}::${reliability}::${snippet}`;
        if (mentionSeen.has(mentionKey)) continue;
        mentionSeen.add(mentionKey);
        mentions.push({
            source: sourceLabel,
            snippet,
            reliability,
        });
    }

    return mentions;
}

// ── Full answer parser (used by AppContext for live responses) ────────

export function parseAnswerArtifacts(
    answer: string,
    availableSources: string[]
): {
    content: string;
    markdownContent: string;
    citations: string[];
    citationMentions: CitationMention[];
} {
    if (!answer.trim()) {
        return {
            content: "",
            markdownContent: "",
            citations: [],
            citationMentions: [],
        };
    }

    const canonicalSourceMap = new Map<string, string>();
    for (const source of availableSources) {
        const normalized = source.trim();
        if (!normalized) continue;
        canonicalSourceMap.set(normalizeSourceLabelKey(normalized), normalized);
    }

    const citations: string[] = [];
    const citationSeen = new Set<string>();
    const mentions: CitationMention[] = [];
    const mentionSeen = new Set<string>();

    const cleaned = answer.replace(BRACKET_TOKEN_REGEX, (full, tokenValue: string, offset: number, raw: string) => {
        const normalizedToken = normalizeCitationToken(tokenValue);
        if (!normalizedToken || NON_SOURCE_TAGS.has(normalizedToken)) {
            return full;
        }

        const tokenKey = normalizeSourceLabelKey(normalizedToken);
        const canonical = canonicalSourceMap.get(tokenKey);
        const looksLikeSourceLabel =
            Boolean(canonical) ||
            normalizedToken.includes("/") ||
            normalizedToken.includes("\\") ||
            /\.md(\b|$)/i.test(normalizedToken) ||
            tokenValue.trim().toLowerCase().startsWith("source=");

        if (!looksLikeSourceLabel) {
            return full;
        }
        const sourceLabel = canonical ?? normalizedToken;

        if (!citationSeen.has(sourceLabel)) {
            citations.push(sourceLabel);
            citationSeen.add(sourceLabel);
        }

        const snippet = extractCitationSnippet(raw, offset);
        if (snippet) {
            const reliability = detectReliabilityNearToken(raw, offset);
            const mentionKey = `${sourceLabel}::${reliability}::${snippet}`;
            if (!mentionSeen.has(mentionKey)) {
                mentions.push({
                    source: sourceLabel,
                    snippet,
                    reliability,
                });
                mentionSeen.add(mentionKey);
            }
        }

        return "";
    });

    const content = cleanAnswerWhitespace(stripReliabilityTags(cleaned));
    const markdownCitationBlock =
        citations.length > 0
            ? `\n\n### Citations\n${citations.map((source) => `- [${source}]`).join("\n")}`
            : "";

    return {
        content,
        markdownContent: `${content}${markdownCitationBlock}`.trim(),
        citations,
        citationMentions: mentions,
    };
}
