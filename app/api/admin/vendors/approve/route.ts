import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function generateTemporaryPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  let result = "Inno@";

  const values = new Uint32Array(12);
  crypto.getRandomValues(values);

  for (let i = 0; i < values.length; i++) {
    result += chars[values[i] % chars.length];
  }

  return result;
}

async function getAdminContext(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (!auth?.startsWith("Bearer ")) {
    return {
      error: "Authentication required.",
      status: 401 as const,
    };
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
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
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
    return {
      error: "Admin access required.",
      status: 403 as const,
    };
  }

  return {
    user: authData.user,
    admin,
  };
}

export async function POST(req: NextRequest) {
  let createdAuthUserId: string | null = null;

  try {
    const context = await getAdminContext(req);

    if ("error" in context) {
      return NextResponse.json(
        { error: context.error },
        { status: context.status }
      );
    }

    const { user: adminUser, admin } = context;

    const body = await req.json();
    const applicationId = body.application_id;

    if (!applicationId) {
      return NextResponse.json(
        { error: "application_id is required." },
        { status: 400 }
      );
    }

    const { data: application, error: applicationError } = await admin
      .from("vendor_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      return NextResponse.json(
        { error: "Vendor application not found." },
        { status: 404 }
      );
    }

    if (application.status !== "pending") {
      return NextResponse.json(
        {
          error: `This application is already ${application.status}.`,
        },
        { status: 409 }
      );
    }

    const email = String(application.contact_email)
      .trim()
      .toLowerCase();

    const { data: existingVendor } = await admin
      .from("vendors")
      .select("id, status")
      .ilike("email", email)
      .maybeSingle();

    if (existingVendor) {
      return NextResponse.json(
        { error: "A vendor with this email already exists." },
        { status: 409 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          account_type: "vendor",
          vendor_contact_name: application.contact_name,
        },
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        {
          error:
            authError?.message ??
            "Could not create vendor account.",
        },
        { status: 500 }
      );
    }

    createdAuthUserId = authData.user.id;

    const { data: vendor, error: vendorError } = await admin
      .from("vendors")
      .insert({
        company_name: application.company_name,
        contact_name: application.contact_name,
        email,
        phone: application.contact_phone,
        logo_url: application.logo_url,
        website: application.website,
        category: application.category,
        status: "approved",
        auth_user_id: authData.user.id,
        must_change_password: true,
        approved_at: new Date().toISOString(),
        approved_by: adminUser.id,
      })
      .select()
      .single();

    if (vendorError || !vendor) {
      await admin.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        {
          error:
            vendorError?.message ??
            "Could not create vendor record.",
        },
        { status: 500 }
      );
    }

    const { error: userLinkError } = await admin
      .from("vendor_users")
      .insert({
        vendor_id: vendor.id,
        user_id: authData.user.id,
        role: "vendor_admin",
      });

    if (userLinkError) {
      await admin
        .from("vendors")
        .delete()
        .eq("id", vendor.id);

      await admin.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        { error: userLinkError.message },
        { status: 500 }
      );
    }

    const { error: chatError } = await admin
      .from("vendor_chats")
      .insert({
        vendor_id: vendor.id,
      });

    if (chatError) {
      await admin
        .from("vendor_users")
        .delete()
        .eq("vendor_id", vendor.id);

      await admin
        .from("vendors")
        .delete()
        .eq("id", vendor.id);

      await admin.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        { error: chatError.message },
        { status: 500 }
      );
    }

    await admin
      .from("vendor_applications")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUser.id,
      })
      .eq("id", application.id);

    await admin.from("vendor_audit_logs").insert({
      vendor_id: vendor.id,
      actor_id: adminUser.id,
      action: "vendor_approved",
      details: {
        application_id: application.id,
        email,
      },
    });

    return NextResponse.json({
      success: true,
      vendor,
      credentials: {
        email,
        temporary_password: temporaryPassword,
      },
      message:
        "Vendor approved. Save the temporary password now; it will not be shown again.",
    });
  } catch (error) {
    if (createdAuthUserId) {
      try {
        const admin = getSupabaseAdmin();
        await admin.auth.admin.deleteUser(createdAuthUserId);
      } catch {}
    }

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