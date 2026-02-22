"use client";

import Link from "next/link";
import { useState } from "react";

export default function RequestAccessPage() {
    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [company, setCompany] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        try {
            const response = await fetch("/api/request-access", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    full_name: fullName,
                    company,
                    message,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
            };

            if (!response.ok) {
                setError(payload.error || "Unable to submit request.");
                return;
            }

            setSuccess(payload.message || "Request submitted successfully.");
            setEmail("");
            setFullName("");
            setCompany("");
            setMessage("");
        } catch {
            setError("Unable to submit request.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                padding: "var(--space-8)",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 640,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-lg)",
                    padding: "clamp(24px, 4vw, 44px)",
                }}
            >
                <h1
                    style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "var(--text-3xl)",
                        fontWeight: 400,
                        marginBottom: "var(--space-2)",
                    }}
                >
                    Request Access
                </h1>
                <p
                    style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--text-secondary)",
                        marginBottom: "var(--space-6)",
                    }}
                >
                    Send your details and we will review your access request.
                </p>

                {error ? (
                    <div
                        style={{
                            marginBottom: "var(--space-4)",
                            padding: "var(--space-3) var(--space-4)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid rgba(177, 89, 89, 0.35)",
                            background: "rgba(177, 89, 89, 0.08)",
                            color: "var(--color-danger)",
                            fontSize: "var(--text-xs)",
                        }}
                    >
                        {error}
                    </div>
                ) : null}

                {success ? (
                    <div
                        style={{
                            marginBottom: "var(--space-4)",
                            padding: "var(--space-3) var(--space-4)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid rgba(74, 158, 111, 0.3)",
                            background: "rgba(74, 158, 111, 0.12)",
                            color: "var(--color-success)",
                            fontSize: "var(--text-xs)",
                        }}
                    >
                        {success}
                    </div>
                ) : null}

                <form
                    onSubmit={handleSubmit}
                    style={{
                        display: "grid",
                        gap: "var(--space-5)",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "clamp(16px, 2.5vw, 26px)",
                    }}
                >
                    <div style={{ display: "grid", gap: "var(--space-2)" }}>
                        <label htmlFor="access-email" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                            Email *
                        </label>
                        <input
                            id="access-email"
                            type="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@company.com"
                            style={{
                                width: "100%",
                                padding: "var(--space-3) var(--space-4)",
                                background: "var(--bg-tertiary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "var(--text-sm)",
                                color: "var(--text-primary)",
                                outline: "none",
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: "var(--space-2)" }}>
                        <label htmlFor="access-name" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                            Full Name
                        </label>
                        <input
                            id="access-name"
                            type="text"
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            placeholder="Your name"
                            style={{
                                width: "100%",
                                padding: "var(--space-3) var(--space-4)",
                                background: "var(--bg-tertiary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "var(--text-sm)",
                                color: "var(--text-primary)",
                                outline: "none",
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: "var(--space-2)" }}>
                        <label htmlFor="access-company" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                            Company
                        </label>
                        <input
                            id="access-company"
                            type="text"
                            value={company}
                            onChange={(event) => setCompany(event.target.value)}
                            placeholder="Company name"
                            style={{
                                width: "100%",
                                padding: "var(--space-3) var(--space-4)",
                                background: "var(--bg-tertiary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "var(--text-sm)",
                                color: "var(--text-primary)",
                                outline: "none",
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: "var(--space-2)" }}>
                        <label htmlFor="access-message" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                            Message
                        </label>
                        <textarea
                            id="access-message"
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            placeholder="What do you need this workspace for?"
                            rows={4}
                            style={{
                                width: "100%",
                                padding: "var(--space-3) var(--space-4)",
                                background: "var(--bg-tertiary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "var(--text-sm)",
                                color: "var(--text-primary)",
                                outline: "none",
                                resize: "vertical",
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            marginTop: "var(--space-3)",
                            width: "100%",
                            padding: "var(--space-4) var(--space-5)",
                            background: "var(--color-accent)",
                            color: "var(--color-pure-white)",
                            border: "none",
                            borderRadius: "var(--radius-md)",
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            cursor: isLoading ? "not-allowed" : "pointer",
                            opacity: isLoading ? 0.65 : 1,
                        }}
                    >
                        {isLoading ? "Submitting..." : "Submit Request"}
                    </button>
                </form>

                <div
                    style={{
                        marginTop: "var(--space-5)",
                        fontSize: "var(--text-sm)",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                    }}
                >
                    Already approved?{" "}
                    <Link
                        href="/login"
                        style={{
                            color: "var(--color-accent)",
                            fontWeight: 600,
                            textDecoration: "none",
                            borderBottom: "1px solid var(--color-accent)",
                            paddingBottom: 1,
                        }}
                    >
                        Back to login
                    </Link>
                </div>
            </div>
        </div>
    );
}
