import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import {
    buildBackendHeaders,
    buildBackendUrl,
    readUpstreamPayload,
} from "@/lib/server/backend";
import { getAllowedIndexesForUser } from "@/lib/server/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeIndexNames(raw: unknown): string[] {
    const collect = (value: unknown): string[] => {
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === "string") return item;
                    if (
                        item &&
                        typeof item === "object" &&
                        "name" in item &&
                        typeof (item as { name?: unknown }).name === "string"
                    ) {
                        return (item as { name: string }).name;
                    }
                    return "";
                })
                .filter(Boolean);
        }

        if (value && typeof value === "object") {
            const record = value as Record<string, unknown>;
            if ("indexes" in record) return collect(record.indexes);
            if ("data" in record) return collect(record.data);
            if ("items" in record) return collect(record.items);
            if ("names" in record) return collect(record.names);
        }
        return [];
    };

    const out = new Set<string>();
    for (const name of collect(raw)) {
        const trimmed = name.trim();
        if (trimmed) out.add(trimmed);
    }
    return [...out];
}

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required.", indexes: [] },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    let upstream: Response;
    try {
        upstream = await fetch(buildBackendUrl("/indexes"), {
            method: "GET",
            cache: "no-store",
            headers: buildBackendHeaders(),
        });
    } catch {
        return NextResponse.json(
            { indexes: [] as string[] },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    if (!upstream.ok) {
        return NextResponse.json(
            { indexes: [] as string[] },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    const payload = await readUpstreamPayload(upstream);
    if (payload === null || typeof payload === "string") {
        return NextResponse.json(
            { indexes: [] as string[] },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    const available = normalizeIndexNames(payload);

    let allowedByAccount: string[] = [];
    try {
        allowedByAccount = await getAllowedIndexesForUser(user.id);
    } catch {
        return NextResponse.json(
            { indexes: [] as string[] },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    const indexes =
        allowedByAccount.length === 0
            ? available
            : available.filter((name) => allowedByAccount.includes(name));

    return NextResponse.json(
        { indexes },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
