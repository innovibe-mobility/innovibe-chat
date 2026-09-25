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

    if (!loginUsername) {
      return NextResponse.json(
        { error: "Login ID is required." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select(
        "id, login_username, communication_email, is_active"
      )
      .ilike("login_username", loginUsername)
      .maybeSingle();

    if (profileError) {
      console.error("Forgot password profile lookup error:", profileError);

      return NextResponse.json(
        { error: "Unable to process the request." },
        { status: 500 }
      );
    }

    /*
     * Always return the same public message whether the
     * username exists or not. This prevents username enumeration.
     */
    if (!profile || !profile.communication_email) {
      return NextResponse.json({
        success: true,
        message:
          "If the Login ID is registered, a password reset link has been sent to the registered communication email.",
      });
    }

    if (profile.is_active === false) {
      return NextResponse.json({
        success: true,
        message:
          "If the Login ID is registered, a password reset link has been sent to the registered communication email.",
      });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const redirectTo = `${siteUrl}/reset-password`;

    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(
        profile.communication_email,
        {
          redirectTo,
        }
      );

    if (resetError) {
      console.error("Password reset email error:", resetError);

      return NextResponse.json(
        { error: "Unable to send the password reset email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "If the Login ID is registered, a password reset link has been sent to the registered communication email.",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Unable to process the password reset request.",
      },
      { status: 500 }
    );
  }
}