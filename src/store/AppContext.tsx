"use client";

import {
    createContext,
    useContext,
    useReducer,
    useCallback,
    type ReactNode,
    type Dispatch,
} from "react";
import type { Session, ChatMessage, MatchItem, CitationMention } from "@/types/chat";
import { createConversationId } from "@/lib/conversation-id";
import { ApiError, sendChat } from "@/lib/api";
import { extractReliabilityTags } from "@/lib/reliability";

const NON_SOURCE_TAGS = new Set([
    "KB",
    "Inference",
    "Suggested baseline (inference)",
]);

const BRACKET_TOKEN_REGEX = /\[([^\]\n]+)\](?!\()/g;
const RELIABILITY_TAG_REGEX =
    /\[(KB|Inference|Suggested baseline \(inference\))\]/g;
const RELIABILITY_CAPTURE_REGEX =
    /\[(KB|Inference|Suggested baseline \(inference\))\]/g;

interface AppState {
    sessions: Session[];
    activeSessionId: string | null;
    activeIndexNames: string[];
    availableIndexes: string[];
    topK: number;
    temperature: number;
    isLoading: boolean;
    error: string | null;
    evidenceDrawerOpen: boolean;
    selectedMessageId: string | null;
    sidebarOpen: boolean;
    hoveredCitationIndex: number | null;
    hoveredCitationMessageId: string | null;
    activeCitationIndex: number | null;
    activeCitationMessageId: string | null;
    limitModalOpen: boolean;
    limitModalMessage: string | null;
}

const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function normalizeIndexNames(names: string[]): string[] {
    const seen = new Set<string>();
    for (const name of names) {
        const trimmed = name.trim();
        if (trimmed) {
            seen.add(trimmed);
        }
    }
    return [...seen];
}

function createSession(id: string, title?: string): Session {
    const now = Date.now();
    return {
        id,
        title: title || "New Session",
        createdAt: now,
        updatedAt: now,
        messages: [],
        messagesLoaded: true,
    };
}

function sortSessionsByUpdated(sessions: Session[]): Session[] {
    return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

const initialState: AppState = {
    sessions: [],
    activeSessionId: null,
    activeIndexNames: [],
    availableIndexes: [],
    topK: 10,
    temperature: 0.2,
    isLoading: false,
    error: null,
    evidenceDrawerOpen: false,
    selectedMessageId: null,
    sidebarOpen: true,
    hoveredCitationIndex: null,
    hoveredCitationMessageId: null,
    activeCitationIndex: null,
    activeCitationMessageId: null,
    limitModalOpen: false,
    limitModalMessage:
        "You reached your daily limit. Communicate with Jose Ahmad at hello@joseahmad.com to expand your daily limit, otherwise wait until the next day.",
};

type Action =
    | { type: "NEW_SESSION" }
    | { type: "NEW_SESSION_WITH_ID"; id: string; title?: string }
    | { type: "SWITCH_SESSION"; id: string }
    | { type: "CLEAR_SESSION"; id: string }
    | { type: "DELETE_SESSION"; id: string }
    | { type: "SET_SESSIONS"; sessions: Session[]; activeSessionId: string | null }
    | { type: "SET_SESSION_MESSAGES"; sessionId: string; messages: ChatMessage[] }
    | { type: "ADD_MESSAGE"; sessionId: string; message: ChatMessage }
    | {
          type: "UPDATE_MESSAGE";
          sessionId: string;
          messageId: string;
          updates: Partial<ChatMessage>;
      }
    | { type: "SET_ACTIVE_INDEXES"; names: string[] }
    | { type: "SET_AVAILABLE_INDEXES"; indexes: string[] }
    | { type: "SET_TOP_K"; value: number }
    | { type: "SET_TEMPERATURE"; value: number }
    | { type: "SET_LOADING"; value: boolean }
    | { type: "SET_ERROR"; value: string | null }
    | { type: "TOGGLE_EVIDENCE_DRAWER"; messageId?: string }
    | { type: "TOGGLE_SIDEBAR" }
    | { type: "SET_SIDEBAR"; value: boolean }
    | { type: "OPEN_LIMIT_MODAL"; message?: string }
    | { type: "CLOSE_LIMIT_MODAL" }
    | {
          type: "SET_HOVERED_CITATION";
          index: number | null;
          messageId: string | null;
      }
    | {
          type: "SET_ACTIVE_CITATION";
          index: number | null;
          messageId: string | null;
      };

function normalizeCitationToken(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase().startsWith("source=")) {
        return trimmed.slice(7).trim();
    }
    return trimmed;
}

function stripMarkdownDecorators(text: string): string {
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

function normalizeSourceLabelKey(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[‐-―]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function extractCitationSnippet(answer: string, tokenIndex: number): string {
    const lineStart = answer.lastIndexOf("\n", tokenIndex) + 1;
    const rawLine = answer.slice(lineStart, tokenIndex);
    let candidate = stripMarkdownDecorators(
        rawLine
            .replace(/\[[^\]\n]+\](?!\()/g, "")
            .replace(RELIABILITY_TAG_REGEX, "")
            .replace(/\s+/g, " ")
            .trim()
    );

    if (!candidate) {
        const maxWindow = 320;
        const start = Math.max(0, tokenIndex - maxWindow);
        const windowText = answer.slice(start, tokenIndex);
        const lines = windowText
            .split("\n")
            .filter((line) => line.trim().length > 0);
        candidate = stripMarkdownDecorators(
            (lines.at(-1) ?? windowText)
                .replace(/\[[^\]\n]+\](?!\()/g, "")
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

function detectReliabilityNearToken(
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

    // Source-linked snippets are factual by default unless explicitly marked.
    return "KB";
}

function stripReliabilityTags(text: string): string {
    return text.replace(RELIABILITY_TAG_REGEX, "");
}

function cleanAnswerWhitespace(text: string): string {
    return text
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function parseAnswerArtifacts(
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

function extractErrorMessage(raw: string): string {
    try {
        const parsed = JSON.parse(raw) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim()) {
            return parsed.error.trim();
        }
        return raw;
    } catch {
        return raw;
    }
}

function isDailyLimitError(error: unknown): boolean {
    if (error instanceof ApiError) {
        if (error.status === 429) return true;
        const bodyMessage = extractErrorMessage(error.message);
        return /daily quota exceeded|daily limit/i.test(bodyMessage);
    }

    if (error instanceof Error) {
        return /daily quota exceeded|daily limit|429/i.test(error.message);
    }

    return false;
}

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case "NEW_SESSION": {
            const session = createSession(createConversationId());
            return {
                ...state,
                sessions: sortSessionsByUpdated([session, ...state.sessions]),
                activeSessionId: session.id,
            };
        }
        case "NEW_SESSION_WITH_ID": {
            const existing = state.sessions.find((s) => s.id === action.id);
            if (existing) {
                return {
                    ...state,
                    activeSessionId: action.id,
                    hoveredCitationIndex: null,
                    hoveredCitationMessageId: null,
                    activeCitationIndex: null,
                    activeCitationMessageId: null,
                };
            }
            const session = createSession(action.id, action.title);
            return {
                ...state,
                sessions: sortSessionsByUpdated([session, ...state.sessions]),
                activeSessionId: session.id,
                hoveredCitationIndex: null,
                hoveredCitationMessageId: null,
                activeCitationIndex: null,
                activeCitationMessageId: null,
            };
        }
        case "SET_SESSIONS":
            return {
                ...state,
                sessions: sortSessionsByUpdated(action.sessions),
                activeSessionId: action.activeSessionId,
                hoveredCitationIndex: null,
                hoveredCitationMessageId: null,
                activeCitationIndex: null,
                activeCitationMessageId: null,
            };
        case "SWITCH_SESSION":
            return {
                ...state,
                activeSessionId: action.id,
                hoveredCitationIndex: null,
                hoveredCitationMessageId: null,
                activeCitationIndex: null,
                activeCitationMessageId: null,
            };
        case "CLEAR_SESSION":
            return {
                ...state,
                sessions: sortSessionsByUpdated(
                    state.sessions.map((s) =>
                        s.id === action.id
                            ? { ...s, messages: [], updatedAt: Date.now() }
                            : s
                    )
                ),
            };
        case "DELETE_SESSION": {
            const remaining = state.sessions.filter((s) => s.id !== action.id);
            return {
                ...state,
                sessions: remaining,
                activeSessionId:
                    state.activeSessionId === action.id
                        ? remaining[0]?.id ?? null
                        : state.activeSessionId,
            };
        }
        case "SET_SESSION_MESSAGES":
            return {
                ...state,
                sessions: state.sessions.map((s) =>
                    s.id === action.sessionId
                        ? {
                              ...s,
                              messages: action.messages,
                              messagesLoaded: true,
                          }
                        : s
                ),
            };
        case "ADD_MESSAGE":
            return {
                ...state,
                sessions: sortSessionsByUpdated(
                    state.sessions.map((s) =>
                        s.id === action.sessionId
                            ? {
                                  ...s,
                                  messages: [...s.messages, action.message],
                                  updatedAt: Date.now(),
                                  title:
                                      s.messages.length === 0 &&
                                      action.message.role === "user"
                                          ? action.message.content.slice(0, 48) +
                                            (action.message.content.length > 48
                                                ? "..."
                                                : "")
                                          : s.title,
                              }
                            : s
                    )
                ),
            };
        case "UPDATE_MESSAGE":
            return {
                ...state,
                sessions: sortSessionsByUpdated(
                    state.sessions.map((s) =>
                        s.id === action.sessionId
                            ? {
                                  ...s,
                                  messages: s.messages.map((m) =>
                                      m.id === action.messageId
                                          ? { ...m, ...action.updates }
                                          : m
                                  ),
                                  updatedAt: Date.now(),
                              }
                            : s
                    )
                ),
            };
        case "SET_ACTIVE_INDEXES": {
            const valid = normalizeIndexNames(action.names).filter((name) =>
                state.availableIndexes.includes(name)
            );
            return { ...state, activeIndexNames: valid };
        }
        case "SET_AVAILABLE_INDEXES": {
            const available = normalizeIndexNames(action.indexes);
            const active = state.activeIndexNames.filter((name) =>
                available.includes(name)
            );
            return {
                ...state,
                availableIndexes: available,
                activeIndexNames: active,
            };
        }
        case "SET_TOP_K":
            return { ...state, topK: Math.max(8, Math.min(12, action.value)) };
        case "SET_TEMPERATURE":
            return { ...state, temperature: action.value };
        case "SET_LOADING":
            return { ...state, isLoading: action.value };
        case "SET_ERROR":
            return { ...state, error: action.value };
        case "TOGGLE_EVIDENCE_DRAWER":
            return {
                ...state,
                evidenceDrawerOpen: action.messageId
                    ? action.messageId !== state.selectedMessageId ||
                      !state.evidenceDrawerOpen
                    : !state.evidenceDrawerOpen,
                selectedMessageId: action.messageId ?? state.selectedMessageId,
                hoveredCitationIndex: null,
                hoveredCitationMessageId: null,
                activeCitationIndex: null,
                activeCitationMessageId: null,
            };
        case "TOGGLE_SIDEBAR":
            return { ...state, sidebarOpen: !state.sidebarOpen };
        case "SET_SIDEBAR":
            return { ...state, sidebarOpen: action.value };
        case "OPEN_LIMIT_MODAL":
            return {
                ...state,
                limitModalOpen: true,
                limitModalMessage:
                    action.message?.trim() ||
                    state.limitModalMessage ||
                    "You reached your daily limit. Communicate with Jose Ahmad at hello@joseahmad.com to expand your daily limit, otherwise wait until the next day.",
            };
        case "CLOSE_LIMIT_MODAL":
            return {
                ...state,
                limitModalOpen: false,
            };
        case "SET_HOVERED_CITATION":
            return {
                ...state,
                hoveredCitationIndex: action.index,
                hoveredCitationMessageId: action.messageId,
            };
        case "SET_ACTIVE_CITATION":
            return {
                ...state,
                activeCitationIndex: action.index,
                activeCitationMessageId: action.messageId,
            };
        default:
            return state;
    }
}

const AppContext = createContext<{
    state: AppState;
    dispatch: Dispatch<Action>;
    sendMessage: (question: string) => Promise<void>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const sendMessage = useCallback(
        async (question: string) => {
            const sessionId = state.activeSessionId;
            if (!sessionId) return;
            if (!state.sessions.some((session) => session.id === sessionId)) {
                dispatch({
                    type: "NEW_SESSION_WITH_ID",
                    id: sessionId,
                });
            }

            const userMsg: ChatMessage = {
                id: generateId(),
                role: "user",
                content: question,
                timestamp: Date.now(),
            };
            dispatch({ type: "ADD_MESSAGE", sessionId, message: userMsg });

            const assistantId = generateId();
            const loadingMsg: ChatMessage = {
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
                isLoading: true,
            };
            dispatch({ type: "ADD_MESSAGE", sessionId, message: loadingMsg });
            dispatch({ type: "SET_LOADING", value: true });
            dispatch({ type: "SET_ERROR", value: null });

            try {
                const routableActiveIndexes = state.activeIndexNames.filter(
                    (name) => state.availableIndexes.includes(name)
                );

                const response = await sendChat({
                    question,
                    session_id: sessionId,
                    top_k: state.topK,
                    temperature: state.temperature,
                    active_index_names:
                        routableActiveIndexes.length > 0
                            ? routableActiveIndexes
                            : undefined,
                });

                const matches = Array.isArray(response.matches)
                    ? response.matches
                    : [];
                const tags = extractReliabilityTags(response.answer);
                const sources = matches.map((m: MatchItem) => ({
                    source: m.source,
                    score: m.score,
                    metadata: m.metadata,
                }));
                const parsedAnswer = parseAnswerArtifacts(
                    response.answer,
                    matches.map((m: MatchItem) => m.source)
                );

                dispatch({
                    type: "UPDATE_MESSAGE",
                    sessionId,
                    messageId: assistantId,
                    updates: {
                        content: parsedAnswer.content,
                        markdownContent: parsedAnswer.markdownContent,
                        sources: sources.length > 0 ? sources : undefined,
                        matches: matches.length > 0 ? matches : undefined,
                        citations: parsedAnswer.citations,
                        citationMentions: parsedAnswer.citationMentions,
                        reliability: tags,
                        isLoading: false,
                    },
                });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Something went wrong";
                const normalizedMessage = extractErrorMessage(errorMessage);

                dispatch({
                    type: "UPDATE_MESSAGE",
                    sessionId,
                    messageId: assistantId,
                    updates: {
                        content: "",
                        isLoading: false,
                        isError: true,
                        errorMessage: normalizedMessage,
                    },
                });
                dispatch({ type: "SET_ERROR", value: normalizedMessage });
                if (isDailyLimitError(err)) {
                    dispatch({
                        type: "OPEN_LIMIT_MODAL",
                        message:
                            "You reached your daily limit. Communicate with Jose Ahmad at hello@joseahmad.com to expand your daily limit, otherwise wait until the next day.",
                    });
                }
            } finally {
                dispatch({ type: "SET_LOADING", value: false });
            }
        },
        [
            state.activeSessionId,
            state.sessions,
            state.topK,
            state.temperature,
            state.activeIndexNames,
            state.availableIndexes,
        ]
    );

    return (
        <AppContext.Provider value={{ state, dispatch, sendMessage }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be inside AppProvider");
    return ctx;
}
