import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");

    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const token = auth.slice(7);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const client = createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: authData } =
      await client.auth.getUser(token);

    if (!authData.user) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: profile } = await admin
      .from("profiles")
      .select("role, is_admin")
      .eq("id", authData.user.id)
      .single();

    const isAdmin =
      (profile?.role ?? "").toLowerCase() === "ceo" ||
      (profile?.role ?? "").toLowerCase() === "hr" ||
      profile?.is_admin === true;

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.application_id) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    const { error } = await admin
      .from("vendor_applications")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: authData.user.id,
      })
      .eq("id", body.application_id)
      .eq("status", "pending");

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Vendor application rejected.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error.",
      },
      { status: 500 }
    );
  }
}