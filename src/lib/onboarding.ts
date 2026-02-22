import type { User } from "@supabase/supabase-js";

const NEW_USER_WINDOW_MS = 15 * 60 * 1000;

function toTimestamp(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export function sanitizeNextPath(
    value: string | null | undefined,
    fallback = "/"
): string {
    if (!value || !value.startsWith("/")) return fallback;
    return value;
}

export function hasCompletedOnboarding(user: User | null | undefined): boolean {
    if (!user) return false;
    return user.user_metadata?.onboarding_completed === true;
}

export function isLikelyNewUser(user: User | null | undefined): boolean {
    if (!user) return false;

    const createdAt = toTimestamp(user.created_at);
    const lastSignInAt = toTimestamp(user.last_sign_in_at ?? undefined);

    if (createdAt === null || lastSignInAt === null) {
        return false;
    }

    return Math.abs(lastSignInAt - createdAt) <= NEW_USER_WINDOW_MS;
}

export function shouldShowOnboarding(user: User | null | undefined): boolean {
    if (!user) return false;
    if (hasCompletedOnboarding(user)) return false;
    return isLikelyNewUser(user);
}

export function toOnboardingPath(nextPath: string): string {
    const safeNextPath = sanitizeNextPath(nextPath, "/");
    return `/onboarding?next=${encodeURIComponent(safeNextPath)}`;
}
