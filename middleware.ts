import { NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import {
    sanitizeNextPath,
    shouldShowOnboarding,
    toOnboardingPath,
} from "@/lib/onboarding";

const PUBLIC_PAGE_PATHS = new Set(["/login", "/request-access", "/auth/callback"]);
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/request-access"]);
const PROTECTED_API_PREFIXES = [
    "/api/chat",
    "/api/indexes",
    "/api/quota",
    "/api/conversations",
    "/api/account",
    "/api/onboarding",
];
const ONBOARDING_PAGE_PATH = "/onboarding";
const ONBOARDING_COMPLETION_API_PATH = "/api/onboarding/complete";
const ONBOARDING_ALLOWED_PAGE_PATHS = new Set([ONBOARDING_PAGE_PATH, "/auth/logout"]);
const ONBOARDING_COOKIE_NAME = "jiff_onboarding_user";

function isStaticAsset(pathname: string): boolean {
    return (
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/favicon") ||
        /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$/i.test(pathname)
    );
}

function isProtectedApi(pathname: string): boolean {
    return PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

    if (isStaticAsset(pathname)) {
        return NextResponse.next();
    }

    const { response, user } = await updateSupabaseSession(request);

    const onboardingCookieUserId = request.cookies.get(ONBOARDING_COOKIE_NAME)?.value;
    const hasOnboardingCookie = Boolean(user && onboardingCookieUserId === user.id);
    const needsOnboarding = !hasOnboardingCookie && shouldShowOnboarding(user);

    if (pathname.startsWith("/api/")) {
        if (PUBLIC_API_PATHS.has(pathname)) {
            return response;
        }
        if (isProtectedApi(pathname) && !user) {
            return NextResponse.json(
                { error: "Authentication required." },
                { status: 401 }
            );
        }
        if (user && needsOnboarding && pathname !== ONBOARDING_COMPLETION_API_PATH) {
            return NextResponse.json(
                { error: "Onboarding required.", redirect: ONBOARDING_PAGE_PATH },
                { status: 428 }
            );
        }
        return response;
    }

    if (PUBLIC_PAGE_PATHS.has(pathname)) {
        if (user && pathname === "/login") {
            const requestedNextPath = sanitizeNextPath(
                request.nextUrl.searchParams.get("next"),
                "/"
            );
            const url = request.nextUrl.clone();
            if (needsOnboarding) {
                const onboardingPath = toOnboardingPath(requestedNextPath);
                const onboardingUrl = new URL(onboardingPath, request.url);
                return NextResponse.redirect(onboardingUrl);
            }
            url.pathname = requestedNextPath;
            url.search = "";
            return NextResponse.redirect(url);
        }
        return response;
    }

    if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", `${pathname}${search}`);
        return NextResponse.redirect(url);
    }

    if (pathname === ONBOARDING_PAGE_PATH && !needsOnboarding) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
    }

    if (needsOnboarding && !ONBOARDING_ALLOWED_PAGE_PATHS.has(pathname)) {
        const onboardingTarget = toOnboardingPath(`${pathname}${search}`);
        return NextResponse.redirect(new URL(onboardingTarget, request.url));
    }

    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
