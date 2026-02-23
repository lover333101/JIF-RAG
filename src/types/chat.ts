/* ─── Domain types for the Jiff RAG Assistant ─── */

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    markdownContent?: string;
    timestamp: number;
    sources?: SourceItem[];
    matches?: MatchItem[];
    citations?: string[];
    citationMentions?: CitationMention[];
    reliability?: ReliabilityTag[];
    isLoading?: boolean;
    isError?: boolean;
    errorMessage?: string;
    responseMode?: "auto" | "light" | "heavy";
    thinkingStatus?: string;
    thinkingSteps?: ThinkingStep[];
    routingReason?: string;
}

export interface ThinkingStep {
    id: string;
    label: string;
    detail?: string;
    state: "pending" | "active" | "done";
    updated_at_ms?: number;
}

export interface CitationMention {
    source: string;
    snippet: string;
    reliability: ReliabilityTag | "Unlabeled";
}

export interface SourceItem {
    source: string;
    score?: number;
    metadata?: Record<string, unknown>;
}

export interface MatchItem {
    id: string;
    score: number;
    source: string;
    metadata?: Record<string, unknown>;
}

export type ReliabilityTag = "KB" | "Inference" | "Suggested baseline (inference)";

export interface Session {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
    messagesLoaded?: boolean;
}

export interface ChatRequest {
    question: string;
    session_id: string;
    response_mode?: "auto" | "light" | "heavy";
}

export interface ChatResponse {
    answer: string;
    sources?: string[];
    matches?: MatchItem[];
    quota?: {
        limit: number;
        used: number;
        remaining: number;
        reset_at: string;
    };
}

export type EvidenceStrength = "strong" | "moderate" | "weak" | "none";

export interface AccountSummary {
    user_id: string;
    email: string;
    display_name: string | null;
    message_count: number;
}

export interface QuotaSummary {
    limit: number;
    used: number;
    remaining: number;
    reset_at: string;
}

export interface ConversationRecord {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface StoredMessageRecord {
    id: string;
    conversation_id: string;
    role: "user" | "assistant";
    content: string;
    markdown_content?: string;
    citations?: string[];
    matches?: MatchItem[];
    created_at: string;
}
