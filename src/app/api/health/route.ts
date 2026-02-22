import { NextResponse } from "next/server";
import { buildBackendUrl } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const upstream = await fetch(buildBackendUrl("/health"), {
            method: "GET",
            cache: "no-store",
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { status: "degraded" },
                { status: 200, headers: { "Cache-Control": "no-store" } }
            );
        }

        const payload = await upstream
            .json()
            .catch(() => ({ status: "ok" as const }));
        return NextResponse.json(payload, {
            status: 200,
            headers: { "Cache-Control": "no-store" },
        });
    } catch {
        return NextResponse.json(
            { status: "degraded" },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }
}
