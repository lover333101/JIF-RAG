"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/store/AppContext";
import { getConversationMessages, syncPendingChatTask } from "@/lib/api";
import { mapStoredMessageRecordsToChatMessages } from "@/lib/message-mappers";
import ChatBubble from "@/components/ChatBubble";
import Composer from "@/components/Composer";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 30000;
const POLL_MAX_DURATION_MS = 1000 * 60 * 5;

const SidebarToggleIcon = ({ open }: { open: boolean }) => (
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
        {open ? (
            <>
                <line x1="11" y1="3.5" x2="5" y2="8" />
                <line x1="11" y1="12.5" x2="5" y2="8" />
            </>
        ) : (
            <>
                <line x1="2" y1="4" x2="14" y2="4" />
                <line x1="2" y1="8" x2="14" y2="8" />
                <line x1="2" y1="12" x2="14" y2="12" />
            </>
        )}
    </svg>
);

export default function ChatArea() {
    const { state, sendMessage, dispatch } = useApp();
    const scrollRef = useRef<HTMLDivElement>(null);
    const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);
    const messages = activeSession?.messages || [];
    const isEmpty = messages.length === 0;
    const lastMessageContent = messages[messages.length - 1]?.content ?? "";
    const lastMessage = messages[messages.length - 1];
    const activeLoadingAssistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.isLoading);
    const isHeavyThinking = activeLoadingAssistant?.responseMode === "heavy";

    // ── Response recovery polling ──
    const needsRecovery =
        !isEmpty &&
        lastMessage?.role === "user" &&
        !state.isLoading &&
        activeSession?.messagesLoaded === true;

    const [recoveringMessageId, setRecoveringMessageId] = useState<string | null>(null);
    const [timedOutMessageId, setTimedOutMessageId] = useState<string | null>(null);
    const currentRecoveryMessageId = needsRecovery ? lastMessage?.id ?? null : null;
    const showRecovering =
        needsRecovery &&
        currentRecoveryMessageId !== null &&
        timedOutMessageId !== currentRecoveryMessageId &&
        recoveringMessageId === currentRecoveryMessageId;
    const showTimedOut =
        needsRecovery &&
        currentRecoveryMessageId !== null &&
        timedOutMessageId === currentRecoveryMessageId;
    const hasHeaderProgress = state.isLoading || showRecovering || showTimedOut;
    const headerStatusLabel = state.isLoading
        ? isHeavyThinking
            ? "Thinking through evidence..."
            : "Generating response..."
        : showRecovering
            ? "Syncing response..."
            : showTimedOut
                ? "Response delayed"
                : "Ready";
    const headerStatusColor = state.isLoading || showRecovering
        ? "var(--color-accent)"
        : showTimedOut
            ? "var(--color-warning)"
            : "var(--color-success)";

    const pollForResponse = useCallback(async (
        sessionId: string
    ): Promise<"recovered" | "waiting" | "failed"> => {
        try {
            const records = await getConversationMessages(sessionId);
            if (records.length > 0) {
                const lastRecord = records[records.length - 1];
                if (lastRecord.role === "assistant") {
                    // Response found — update state with all messages
                    dispatch({
                        type: "SET_SESSION_MESSAGES",
                        sessionId,
                        messages: mapStoredMessageRecordsToChatMessages(records),
                    });
                    return "recovered";
                }
            }

            const pendingTaskState = await syncPendingChatTask(sessionId);
            if (pendingTaskState === "completed") {
                const refreshed = await getConversationMessages(sessionId);
                if (refreshed.length > 0) {
                    const lastRefreshed = refreshed[refreshed.length - 1];
                    if (lastRefreshed.role === "assistant") {
                        dispatch({
                            type: "SET_SESSION_MESSAGES",
                            sessionId,
                            messages: mapStoredMessageRecordsToChatMessages(refreshed),
                        });
                        return "recovered";
                    }
                }
            }
            if (pendingTaskState === "failed") {
                return "failed";
            }
        } catch {
            // Silently ignore polling errors
        }
        return "waiting";
    }, [dispatch]);

    useEffect(() => {
        if (!needsRecovery) {
            return;
        }

        const sessionId = state.activeSessionId;
        const recoveryMessageId = lastMessage?.id;
        if (!sessionId || !recoveryMessageId) return;

        // Never start a duplicate poll worker for the same user message.
        if (
            recoveringMessageId === recoveryMessageId ||
            timedOutMessageId === recoveryMessageId
        ) {
            return;
        }

        let stopped = false;

        const poll = async () => {
            await Promise.resolve();
            if (stopped) return;

            setRecoveringMessageId(recoveryMessageId);
            setTimedOutMessageId(null);

            const startTime = Date.now();
            let delayedShown = false;
            while (!stopped) {
                const pollState = await pollForResponse(sessionId);
                if (pollState === "recovered" || stopped) {
                    if (!stopped) {
                        setRecoveringMessageId(null);
                        setTimedOutMessageId(null);
                    }
                    return;
                }
                if (pollState === "failed") {
                    setRecoveringMessageId(null);
                    setTimedOutMessageId(recoveryMessageId);
                    return;
                }

                const elapsedMs = Date.now() - startTime;
                if (!delayedShown && elapsedMs >= POLL_TIMEOUT_MS) {
                    delayedShown = true;
                    setTimedOutMessageId(recoveryMessageId);
                }
                if (elapsedMs >= POLL_MAX_DURATION_MS) {
                    setRecoveringMessageId(null);
                    setTimedOutMessageId(recoveryMessageId);
                    return;
                }

                await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            }
        };

        poll();

        return () => {
            stopped = true;
        };
    }, [
        needsRecovery,
        state.activeSessionId,
        lastMessage?.id,
        recoveringMessageId,
        timedOutMessageId,
        pollForResponse,
    ]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [messages.length, lastMessageContent]);

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                height: "100dvh",
                minWidth: 0,
                background: "var(--bg-primary)",
                overflow: "hidden",
            }}
        >
            <header
                className="glass"
                style={{
                    height: "var(--header-height)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 clamp(var(--space-3), 2.5vw, var(--space-5))",
                    borderBottom: "1px solid var(--border-subtle)",
                    position: "sticky",
                    top: 0,
                    zIndex: 20,
                    gap: "var(--space-3)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <button
                        id="btn-toggle-sidebar"
                        aria-label={state.sidebarOpen ? "Close sidebar" : "Open sidebar"}
                        onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
                        style={{
                            width: 32,
                            height: 32,
                            flexShrink: 0,
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-default)",
                            background: state.sidebarOpen
                                ? "var(--bg-tertiary)"
                                : "rgba(196, 122, 74, 0.1)",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <SidebarToggleIcon open={state.sidebarOpen} />
                    </button>

                    <h2
                        style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "var(--text-lg)",
                            fontWeight: 400,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                        }}
                    >
                        {activeSession?.title || "New Session"}
                    </h2>
                </div>

                {(hasHeaderProgress || !isEmpty) && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            fontSize: "var(--text-xs)",
                            color: "var(--text-tertiary)",
                            flexShrink: 0,
                            whiteSpace: "nowrap",
                            padding: "var(--space-1) var(--space-2)",
                            borderRadius: "var(--radius-full)",
                            border: hasHeaderProgress
                                ? "1px solid color-mix(in oklch, var(--color-accent) 25%, transparent)"
                                : "1px solid transparent",
                            background: hasHeaderProgress
                                ? "color-mix(in oklch, var(--color-accent) 10%, transparent)"
                                : "transparent",
                        }}
                    >
                        <motion.div
                            animate={
                                state.isLoading || showRecovering
                                    ? { scale: [1, 1.25, 1], opacity: [0.45, 1, 0.45] }
                                    : { scale: 1, opacity: 1 }
                            }
                            transition={
                                state.isLoading || showRecovering
                                    ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                                    : undefined
                            }
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: headerStatusColor,
                                flexShrink: 0,
                            }}
                        />
                        <span
                            style={{
                                color: hasHeaderProgress
                                    ? "var(--text-primary)"
                                    : "var(--text-tertiary)",
                                fontWeight: hasHeaderProgress ? 600 : 500,
                            }}
                        >
                            {headerStatusLabel}
                        </span>
                    </div>
                )}
            </header>

            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "var(--space-6) clamp(var(--space-3), 3vw, var(--space-5))",
                }}
            >
                {isEmpty ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            minHeight: 400,
                            textAlign: "center",
                            gap: "var(--space-6)",
                        }}
                    >
                        <div
                            style={{
                                width: "clamp(48px, 10vw, 64px)",
                                height: "clamp(48px, 10vw, 64px)",
                                borderRadius: "var(--radius-xl)",
                                background:
                                    "linear-gradient(135deg, var(--color-accent), var(--color-accent-dim))",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "var(--font-serif)",
                                fontSize: "clamp(var(--text-xl), 4vw, var(--text-3xl))",
                                color: "var(--color-pure-white)",
                                boxShadow: "0 8px 24px rgba(196,122,74,.25)",
                            }}
                        >
                            J
                        </div>
                        <div>
                            <h2
                                style={{
                                    fontFamily: "var(--font-serif)",
                                    fontSize: "clamp(var(--text-xl), 4vw, var(--text-2xl))",
                                    fontWeight: 400,
                                    marginBottom: "var(--space-2)",
                                }}
                            >
                                What would you like to learn?
                            </h2>
                            <p
                                style={{
                                    fontSize: "var(--text-base)",
                                    color: "var(--text-tertiary)",
                                    maxWidth: 420,
                                    lineHeight: "var(--leading-relaxed)",
                                }}
                            >
                                Ask strategic questions grounded in your private knowledge bases. Jiff cites sources and flags uncertainty.
                            </p>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                justifyContent: "center",
                                gap: "var(--space-2)",
                                marginTop: "var(--space-4)",
                                maxWidth: 560,
                                padding: "0 var(--space-2)",
                            }}
                        >
                            {[
                                "What are the key positioning strategies?",
                                "Summarize brand architecture findings",
                                "What gaps exist in our competitive analysis?",
                            ].map((text) => (
                                <motion.button
                                    key={text}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => sendMessage(text, state.activeSessionId || undefined)}
                                    style={{
                                        padding: "var(--space-3) var(--space-4)",
                                        background: "var(--bg-tertiary)",
                                        border: "1px solid var(--border-default)",
                                        borderRadius: "var(--radius-lg)",
                                        color: "var(--text-secondary)",
                                        fontSize: "var(--text-sm)",
                                        fontFamily: "var(--font-sans)",
                                        cursor: "pointer",
                                        textAlign: "start",
                                        boxShadow: "var(--shadow-sm)",
                                    }}
                                >
                                    {text}
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                ) : (
                    <div style={{ maxWidth: "var(--composer-max)", margin: "0 auto" }}>
                        {messages.map((msg) => (
                            <ChatBubble key={msg.id} message={msg} />
                        ))}

                        {showRecovering && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "var(--space-3)",
                                    padding: "var(--space-3) var(--space-4)",
                                    marginTop: "var(--space-3)",
                                    borderRadius: "var(--radius-lg)",
                                    background: "color-mix(in oklch, var(--color-accent) 8%, transparent)",
                                    border: "1px solid color-mix(in oklch, var(--color-accent) 20%, transparent)",
                                    fontSize: "var(--text-sm)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                <motion.div
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: "var(--color-accent)",
                                        flexShrink: 0,
                                    }}
                                />
                                <span>Waiting for response from server...</span>
                            </motion.div>
                        )}

                        {showTimedOut && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "var(--space-3)",
                                    padding: "var(--space-3) var(--space-4)",
                                    marginTop: "var(--space-3)",
                                    borderRadius: "var(--radius-lg)",
                                    background: "color-mix(in oklch, var(--color-warning) 10%, transparent)",
                                    border: "1px solid color-mix(in oklch, var(--color-warning) 25%, transparent)",
                                    fontSize: "var(--text-sm)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                                    <circle cx="8" cy="8" r="7" stroke="var(--color-warning)" strokeWidth="1.5" />
                                    <line x1="8" y1="4.5" x2="8" y2="8.5" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round" />
                                    <circle cx="8" cy="11" r="0.75" fill="var(--color-warning)" />
                                </svg>
                                <span style={{ flex: 1 }}>
                                    Response is taking longer than expected. You can wait or re-ask.
                                </span>
                                <button
                                    onClick={() => sendMessage(lastMessage.content, state.activeSessionId || undefined)}
                                    style={{
                                        padding: "var(--space-1) var(--space-3)",
                                        borderRadius: "var(--radius-md)",
                                        background: "var(--color-accent)",
                                        color: "var(--color-pure-white)",
                                        border: "none",
                                        fontSize: "var(--text-xs)",
                                        fontFamily: "var(--font-sans)",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    Re-ask
                                </button>
                            </motion.div>
                        )}
                    </div>
                )}
            </div>
            <Composer />
        </div>
    );
}
