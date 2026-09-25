"use client";



import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";



const DEPARTMENTS = [

  { label: "CEO", suffix: "ceo" },

  { label: "IT", suffix: "it" },

  { label: "R&D", suffix: "rd" },

  { label: "Data Analytics", suffix: "data" },

  { label: "HR", suffix: "hr" },

  { label: "Service", suffix: "service" },

];



const ROLES = [

  { label: "Employee", value: "employee" },

  { label: "CEO", value: "ceo" },

  { label: "HR", value: "hr" },

  { label: "Admin", value: "admin" },

];



export default function CreateEmployeePage() {

  const router = useRouter();



  const [fullName, setFullName] = useState("");

  const [department, setDepartment] = useState("");

  const [communicationEmail, setCommunicationEmail] = useState("");

  const [role, setRole] = useState("employee");



  const [loading, setLoading] = useState(false);

  const [checkingAccess, setCheckingAccess] = useState(true);



  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");



  const [createdEmployee, setCreatedEmployee] = useState<{

    full_name: string;

    login_username: string;

    communication_email: string;

    department: string;

  } | null>(null);



  const [employees, setEmployees] = useState<
    {
      id: string;
      full_name: string;
      role: string | null;
      login_username: string | null;
      communication_email: string | null;
      is_admin: boolean | null;
      is_active: boolean | null;
    }[]
  >([]);

  const [credentialLoadingId, setCredentialLoadingId] = useState("");
  const [credentialMessage, setCredentialMessage] = useState("");
  const [credentialError, setCredentialError] = useState("");

  async function loadEmployees() {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, login_username, communication_email, is_admin, is_active"
      )
      .eq("is_active", true)
      .order("full_name");

    if (!error) {
      setEmployees(data || []);
    }
  }

  useEffect(() => {

    async function checkAccess() {

      try {

        const {

          data: { user },

        } = await supabase.auth.getUser();



        if (!user) {

          router.replace("/login");

          return;

        }



        const { data: profile, error } = await supabase

          .from("profiles")

          .select("role, is_admin, is_active")

          .eq("id", user.id)

          .single();



        if (

          error ||

          !profile ||

          profile.is_active === false ||

          !(

            profile.is_admin === true ||

            ["ceo", "hr", "admin"].includes(

              String(profile.role || "").toLowerCase()

            )

          )

        ) {

          router.replace("/dashboard");

          return;

        }

        await loadEmployees();

      } catch (err) {

        console.error("Access check failed:", err);

        router.replace("/dashboard");

      } finally {

        setCheckingAccess(false);

      }

    }



    checkAccess();

  }, [router]);



  function getUsernamePreview() {

    if (!fullName.trim() || !department) {

      return "";

    }



    const selectedDepartment = DEPARTMENTS.find(

      (item) => item.label === department

    );



    if (!selectedDepartment) {

      return "";

    }



    const cleanName = fullName

      .trim()

      .toLowerCase()

      .replace(/[^a-z0-9]+/g, "");



    if (!cleanName) {

      return "";

    }



    return `${cleanName}.${selectedDepartment.suffix}`;

  }



  async function sendCredentials(employee: {
    id: string;
    full_name: string;
    login_username: string | null;
    communication_email: string | null;
  }) {
    setCredentialMessage("");
    setCredentialError("");

    if (!employee.login_username) {
      setCredentialError(
        `${employee.full_name} does not have a Login ID yet.`
      );
      return;
    }

    if (!employee.communication_email) {
      setCredentialError(
        `${employee.full_name} does not have a communication email yet.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Send new temporary credentials to ${employee.full_name} at ${employee.communication_email}?`
    );

    if (!confirmed) return;

    setCredentialLoadingId(employee.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setCredentialError("Your session has expired. Please log in again.");
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/employees/reset-credentials",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            employee_id: employee.id,
            communication_email: employee.communication_email,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setCredentialError(
          data?.error || "Unable to send employee credentials."
        );
        return;
      }

      setCredentialMessage(
        `Credentials sent successfully to ${employee.communication_email}.`
      );

      await loadEmployees();
    } catch (err: any) {
      setCredentialError(
        err?.message || "Unable to send employee credentials."
      );
    } finally {
      setCredentialLoadingId("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {

    e.preventDefault();



    setError("");

    setSuccess("");

    setCreatedEmployee(null);



    if (!fullName.trim()) {

      setError("Please enter the employee's full name.");

      return;

    }



    if (!department) {

      setError("Please select a department.");

      return;

    }



    if (!communicationEmail.trim()) {

      setError("Please enter the communication email.");

      return;

    }



    if (!role) {

      setError("Please select a role.");

      return;

    }



    setLoading(true);



    try {

      const {

        data: { session },

      } = await supabase.auth.getSession();



      if (!session?.access_token) {

        setError("Your session has expired. Please log in again.");

        router.replace("/login");

        return;

      }



      const response = await fetch("/api/admin/employees", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,

        },

        body: JSON.stringify({

          full_name: fullName.trim(),

          department,

          communication_email: communicationEmail

            .trim()

            .toLowerCase(),

          role,

        }),

      });



      const data = await response.json();



      if (!response.ok) {

        setError(

          data?.error || "Unable to create the employee account."

        );

        return;

      }



      setSuccess(

        "Employee account created successfully. The temporary credentials have been sent to the communication email."

      );



      setCreatedEmployee({

        full_name: data.employee?.full_name || fullName.trim(),

        login_username:

          data.employee?.login_username || getUsernamePreview(),

        communication_email:

          data.employee?.communication_email ||

          communicationEmail.trim().toLowerCase(),

        department,

      });



      setFullName("");

      setDepartment("");

      setCommunicationEmail("");

      setRole("employee");

    } catch (err: any) {

      setError(

        err?.message || "Unable to create the employee account."

      );

    } finally {

      setLoading(false);

    }

  }



  if (checkingAccess) {

    return (

      <main

        style={{

          minHeight: "100vh",

          display: "flex",

          alignItems: "center",

          justifyContent: "center",

          background: "#f8fafc",

        }}

      >

        Checking access...

      </main>

    );

  }



  return (

    <main

      style={{

        minHeight: "100vh",

        background: "#f8fafc",

        padding: "32px 20px",

      }}

    >

      <div

        style={{

          maxWidth: "720px",

          margin: "0 auto",

        }}

      >

        <button

          type="button"

          onClick={() => router.push("/dashboard")}

          style={{

            border: "none",

            background: "transparent",

            padding: 0,

            marginBottom: "20px",

            color: "#475569",

            cursor: "pointer",

            fontSize: "14px",

          }}

        >

          ← Back to Dashboard

        </button>

        <a

  href="/admin/vendors"

  style={{

    display: "inline-block",

    marginBottom: "20px",

    marginLeft: "16px",

    color: "#475569",

    fontSize: "14px",

    textDecoration: "none",

  }}

>

  Vendor Management →

</a>



        <div

          style={{

            background: "#ffffff",

            borderRadius: "16px",

            padding: "32px",

            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",

          }}

        >

          <h1

            style={{

              marginTop: 0,

              marginBottom: "8px",

              fontSize: "28px",

            }}

          >

            Create Employee Account

          </h1>



          <p

            style={{

              marginTop: 0,

              marginBottom: "28px",

              color: "#64748b",

              lineHeight: 1.5,

            }}

          >

            Create an employee's InnoVibe login account. The

            system will generate the User ID and temporary

            password automatically.

          </p>



          <section
            style={{
              marginBottom: "28px",
              padding: "20px",
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: "6px",
                fontSize: "19px",
              }}
            >
              Existing Employee Credentials
            </h2>

            <p
              style={{
                marginTop: 0,
                marginBottom: "16px",
                color: "#64748b",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Send a new temporary password to an existing employee without
              creating a new Supabase account. Their existing user ID,
              department memberships, chats and messages remain unchanged.
            </p>

            {credentialError && (
              <div
                style={{
                  marginBottom: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: "13px",
                }}
              >
                {credentialError}
              </div>
            )}

            {credentialMessage && (
              <div
                style={{
                  marginBottom: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "#f0fdf4",
                  color: "#166534",
                  fontSize: "13px",
                }}
              >
                {credentialMessage}
              </div>
            )}

            <div style={{ display: "grid", gap: "10px" }}>
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#111827",
                      }}
                    >
                      {employee.full_name}
                    </div>

                    <div
                      style={{
                        marginTop: "3px",
                        fontSize: "12px",
                        color: "#64748b",
                      }}
                    >
                      {employee.login_username || "No Login ID"} ·{" "}
                      {employee.communication_email || "No email"}
                      {employee.is_admin === true ? " · Admin" : ""}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => sendCredentials(employee)}
                    disabled={
                      credentialLoadingId === employee.id ||
                      !employee.login_username ||
                      !employee.communication_email
                    }
                    style={{
                      flexShrink: 0,
                      border: "none",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      background: "#111827",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor:
                        credentialLoadingId === employee.id
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        credentialLoadingId === employee.id ? 0.65 : 1,
                    }}
                  >
                    {credentialLoadingId === employee.id
                      ? "Sending..."
                      : "Send Credentials"}
                  </button>
                </div>
              ))}

              {employees.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  No active employees found.
                </div>
              )}
            </div>
          </section>

          <form onSubmit={handleSubmit}>

            <div style={{ marginBottom: "20px" }}>

              <label

                style={{

                  display: "block",

                  fontWeight: 600,

                  marginBottom: "8px",

                }}

              >

                Full Name

              </label>



              <input

                type="text"

                value={fullName}

                onChange={(e) => setFullName(e.target.value)}

                placeholder="e.g. Yamini"

                disabled={loading}

                style={{

                  width: "100%",

                  boxSizing: "border-box",

                  padding: "12px 14px",

                  border: "1px solid #cbd5e1",

                  borderRadius: "10px",

                  fontSize: "15px",

                }}

              />

            </div>



            <div style={{ marginBottom: "20px" }}>

              <label

                style={{

                  display: "block",

                  fontWeight: 600,

                  marginBottom: "8px",

                }}

              >

                Department

              </label>



              <select

                value={department}

                onChange={(e) => setDepartment(e.target.value)}

                disabled={loading}

                style={{

                  width: "100%",

                  boxSizing: "border-box",

                  padding: "12px 14px",

                  border: "1px solid #cbd5e1",

                  borderRadius: "10px",

                  fontSize: "15px",

                  background: "#ffffff",

                }}

              >

                <option value="">Select department</option>



                {DEPARTMENTS.map((item) => (

                  <option key={item.label} value={item.label}>

                    {item.label}

                  </option>

                ))}

              </select>

            </div>



            <div style={{ marginBottom: "20px" }}>

              <label

                style={{

                  display: "block",

                  fontWeight: 600,

                  marginBottom: "8px",

                }}

              >

                Communication Email

              </label>



              <input

                type="email"

                value={communicationEmail}

                onChange={(e) =>

                  setCommunicationEmail(e.target.value)

                }

                placeholder="employee\@gmail.com"

                disabled={loading}

                style={{

                  width: "100%",

                  boxSizing: "border-box",

                  padding: "12px 14px",

                  border: "1px solid #cbd5e1",

                  borderRadius: "10px",

                  fontSize: "15px",

                }}

              />



              <p

                style={{

                  marginTop: "7px",

                  marginBottom: 0,

                  fontSize: "13px",

                  color: "#64748b",

                }}

              >

                Credentials and future password-reset emails

                will be sent here.

              </p>

            </div>



            <div style={{ marginBottom: "20px" }}>

              <label

                style={{

                  display: "block",

                  fontWeight: 600,

                  marginBottom: "8px",

                }}

              >

                Role

              </label>



              <select

                value={role}

                onChange={(e) => setRole(e.target.value)}

                disabled={loading}

                style={{

                  width: "100%",

                  boxSizing: "border-box",

                  padding: "12px 14px",

                  border: "1px solid #cbd5e1",

                  borderRadius: "10px",

                  fontSize: "15px",

                  background: "#ffffff",

                }}

              >

                {ROLES.map((item) => (

                  <option key={item.value} value={item.value}>

                    {item.label}

                  </option>

                ))}

              </select>

            </div>



            {getUsernamePreview() && (

              <div

                style={{

                  marginBottom: "20px",

                  padding: "14px",

                  borderRadius: "10px",

                  background: "#f1f5f9",

                }}

              >

                <div

                  style={{

                    fontSize: "13px",

                    color: "#64748b",

                    marginBottom: "4px",

                  }}

                >

                  Generated User ID

                </div>



                <strong style={{ fontSize: "16px" }}>

                  {getUsernamePreview()}

                </strong>

              </div>

            )}



            {error && (

              <div

                style={{

                  marginBottom: "18px",

                  padding: "12px 14px",

                  borderRadius: "10px",

                  background: "#fef2f2",

                  color: "#b91c1c",

                  fontSize: "14px",

                }}

              >

                {error}

              </div>

            )}



            {success && (

              <div

                style={{

                  marginBottom: "18px",

                  padding: "12px 14px",

                  borderRadius: "10px",

                  background: "#f0fdf4",

                  color: "#166534",

                  fontSize: "14px",

                  lineHeight: 1.5,

                }}

              >

                {success}

              </div>

            )}



            {createdEmployee && (

              <div

                style={{

                  marginBottom: "20px",

                  padding: "16px",

                  borderRadius: "10px",

                  background: "#eff6ff",

                  border: "1px solid #bfdbfe",

                }}

              >

                <strong

                  style={{

                    display: "block",

                    marginBottom: "10px",

                  }}

                >

                  Account Details

                </strong>



                <div style={{ fontSize: "14px", lineHeight: 1.8 }}>

                  <div>

                    <strong>User ID:</strong>{" "}

                    {createdEmployee.login_username}

                  </div>



                  <div>

                    <strong>Email:</strong>{" "}

                    {createdEmployee.communication_email}

                  </div>



                  <div>

                    <strong>Department:</strong>{" "}

                    {createdEmployee.department}

                  </div>

                </div>



                <p

                  style={{

                    marginBottom: 0,

                    marginTop: "10px",

                    fontSize: "13px",

                    color: "#475569",

                  }}

                >

                  The temporary password is intentionally not

                  displayed here. It is sent directly to the

                  employee's communication email.

                </p>

              </div>

            )}



            <button

              type="submit"

              disabled={loading}

              style={{

                width: "100%",

                padding: "13px",

                border: "none",

                borderRadius: "10px",

                background: "#111827",

                color: "#ffffff",

                fontSize: "15px",

                fontWeight: 600,

                cursor: loading ? "not-allowed" : "pointer",

                opacity: loading ? 0.7 : 1,

              }}

            >

              {loading ? "Creating Account..." : "Create Employee Account"}

            </button>

          </form>

        </div>

      </div>

    </main>

  );

}