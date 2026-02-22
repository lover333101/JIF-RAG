import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REQUEST_ACCESS_WEBHOOK_URL =
    "https://my-n8n-instance-paov.onrender.com/webhook/d0dde6f8-9008-425e-b2c2-f4ef52b3d4fe";
const REQUEST_ACCESS_WEBHOOK_URL =
    process.env.REQUEST_ACCESS_WEBHOOK_URL?.trim() ||
    DEFAULT_REQUEST_ACCESS_WEBHOOK_URL;
const WEBHOOK_TIMEOUT_MS = 10000;

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanText(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
}

function getClientIp(request: NextRequest): string | null {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0]?.trim() || null;
    }
    const realIp = request.headers.get("x-real-ip");
    return realIp?.trim() || null;
}

export async function POST(request: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json(
            { error: "Invalid request payload." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const email = cleanText(body.email, 320).toLowerCase();
    const fullName = cleanText(body.full_name, 120);
    const company = cleanText(body.company, 120);
    const message = cleanText(body.message, 2000);
    const submittedAt = new Date().toISOString();

    if (!email || !isValidEmail(email)) {
        return NextResponse.json(
            { error: "Valid email is required." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const webhookPayload = {
        email,
        full_name: fullName || null,
        company: company || null,
        message: message || null,
        submitted_at: submittedAt,
        source: "jiff-rag-request-access",
        ip: getClientIp(request),
        user_agent: request.headers.get("user-agent") || null,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    let webhookResponse: Response;
    try {
        webhookResponse = await fetch(REQUEST_ACCESS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
            signal: controller.signal,
            cache: "no-store",
        });
    } catch {
        clearTimeout(timeoutId);
        return NextResponse.json(
            { error: "Unable to deliver request to webhook." },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
    clearTimeout(timeoutId);

    if (!webhookResponse.ok) {
        return NextResponse.json(
            { error: "Webhook rejected the request." },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }

    // Best-effort persistence for internal review; webhook delivery is the primary path.
    try {
        const admin = getSupabaseAdminClient();
        await admin.from("access_requests").upsert(
            {
                email,
                full_name: fullName || null,
                company: company || null,
                message: message || null,
                status: "pending",
                updated_at: submittedAt,
            },
            { onConflict: "email", ignoreDuplicates: false }
        );
    } catch {
        // Intentionally ignore DB failures here to keep webhook flow reliable.
    }

    return NextResponse.json(
        { ok: true, message: "Access request submitted." },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
