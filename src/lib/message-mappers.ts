import type { ChatMessage, StoredMessageRecord } from "@/types/chat";
import { normalizeMatches, normalizeCitations } from "@/lib/normalize";
import {
    stripStoredTokens,
    extractCitationMentionsFromStored,
} from "@/lib/format-answer";

function toMillis(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
}

export function mapStoredMessageRecordToChatMessage(
    record: StoredMessageRecord
): ChatMessage {
    const content = record.markdown_content ?? record.content ?? "";
    const baseMessage: ChatMessage = {
        id: record.id,
        role: record.role,
        content,
        markdownContent: content,
        timestamp: toMillis(record.created_at),
    };

    if (record.role !== "assistant") {
        return baseMessage;
    }

    const citations = normalizeCitations(record.citations);
    const cleanedContent = stripStoredTokens(content);
    const citationMentions = citations
        ? extractCitationMentionsFromStored(content, citations)
        : [];

    return {
        ...baseMessage,
        content: cleanedContent,
        markdownContent: cleanedContent,
        citations,
        matches: normalizeMatches(record.matches),
        citationMentions: citationMentions.length > 0 ? citationMentions : undefined,
    };
}

export function mapStoredMessageRecordsToChatMessages(
    records: StoredMessageRecord[]
): ChatMessage[] {
    return records.map(mapStoredMessageRecordToChatMessage);
}
