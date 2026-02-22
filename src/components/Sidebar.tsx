"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createConversationId } from "@/lib/conversation-id";
import {
    createConversation,
    deleteConversation,
    getAccountSummary,
    getQuotaSummary,
} from "@/lib/api";
import { useApp } from "@/store/AppContext";
import type { AccountSummary, QuotaSummary } from "@/types/chat";

const PlusIcon = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
    >
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
);

const TrashIcon = () => (
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
        <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" />
    </svg>
);

const ChatIcon = () => (
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
        <path d="M14 10a1.33 1.33 0 01-1.33 1.33H4.67L2 14V3.33A1.33 1.33 0 013.33 2h9.34A1.33 1.33 0 0114 3.33V10z" />
    </svg>
);

const SettingsIcon = () => (
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
        <circle cx="8" cy="8" r="2.2" />
        <path d="M13.4 9.5l.2-1.5-1.6-.7a4.5 4.5 0 00-.3-.8l.9-1.5-1.1-1.1-1.5.9a4.5 4.5 0 00-.8-.3L8 2.4l-1.5.2-.7 1.6a4.5 4.5 0 00-.8.3l-1.5-.9-1.1 1.1.9 1.5a4.5 4.5 0 00-.3.8L2.4 8l.2 1.5 1.6.7c.1.3.2.5.3.8l-.9 1.5 1.1 1.1 1.5-.9c.3.1.5.2.8.3l.7 1.6 1.5-.2.7-1.6c.3-.1.5-.2.8-.3l1.5.9 1.1-1.1-.9-1.5c.1-.3.2-.5.3-.8l1.6-.7z" />
    </svg>
);

const LimitIcon = () => (
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
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.4v4.2" />
        <circle cx="8" cy="11.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
);

