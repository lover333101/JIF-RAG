"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/store/AppContext";

const SendIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const SettingsIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
);

const MODE_OPTIONS = [
    { value: "auto", label: "Auto" },
    { value: "light", label: "Light (Fast)" },
    { value: "heavy", label: "Heavy (Grounded)" },
] as const;

export default function Composer() {
    const { state, sendMessage, dispatch } = useApp();
    const [input, setInput] = useState("");
    const [showControls, setShowControls] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed || state.isLoading) return;
        sendMessage(trimmed, state.activeSessionId || undefined);
        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
    };

    const modeLabel =
        MODE_OPTIONS.find((item) => item.value === state.responseMode)?.label ??
        "Auto";

    return (
        <div
            style={{
                width: "100%",
                maxWidth: "var(--composer-max)",
                margin: "0 auto",
                padding: "0 clamp(var(--space-3), 3vw, var(--space-5)) var(--space-3)",
            }}
        >
            {/* Mode Chip */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    marginBottom: "var(--space-2)",
                    paddingLeft: "var(--space-1)",
                }}
            >
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        padding: "var(--space-1) var(--space-3)",
                        background: "var(--color-cream)",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--text-xs)",
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                    }}
                >
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background:
                                state.responseMode === "heavy"
                                    ? "var(--color-warning)"
                                    : state.responseMode === "light"
                                        ? "var(--color-success)"
                                        : "var(--color-accent)",
                        }}
                    />
                    Mode: {modeLabel}
                </div>
            </div>

            {/* Composer box */}
            <div
                style={{
                    background: "var(--bg-tertiary)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border-default)",
                    boxShadow: "var(--shadow-md)",
                    transition: "box-shadow var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out)",
                }}
            >
                <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-2)", padding: "var(--space-3) var(--space-4)" }}>
                    <textarea
                        ref={textareaRef}
                        id="composer-input"
                        value={input}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask Jiff anything about your knowledge base…"
                        rows={1}
                        style={{
                            flex: 1,
                            resize: "none",
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--text-base)",
                            lineHeight: "var(--leading-normal)",
                            color: "var(--text-primary)",
                            padding: "var(--space-2) 0",
                            maxHeight: 160,
                        }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", paddingBottom: "var(--space-2)" }}>
                        {/* Settings toggle */}
                        <button
                            onClick={() => setShowControls(!showControls)}
                            id="btn-toggle-controls"
                            aria-label="Toggle advanced controls"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 32,
                                height: 32,
                                borderRadius: "var(--radius-md)",
                                border: "none",
                                background: showControls
                                    ? "var(--color-cream)"
                                    : "transparent",
                                color: "var(--text-tertiary)",
                                cursor: "pointer",
                                transition: "all var(--duration-fast) var(--ease-out)",
                            }}
                        >
                            <SettingsIcon />
                        </button>

                        {/* Send button */}
                        <motion.button
                            onClick={handleSend}
                            disabled={!input.trim() || state.isLoading}
                            id="btn-send"
                            whileTap={{ scale: 0.95 }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 36,
                                height: 36,
                                borderRadius: "var(--radius-md)",
                                border: "none",
                                background:
                                    input.trim() && !state.isLoading
                                        ? "var(--color-accent)"
                                        : "var(--color-sand)",
                                color: "var(--color-pure-white)",
                                cursor:
                                    input.trim() && !state.isLoading
                                        ? "pointer"
                                        : "not-allowed",
                                transition: "all var(--duration-fast) var(--ease-out)",
                            }}
                        >
                            {state.isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    style={{
                                        width: 16,
                                        height: 16,
                                        border: "2px solid rgba(255,255,255,0.3)",
                                        borderTopColor: "white",
                                        borderRadius: "50%",
                                    }}
                                />
                            ) : (
                                <SendIcon />
                            )}
                        </motion.button>
                    </div>
                </div>

                {/* Advanced controls */}
                <motion.div
                    initial={false}
                    animate={{
                        height: showControls ? "auto" : 0,
                        opacity: showControls ? 1 : 0,
                    }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: "hidden" }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-4)",
                            padding: "var(--space-3) var(--space-4)",
                            borderTop: "1px solid var(--border-subtle)",
                            flexWrap: "wrap",
                        }}
                    >
                        {/* Response Mode */}
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginLeft: "auto" }}>
                            <label
                                htmlFor="control-mode"
                                style={{
                                    fontSize: "var(--text-xs)",
                                    fontWeight: 500,
                                    color: "var(--text-tertiary)",
                                    fontFamily: "var(--font-mono)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                }}
                            >
                                Mode
                            </label>
                            <select
                                id="control-mode"
                                value={state.responseMode}
                                onChange={(e) => {
                                    const val = e.target.value as
                                        | "auto"
                                        | "light"
                                        | "heavy";
                                    dispatch({
                                        type: "SET_RESPONSE_MODE",
                                        mode: val,
                                    });
                                }}
                                style={{
                                    fontSize: "var(--text-xs)",
                                    fontFamily: "var(--font-mono)",
                                    padding: "var(--space-1) var(--space-2)",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--border-default)",
                                    background: "var(--bg-primary)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                }}
                            >
                                {MODE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Disclaimer */}
            <p
                style={{
                    textAlign: "center",
                    fontSize: "var(--text-xs)",
                    color: "var(--text-tertiary)",
                    marginTop: "var(--space-2)",
                    marginBottom: "var(--space-1)",
                    fontWeight: 300,
                }}
            >
                Jiff grounds answers in your knowledge base. Always verify critical decisions.
            </p>
        </div>
    );
}
