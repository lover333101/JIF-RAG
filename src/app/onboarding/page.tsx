"use client";

import { ArrowRight, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { sanitizeNextPath, shouldShowOnboarding } from "@/lib/onboarding";

type OnboardingItem = {
    title: string;
    description: string;
    icon: typeof Sparkles;
};

const ONBOARDING_ITEMS: OnboardingItem[] = [
    {
        title: "Ask focused strategic questions",
        description:
            "Prompt Jiff with clear business context, target market, and constraints to get stronger decisions.",
        icon: Sparkles,
    },
    {
        title: "Verify with evidence",
        description:
            "Use sources and citations to inspect what grounded the answer before making a call.",
        icon: FileSearch,
    },
    {
        title: "Protect quality",
        description:
            "Treat answers as expert drafts: validate assumptions, then adapt for your brand reality.",
        icon: ShieldCheck,
    },
];

export default function OnboardingPage() {
    const router = useRouter();
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [isCompleting, setIsCompleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const readNextPath = () => {
        if (typeof window === "undefined") return "/";
        const nextParam = new URLSearchParams(window.location.search).get("next");
        return sanitizeNextPath(nextParam, "/");
    };

    useEffect(() => {
        let cancelled = false;
        const nextPath = readNextPath();
        let supabase;
        try {
            supabase = getSupabaseBrowserClient();
        } catch (err) {
            if (!cancelled) {
                const message =
                    err instanceof Error
                        ? err.message
                        : "Supabase environment is not configured.";
                setError(message);
                setIsCheckingSession(false);
            }
            return () => {
                cancelled = true;
            };
        }

        supabase.auth
            .getUser()
            .then(({ data, error: userError }) => {
                if (cancelled) return;

                if (userError || !data.user) {
                    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
                    return;
                }

                if (!shouldShowOnboarding(data.user)) {
                    router.replace(nextPath);
                    return;
                }

                setIsCheckingSession(false);
            })
            .catch(() => {
                if (!cancelled) {
                    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [router]);

    const completeOnboarding = async () => {
        const nextPath = readNextPath();
        setError(null);
        setIsCompleting(true);
        try {
            const response = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
            };

            if (!response.ok) {
                throw new Error(payload.error || "Failed to complete onboarding.");
            }

            router.replace(nextPath);
            router.refresh();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to complete onboarding."
            );
        } finally {
            setIsCompleting(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg-primary)",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-sans)",
                }}
            >
                Preparing your workspace...
            </div>
        );
    }

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
                padding: "clamp(20px, 3vw, 42px)",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 860,
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-xl)",
                    background: "var(--bg-secondary)",
                    boxShadow: "var(--shadow-md)",
                    padding: "clamp(20px, 3vw, 36px)",
                    display: "grid",
                    gap: "var(--space-6)",
                }}
            >
                <div style={{ display: "grid", gap: "var(--space-2)" }}>
                    <p
                        style={{
                            margin: 0,
                            fontSize: "var(--text-xs)",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-tertiary)",
                        }}
                    >
                        One-time onboarding
                    </p>
                    <h1
                        style={{
                            margin: 0,
                            fontFamily: "var(--font-serif)",
                            fontSize: "clamp(28px, 4vw, 40px)",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                        }}
                    >
                        Quick start with Jiff
                    </h1>
                    <p
                        style={{
                            margin: 0,
                            color: "var(--text-secondary)",
                            fontSize: "var(--text-sm)",
                            lineHeight: "var(--leading-relaxed)",
                        }}
                    >
                        This takes less than a minute and appears once for new
                        users.
                    </p>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "var(--space-3)",
                    }}
                >
                    {ONBOARDING_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div
                                key={item.title}
                                style={{
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "var(--radius-lg)",
                                    background: "var(--bg-primary)",
                                    padding: "var(--space-4)",
                                    display: "grid",
                                    gap: "var(--space-3)",
                                }}
                            >
                                <div
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: "var(--radius-md)",
                                        border: "1px solid var(--border-default)",
                                        background: "var(--bg-tertiary)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "var(--color-accent)",
                                    }}
                                >
                                    <Icon size={16} />
                                </div>
                                <div style={{ display: "grid", gap: "var(--space-1)" }}>
                                    <h2
                                        style={{
                                            margin: 0,
                                            fontSize: "var(--text-sm)",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {item.title}
                                    </h2>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: "var(--text-xs)",
                                            color: "var(--text-secondary)",
                                            lineHeight: "var(--leading-relaxed)",
                                        }}
                                    >
                                        {item.description}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {error ? (
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
                ) : null}

                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <button
                        type="button"
                        onClick={completeOnboarding}
                        disabled={isCompleting}
                        style={{
                            border: "none",
                            borderRadius: "var(--radius-md)",
                            background: "var(--color-accent)",
                            color: "var(--color-pure-white)",
                            padding: "var(--space-3) var(--space-5)",
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            cursor: isCompleting ? "not-allowed" : "pointer",
                            opacity: isCompleting ? 0.7 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            boxShadow: "var(--shadow-sm)",
                        }}
                    >
                        {isCompleting ? "Finishing..." : "Continue to workspace"}
                        <ArrowRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
