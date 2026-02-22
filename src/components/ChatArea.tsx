"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/store/AppContext";
import ChatBubble from "@/components/ChatBubble";
import Composer from "@/components/Composer";

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
                height: "100vh",
                minWidth: 0,
                background: "var(--bg-primary)",
            }}
        >
            <header
                className="glass"
                style={{
                    height: "var(--header-height)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 var(--space-5)",
                    borderBottom: "1px solid var(--border-subtle)",
                    position: "sticky",
                    top: 0,
                    zIndex: 20,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <button
                        id="btn-toggle-sidebar"
                        aria-label={state.sidebarOpen ? "Close sidebar" : "Open sidebar"}
                        onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
                        style={{
                            width: 32,
                            height: 32,
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
                        }}
                    >
                        {activeSession?.title || "New Session"}
                    </h2>
                </div>

                {!isEmpty && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            fontSize: "var(--text-xs)",
                            color: "var(--text-tertiary)",
                        }}
                    >
                        <div
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: state.isLoading
                                    ? "var(--color-warning)"
                                    : "var(--color-success)",
                            }}
                        />
                        {state.isLoading ? "Thinking..." : "Ready"}
                    </div>
                )}
            </header>

            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "var(--space-8) var(--space-5)",
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
                                width: 64,
                                height: 64,
                                borderRadius: "var(--radius-xl)",
                                background:
                                    "linear-gradient(135deg, var(--color-accent), var(--color-accent-dim))",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "var(--font-serif)",
                                fontSize: "var(--text-3xl)",
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
                                    fontSize: "var(--text-2xl)",
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
                                    onClick={() => sendMessage(text)}
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
                    </div>
                )}
            </div>
            <Composer />
        </div>
    );
}
