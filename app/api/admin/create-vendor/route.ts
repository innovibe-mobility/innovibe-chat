import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// One-click vendor onboarding -- replaces the manual multi-step SQL
// process. Does everything in one go: creates their login, sets their
// profile (role, company name, logo), creates their private channel,
// and adds them + you as members.

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  const body = await req.json();
  const { companyName, contactEmail, password, logoUrl, adminEmail } = body;

  if (!companyName || !contactEmail || !password || !adminEmail) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // 1. Create their login
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: contactEmail,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json(
      { error: `Couldn't create login: ${createError?.message}` },
      { status: 500 }
    );
  }
  const vendorId = created.user.id;

  // 2. Set their profile (the auto-create trigger already made a
  // placeholder row -- this fills in the real details)
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: companyName,
      role: "vendor",
      company_name: companyName,
      company_logo_url: logoUrl || null,
    })
    .eq("id", vendorId);
  if (profileError) {
    return NextResponse.json(
      { error: `Login created, but profile setup failed: ${profileError.message}` },
      { status: 500 }
    );
  }

  // 3. Find your own admin user id (to add you to their channel too)
  const { data: adminUserList } = await admin.auth.admin.listUsers();
  const adminUser = adminUserList?.users.find((u) => u.email === adminEmail);
  if (!adminUser) {
    return NextResponse.json(
      { error: `Vendor created, but couldn't find admin account for ${adminEmail}.` },
      { status: 500 }
    );
  }

  // 4. Create their private channel
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const { data: channel, error: channelError } = await admin
    .from("channels")
    .insert({
      name: `vendor-${slug}`,
      description: `${companyName} -- private vendor channel`,
      is_private: true,
      created_by: adminUser.id,
    })
    .select()
    .single();
  if (channelError || !channel) {
    return NextResponse.json(
      { error: `Vendor created, but channel setup failed: ${channelError?.message}` },
      { status: 500 }
    );
  }

  // 5. Add both the vendor and the admin as members
  const { error: memberError } = await admin.from("channel_members").insert([
    { channel_id: channel.id, user_id: vendorId },
    { channel_id: channel.id, user_id: adminUser.id },
  ]);
  if (memberError) {
    return NextResponse.json(
      { error: `Channel created, but adding members failed: ${memberError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    email: contactEmail,
    channelName: channel.name,
  });
}
