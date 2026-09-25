import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const loginUsername = String(body.login_username ?? "")
      .trim()
      .toLowerCase();

    const password = String(body.password ?? "");

    if (!loginUsername || !password) {
      return NextResponse.json(
        { error: "Login ID and password are required." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // Find the employee using the login username.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select(
        "id, full_name, role, communication_email, login_username, is_active, must_change_password"
      )
      .ilike("login_username", loginUsername)
      .maybeSingle();

    if (profileError) {
      console.error("Login profile lookup failed:", profileError);

      return NextResponse.json(
        { error: "Unable to process login." },
        { status: 500 }
      );
    }

    if (!profile || !profile.communication_email) {
      return NextResponse.json(
        { error: "Invalid Login ID or password." },
        { status: 401 }
      );
    }

    if (profile.is_active === false) {
      return NextResponse.json(
        { error: "This employee account is inactive." },
        { status: 403 }
      );
    }

    // Create a temporary Supabase client for the actual sign-in.
    // The service-role key is never exposed to the browser.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: profile.communication_email,
        password,
      });

    if (authError || !authData.session || !authData.user) {
      return NextResponse.json(
        { error: "Invalid Login ID or password." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,

      session: authData.session,

      user: {
        id: authData.user.id,
        full_name: profile.full_name,
        role: profile.role,
        login_username: profile.login_username,
        communication_email: profile.communication_email,
        must_change_password: profile.must_change_password === true,
      },
    });
  } catch (error: any) {
    console.error("Employee login error:", error);

    return NextResponse.json(
      {
        error: error?.message ?? "Unexpected login error.",
      },
      { status: 500 }
    );
  }
}