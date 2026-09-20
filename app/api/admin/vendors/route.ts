import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getAdminContext(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (!auth?.startsWith("Bearer ")) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const token = auth.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      error: "Supabase environment variables are missing.",
      status: 500 as const,
    };
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } =
    await client.auth.getUser(token);

  if (authError || !authData.user) {
    return {
      error: "Invalid or expired session.",
      status: 401 as const,
    };
  }

  const admin = getSupabaseAdmin();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, is_admin")
    .eq("id", authData.user.id)
    .single();

  const isAdmin =
    (profile?.role ?? "").toLowerCase() === "ceo" ||
    (profile?.role ?? "").toLowerCase() === "hr" ||
    profile?.is_admin === true;

  if (profileError || !isAdmin) {
    return {
      error: "Admin access required.",
      status: 403 as const,
    };
  }

  return { user: authData.user, admin };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getAdminContext(req);

    if ("error" in context) {
      return NextResponse.json(
        { error: context.error },
        { status: context.status }
      );
    }

    const { admin } = context;

    const [
      { data: applications, error: applicationsError },
      { data: vendors, error: vendorsError },
    ] = await Promise.all([
      admin
        .from("vendor_applications")
        .select("*")
        .order("created_at", { ascending: false }),

      admin
        .from("vendors")
        .select("*")
        .order("company_name", { ascending: true }),
    ]);

    if (applicationsError) {
      return NextResponse.json(
        { error: applicationsError.message },
        { status: 500 }
      );
    }

    if (vendorsError) {
      return NextResponse.json(
        { error: vendorsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      applications: applications ?? [],
      vendors: vendors ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected error.",
      },
      { status: 500 }
    );
  }
}