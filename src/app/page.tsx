import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { isValidConversationId } from "@/lib/conversation-id";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
    const user = await getAuthenticatedUser();
    if (!user) {
        redirect("/login");
    }

    const admin = getSupabaseAdminClient();
    const { data } = await admin
        .from("conversations")
        .select("id")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const preferredId =
        data && typeof data.id === "string" && isValidConversationId(data.id)
            ? data.id
            : randomUUID();

    redirect(`/chat/${preferredId}`);
}
