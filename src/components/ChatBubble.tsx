"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    Fragment,
    cloneElement,
    isValidElement,
    type ComponentPropsWithoutRef,
    type ReactNode,
    useMemo,
    useState,
} from "react";
import type { ChatMessage, ReliabilityTag } from "@/types/chat";
import { useApp } from "@/store/AppContext";
import { assessEvidenceStrength } from "@/lib/reliability";

const SourceIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M14 2H8l-2 2H2v10h12V2z" />
    </svg>
);

const CopyIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="5" y="5" width="9" height="9" rx="1.5" />
        <path d="M3 11.5H2.5A1.5 1.5 0 011 10V2.5A1.5 1.5 0 012.5 1H10A1.5 1.5 0 0111.5 2.5V3" />
    </svg>
);

const AlertIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M6.86 2.57L1.05 12.5a1.14 1.14 0 001 1.71h11.6a1.14 1.14 0 001-1.71L8.84 2.57a1.14 1.14 0 00-1.98 0z" />
        <line x1="8" y1="6.29" x2="8" y2="9.14" />
        <line x1="8" y1="11.43" x2="8.01" y2="11.43" />
    </svg>
);

const ErrorIcon = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="8" cy="8" r="7" />
        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
    </svg>
);

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightClassForReliability(
    reliability: ReliabilityTag | "Unlabeled"
): string {
    if (reliability === "KB") return "citation-highlight-kb";
    if (reliability === "Inference") return "citation-highlight-inference";
    if (reliability === "Suggested baseline (inference)") {
        return "citation-highlight-baseline";
    }
    return "citation-highlight";
}

function highlightFirstOccurrence(
    text: string,
    snippet: string,
    markId: string,
    markClassName: string,
    onceFlag: { used: boolean }
): ReactNode {
    if (onceFlag.used || !snippet.trim()) {
        return text;
    }

    const pattern = new RegExp(escapeRegExp(snippet.trim()), "i");
    const hit = pattern.exec(text);
    if (!hit) {
        return text;
    }

    onceFlag.used = true;
    const idx = hit.index;
    const matched = hit[0];

    return (
        <>
            {idx > 0 ? text.slice(0, idx) : null}
            <mark id={markId} className={markClassName}>
                {matched}
            </mark>
            {idx + matched.length < text.length
                ? text.slice(idx + matched.length)
                : null}
        </>
    );
}

function injectCitationHighlight(
    node: ReactNode,
    snippet: string,
    markId: string,
    markClassName: string,
    onceFlag: { used: boolean }
): ReactNode {
    if (!snippet.trim()) return node;

    if (typeof node === "string") {
        return highlightFirstOccurrence(
            node,
            snippet,
            markId,
            markClassName,
            onceFlag
        );
    }

    if (Array.isArray(node)) {
        return node.map((child, index) => (
            <Fragment key={`hl-node-${index}`}>
                {injectCitationHighlight(child, snippet, markId, markClassName, onceFlag)}
            </Fragment>
        ));
    }

    if (isValidElement<{ children?: ReactNode }>(node)) {
        const children = node.props.children;
        if (children === undefined) {
            return node;
        }
        return cloneElement(
            node,
            undefined,
            injectCitationHighlight(children, snippet, markId, markClassName, onceFlag)
        );
    }

    return node;
}

