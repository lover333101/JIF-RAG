import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required.", indexes: [] },
            { status: 401, headers: { "Cache-Control": "no-store" } }
        );
    }

    return NextResponse.json(
        { indexes: [] as string[] },
        { status: 200, headers: { "Cache-Control": "no-store" } }
    );
}
