"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import LimitExceededModal from "@/components/LimitExceededModal";
import { createConversationId, isValidConversationId } from "@/lib/conversation-id";
import {
    createConversation,
    getConversationMessages,
    getIndexes,
    listConversations,
} from "@/lib/api";
import { useApp } from "@/store/AppContext";
import type {
    ChatMessage,
    ConversationRecord,
    Session,
    StoredMessageRecord,
} from "@/types/chat";

function toMillis(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function toSession(record: ConversationRecord): Session {
    return {
        id: record.id,
        title: record.title || "New Session",
        createdAt: toMillis(record.created_at),
        updatedAt: toMillis(record.updated_at),
        messages: [],
        messagesLoaded: false,
    };
}

function toMessage(record: StoredMessageRecord): ChatMessage {
    const citations = Array.isArray(record.citations)
        ? record.citations.filter((item): item is string => typeof item === "string")
        : undefined;

    return {
        id: record.id,
        role: record.role,
        content: record.content ?? "",
        markdownContent: record.markdown_content ?? record.content ?? "",
        citations,
        timestamp: toMillis(record.created_at),
    };
}

export default function JiffWorkspace({
    conversationId,
}: {
    conversationId: string;
}) {
    const { state, dispatch } = useApp();
    const router = useRouter();
    const sessionsRef = useRef(state.sessions);
    const availableIndexesRef = useRef(state.availableIndexes);

    const gridColumns = `${state.sidebarOpen ? "var(--sidebar-width)" : "0px"} minmax(0,1fr) ${
        state.evidenceDrawerOpen ? "var(--drawer-width)" : "0px"
    }`;

    useEffect(() => {
        sessionsRef.current = state.sessions;
        availableIndexesRef.current = state.availableIndexes;
    }, [state.availableIndexes, state.sessions]);

    useEffect(() => {
        let cancelled = false;
        const normalizedConversationId = conversationId.trim();

        const run = async () => {
            if (!isValidConversationId(normalizedConversationId)) {
                const fallbackId = createConversationId();
                router.replace(`/chat/${fallbackId}`);
                return;
            }

            dispatch({ type: "SET_ERROR", value: null });

            try {
                if (availableIndexesRef.current.length === 0) {
                    const indexes = await getIndexes();
                    if (cancelled) return;
                    dispatch({
                        type: "SET_AVAILABLE_INDEXES",
                        indexes: indexes.map((item) => item.name),
                    });
                }

                let sessions = sessionsRef.current;
                let nextActiveIndexes: string[] | null = null;
                let shouldFetchMessages = true;

                if (sessions.length === 0) {
                    const conversationRecords = await listConversations();
                    if (cancelled) return;

                    let records = conversationRecords;
                    const hasCurrent = records.some(
                        (record) => record.id === normalizedConversationId
                    );

                    if (!hasCurrent) {
                        try {
                            const created = await createConversation({
                                id: normalizedConversationId,
                                title: "New Session",
                            });
                            if (cancelled) return;
                            records = [created, ...records];
                        } catch {
                            const refreshed = await listConversations();
                            if (cancelled) return;
                            const existsAfterRetry = refreshed.some(
                                (record) => record.id === normalizedConversationId
                            );
                            if (!existsAfterRetry) {
                                const fallbackId = createConversationId();
                                router.replace(`/chat/${fallbackId}`);
                                return;
                            }
                            records = refreshed;
                        }
                    }

                    const ordered = records
                        .slice()
                        .sort(
                            (a, b) => toMillis(b.updated_at) - toMillis(a.updated_at)
                        );
                    sessions = ordered.map(toSession);
                    const current = ordered.find(
                        (record) => record.id === normalizedConversationId
                    );
                    nextActiveIndexes = current?.active_index_names ?? [];
                    dispatch({
                        type: "SET_SESSIONS",
                        sessions,
                        activeSessionId: normalizedConversationId,
                    });
                } else {
                    const hasLocal = sessions.some(
                        (session) => session.id === normalizedConversationId
                    );
                    if (!hasLocal) {
                        try {
                            await createConversation({
                                id: normalizedConversationId,
                                title: "New Session",
                            });
                        } catch {
                            // Ignore: conversation might already exist due parallel tab/session.
                        }
                        dispatch({
                            type: "NEW_SESSION_WITH_ID",
                            id: normalizedConversationId,
                            title: "New Session",
                        });
                        nextActiveIndexes = [];
                    } else {
                        const localSession = sessions.find(
                            (session) => session.id === normalizedConversationId
                        );
                        shouldFetchMessages = !localSession?.messagesLoaded;
                        dispatch({
                            type: "SWITCH_SESSION",
                            id: normalizedConversationId,
                        });
                    }
                }

                if (nextActiveIndexes) {
                    dispatch({
                        type: "SET_ACTIVE_INDEXES",
                        names: nextActiveIndexes,
                    });
                }

                if (shouldFetchMessages) {
                    const messageRecords = await getConversationMessages(
                        normalizedConversationId
                    );
                    if (cancelled) return;

                    dispatch({
                        type: "SET_SESSION_MESSAGES",
                        sessionId: normalizedConversationId,
                        messages: messageRecords.map(toMessage),
                    });
                }
            } catch (error) {
                if (cancelled) return;
                const message =
                    error instanceof Error
                        ? error.message
                        : "Failed to load conversation.";
                dispatch({ type: "SET_ERROR", value: message });
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [
        conversationId,
        dispatch,
        router,
    ]);

    return (
        <>
            <div
                style={{
                    display: "grid",
                    height: "100vh",
                    overflow: "hidden",
                    gridTemplateColumns: gridColumns,
                    transition: "grid-template-columns 340ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            >
                <div style={{ overflow: "hidden", minWidth: 0 }}>
                    <Sidebar />
                </div>
                <div style={{ minWidth: 0, display: "flex" }}>
                    <ChatArea />
                </div>
                <div style={{ overflow: "hidden", minWidth: 0 }}>
                    <EvidenceDrawer />
                </div>
            </div>
            <LimitExceededModal />
        </>
    );
}
