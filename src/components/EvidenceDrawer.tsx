"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useApp } from "@/store/AppContext";
import type { CitationMention, MatchItem, ReliabilityTag } from "@/types/chat";

const CloseIcon = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
    >
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
);

const ExpandIcon = ({ open }: { open: boolean }) => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform var(--duration-fast) var(--ease-out)",
        }}
    >
        <polyline points="6,3 11,8 6,13" />
    </svg>
);

function normalizeSourceLabelKey(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[\u2010-\u2015]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function ScoreBar({ score }: { score: number }) {
    const pct = Math.round(score * 100);
    const color =
        score >= 0.8
            ? "var(--color-success)"
            : score >= 0.5
                ? "var(--color-warning)"
                : "var(--color-danger)";

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginTop: "var(--space-2)",
            }}
        >
            <div
                style={{
                    flex: 1,
                    height: 4,
                    background: "var(--color-cream)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                }}
            >
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        height: "100%",
                        background: color,
                        borderRadius: "var(--radius-full)",
                    }}
                />
            </div>
            <span
                style={{
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-tertiary)",
                    minWidth: 36,
                    textAlign: "right",
                }}
            >
                {pct}%
            </span>
        </div>
    );
}

function reliabilityStyle(label: ReliabilityTag | "Unlabeled") {
    if (label === "KB") {
        return {
            color: "var(--color-success)",
            background: "rgba(74, 158, 111, 0.12)",
        };
    }
    if (label === "Inference") {
        return {
            color: "var(--color-info)",
            background: "rgba(91, 142, 191, 0.14)",
        };
    }
    if (label === "Suggested baseline (inference)") {
        return {
            color: "var(--color-warning)",
            background: "rgba(212, 168, 67, 0.14)",
        };
    }
    return {
        color: "var(--text-tertiary)",
        background: "rgba(160, 154, 141, 0.16)",
    };
}

interface MentionRef {
    mention: CitationMention;
    index: number;
}

interface SourceGroup {
    key: string;
    source: string;
    match?: MatchItem;
    mentions: MentionRef[];
}

function sourceAlias(index: number): string {
    return `Source #${String(index + 1).padStart(2, "0")}`;
}

