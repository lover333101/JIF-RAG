"use client";

import { useEffect, useState } from "react";

const DEVTOOLS_GUARD_ENABLED =
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_DISABLE_DEVTOOLS !== "false";

function isBlockedShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if (key === "f12") {
        return true;
    }
    if (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) {
        return true;
    }
    if ((event.ctrlKey || event.metaKey) && key === "u") {
        return true;
    }
    return false;
}

function isDevtoolsLikelyOpen(): boolean {
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    return widthGap > 180 || heightGap > 180;
}

function isDebuggerLikelyOpen(): boolean {
    const start = performance.now();
    debugger;
    const duration = performance.now() - start;
    return duration > 120;
}

export default function ClientSecurityGuards() {
    const [showBlockOverlay, setShowBlockOverlay] = useState(false);
    const [hardLocked, setHardLocked] = useState(false);

    useEffect(() => {
        if (!DEVTOOLS_GUARD_ENABLED) {
            return;
        }

        const lockSession = () => {
            setHardLocked(true);
            setShowBlockOverlay(true);
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
        };

        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault();
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (!isBlockedShortcut(event)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
        };

        const onResize = () => {
            if (isDevtoolsLikelyOpen()) {
                lockSession();
            }
        };

        document.addEventListener("contextmenu", onContextMenu);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onResize);

        const intervalId = window.setInterval(() => {
            if (hardLocked) {
                return;
            }

            if (isDevtoolsLikelyOpen() || isDebuggerLikelyOpen()) {
                lockSession();
            }
        }, 700);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("contextmenu", onContextMenu);
            document.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("resize", onResize);
            document.documentElement.style.overflow = "";
            document.body.style.overflow = "";
        };
    }, [hardLocked]);

    if (!showBlockOverlay) {
        return null;
    }

    return (
        <div
            role="alert"
            aria-live="assertive"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483647,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                    "radial-gradient(circle at 20% 20%, #2f2219 0%, #101010 58%)",
                color: "#f8efe7",
                fontFamily: "var(--font-sans)",
                padding: 24,
                textAlign: "center",
            }}
        >
            <div
                style={{
                    maxWidth: 520,
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    borderRadius: 14,
                    padding: "24px 22px",
                    background: "rgba(0, 0, 0, 0.42)",
                    boxShadow: "0 12px 48px rgba(0, 0, 0, 0.44)",
                }}
            >
                <h2
                    style={{
                        fontSize: "1.4rem",
                        lineHeight: 1.25,
                        margin: 0,
                        fontWeight: 600,
                    }}
                >
                    Developer tools are disabled
                </h2>
                <p
                    style={{
                        marginTop: 12,
                        marginBottom: 0,
                        color: "rgba(248, 239, 231, 0.86)",
                        lineHeight: 1.5,
                    }}
                >
                    Close and reload the page to continue using this workspace.
                </p>
            </div>
        </div>
    );
}
