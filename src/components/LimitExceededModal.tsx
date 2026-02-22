"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/store/AppContext";

const MailIcon = () => (
    <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
        <path d="M2.5 4.5L8 8.5l5.5-4" />
    </svg>
);

export default function LimitExceededModal() {
    const { state, dispatch } = useApp();

    return (
        <AnimatePresence>
            {state.limitModalOpen ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => dispatch({ type: "CLOSE_LIMIT_MODAL" })}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 120,
                        background: "rgba(8, 8, 8, 0.58)",
                        backdropFilter: "blur(2px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "var(--space-5)",
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 460,
                            borderRadius: "var(--radius-xl)",
                            border: "1px solid var(--border-default)",
                            background: "var(--bg-secondary)",
                            boxShadow: "var(--shadow-lg)",
                            padding: "var(--space-6)",
                            color: "var(--text-primary)",
                        }}
                    >
                        <div
                            style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "var(--text-2xl)",
                                lineHeight: 1.15,
                                marginBottom: "var(--space-2)",
                            }}
                        >
                            Daily limit reached
                        </div>
                        <p
                            style={{
                                margin: 0,
                                fontSize: "var(--text-sm)",
                                color: "var(--text-secondary)",
                                lineHeight: "var(--leading-relaxed)",
                            }}
                        >
                            {state.limitModalMessage ||
                                "You reached your daily limit. Communicate with Jose Ahmad at hello@joseahmad.com to expand your daily limit, otherwise wait until the next day."}
                        </p>
                        <p
                            style={{
                                marginTop: "var(--space-2)",
                                marginBottom: 0,
                                fontSize: "var(--text-xs)",
                                color: "var(--text-tertiary)",
                            }}
                        >
                            Contact email:{" "}
                            <a
                                href="mailto:hello@joseahmad.com"
                                style={{
                                    color: "var(--color-accent)",
                                    textDecoration: "none",
                                }}
                            >
                                hello@joseahmad.com
                            </a>
                        </p>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "var(--space-2)",
                                marginTop: "var(--space-5)",
                            }}
                        >
                            <a
                                id="btn-contact-jose"
                                href="mailto:hello@joseahmad.com?subject=Daily%20Limit%20Expansion%20Request&body=Hi%20Jose%20Ahmad%2C%0A%0AI%20reached%20my%20daily%20limit%20in%20Jiff.%20Please%20expand%20my%20daily%20limit.%0A%0AThank%20you."
                                style={{
                                    flex: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "var(--space-2)",
                                    borderRadius: "var(--radius-md)",
                                    border: "none",
                                    background: "var(--color-accent)",
                                    color: "var(--color-pure-white)",
                                    padding: "var(--space-3) var(--space-4)",
                                    fontSize: "var(--text-sm)",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    textDecoration: "none",
                                }}
                            >
                                <MailIcon />
                                Email Jose Ahmad
                            </a>

                            <button
                                type="button"
                                id="btn-close-limit-modal"
                                onClick={() => dispatch({ type: "CLOSE_LIMIT_MODAL" })}
                                style={{
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "var(--radius-md)",
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-secondary)",
                                    padding: "var(--space-3) var(--space-4)",
                                    fontSize: "var(--text-sm)",
                                    cursor: "pointer",
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
