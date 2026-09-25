import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const INTERNAL_ADMIN_ROLES = ["admin", "hr", "ceo"];

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url") + "A9!";
}

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    throw new Error("SMTP configuration is incomplete.");
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from,
  };
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const admin = getSupabaseAdmin();

    const {
      data: { user: requester },
      error: requesterError,
    } = await admin.auth.getUser(token);

    if (requesterError || !requester) {
      return NextResponse.json(
        { error: "Invalid session." },
        { status: 401 }
      );
    }

    const { data: requesterProfile, error: requesterProfileError } =
      await admin
        .from("profiles")
        .select("id, role, is_admin, is_active")
        .eq("id", requester.id)
        .maybeSingle();

    if (requesterProfileError) {
      return NextResponse.json(
        { error: requesterProfileError.message },
        { status: 500 }
      );
    }

    const requesterRole = String(requesterProfile?.role ?? "")
      .trim()
      .toLowerCase();

    const hasAdminAccess =
      requesterProfile?.is_active !== false &&
      (requesterProfile?.is_admin === true ||
        INTERNAL_ADMIN_ROLES.includes(requesterRole));

    if (!hasAdminAccess) {
      return NextResponse.json(
        {
          error:
            "You are not authorized to manage employee credentials.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();

    const employeeId = String(body.employee_id ?? "").trim();

    const suppliedEmail = String(
      body.communication_email ?? ""
    )
      .trim()
      .toLowerCase();

    if (!employeeId) {
      return NextResponse.json(
        { error: "employee_id is required." },
        { status: 400 }
      );
    }

    const { data: employee, error: employeeError } = await admin
      .from("profiles")
      .select(
        "id, full_name, role, login_username, communication_email, is_active"
      )
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json(
        { error: employeeError.message },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }

    if (employee.is_active === false) {
      return NextResponse.json(
        { error: "This employee account is inactive." },
        { status: 400 }
      );
    }

    const communicationEmail =
      suppliedEmail ||
      String(employee.communication_email ?? "")
        .trim()
        .toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(communicationEmail)) {
      return NextResponse.json(
        { error: "A valid communication email is required." },
        { status: 400 }
      );
    }

    if (!employee.login_username) {
      return NextResponse.json(
        {
          error:
            "This employee does not have a login username yet.",
        },
        { status: 400 }
      );
    }

    // IMPORTANT:
    // We keep the existing Supabase Auth user ID.
    // This preserves existing Chat, DMs, groups,
    // department memberships, messages, reactions, etc.

    const temporaryPassword = generateTemporaryPassword();

    const { data: authUserData, error: authUserError } =
      await admin.auth.admin.getUserById(employee.id);

    if (authUserError || !authUserData.user) {
      return NextResponse.json(
        {
          error:
            authUserError?.message || "Auth user not found.",
        },
        { status: 404 }
      );
    }

    const { error: updateAuthError } =
      await admin.auth.admin.updateUserById(
        employee.id,
        {
          email: communicationEmail,
          password: temporaryPassword,
          email_confirm: true,
        }
      );

    if (updateAuthError) {
      return NextResponse.json(
        { error: updateAuthError.message },
        { status: 500 }
      );
    }

    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({
        communication_email: communicationEmail,
        must_change_password: true,
        is_active: true,
      })
      .eq("id", employee.id);

    if (updateProfileError) {
      return NextResponse.json(
        {
          error:
            "The Auth password was updated, but the employee profile could not be updated: " +
            updateProfileError.message,
        },
        { status: 500 }
      );
    }

    const { transporter, from } = getMailer();

    try {
      await transporter.sendMail({
        from,
        to: communicationEmail,
        subject: "InnoVibe Office Credentials",
        text: [
          "InnoVibe Office Credentials",
          "",
          `Hello ${employee.full_name || "Employee"},`,
          "",
          "Your InnoVibe Office account has been prepared.",
          "",
          `Login ID: ${employee.login_username}`,
          `Temporary Password: ${temporaryPassword}`,
          "",
          "Sign in through the InnoVibe Office login page.",
          "You will be required to create a new password on your first login.",
          "",
          "Please keep these credentials private.",
        ].join("\n"),
      });
    } catch (mailError: any) {
      return NextResponse.json(
        {
          error:
            "The employee password was updated, but the credentials email could not be sent: " +
            (mailError?.message || "Unknown SMTP error."),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Credentials sent to ${communicationEmail}.`,
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        login_username: employee.login_username,
        communication_email: communicationEmail,
        must_change_password: true,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message || "Unexpected error.",
      },
      { status: 500 }
    );
  }
}