/* ─── Reliability parsing utilities ─── */

import type { EvidenceStrength, ReliabilityTag, MatchItem } from "@/types/chat";

/** Extract all reliability tags ([KB], [Inference], etc.) from an answer string */
export function extractReliabilityTags(answer: string): ReliabilityTag[] {
    const tags: Set<ReliabilityTag> = new Set();
    const patterns: [RegExp, ReliabilityTag][] = [
        [/\[KB\]/g, "KB"],
        [/\[Inference\]/g, "Inference"],
        [/\[Suggested baseline \(inference\)\]/g, "Suggested baseline (inference)"],
    ];

    for (const [regex, tag] of patterns) {
        if (regex.test(answer)) {
            tags.add(tag);
        }
    }

    return Array.from(tags);
}

/** Determine evidence strength from matches */
export function assessEvidenceStrength(
    matches: MatchItem[],
    answer: string
): EvidenceStrength {
    if (!matches || matches.length === 0) return "none";

    const topScore = Math.max(...matches.map((m) => m.score));
    const uniqueSources = new Set(matches.map((m) => m.source)).size;

    // Check for weak evidence signals in the answer
    const weakSignals = [
        "no relevant context",
        "context is insufficient",
        "what is missing",
        "could not find",
        "no results",
    ];
    const hasWeakSignal = weakSignals.some((s) =>
        answer.toLowerCase().includes(s)
    );

    if (hasWeakSignal) return "weak";
    if (topScore >= 0.8 && uniqueSources >= 2) return "strong";
    if (topScore >= 0.5) return "moderate";
    return "weak";
}

/** Generate a human-readable reliability summary */
export function getReliabilitySummary(
    tags: ReliabilityTag[],
    strength: EvidenceStrength
): string {
    const parts: string[] = [];

    if (tags.includes("KB")) parts.push("Knowledge-base grounded");
    if (tags.includes("Inference")) parts.push("Contains inferences");
    if (tags.includes("Suggested baseline (inference)"))
        parts.push("Includes suggested baselines");

    const strengthLabels: Record<EvidenceStrength, string> = {
        strong: "Strong evidence",
        moderate: "Moderate evidence",
        weak: "Weak evidence — verify independently",
        none: "No evidence found",
    };

    parts.push(strengthLabels[strength]);
    return parts.join(" · ");
}
