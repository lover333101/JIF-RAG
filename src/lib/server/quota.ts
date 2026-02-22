import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const DEFAULT_DAILY_LIMIT = 10;

export interface QuotaResult {
    allowed: boolean;
    limit: number;
    used: number;
    remaining: number;
    resetAt: string;
}

function nextUtcMidnightIso(now: Date): string {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.toISOString();
}

function clampLimit(value: number | null | undefined): number {
    if (!value || !Number.isFinite(value)) return DEFAULT_DAILY_LIMIT;
    return Math.max(1, Math.min(10000, Math.floor(value)));
}

function isMissingRpcFunction(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "";
    const message = typeof record.message === "string" ? record.message : "";
    return code === "PGRST202" || /could not find the function/i.test(message);
}

function parseRpcQuotaData(data: unknown, fallbackNow: Date): QuotaResult | null {
    if (!data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return null;

    const record = row as Record<string, unknown>;
    const allowed = Boolean(record.allowed);
    const limit = clampLimit(
        Number(
            typeof record.daily_limit !== "undefined"
                ? record.daily_limit
                : record.limit
        )
    );
    const used = Math.max(0, Math.floor(Number(record.used) || 0));
    const remaining = Math.max(0, Math.floor(Number(record.remaining) || 0));
    const resetAtRaw =
        typeof record.reset_at === "string" ? record.reset_at : "";
    const resetAt = resetAtRaw || nextUtcMidnightIso(fallbackNow);

    return { allowed, limit, used, remaining, resetAt };
}

export async function consumeDailyQuota(userId: string): Promise<QuotaResult> {
    const admin = getSupabaseAdminClient();
    const now = new Date();
    const rpc = await admin.rpc("consume_daily_quota", {
        p_user_id: userId,
        p_default_limit: DEFAULT_DAILY_LIMIT,
    });
    if (rpc.error) {
        if (isMissingRpcFunction(rpc.error)) {
            throw new Error(
                "Quota function `consume_daily_quota` is missing. Run the latest Supabase migration before using chat."
            );
        }
        throw new Error(
            typeof rpc.error.message === "string"
                ? rpc.error.message
                : "Failed to evaluate daily quota."
        );
    }
    const parsed = parseRpcQuotaData(rpc.data, now);
    if (!parsed) {
        throw new Error("Invalid response from `consume_daily_quota`.");
    }
    return parsed;
}
