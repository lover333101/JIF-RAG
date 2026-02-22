import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    getSupabaseServiceRoleKey,
    getSupabaseUrl,
} from "@/lib/supabase/env";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
    if (!adminClient) {
        adminClient = createClient(
            getSupabaseUrl(),
            getSupabaseServiceRoleKey(),
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
            }
        );
    }
    return adminClient;
}
