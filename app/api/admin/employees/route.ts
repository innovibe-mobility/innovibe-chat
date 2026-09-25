import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const INTERNAL_ROLES = ["employee", "ceo", "hr", "admin"];

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url") + "A9!";
}

function makeUsername(name: string, department: string) {
  const cleanName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const cleanDepartment = department
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return `${cleanName}.${cleanDepartment}`;
}

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is missing."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: password,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authorization.substring(7);

    const admin = getSupabaseAdmin();

    // Verify the currently logged-in user
    const {
      data: { user: requester },
      error: requesterError,
    } = await admin.auth.getUser(accessToken);

    if (requesterError || !requester) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    // Check requester profile
    const { data: requesterProfile, error: requesterProfileError } =
      await admin
        .from("profiles")
        .select("id, role, is_admin, is_active")
        .eq("id", requester.id)
        .maybeSingle();

    if (requesterProfileError) {
      console.error(
        "Requester profile lookup error:",
        requesterProfileError
      );

      return NextResponse.json(
        { error: "Unable to verify administrator access." },
        { status: 500 }
      );
    }

    if (
      !requesterProfile ||
      requesterProfile.is_active === false ||
      !(
        requesterProfile.is_admin === true ||
        ["ceo", "hr", "admin"].includes(
          String(requesterProfile.role || "").toLowerCase()
        )
      )
    ) {
      return NextResponse.json(
        { error: "You are not authorized to create employee accounts." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const fullName = String(body.full_name ?? "").trim();
    const department = String(body.department ?? "").trim();
    const communicationEmail = String(
      body.communication_email ?? ""
    )
      .trim()
      .toLowerCase();
    const role = String(body.role ?? "employee")
      .trim()
      .toLowerCase();

    if (!fullName) {
      return NextResponse.json(
        { error: "Full name is required." },
        { status: 400 }
      );
    }

    if (!department) {
      return NextResponse.json(
        { error: "Department is required." },
        { status: 400 }
      );
    }

    if (!communicationEmail) {
      return NextResponse.json(
        { error: "Communication email is required." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(communicationEmail)) {
      return NextResponse.json(
        { error: "Please provide a valid communication email." },
        { status: 400 }
      );
    }

    if (!INTERNAL_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Invalid employee role." },
        { status: 400 }
      );
    }

    const loginUsername = makeUsername(fullName, department);

    // Check whether the User ID already exists
    const { data: existingUsername, error: usernameError } =
      await admin
        .from("profiles")
        .select("id")
        .ilike("login_username", loginUsername)
        .maybeSingle();

    if (usernameError) {
      console.error("Username lookup error:", usernameError);

      return NextResponse.json(
        { error: "Unable to check User ID availability." },
        { status: 500 }
      );
    }

    if (existingUsername) {
      return NextResponse.json(
        {
          error: `The User ID "${loginUsername}" already exists.`,
        },
        { status: 409 }
      );
    }

    // Check whether communication email is already assigned
    const { data: existingEmail, error: emailLookupError } =
      await admin
        .from("profiles")
        .select("id")
        .ilike("communication_email", communicationEmail)
        .maybeSingle();

    if (emailLookupError) {
      console.error(
        "Communication email lookup error:",
        emailLookupError
      );

      return NextResponse.json(
        { error: "Unable to check email availability." },
        { status: 500 }
      );
    }

    if (existingEmail) {
      return NextResponse.json(
        {
          error:
            "This communication email is already assigned to an employee.",
        },
        { status: 409 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();

    // Create Supabase Auth account using the real communication email
    const {
      data: authData,
      error: authError,
    } = await admin.auth.admin.createUser({
      email: communicationEmail,
      password: temporaryPassword,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error("Auth user creation error:", authError);

      return NextResponse.json(
        {
          error:
            authError?.message ||
            "Unable to create the employee authentication account.",
        },
        { status: 500 }
      );
    }

    const newUserId = authData.user.id;

    // Create/update employee profile
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        login_username: loginUsername,
        communication_email: communicationEmail,
        must_change_password: true,
        is_active: true,
      })
      .eq("id", newUserId);

    if (profileError) {
      console.error("Profile update error:", profileError);

      // Roll back Auth account if profile creation/update fails
      await admin.auth.admin.deleteUser(newUserId);

      return NextResponse.json(
        {
          error:
            "Employee authentication account was created, but the profile could not be saved.",
        },
        { status: 500 }
      );
    }

    // Send credentials through Gmail SMTP
    try {
      const transporter = getMailer();

      const from =
        process.env.SMTP_FROM ||
        `InnoVibe Office <${process.env.SMTP_USER}>`;

      await transporter.sendMail({
        from,
        to: communicationEmail,
        subject: "InnoVibe Office Credentials",
        text: `Hello ${fullName},

Your InnoVibe Office account has been created.

Login details:

User ID: ${loginUsername}
Temporary Password: ${temporaryPassword}

Login:
${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/login

You will be required to change your temporary password when you log in for the first time.

Please keep these credentials confidential.

Regards,
InnoVibe Office`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <h2>InnoVibe Office Credentials</h2>

            <p>Hello ${fullName},</p>

            <p>
              Your InnoVibe Office account has been created.
            </p>

            <div style="
              background: #f3f4f6;
              padding: 16px;
              border-radius: 8px;
              margin: 20px 0;
            ">
              <p style="margin: 0 0 8px;">
                <strong>User ID:</strong> ${loginUsername}
              </p>

              <p style="margin: 0;">
                <strong>Temporary Password:</strong> ${temporaryPassword}
              </p>
            </div>

            <p>
              <strong>Login:</strong><br>
              <a href="${
                process.env.NEXT_PUBLIC_SITE_URL ||
                "http://localhost:3000"
              }/login">
                InnoVibe Office Login
              </a>
            </p>

            <p>
              You will be required to change your temporary password
              when you log in for the first time.
            </p>

            <p>
              Please keep these credentials confidential.
            </p>

            <p>
              Regards,<br>
              <strong>InnoVibe Office</strong>
            </p>
          </div>
        `,
      });
    } catch (emailError: any) {
      console.error("Credential email error:", emailError);

      // Roll back both profile and Auth account if email delivery fails
      await admin
        .from("profiles")
        .delete()
        .eq("id", newUserId);

      await admin.auth.admin.deleteUser(newUserId);

      return NextResponse.json(
        {
          error:
            emailError?.message ||
            "Employee account could not be completed because the credential email could not be sent.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Employee account created and credentials sent successfully.",
      employee: {
        id: newUserId,
        full_name: fullName,
        login_username: loginUsername,
        communication_email: communicationEmail,
        department,
        role,
      },
    });
  } catch (error: any) {
    console.error("Create employee error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while creating employee account.",
      },
      { status: 500 }
    );
  }
}