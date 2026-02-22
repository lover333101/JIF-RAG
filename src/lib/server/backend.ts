const DEFAULT_BACKEND_API_URL = "http://localhost:8000";

export function getBackendApiBaseUrl(): string {
    const raw =
        process.env.BACKEND_API_URL?.trim() ||
        process.env.API_URL?.trim() ||
        DEFAULT_BACKEND_API_URL;
    return raw.replace(/\/+$/, "");
}

export function buildBackendUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${getBackendApiBaseUrl()}${normalized}`;
}

export function getBackendInternalSecret(): string {
    return (
        process.env.BACKEND_INTERNAL_SECRET?.trim() ||
        process.env.SERVER_INTERNAL_SECRET?.trim() ||
        ""
    );
}

export function buildBackendHeaders(
    init?: HeadersInit
): Record<string, string> {
    const headers = new Headers(init);
    const secret = getBackendInternalSecret();
    if (secret) {
        headers.set("X-Internal-Secret", secret);
    }
    return Object.fromEntries(headers.entries());
}

export async function readUpstreamPayload(
    response: Response
): Promise<unknown> {
    const body = await response.text();
    if (!body) return null;

    try {
        return JSON.parse(body);
    } catch {
        return body;
    }
}

export function extractUpstreamErrorMessage(
    payload: unknown,
    fallback: string
): string {
    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        if (typeof record.detail === "string" && record.detail.trim()) {
            return record.detail.trim();
        }
        if (typeof record.error === "string" && record.error.trim()) {
            return record.error.trim();
        }
        if (typeof record.message === "string" && record.message.trim()) {
            return record.message.trim();
        }
    }

    if (typeof payload === "string" && payload.trim()) {
        return payload.trim();
    }

    return fallback;
}