function SourceCard({
    group,
    index,
    alias,
    isOpen,
    onToggle,
    onHoverMention,
    onLeaveMention,
    onClickMention,
    isMentionActive,
}: {
    group: SourceGroup;
    index: number;
    alias: string;
    isOpen: boolean;
    onToggle: () => void;
    onHoverMention: (idx: number) => void;
    onLeaveMention: () => void;
    onClickMention: (idx: number) => void;
    isMentionActive: (idx: number) => boolean;
}) {
    const sourceScore = group.match ? (group.match.score * 100).toFixed(1) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                marginBottom: "var(--space-3)",
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                onMouseEnter={() => {
                    if (group.mentions.length > 0) {
                        onHoverMention(group.mentions[0].index);
                    }
                }}
                onMouseLeave={onLeaveMention}
                style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    padding: "var(--space-4)",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: "var(--space-3)",
                }}
            >
                <ExpandIcon open={isOpen} />
                <div>
                    <div
                        style={{
                            fontSize: "var(--text-sm)",
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            wordBreak: "break-word",
                            marginBottom: "var(--space-1)",
                        }}
                    >
                        {alias}
                    </div>
                    <div
                        style={{
                            fontSize: "var(--text-xs)",
                            color: "var(--text-tertiary)",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        {sourceScore
                            ? `Score ${sourceScore}% - ${group.mentions.length} used`
                            : group.mentions.length > 0
                                ? `${group.mentions.length} used - cited in answer`
                                : "Cited in answer"}
                    </div>
                    {group.match ? <ScoreBar score={group.match.score} /> : null}
                </div>
                <span
                    style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-tertiary)",
                        fontFamily: "var(--font-mono)",
                    }}
                >
                    {alias}
                </span>
            </button>

            {isOpen ? (
                <div
                    style={{
                        borderTop: "1px solid var(--border-subtle)",
                        padding: "var(--space-4)",
                    }}
                >
                    <div
                        style={{
                            fontSize: "10px",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-tertiary)",
                            marginBottom: "var(--space-2)",
                        }}
                    >
                        Used in generated answer
                    </div>

                    {group.mentions.length === 0 ? (
                        <div
                            style={{
                                fontSize: "var(--text-xs)",
                                color: "var(--text-tertiary)",
                            }}
                        >
                            {group.match
                                ? "This source is retrieved but not explicitly cited in this answer."
                                : "This source is cited, but no snippet was extracted for highlighting."}
                        </div>
                    ) : (
                        group.mentions.map(({ mention, index: mentionIndex }) => {
                            const tagStyle = reliabilityStyle(mention.reliability);
                            return (
                                <button
                                    key={`${group.key}-${mentionIndex}`}
                                    type="button"
                                    onMouseEnter={() => onHoverMention(mentionIndex)}
                                    onMouseLeave={onLeaveMention}
                                    onFocus={() => onHoverMention(mentionIndex)}
                                    onBlur={onLeaveMention}
                                    onClick={() => onClickMention(mentionIndex)}
                                    style={{
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "var(--space-3)",
                                        border: isMentionActive(mentionIndex)
                                            ? "1px solid var(--color-accent)"
                                            : "1px solid var(--border-subtle)",
                                        borderRadius: "var(--radius-sm)",
                                        background: "var(--bg-tertiary)",
                                        cursor: "pointer",
                                        marginBottom: "var(--space-2)",
                                        transition:
                                            "border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
                                        boxShadow: isMentionActive(mentionIndex)
                                            ? "var(--shadow-sm)"
                                            : "none",
                                    }}
                                >
                                    <span
                                        style={{
                                            ...tagStyle,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            padding: "2px 8px",
                                            borderRadius: "var(--radius-full)",
                                            fontSize: "11px",
                                            fontFamily: "var(--font-mono)",
                                            marginBottom: "var(--space-2)",
                                        }}
                                    >
                                        {mention.reliability}
                                    </span>
                                    <div
                                        style={{
                                            fontSize: "var(--text-sm)",
                                            color: "var(--text-secondary)",
                                            lineHeight: "var(--leading-normal)",
                                        }}
                                    >
                                        {mention.snippet}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            ) : null}
        </motion.div>
    );
}

export default function EvidenceDrawer() {
    const { state, dispatch } = useApp();
    const {
        evidenceDrawerOpen,
        selectedMessageId,
        hoveredCitationIndex,
        hoveredCitationMessageId,
        activeCitationIndex,
        activeCitationMessageId,
    } = state;

    const [openSourceKey, setOpenSourceKey] = useState<string | null>(null);

    const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);
    const selectedMessage = activeSession?.messages.find(
        (m) => m.id === selectedMessageId
    );

    const matches = useMemo(
        () => selectedMessage?.matches ?? [],
        [selectedMessage?.matches]
    );
    const citationMentions = useMemo(
        () => selectedMessage?.citationMentions ?? [],
        [selectedMessage?.citationMentions]
    );
    const citations = useMemo(
        () => selectedMessage?.citations ?? [],
        [selectedMessage?.citations]
    );

    const sourceGroups = useMemo(() => {
        const groups = new Map<string, SourceGroup>();

        for (const match of matches) {
            const key = normalizeSourceLabelKey(match.source);
            groups.set(key, {
                key,
                source: match.source,
                match,
                mentions: [],
            });
        }

        citationMentions.forEach((mention, mentionIndex) => {
            const key = normalizeSourceLabelKey(mention.source);
            const existing = groups.get(key);
            if (existing) {
                existing.mentions.push({ mention, index: mentionIndex });
                return;
            }
            groups.set(key, {
                key,
                source: mention.source,
                mentions: [{ mention, index: mentionIndex }],
            });
        });

        citations.forEach((citation) => {
            const source = citation.trim();
            if (!source) return;
            const key = normalizeSourceLabelKey(source);
            if (groups.has(key)) return;
            groups.set(key, {
                key,
                source,
                mentions: [],
            });
        });

        return [...groups.values()].sort((a, b) => {
            const aHasMatch = Boolean(a.match);
            const bHasMatch = Boolean(b.match);
            if (aHasMatch !== bHasMatch) {
                return aHasMatch ? -1 : 1;
            }
            const aScore = a.match?.score ?? -1;
            const bScore = b.match?.score ?? -1;
            return bScore - aScore;
        });
    }, [matches, citationMentions, citations]);

    const setHovered = (index: number | null) => {
        dispatch({
            type: "SET_HOVERED_CITATION",
            index,
            messageId: index === null || !selectedMessageId ? null : selectedMessageId,
        });
    };

    const setActive = (index: number) => {
        if (!selectedMessageId) return;

        dispatch({
            type: "SET_ACTIVE_CITATION",
            index,
            messageId: selectedMessageId,
        });

        window.setTimeout(() => {
            const target = document.getElementById(
                `citation-target-${selectedMessageId}-${index}`
            );
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 40);
    };

    const isMentionActive = (index: number) =>
        (hoveredCitationMessageId === selectedMessageId &&
            hoveredCitationIndex === index) ||
        (activeCitationMessageId === selectedMessageId &&
            activeCitationIndex === index);

    return (
        <motion.aside
            initial={false}
            animate={{
                x: evidenceDrawerOpen ? 0 : 12,
                opacity: evidenceDrawerOpen ? 1 : 0,
            }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden={!evidenceDrawerOpen}
            style={{
                width: "var(--drawer-width)",
                minWidth: "var(--drawer-width)",
                height: "100dvh",
                background: "var(--bg-drawer)",
                borderLeft: evidenceDrawerOpen
                    ? "1px solid var(--border-default)"
                    : "1px solid transparent",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                zIndex: 25,
                boxShadow: evidenceDrawerOpen ? "var(--shadow-lg)" : "none",
                pointerEvents: evidenceDrawerOpen ? "auto" : "none",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-4) var(--space-5)",
                    borderBottom: "1px solid var(--border-subtle)",
                    height: "var(--header-height)",
                }}
            >
                <div>
                    <h3
                        style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "var(--text-md)",
                            fontWeight: 400,
                        }}
                    >
                        Sources
                    </h3>
                    <span
                        style={{
                            fontSize: "var(--text-xs)",
                            color: "var(--text-tertiary)",
                        }}
                    >
                        {sourceGroups.length} sources - {citationMentions.length} used snippets
                    </span>
                </div>
                <button
                    onClick={() => dispatch({ type: "TOGGLE_EVIDENCE_DRAWER" })}
                    id="btn-close-drawer"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        background: "transparent",
                        color: "var(--text-tertiary)",
                        cursor: "pointer",
                    }}
                >
                    <CloseIcon />
                </button>
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "var(--space-4)",
                }}
            >
                {sourceGroups.length === 0 ? (
                    <div
                        style={{
                            padding: "var(--space-4)",
                            fontSize: "var(--text-sm)",
                            color: "var(--text-tertiary)",
                        }}
                    >
                        No sources available for this response.
                    </div>
                ) : (
                    sourceGroups.map((group, index) => {
                        const scopedSourceKey = `${selectedMessageId ?? "none"}::${group.key}`;
                        const alias = sourceAlias(index);
                        return (
                            <SourceCard
                                key={group.key}
                                group={group}
                                index={index}
                                alias={alias}
                                isOpen={openSourceKey === scopedSourceKey}
                                onToggle={() =>
                                    setOpenSourceKey((prev) =>
                                        prev === scopedSourceKey
                                            ? null
                                            : scopedSourceKey
                                    )
                                }
                                onHoverMention={(mentionIndex) => setHovered(mentionIndex)}
                                onLeaveMention={() => setHovered(null)}
                                onClickMention={(mentionIndex) => setActive(mentionIndex)}
                                isMentionActive={isMentionActive}
                            />
                        );
                    })
                )}
            </div>

            <div
                style={{
                    padding: "var(--space-3) var(--space-5)",
                    borderTop: "1px solid var(--border-subtle)",
                    fontSize: "var(--text-xs)",
                    color: "var(--text-tertiary)",
                }}
            >
                Open a source card and hover a used snippet to highlight it in the answer.
            </div>
        </motion.aside>
    );
}
