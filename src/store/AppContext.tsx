"use client";

import {
    createContext,
    useContext,
    useReducer,
    useCallback,
    type ReactNode,
    type Dispatch,
} from "react";
import type { Session, ChatMessage, MatchItem } from "@/types/chat";
import { createConversationId } from "@/lib/conversation-id";
import { ApiError, sendChat, type ChatProgressUpdate } from "@/lib/api";
import { extractReliabilityTags } from "@/lib/reliability";
import { parseAnswerArtifacts } from "@/lib/format-answer";

interface AppState {
    sessions: Session[];
    activeSessionId: string | null;
    responseMode: "auto" | "light" | "heavy";
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

function createSession(id: string, title?: string, messagesLoaded = false): Session {
    const now = Date.now();
    return {
        id,
        title: title || "New Session",
        createdAt: now,
        updatedAt: now,
        messages: [],
        messagesLoaded,
    };
}

function sortSessionsByUpdated(sessions: Session[]): Session[] {
    return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

const initialState: AppState = {
    sessions: [],
    activeSessionId: null,
    responseMode: "auto",
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
    | { type: "SET_RESPONSE_MODE"; mode: "auto" | "light" | "heavy" }
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
                            ? { ...s, messages: [], updatedAt: Date.now(), messagesLoaded: false }
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
        case "SET_RESPONSE_MODE":
            return { ...state, responseMode: action.mode };
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
    sendMessage: (question: string, targetSessionId?: string) => Promise<void>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const sendMessage = useCallback(
        async (question: string, targetSessionId?: string) => {
            const sessionId = targetSessionId || state.activeSessionId;
            if (!sessionId) return;
            const requestedMode = state.responseMode;
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
                responseMode: requestedMode,
            };
            dispatch({ type: "ADD_MESSAGE", sessionId, message: loadingMsg });
            dispatch({ type: "SET_LOADING", value: true });
            dispatch({ type: "SET_ERROR", value: null });

            let streamedContent = "";

            try {
                const response = await sendChat({
                    question,
                    session_id: sessionId,
                    response_mode: requestedMode,
                }, {
                    onProgress: (progress: ChatProgressUpdate) => {
                        dispatch({
                            type: "UPDATE_MESSAGE",
                            sessionId,
                            messageId: assistantId,
                            updates: {
                                responseMode: progress.mode ?? requestedMode,
                                thinkingStatus: progress.thinkingStatus,
                                thinkingSteps: progress.thinkingSteps,
                                routingReason: progress.routingReason,
                            },
                        });
                    },
                    onToken: (token: string) => {
                        streamedContent += token;
                        dispatch({
                            type: "UPDATE_MESSAGE",
                            sessionId,
                            messageId: assistantId,
                            updates: {
                                content: streamedContent,
                                markdownContent: streamedContent,
                                isLoading: true,
                            },
                        });
                    },
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
            state.responseMode,
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
