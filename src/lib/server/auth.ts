import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser(): Promise<User | null> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) {
        return null;
    }
    return user;
}
