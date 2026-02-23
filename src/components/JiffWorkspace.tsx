"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import LimitExceededModal from "@/components/LimitExceededModal";
import { createConversationId, isValidConversationId } from "@/lib/conversation-id";
import {
    createConversation,
    getConversationMessages,
    listConversations,
} from "@/lib/api";
import { mapStoredMessageRecordsToChatMessages } from "@/lib/message-mappers";
import { useApp } from "@/store/AppContext";
import type { ConversationRecord, Session } from "@/types/chat";

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

export default function JiffWorkspace({
    conversationId,
}: {
    conversationId: string;
}) {
    const { state, dispatch } = useApp();
    const router = useRouter();
    const sessionsRef = useRef(state.sessions);

    // ── Mobile detection ──
    const MOBILE_BREAKPOINT = 760;
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
        const update = () => setIsMobile(mql.matches);
        update();
        mql.addEventListener("change", update);
        return () => mql.removeEventListener("change", update);
    }, []);

    const closeSidebarOnMobile = useCallback(() => {
        if (isMobile && state.sidebarOpen) dispatch({ type: "TOGGLE_SIDEBAR" });
    }, [isMobile, state.sidebarOpen, dispatch]);

    const closeDrawerOnMobile = useCallback(() => {
        if (isMobile && state.evidenceDrawerOpen) dispatch({ type: "TOGGLE_EVIDENCE_DRAWER" });
    }, [isMobile, state.evidenceDrawerOpen, dispatch]);

    // On mobile: sidebar/drawer are overlays, grid is always single column
    const gridColumns = isMobile
        ? "1fr"
        : `${state.sidebarOpen ? "var(--sidebar-width)" : "0px"} minmax(0,1fr) ${state.evidenceDrawerOpen ? "var(--drawer-width)" : "0px"
        }`;

    useEffect(() => {
        sessionsRef.current = state.sessions;
    }, [state.sessions]);

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
                let sessions = sessionsRef.current;
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
                    } else {
                        const localSession = sessions.find(
                            (session) => session.id === normalizedConversationId
                        );
                        shouldFetchMessages =
                            !localSession?.messagesLoaded &&
                            (localSession?.messages.length ?? 0) === 0;
                        dispatch({
                            type: "SWITCH_SESSION",
                            id: normalizedConversationId,
                        });
                    }
                }

                if (shouldFetchMessages) {
                    const messageRecords = await getConversationMessages(
                        normalizedConversationId
                    );
                    if (cancelled) return;

                    dispatch({
                        type: "SET_SESSION_MESSAGES",
                        sessionId: normalizedConversationId,
                        messages: mapStoredMessageRecordsToChatMessages(messageRecords),
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

    // ── Lazy message loading on active session change (sidebar switches) ──
    useEffect(() => {
        const sid = state.activeSessionId;
        if (!sid) return;
        const session = state.sessions.find((s) => s.id === sid);
        if (!session || session.messagesLoaded || session.messages.length > 0) return;

        let cancelled = false;
        getConversationMessages(sid).then((records) => {
            if (cancelled) return;
            dispatch({
                type: "SET_SESSION_MESSAGES",
                sessionId: sid,
                messages: mapStoredMessageRecordsToChatMessages(records),
            });
        }).catch(() => {
            // Silently ignore — the main effect handles errors on initial load
        });

        return () => { cancelled = true; };
    }, [state.activeSessionId, state.sessions, dispatch]);

    return (
        <>
            <div
                style={{
                    display: "grid",
                    height: "100dvh",
                    overflow: "hidden",
                    gridTemplateColumns: gridColumns,
                    transition: isMobile
                        ? "none"
                        : "grid-template-columns 340ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            >
                {/* ── Sidebar panel ── */}
                {isMobile ? (
                    <>
                        {state.sidebarOpen && (
                            <div
                                className="mobile-overlay-backdrop"
                                style={{ display: "block" }}
                                onClick={closeSidebarOnMobile}
                            />
                        )}
                        <div
                            className="mobile-sidebar-overlay"
                            style={{
                                transform: state.sidebarOpen
                                    ? "translateX(0)"
                                    : "translateX(-100%)",
                                transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                                width: "var(--sidebar-width)",
                                position: "fixed",
                                top: 0,
                                left: 0,
                                bottom: 0,
                                zIndex: 40,
                            }}
                        >
                            <Sidebar />
                        </div>
                    </>
                ) : (
                    <div style={{ overflow: "hidden", minWidth: 0 }}>
                        <Sidebar />
                    </div>
                )}

                {/* ── Chat area ── */}
                <div style={{ minWidth: 0, display: "flex" }}>
                    <ChatArea />
                </div>

                {/* ── Evidence drawer ── */}
                {isMobile ? (
                    <>
                        {state.evidenceDrawerOpen && (
                            <div
                                className="mobile-overlay-backdrop"
                                style={{ display: "block" }}
                                onClick={closeDrawerOnMobile}
                            />
                        )}
                        <div
                            className="mobile-drawer-overlay"
                            style={{
                                transform: state.evidenceDrawerOpen
                                    ? "translateX(0)"
                                    : "translateX(100%)",
                                transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                                width: "var(--drawer-width)",
                                position: "fixed",
                                top: 0,
                                right: 0,
                                bottom: 0,
                                zIndex: 40,
                            }}
                        >
                            <EvidenceDrawer />
                        </div>
                    </>
                ) : (
                    <div style={{ overflow: "hidden", minWidth: 0 }}>
                        <EvidenceDrawer />
                    </div>
                )}
            </div>
            <LimitExceededModal />
        </>
    );
}