export default function Sidebar() {
    const { state, dispatch } = useApp();
    const { sessions, activeSessionId, sidebarOpen } = state;
    const router = useRouter();
    const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(
        null
    );
    const [quotaSummary, setQuotaSummary] = useState<QuotaSummary | null>(null);

    const dailyUsagePercent = useMemo(() => {
        if (!quotaSummary || quotaSummary.limit <= 0) return null;
        const ratio = (quotaSummary.used / quotaSummary.limit) * 100;
        return Math.max(0, Math.min(100, Math.round(ratio)));
    }, [quotaSummary]);

    const handleCreateSession = async () => {
        const id = createConversationId();

        dispatch({
            type: "NEW_SESSION_WITH_ID",
            id,
            title: "New Session",
        });
        router.push(`/chat/${id}`);

        try {
            await createConversation({
                id,
                title: "New Session",
                active_index_names: state.activeIndexNames,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to create session.";
            dispatch({ type: "SET_ERROR", value: message });
        }
    };

    const handleSwitchSession = (id: string) => {
        if (id === activeSessionId) return;
        dispatch({
            type: "SWITCH_SESSION",
            id,
        });
        router.push(`/chat/${id}`);
    };

    const handleArchiveSession = async (id: string) => {
        const remainingIds = sessions.filter((session) => session.id !== id).map((session) => session.id);

        dispatch({ type: "DELETE_SESSION", id });

        try {
            await deleteConversation(id);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to remove session.";
            dispatch({ type: "SET_ERROR", value: message });
            return;
        }

        if (remainingIds.length > 0) {
            const nextId = remainingIds[0];
            dispatch({ type: "SWITCH_SESSION", id: nextId });
            router.push(`/chat/${nextId}`);
            return;
        }

        await handleCreateSession();
    };

    useEffect(() => {
        let cancelled = false;

        Promise.all([getAccountSummary(), getQuotaSummary()])
            .then(([summary, quota]) => {
                if (!cancelled) {
                    setAccountSummary(summary);
                    setQuotaSummary(quota);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAccountSummary(null);
                    setQuotaSummary(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <motion.aside
            initial={false}
            animate={{
                x: sidebarOpen ? 0 : -24,
                opacity: sidebarOpen ? 1 : 0.96,
            }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden={!sidebarOpen}
            style={{
                width: "var(--sidebar-width)",
                minWidth: "var(--sidebar-width)",
                height: "100vh",
                background: "var(--bg-sidebar)",
                color: "var(--text-inverse)",
                display: "flex",
                flexDirection: "column",
                borderRight: "1px solid rgba(255,255,255,0.06)",
                position: "relative",
                zIndex: 30,
                pointerEvents: sidebarOpen ? "auto" : "none",
            }}
        >
                    <div
                        style={{
                            padding: "var(--space-5)",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-3)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "var(--space-3)",
                            }}
                        >
                            <div
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "var(--radius-md)",
                                    background: "var(--color-accent)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontFamily: "var(--font-serif)",
                                    fontSize: "var(--text-lg)",
                                    fontWeight: 400,
                                    color: "var(--color-pure-white)",
                                }}
                            >
                                J
                            </div>
                            <div>
                                <h1
                                    style={{
                                        fontFamily: "var(--font-serif)",
                                        fontSize: "var(--text-xl)",
                                        fontWeight: 400,
                                        lineHeight: 1,
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    Jiff
                                </h1>
                                <span
                                    style={{
                                        fontSize: "var(--text-xs)",
                                        color: "var(--color-stone)",
                                        fontWeight: 300,
                                        letterSpacing: "0.04em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Strategy Assistant
                                </span>
                            </div>
                        </div>

                    </div>

                    <div style={{ padding: "var(--space-4) var(--space-5)" }}>
                        <button
                            onClick={handleCreateSession}
                            id="btn-new-session"
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "var(--space-2)",
                                padding: "var(--space-3) var(--space-4)",
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "var(--radius-md)",
                                color: "var(--text-inverse)",
                                fontSize: "var(--text-sm)",
                                fontFamily: "var(--font-sans)",
                                fontWeight: 500,
                                cursor: "pointer",
                                transition:
                                    "all var(--duration-fast) var(--ease-out)",
                            }}
                        >
                            <PlusIcon /> New Session
                        </button>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: "0 var(--space-3)",
                        }}
                    >
                        <div
                            style={{
                                padding: "var(--space-2)",
                                fontSize: "var(--text-xs)",
                                fontWeight: 500,
                                color: "var(--color-stone)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                            }}
                        >
                            Sessions
                        </div>
                        <AnimatePresence>
                            {sessions.map((session) => {
                                const isActive = session.id === activeSessionId;
                                return (
                                    <motion.div
                                        key={session.id}
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <button
                                            onClick={() => handleSwitchSession(session.id)}
                                            id={`session-${session.id}`}
                                            style={{
                                                width: "100%",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "var(--space-2)",
                                                padding: "var(--space-3)",
                                                background: isActive
                                                    ? "rgba(196, 122, 74, 0.15)"
                                                    : "transparent",
                                                border: "none",
                                                borderRadius: "var(--radius-md)",
                                                color: isActive
                                                    ? "var(--color-accent)"
                                                    : "var(--color-stone)",
                                                fontSize: "var(--text-sm)",
                                                fontFamily: "var(--font-sans)",
                                                fontWeight: isActive ? 500 : 400,
                                                cursor: "pointer",
                                                textAlign: "start",
                                                transition:
                                                    "all var(--duration-fast) var(--ease-out)",
                                                marginBottom: 2,
                                            }}
                                        >
                                            <ChatIcon />
                                            <span
                                                style={{
                                                    flex: 1,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {session.title}
                                            </span>
                                            {isActive && (
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleArchiveSession(
                                                            session.id
                                                        );
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label="Clear session"
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        opacity: 0.55,
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <TrashIcon />
                                                </span>
                                            )}
                                        </button>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>

                    <div
                        style={{
                            padding: "var(--space-4) var(--space-5)",
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                            display: "grid",
                            gap: "var(--space-3)",
                        }}
                    >
                        <Link
                            href="/account"
                            id="btn-account-settings"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "var(--space-3)",
                                textDecoration: "none",
                                color: "var(--text-inverse)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "rgba(255,255,255,0.04)",
                                borderRadius: "var(--radius-md)",
                                padding: "var(--space-3) var(--space-3)",
                            }}
                        >
                            <div
                                style={{
                                    minWidth: 0,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: "var(--text-sm)",
                                        fontWeight: 600,
                                        lineHeight: 1.1,
                                        marginBottom: 2,
                                    }}
                                >
                                    Account Settings
                                </div>
                                <div
                                    style={{
                                        fontSize: "var(--text-xs)",
                                        color: "var(--color-stone)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {accountSummary?.display_name ||
                                        accountSummary?.email ||
                                        "Manage your account"}
                                </div>
                            </div>
                            <SettingsIcon />
                        </Link>

                        <button
                            type="button"
                            id="btn-expand-daily-limit"
                            onClick={() =>
                                dispatch({
                                    type: "OPEN_LIMIT_MODAL",
                                    message:
                                        "You reached your daily limit. Communicate with Jose Ahmad at hello@joseahmad.com to expand your daily limit, otherwise wait until the next day.",
                                })
                            }
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "var(--space-3)",
                                textDecoration: "none",
                                color: "var(--text-inverse)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "rgba(196, 122, 74, 0.16)",
                                borderRadius: "var(--radius-md)",
                                padding: "var(--space-3) var(--space-3)",
                                cursor: "pointer",
                            }}
                        >
                            <div
                                style={{
                                    minWidth: 0,
                                    textAlign: "left",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: "var(--text-sm)",
                                        fontWeight: 600,
                                        lineHeight: 1.1,
                                        marginBottom: 2,
                                    }}
                                >
                                    Expand Daily Limit
                                </div>
                                <div
                                    style={{
                                        fontSize: "var(--text-xs)",
                                        color: "var(--color-stone)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    Contact Jose Ahmad
                                </div>
                            </div>
                            <LimitIcon />
                        </button>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontSize: "var(--text-xs)",
                                color: "var(--color-stone)",
                            }}
                        >
                            <span
                                style={{
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                Messages
                            </span>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "var(--text-sm)",
                                    color: "var(--text-inverse)",
                                }}
                            >
                                {typeof accountSummary?.message_count === "number"
                                    ? accountSummary.message_count.toLocaleString()
                                    : "--"}
                            </span>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontSize: "var(--text-xs)",
                                color: "var(--color-stone)",
                            }}
                        >
                            <span
                                style={{
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                Daily Limit
                            </span>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "var(--text-sm)",
                                    color: "var(--text-inverse)",
                                }}
                            >
                                {dailyUsagePercent !== null
                                    ? `${dailyUsagePercent}%`
                                    : "--"}
                            </span>
                        </div>
                    </div>
        </motion.aside>
    );
}
