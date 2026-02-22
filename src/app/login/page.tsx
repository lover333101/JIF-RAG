"use client";

import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sanitizeNextPath, shouldShowOnboarding, toOnboardingPath } from "@/lib/onboarding";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
        />
        <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
        />
        <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
        />
        <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
        />
    </svg>
);

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);

    const readNextPath = () => {
        if (typeof window === "undefined") return "/";
        const fromUrl = new URLSearchParams(window.location.search).get("next");
        return sanitizeNextPath(fromUrl, "/");
    };

    useEffect(() => {
        let cancelled = false;
        let supabase;
        try {
            supabase = getSupabaseBrowserClient();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Supabase environment is not configured.";
            console.error(message);
            return () => {
                cancelled = true;
            };
        }
        const nextPath = readNextPath();
        supabase.auth.getUser().then(({ data }) => {
            if (!cancelled && data.user) {
                const target = shouldShowOnboarding(data.user)
                    ? toOnboardingPath(nextPath)
                    : nextPath;
                router.replace(target);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [router]);

    const handleGoogleSignIn = async () => {
        if (configError) return;
        setErrorMessage(null);
        setIsLoading(true);
        let supabase;
        try {
            supabase = getSupabaseBrowserClient();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Supabase environment is not configured.";
            setConfigError(message);
            setIsLoading(false);
            return;
        }
        const nextPath = readNextPath();
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo },
        });

        if (error) {
            setErrorMessage(error.message || "Google sign-in failed.");
            setIsLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (configError) return;
        setErrorMessage(null);
        setIsLoading(true);
        let supabase;
        try {
            supabase = getSupabaseBrowserClient();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Supabase environment is not configured.";
            setConfigError(message);
            setIsLoading(false);
            return;
        }
        const nextPath = readNextPath();

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setErrorMessage(error.message || "Sign-in failed.");
            setIsLoading(false);
            return;
        }

        const target = shouldShowOnboarding(data.user)
            ? toOnboardingPath(nextPath)
            : nextPath;
        router.replace(target);
        router.refresh();
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                background: "var(--bg-primary)",
                fontFamily: "var(--font-sans)",
                color: "var(--text-primary)",
            }}
        >
            {isLoading ? (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        height: 2,
                        background: "var(--color-accent)",
                        animation: "shimmer 1.5s cubic-bezier(0.4,0,0.2,1) infinite",
                        zIndex: 9999,
                        width: "100%",
                    }}
                />
            ) : null}

            <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
                <div
                    style={{
                        width: "50%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "var(--space-10) var(--space-8)",
                    }}
                >
                    <div style={{ width: "100%", maxWidth: 400 }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "var(--space-3)",
                                marginBottom: "var(--space-12)",
                            }}
                        >
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "var(--radius-md)",
                                    background: "var(--color-accent)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontFamily: "var(--font-serif)",
                                    fontSize: "var(--text-xl)",
                                    color: "var(--color-pure-white)",
                                }}
                            >
                                J
                            </div>
                            <div>
                                <h1
                                    style={{
                                        fontFamily: "var(--font-serif)",
                                        fontSize: "var(--text-2xl)",
                                        fontWeight: 400,
                                        lineHeight: 1,
                                    }}
                                >
                                    Jiff
                                </h1>
                                <span
                                    style={{
                                        fontSize: "var(--text-xs)",
                                        color: "var(--text-tertiary)",
                                        letterSpacing: "0.04em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Strategy Assistant
                                </span>
                            </div>
                        </div>

                        <div style={{ marginBottom: "var(--space-8)" }}>
                            <h2
                                style={{
                                    fontFamily: "var(--font-serif)",
                                    fontSize: "var(--text-3xl)",
                                    fontWeight: 400,
                                    marginBottom: "var(--space-2)",
                                }}
                            >
                                Welcome back
                            </h2>
                            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                                Sign in to continue to your workspace
                            </p>
                        </div>

                        {errorMessage ? (
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
                                {errorMessage}
                            </div>
                        ) : null}

                        {configError ? (
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
                                {configError}
                            </div>
                        ) : null}

                        <button
                            id="btn-google-login"
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={isLoading || Boolean(configError)}
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "var(--space-3)",
                                padding: "var(--space-3) var(--space-4)",
                                background: "var(--bg-tertiary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                color: "var(--text-primary)",
                                fontSize: "var(--text-sm)",
                                fontWeight: 500,
                                cursor: isLoading ? "not-allowed" : "pointer",
                                opacity: isLoading ? 0.65 : 1,
                                boxShadow: "var(--shadow-sm)",
                            }}
                        >
                            <GoogleIcon />
                            <span>Continue with Google</span>
                        </button>

                        <div
                            style={{
                                position: "relative",
                                margin: "var(--space-6) 0",
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
                            <div style={{ flex: 1, height: 1, background: "var(--border-default)" }} />
                            <span
                                style={{
                                    padding: "0 var(--space-4)",
                                    fontSize: "var(--text-xs)",
                                    color: "var(--text-tertiary)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                or
                            </span>
                            <div style={{ flex: 1, height: 1, background: "var(--border-default)" }} />
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                <label htmlFor="email" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    disabled={isLoading}
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

                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <label htmlFor="password" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                                        Password
                                    </label>
                                    <Link
                                        href="#"
                                        style={{
                                            fontSize: "var(--text-xs)",
                                            color: "var(--color-accent)",
                                            textDecoration: "none",
                                            fontWeight: 500,
                                        }}
                                    >
                                        Forgot password?
                                    </Link>
                                </div>

                                <div style={{ position: "relative" }}>
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        disabled={isLoading}
                                        style={{
                                            width: "100%",
                                            padding: "var(--space-3) var(--space-4)",
                                            paddingRight: "var(--space-12)",
                                            background: "var(--bg-tertiary)",
                                            border: "1px solid var(--border-default)",
                                            borderRadius: "var(--radius-md)",
                                            fontSize: "var(--text-sm)",
                                            color: "var(--text-primary)",
                                            outline: "none",
                                        }}
                                    />
                                    <button
                                        type="button"
                                        id="btn-toggle-password"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        style={{
                                            position: "absolute",
                                            right: 12,
                                            top: "50%",
                                            transform: "translateY(-50%)",
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            cursor: "pointer",
                                            color: "var(--text-tertiary)",
                                            display: "flex",
                                            alignItems: "center",
                                        }}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                id="btn-sign-in"
                                disabled={isLoading}
                                style={{
                                    width: "100%",
                                    padding: "var(--space-3) var(--space-5)",
                                    background: "var(--color-accent)",
                                    color: "var(--color-pure-white)",
                                    border: "none",
                                    borderRadius: "var(--radius-md)",
                                    fontSize: "var(--text-sm)",
                                    fontWeight: 600,
                                    cursor: isLoading ? "not-allowed" : "pointer",
                                    opacity: isLoading ? 0.65 : 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "var(--space-2)",
                                    boxShadow: "var(--shadow-md)",
                                }}
                            >
                                {isLoading ? (
                                    <>
                                        <span
                                            style={{
                                                width: 16,
                                                height: 16,
                                                border: "2px solid rgba(255,255,255,0.3)",
                                                borderTopColor: "#fff",
                                                borderRadius: "50%",
                                                display: "inline-block",
                                                animation: "spin 0.7s linear infinite",
                                            }}
                                        />
                                        <span>Signing in...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Sign in</span>
                                        <ArrowRight size={15} style={{ opacity: 0.8 }} />
                                    </>
                                )}
                            </button>
                        </form>

                        <p
                            style={{
                                marginTop: "var(--space-8)",
                                fontSize: "var(--text-sm)",
                                color: "var(--text-secondary)",
                                textAlign: "center",
                            }}
                        >
                            Don&apos;t have an account?{" "}
                            <Link
                                href="/request-access"
                                style={{
                                    color: "var(--color-accent)",
                                    fontWeight: 600,
                                    textDecoration: "none",
                                    borderBottom: "1px solid var(--color-accent)",
                                    paddingBottom: 1,
                                }}
                            >
                                Request access
                            </Link>
                        </p>
                    </div>
                </div>

                <div
                    style={{
                        width: "50%",
                        background: "var(--color-charcoal)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            opacity: 0.04,
                            pointerEvents: "none",
                            backgroundImage:
                                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            top: "-20%",
                            right: "-15%",
                            width: 500,
                            height: 500,
                            borderRadius: "50%",
                            background: "var(--color-accent)",
                            filter: "blur(160px)",
                            opacity: 0.2,
                            pointerEvents: "none",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            bottom: "-25%",
                            left: "-10%",
                            width: 400,
                            height: 400,
                            borderRadius: "50%",
                            background: "var(--color-accent-dim)",
                            filter: "blur(140px)",
                            opacity: 0.15,
                            pointerEvents: "none",
                        }}
                    />

                    <div style={{ position: "relative", zIndex: 10, maxWidth: 420, padding: "0 var(--space-10)" }}>
                        <h2
                            style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "var(--text-4xl)",
                                fontWeight: 400,
                                color: "var(--color-ivory)",
                                lineHeight: "var(--leading-tight)",
                                letterSpacing: "-0.02em",
                                marginBottom: "var(--space-6)",
                            }}
                        >
                            The knowledge of <span style={{ color: "var(--color-accent)" }}>strategy</span>, between your hands.
                        </h2>

                        <p
                            style={{
                                fontSize: "var(--text-base)",
                                color: "var(--color-stone)",
                                lineHeight: "var(--leading-relaxed)",
                                marginBottom: "var(--space-10)",
                            }}
                        >
                            Ask complex questions across your private knowledge bases.
                            Inspect sources, verify evidence, and trust every answer.
                        </p>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                            {["Source-grounded", "Multi-database", "Evidence-backed"].map((label) => (
                                <span
                                    key={label}
                                    style={{
                                        padding: "var(--space-1) var(--space-3)",
                                        background: "rgba(196, 122, 74, 0.12)",
                                        border: "1px solid rgba(196, 122, 74, 0.2)",
                                        borderRadius: "var(--radius-full)",
                                        fontSize: "var(--text-xs)",
                                        fontWeight: 500,
                                        color: "var(--color-accent)",
                                        letterSpacing: "0.02em",
                                    }}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
