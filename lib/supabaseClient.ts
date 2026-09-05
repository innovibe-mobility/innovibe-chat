import { createClient } from "@supabase/supabase-js";

// These two values come from your Supabase project settings
// (Project Settings -> API). They are safe to expose in the browser
// because Supabase's Row Level Security (RLS) rules -- set up in
// supabase/schema.sql -- control who can actually read/write data.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
