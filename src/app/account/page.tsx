"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAccountSummary, getQuotaSummary } from "@/lib/api";
import type { AccountSummary, QuotaSummary } from "@/types/chat";

export default function AccountPage() {
    const router = useRouter();
    const [summary, setSummary] = useState<AccountSummary | null>(null);
    const [quota, setQuota] = useState<QuotaSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSigningOut, setIsSigningOut] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        Promise.all([getAccountSummary(), getQuotaSummary()])
            .then(([accountData, quotaData]) => {
                if (!cancelled) {
                    setSummary(accountData);
                    setQuota(quotaData);
                    setError(null);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load account.");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const displayName = useMemo(() => {
        if (!summary) return "Account";
        if (summary.display_name) return summary.display_name;
        if (summary.email) return summary.email;
        return "Account";
    }, [summary]);

    const limitUsagePercentage = useMemo(() => {
        if (!quota || quota.limit <= 0) return 0;
        const ratio = (quota.used / quota.limit) * 100;
        return Math.max(0, Math.min(100, Math.round(ratio)));
    }, [quota]);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            const res = await fetch("/auth/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const payload = (await res.json().catch(() => ({}))) as {
                redirect?: string;
            };
            router.push(payload.redirect || "/login");
            router.refresh();
        } finally {
            setIsSigningOut(false);
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                padding: "clamp(20px, 3vw, 42px)",
            }}
        >
            <div
                style={{
                    maxWidth: 860,
                    margin: "0 auto",
                    display: "grid",
                    gap: "var(--space-5)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "var(--space-3)",
                    }}
                >
                    <div>
                        <h1
                            style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "clamp(30px, 4vw, 44px)",
                                fontWeight: 400,
                                letterSpacing: "-0.02em",
                                marginBottom: "var(--space-1)",
                            }}
                        >
                            Account Settings
                        </h1>
                        <p
                            style={{
                                fontSize: "var(--text-sm)",
                                color: "var(--text-secondary)",
                            }}
                        >
                            Manage your workspace identity and usage stats.
                        </p>
                    </div>
                    <Link
                        href="/"
                        style={{
                            color: "var(--color-accent)",
                            textDecoration: "none",
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            borderBottom: "1px solid var(--color-accent)",
                            paddingBottom: 1,
                        }}
                    >
                        Back to chat
                    </Link>
                </div>

                <div
                    style={{
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-secondary)",
                        boxShadow: "var(--shadow-md)",
                        padding: "clamp(18px, 3vw, 28px)",
                        display: "grid",
                        gap: "var(--space-4)",
                    }}
                >
                    {isLoading ? (
                        <div
                            style={{
                                fontSize: "var(--text-sm)",
                                color: "var(--text-secondary)",
                            }}
                        >
                            Loading account...
                        </div>
                    ) : error ? (
                        <div
                            style={{
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
                    ) : (
                        <>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr auto",
                                    gap: "var(--space-3)",
                                    alignItems: "center",
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            fontSize: "var(--text-xs)",
                                            color: "var(--text-tertiary)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            marginBottom: "var(--space-1)",
                                        }}
                                    >
                                        Account
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "var(--text-lg)",
                                            fontWeight: 600,
                                            color: "var(--text-primary)",
                                        }}
                                    >
                                        {displayName}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "var(--text-sm)",
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        {summary?.email || "No email available"}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    disabled={isSigningOut}
                                    style={{
                                        border: "1px solid var(--border-default)",
                                        borderRadius: "var(--radius-md)",
                                        background: "var(--bg-tertiary)",
                                        padding: "var(--space-2) var(--space-3)",
                                        fontSize: "var(--text-sm)",
                                        color: "var(--text-primary)",
                                        cursor: isSigningOut ? "not-allowed" : "pointer",
                                        opacity: isSigningOut ? 0.7 : 1,
                                    }}
                                >
                                    {isSigningOut ? "Signing out..." : "Sign out"}
                                </button>
                            </div>

                            <div
                                style={{
                                    marginTop: "var(--space-2)",
                                    borderTop: "1px solid var(--border-subtle)",
                                    paddingTop: "var(--space-4)",
                                    display: "grid",
                                    gridTemplateColumns:
                                        "repeat(auto-fit,minmax(220px,1fr))",
                                    gap: "var(--space-3)",
                                }}
                            >
                                <div
                                    style={{
                                        border: "1px solid var(--border-subtle)",
                                        borderRadius: "var(--radius-md)",
                                        background: "var(--bg-primary)",
                                        padding: "var(--space-4)",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "var(--text-xs)",
                                            color: "var(--text-tertiary)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            marginBottom: "var(--space-1)",
                                        }}
                                    >
                                        Messages
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "var(--text-2xl)",
                                            fontWeight: 700,
                                            color: "var(--color-accent)",
                                        }}
                                    >
                                        {summary?.message_count ?? 0}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        border: "1px solid var(--border-subtle)",
                                        borderRadius: "var(--radius-md)",
                                        background: "var(--bg-primary)",
                                        padding: "var(--space-4)",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "var(--text-xs)",
                                            color: "var(--text-tertiary)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            marginBottom: "var(--space-1)",
                                        }}
                                    >
                                        Status
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "var(--text-sm)",
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        Active
                                    </div>
                                </div>

                                <div
                                    style={{
                                        border: "1px solid var(--border-subtle)",
                                        borderRadius: "var(--radius-md)",
                                        background: "var(--bg-primary)",
                                        padding: "var(--space-4)",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "var(--text-xs)",
                                            color: "var(--text-tertiary)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            marginBottom: "var(--space-1)",
                                        }}
                                    >
                                        Daily Limit
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "var(--text-lg)",
                                            fontWeight: 700,
                                            color: "var(--text-primary)",
                                            marginBottom: "var(--space-2)",
                                        }}
                                    >
                                        {quota ? `${quota.used}/${quota.limit}` : "--/--"}
                                    </div>
                                    <div
                                        style={{
                                            width: "100%",
                                            height: 7,
                                            borderRadius: "var(--radius-full)",
                                            background: "var(--bg-tertiary)",
                                            overflow: "hidden",
                                            marginBottom: "var(--space-2)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${limitUsagePercentage}%`,
                                                height: "100%",
                                                background:
                                                    limitUsagePercentage >= 100
                                                        ? "var(--color-danger)"
                                                        : "var(--color-accent)",
                                                borderRadius: "var(--radius-full)",
                                                transition: "width 220ms var(--ease-out)",
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            fontSize: "var(--text-xs)",
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        <span>{limitUsagePercentage}% used</span>
                                        <span>
                                            {quota
                                                ? `${Math.max(0, quota.remaining)} left`
                                                : "-- left"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