function decorateMarkdown(
    node: ReactNode,
    activeHighlight:
        | {
            snippet: string;
            markId: string;
            markClassName: string;
        }
        | null
): ReactNode {
    if (!activeHighlight) {
        return node;
    }

    const onceFlag = { used: false };
    return injectCitationHighlight(
        node,
        activeHighlight.snippet,
        activeHighlight.markId,
        activeHighlight.markClassName,
        onceFlag
    );
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <motion.svg
        animate={{ rotate: expanded ? 180 : 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="4 6 8 10 12 6" />
    </motion.svg>
);

const CheckIcon = () => (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 8.5 6.5 12 13 4" />
    </svg>
);

const SpinnerIcon = () => (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
);

function ThinkingTrace({
    thinkingStatus,
    thinkingSteps,
}: {
    thinkingStatus?: string;
    thinkingSteps?: ChatMessage["thinkingSteps"];
}) {
    const steps = thinkingSteps ?? [];
    if (!thinkingStatus && steps.length === 0) {
        return null;
    }

    const completedCount = steps.filter((s) => s.state === "done").length;
    const totalCount = steps.length;
    const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="thinking-trace-card"
            style={{
                marginTop: "var(--space-3)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: "1px solid color-mix(in oklch, var(--color-warning) 25%, var(--border-default))",
                background: "linear-gradient(135deg, rgba(247,245,240,.97), rgba(255,255,255,.92))",
                backdropFilter: "blur(8px)",
                boxShadow: "0 2px 12px rgba(212, 168, 67, 0.08), 0 1px 3px rgba(0,0,0,0.04)",
            }}
        >
            {/* Shimmer progress bar */}
            <div style={{ height: 2, background: "var(--border-subtle)", position: "relative", overflow: "hidden" }}>
                <motion.div
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="thinking-shimmer-bar"
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: "100%",
                        background: "linear-gradient(90deg, var(--color-warning), var(--color-accent))",
                        borderRadius: "0 2px 2px 0",
                    }}
                />
            </div>

            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
                {/* Header */}
                {thinkingStatus && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            marginBottom: steps.length > 0 ? "var(--space-3)" : 0,
                        }}
                    >
                        <div style={{
                            width: 18,
                            height: 18,
                            borderRadius: "var(--radius-sm)",
                            background: "linear-gradient(135deg, rgba(212,168,67,0.15), rgba(196,122,74,0.1))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}>
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round">
                                <circle cx="8" cy="8" r="3" />
                                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
                            </svg>
                        </div>
                        <span
                            style={{
                                fontSize: "var(--text-xs)",
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                letterSpacing: "0.01em",
                            }}
                        >
                            {thinkingStatus}
                        </span>
                        {totalCount > 0 && (
                            <span
                                style={{
                                    marginLeft: "auto",
                                    fontSize: "11px",
                                    color: "var(--text-tertiary)",
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 500,
                                }}
                            >
                                {completedCount}/{totalCount}
                            </span>
                        )}
                    </div>
                )}

                {/* Timeline steps */}
                {steps.length > 0 && (
                    <div style={{ display: "grid", gap: 0, position: "relative" }}>
                        {steps.map((step, idx) => {
                            const isActive = step.state === "active";
                            const isDone = step.state === "done";
                            const isLast = idx === steps.length - 1;

                            return (
                                <div
                                    key={step.id}
                                    style={{
                                        display: "flex",
                                        gap: "var(--space-3)",
                                        position: "relative",
                                        paddingBottom: isLast ? 0 : "var(--space-3)",
                                    }}
                                >
                                    {/* Timeline spine */}
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            flexShrink: 0,
                                            width: 20,
                                            paddingTop: 2,
                                        }}
                                    >
                                        {/* Step node */}
                                        <motion.div
                                            animate={
                                                isActive
                                                    ? {
                                                        boxShadow: [
                                                            "0 0 0 0 rgba(212,168,67,0.3)",
                                                            "0 0 0 5px rgba(212,168,67,0)",
                                                            "0 0 0 0 rgba(212,168,67,0.3)",
                                                        ],
                                                    }
                                                    : { boxShadow: "0 0 0 0 transparent" }
                                            }
                                            transition={
                                                isActive
                                                    ? {
                                                        duration: 1.5,
                                                        repeat: Infinity,
                                                        ease: "easeInOut",
                                                    }
                                                    : undefined
                                            }
                                            style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: "50%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                border: isDone
                                                    ? "2px solid var(--color-success)"
                                                    : isActive
                                                        ? "2px solid var(--color-warning)"
                                                        : "2px solid var(--border-default)",
                                                background: isDone
                                                    ? "rgba(74, 158, 111, 0.1)"
                                                    : isActive
                                                        ? "rgba(212, 168, 67, 0.1)"
                                                        : "var(--bg-tertiary)",
                                                color: isDone
                                                    ? "var(--color-success)"
                                                    : isActive
                                                        ? "var(--color-warning)"
                                                        : "var(--text-tertiary)",
                                                transition: "all 0.3s ease",
                                            }}
                                        >
                                            {isDone ? <CheckIcon /> : isActive ? <SpinnerIcon /> : (
                                                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border-default)" }} />
                                            )}
                                        </motion.div>

                                        {/* Connecting line */}
                                        {!isLast && (
                                            <div
                                                style={{
                                                    flex: 1,
                                                    width: 2,
                                                    marginTop: 2,
                                                    borderRadius: 1,
                                                    background: isDone
                                                        ? "var(--color-success)"
                                                        : "var(--border-default)",
                                                    opacity: isDone ? 0.4 : 0.3,
                                                    transition: "all 0.3s ease",
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* Step content */}
                                    <div style={{ minWidth: 0, paddingTop: 1 }}>
                                        <div
                                            style={{
                                                fontSize: "var(--text-xs)",
                                                color: isActive
                                                    ? "var(--text-primary)"
                                                    : isDone
                                                        ? "var(--text-secondary)"
                                                        : "var(--text-tertiary)",
                                                fontWeight: isActive ? 600 : 500,
                                                lineHeight: 1.4,
                                                transition: "color 0.2s ease",
                                            }}
                                        >
                                            {step.label}
                                        </div>
                                        {step.detail && (
                                            <div
                                                style={{
                                                    fontSize: "11px",
                                                    color: "var(--text-tertiary)",
                                                    lineHeight: 1.4,
                                                    marginTop: 2,
                                                }}
                                            >
                                                {step.detail}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function TypingIndicator({
    responseMode,
    thinkingStatus,
    thinkingSteps,
}: {
    responseMode?: ChatMessage["responseMode"];
    thinkingStatus?: string;
    thinkingSteps?: ChatMessage["thinkingSteps"];
}) {
    const isHeavy = responseMode === "heavy";
    const [showThinking, setShowThinking] = useState(isHeavy);
    const canShowThinking =
        isHeavy &&
        (Boolean(thinkingStatus) ||
            Boolean(thinkingSteps && thinkingSteps.length > 0));

    return (
        <div
            style={{
                display: "grid",
                gap: "var(--space-2)",
                color: "var(--text-secondary)",
            }}
        >
            {/* Typing / Thinking header */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                {/* Glowing orb */}
                <div style={{ position: "relative", width: 28, height: 28, flexShrink: 0 }}>
                    <motion.div
                        animate={{
                            scale: [1, 1.35, 1],
                            opacity: [0.25, 0.5, 0.25],
                        }}
                        transition={{
                            duration: isHeavy ? 2 : 1.4,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%",
                            background: isHeavy
                                ? "radial-gradient(circle, var(--color-warning), transparent 70%)"
                                : "radial-gradient(circle, var(--color-accent), transparent 70%)",
                        }}
                    />
                    <motion.div
                        animate={
                            isHeavy
                                ? { scale: [0.9, 1.1, 0.9] }
                                : { scale: [0.95, 1.05, 0.95] }
                        }
                        transition={{
                            duration: isHeavy ? 1.6 : 1,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                        style={{
                            position: "absolute",
                            inset: 6,
                            borderRadius: "50%",
                            background: isHeavy
                                ? "linear-gradient(135deg, var(--color-warning), var(--color-accent))"
                                : "var(--color-accent)",
                            boxShadow: isHeavy
                                ? "0 0 12px rgba(212, 168, 67, 0.4)"
                                : "0 0 8px rgba(196, 122, 74, 0.3)",
                        }}
                    />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <span
                            style={{
                                fontSize: "var(--text-sm)",
                                fontWeight: 600,
                                color: isHeavy ? "var(--color-warning)" : "var(--text-secondary)",
                                letterSpacing: "0.01em",
                            }}
                        >
                            {isHeavy ? "Jiff is thinking" : "Jiff is typing"}
                        </span>
                        <span className="typing-dots">
                            {[0, 1, 2].map((index) => (
                                <motion.span
                                    key={index}
                                    className="typing-dot"
                                    animate={
                                        isHeavy
                                            ? { scale: [0.85, 1.25, 0.85], opacity: [0.35, 1, 0.35] }
                                            : { y: [0, -3, 0], opacity: [0.35, 1, 0.35] }
                                    }
                                    transition={{
                                        duration: isHeavy ? 0.85 : 0.7,
                                        repeat: Infinity,
                                        delay: index * 0.12,
                                        ease: "easeInOut",
                                    }}
                                    style={{
                                        background: isHeavy
                                            ? "var(--color-warning)"
                                            : "var(--color-accent)",
                                    }}
                                />
                            ))}
                        </span>
                    </div>
                    {isHeavy && (
                        <span
                            style={{
                                fontSize: "11px",
                                color: "var(--text-tertiary)",
                                lineHeight: 1.3,
                            }}
                        >
                            Analyzing evidence and reasoning deeply
                        </span>
                    )}
                </div>
            </div>

            {/* Expandable thinking trace */}
            {canShowThinking && (
                <div style={{ display: "grid", gap: 0 }}>
                    <button
                        type="button"
                        onClick={() => setShowThinking((prev) => !prev)}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "var(--space-1)",
                            width: "fit-content",
                            fontSize: "var(--text-xs)",
                            fontWeight: 500,
                            color: "var(--text-tertiary)",
                            background: showThinking
                                ? "rgba(212, 168, 67, 0.08)"
                                : "transparent",
                            border: "none",
                            padding: "var(--space-1) var(--space-2)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--text-secondary)";
                            e.currentTarget.style.background = "rgba(212, 168, 67, 0.12)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-tertiary)";
                            e.currentTarget.style.background = showThinking
                                ? "rgba(212, 168, 67, 0.08)"
                                : "transparent";
                        }}
                    >
                        <ChevronIcon expanded={showThinking} />
                        <span>{showThinking ? "Hide progress" : "Show progress"}</span>
                    </button>
                    {showThinking && (
                        <ThinkingTrace
                            thinkingStatus={thinkingStatus}
                            thinkingSteps={thinkingSteps}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function buildMarkdownForCopy(message: ChatMessage): string {
    const base = (message.content ?? message.markdownContent ?? "").trim();
    if (!base) return "";

    let out = base
        // Remove appended citation section entirely.
        .replace(/\n{0,2}###\s+Citations[\s\S]*$/i, "")
        // Remove common inline source token formats.
        .replace(/\[\s*source\s*=\s*[^\]\n]+\]/gi, "")
        .replace(/\[\s*source\s*#?\s*\d+[^\]\n]*\]/gi, "");

    if (message.citations && message.citations.length > 0) {
        for (const citation of message.citations) {
            const trimmed = citation.trim();
            if (!trimmed) continue;
            const sourcePattern = new RegExp(
                `\\[\\s*${escapeRegExp(trimmed)}\\s*\\]`,
                "gi"
            );
            out = out.replace(sourcePattern, "");
        }
    }

    return out
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function writeClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}

interface ChatBubbleProps {
    message: ChatMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
    const { state, dispatch } = useApp();
    const isUser = message.role === "user";
    const [copied, setCopied] = useState(false);
    const [showThinkingModel, setShowThinkingModel] = useState(false);

    const evidenceStrength = message.matches
        ? assessEvidenceStrength(message.matches, message.content)
        : undefined;
    const isWeakEvidence = evidenceStrength === "weak" || evidenceStrength === "none";
    const hasMatches = Boolean(message.matches && message.matches.length > 0);
    const hasCitations = Boolean(message.citations && message.citations.length > 0);
    const hasMentionedSources = Boolean(
        message.citationMentions && message.citationMentions.length > 0
    );
    const hasEvidence = hasMatches || hasCitations || hasMentionedSources;
    const sourceCount = hasMatches
        ? message.matches?.length ?? 0
        : hasCitations
            ? new Set(
                (message.citations ?? [])
                    .map((source) => source.trim())
                    .filter(Boolean)
            ).size
            : new Set(
                (message.citationMentions ?? [])
                    .map((mention) => mention.source.trim())
                    .filter(Boolean)
            ).size;
    const sourceLabel = sourceCount === 1 ? "source" : "sources";
    const canViewThinkingModel = Boolean(
        !isUser &&
        !message.isLoading &&
        !message.isError &&
        ((message.thinkingSteps && message.thinkingSteps.length > 0) ||
            message.thinkingStatus ||
            message.routingReason)
    );

    const activeHighlight = useMemo(() => {
        if (!message.citationMentions || message.citationMentions.length === 0) {
            return null;
        }

        const hoverApplies =
            state.hoveredCitationMessageId === message.id &&
            state.hoveredCitationIndex !== null;
        const activeApplies =
            state.activeCitationMessageId === message.id &&
            state.activeCitationIndex !== null;

        const index = hoverApplies
            ? state.hoveredCitationIndex
            : activeApplies
                ? state.activeCitationIndex
                : null;

        if (index === null) return null;
        const mention = message.citationMentions[index];
        if (!mention || !mention.snippet.trim()) return null;

        return {
            snippet: mention.snippet.trim(),
            markId: `citation-target-${message.id}-${index}`,
            markClassName: highlightClassForReliability(mention.reliability),
        };
    }, [
        message.citationMentions,
        message.id,
        state.hoveredCitationMessageId,
        state.hoveredCitationIndex,
        state.activeCitationMessageId,
        state.activeCitationIndex,
    ]);

    const handleCopy = async () => {
        const markdown = buildMarkdownForCopy(message);
        if (!markdown) return;
        try {
            await writeClipboard(markdown);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            setCopied(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
                display: "flex",
                justifyContent: isUser ? "flex-end" : "flex-start",
                marginBottom: "var(--space-4)",
            }}
        >
            <div style={{ maxWidth: isUser ? "clamp(65%, 70vw, 85%)" : "clamp(80%, 90vw, 95%)", width: "100%" }}>
                <div
                    style={{
                        fontSize: "var(--text-xs)",
                        fontWeight: 500,
                        color: "var(--text-tertiary)",
                        marginBottom: "var(--space-1)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textAlign: isUser ? "end" : "start",
                    }}
                >
                    {isUser ? "You" : "Jiff"}
                </div>

                <div
                    style={{
                        padding: isUser ? "var(--space-3) var(--space-5)" : "var(--space-5)",
                        borderRadius: isUser
                            ? "var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)"
                            : "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)",
                        background: isUser ? "var(--color-charcoal)" : "var(--bg-tertiary)",
                        color: isUser ? "var(--text-inverse)" : "var(--text-primary)",
                        border: isUser ? "none" : "1px solid var(--border-subtle)",
                        transition:
                            "box-shadow var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
                        borderColor: activeHighlight
                            ? "var(--color-accent)"
                            : isUser
                                ? "transparent"
                                : "var(--border-subtle)",
                        boxShadow: activeHighlight
                            ? "0 0 0 3px rgba(196, 122, 74, 0.14)"
                            : isUser
                                ? "none"
                                : "var(--shadow-sm)",
                    }}
                >
                    {message.isLoading ? (
                        <TypingIndicator
                            responseMode={message.responseMode}
                            thinkingStatus={message.thinkingStatus}
                            thinkingSteps={message.thinkingSteps}
                        />
                    ) : message.isError ? (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "var(--space-3)",
                                color: "var(--color-danger)",
                            }}
                        >
                            <ErrorIcon />
                            <div>
                                <div
                                    style={{
                                        fontSize: "var(--text-sm)",
                                        fontWeight: 600,
                                        marginBottom: "var(--space-1)",
                                    }}
                                >
                                    Unable to get a response
                                </div>
                                <div
                                    style={{
                                        fontSize: "var(--text-xs)",
                                        color: "var(--text-tertiary)",
                                    }}
                                >
                                    {message.errorMessage ||
                                        "Check your connection and try again."}
                                </div>
                            </div>
                        </div>
                    ) : isUser ? (
                        <p
                            style={{
                                fontSize: "var(--text-base)",
                                lineHeight: "var(--leading-relaxed)",
                            }}
                        >
                            {message.content}
                        </p>
                    ) : (
                        <div className="prose-jiff">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({
                                        children,
                                        ...props
                                    }: ComponentPropsWithoutRef<"p"> & {
                                        children?: ReactNode;
                                    }) => <p {...props}>{decorateMarkdown(children, activeHighlight)}</p>,
                                    li: ({
                                        children,
                                        ...props
                                    }: ComponentPropsWithoutRef<"li"> & {
                                        children?: ReactNode;
                                    }) => <li {...props}>{decorateMarkdown(children, activeHighlight)}</li>,
                                    td: ({
                                        children,
                                        ...props
                                    }: ComponentPropsWithoutRef<"td"> & {
                                        children?: ReactNode;
                                    }) => <td {...props}>{decorateMarkdown(children, activeHighlight)}</td>,
                                    th: ({
                                        children,
                                        ...props
                                    }: ComponentPropsWithoutRef<"th"> & {
                                        children?: ReactNode;
                                    }) => <th {...props}>{decorateMarkdown(children, activeHighlight)}</th>,
                                    blockquote: ({
                                        children,
                                        ...props
                                    }: ComponentPropsWithoutRef<"blockquote"> & {
                                        children?: ReactNode;
                                    }) => (
                                        <blockquote {...props}>
                                            {decorateMarkdown(children, activeHighlight)}
                                        </blockquote>
                                    ),
                                    a: ({
                                        children,
                                        ...props
                                    }: ComponentPropsWithoutRef<"a"> & {
                                        children?: ReactNode;
                                    }) => (
                                        <a {...props} target="_blank" rel="noreferrer noopener">
                                            {decorateMarkdown(children, activeHighlight)}
                                        </a>
                                    ),
                                    input: ({
                                        checked,
                                        ...props
                                    }: ComponentPropsWithoutRef<"input">) => (
                                        <input
                                            {...props}
                                            type="checkbox"
                                            checked={Boolean(checked)}
                                            disabled
                                            readOnly
                                        />
                                    ),
                                }}
                            >
                                {message.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {!isUser && !message.isLoading && !message.isError && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            marginTop: "var(--space-2)",
                            paddingLeft: "var(--space-2)",
                            paddingRight: "var(--space-1)",
                            width: "100%",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "var(--space-2)",
                                flexWrap: "wrap",
                            }}
                        >
                            {isWeakEvidence && (
                                <div
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "var(--space-1)",
                                        fontSize: "var(--text-xs)",
                                        color: "var(--color-warning)",
                                        fontWeight: 500,
                                    }}
                                >
                                    <AlertIcon />
                                    Weak evidence
                                </div>
                            )}

                            {hasEvidence && (
                                <button
                                    onClick={() =>
                                        dispatch({
                                            type: "TOGGLE_EVIDENCE_DRAWER",
                                            messageId: message.id,
                                        })
                                    }
                                    id={`btn-sources-${message.id}`}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "var(--space-1)",
                                        fontSize: "var(--text-xs)",
                                        color: "var(--color-accent)",
                                        fontWeight: 500,
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        padding: "var(--space-1) var(--space-2)",
                                        borderRadius: "var(--radius-sm)",
                                        transition: "all var(--duration-fast) var(--ease-out)",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background =
                                            "rgba(196, 122, 74, 0.08)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "none";
                                    }}
                                >
                                    <SourceIcon />
                                    {sourceCount} {sourceLabel}
                                </button>
                            )}

                            {canViewThinkingModel && (
                                <button
                                    onClick={() => setShowThinkingModel((prev) => !prev)}
                                    id={`btn-thinking-${message.id}`}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "var(--space-1)",
                                        fontSize: "var(--text-xs)",
                                        color: showThinkingModel
                                            ? "var(--text-secondary)"
                                            : "var(--text-tertiary)",
                                        fontWeight: 500,
                                        background: showThinkingModel
                                            ? "rgba(212, 168, 67, 0.08)"
                                            : "none",
                                        border: "none",
                                        cursor: "pointer",
                                        padding: "var(--space-1) var(--space-2)",
                                        borderRadius: "var(--radius-sm)",
                                        transition: "all var(--duration-fast) var(--ease-out)",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background =
                                            "rgba(212, 168, 67, 0.12)";
                                        e.currentTarget.style.color = "var(--text-secondary)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = showThinkingModel
                                            ? "rgba(212, 168, 67, 0.08)"
                                            : "none";
                                        e.currentTarget.style.color = showThinkingModel
                                            ? "var(--text-secondary)"
                                            : "var(--text-tertiary)";
                                    }}
                                >
                                    <ChevronIcon expanded={showThinkingModel} />
                                    {showThinkingModel
                                        ? "Hide reasoning"
                                        : "View reasoning"}
                                </button>
                            )}
                        </div>

                        <button
                            onClick={handleCopy}
                            id={`btn-copy-${message.id}`}
                            aria-label="Copy markdown"
                            title={copied ? "Copied" : "Copy markdown"}
                            style={{
                                marginLeft: "auto",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 24,
                                height: 24,
                                color: copied
                                    ? "var(--color-success)"
                                    : "var(--text-secondary)",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                borderRadius: "var(--radius-sm)",
                                transition: "all var(--duration-fast) var(--ease-out)",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                    "rgba(196, 122, 74, 0.1)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                            }}
                        >
                            <CopyIcon />
                        </button>
                    </div>
                )}

                {canViewThinkingModel && showThinkingModel && (
                    <ThinkingTrace
                        thinkingStatus={message.thinkingStatus}
                        thinkingSteps={message.thinkingSteps}
                    />
                )}
            </div>
        </motion.div>
    );
}
