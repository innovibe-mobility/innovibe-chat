import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY client using the service role key. This key bypasses ALL
// security rules -- it must NEVER be sent to the browser or given a
// NEXT_PUBLIC_ prefix. Only ever imported inside app/api/ routes.
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}
