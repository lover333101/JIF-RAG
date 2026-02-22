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

function TypingIndicator() {
    return (
        <div
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                color: "var(--text-secondary)",
            }}
        >
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                Jiff is typing
            </span>
            <span className="typing-dots">
                {[0, 1, 2].map((index) => (
                    <motion.span
                        key={index}
                        className="typing-dot"
                        animate={{ y: [0, -3, 0], opacity: [0.35, 1, 0.35] }}
                        transition={{
                            duration: 0.7,
                            repeat: Infinity,
                            delay: index * 0.12,
                            ease: "easeInOut",
                        }}
                    />
                ))}
            </span>
        </div>
    );
}

function buildMarkdownForCopy(message: ChatMessage): string {
    const base = (message.markdownContent ?? message.content ?? "").trim();
    if (!base) return "";

    if (!message.citations || message.citations.length === 0) {
        return base;
    }

    if (base.includes("### Citations")) {
        return base;
    }

    return `${base}\n\n### Citations\n${message.citations
        .map((source) => `- [${source}]`)
        .join("\n")}`;
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

    const evidenceStrength = message.matches
        ? assessEvidenceStrength(message.matches, message.content)
        : undefined;
    const isWeakEvidence = evidenceStrength === "weak" || evidenceStrength === "none";
    const hasMatches = Boolean(message.matches && message.matches.length > 0);

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
            <div style={{ maxWidth: isUser ? "65%" : "80%", width: "100%" }}>
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
                        <TypingIndicator />
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

                            {hasMatches && (
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
                                    {message.matches?.length ?? 0} sources
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
            </div>
        </motion.div>
    );
}

