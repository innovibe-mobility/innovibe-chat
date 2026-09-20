"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;

const vendorCategories = [
  "OEM / Manufacturer",
  "Battery & Components",
  "Service Provider",
  "Technology Provider",
  "Logistics / Supply Chain",
  "Dealer / Distributor",
  "Other",
];

export default function VendorApplyPage() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState("");
  const [logo, setLogo] = useState<File | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);

    const cleanCompanyName = companyName.trim();
    const cleanContactName = contactName.trim();
    const cleanEmail = contactEmail.trim().toLowerCase();
    const cleanPhone = contactPhone.trim();
    const cleanWebsite = website.trim();

    if (!cleanCompanyName) {
      setError("Please enter your company name.");
      return;
    }

    if (!cleanContactName) {
      setError("Please enter the contact person's name.");
      return;
    }

    if (!cleanEmail) {
      setError("Please enter a valid business email.");
      return;
    }

    if (!category) {
      setError("Please select a vendor category.");
      return;
    }

    if (logo) {
      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/svg+xml",
      ];

      if (!allowedTypes.includes(logo.type)) {
        setError("Logo must be PNG, JPG, JPEG, WEBP, or SVG.");
        return;
      }

      if (logo.size > MAX_LOGO_SIZE) {
        setError("Logo size must be 2 MB or smaller.");
        return;
      }
    }

    if (cleanWebsite) {
      const websiteValue = cleanWebsite.startsWith("http")
        ? cleanWebsite
        : `https://${cleanWebsite}`;

      try {
        new URL(websiteValue);
      } catch {
        setError("Please enter a valid website address.");
        return;
      }
    }

    setLoading(true);

    try {
      let logoUrl: string | null = null;

      // --------------------------------------------------
      // Upload company logo
      // --------------------------------------------------
      if (logo) {
        const safeName = logo.name
          .toLowerCase()
          .replace(/[^a-z0-9.-]/g, "-");

        const path = `applications/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("vendor-logos")
          .upload(path, logo, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Logo upload failed: ${uploadError.message}`);
        }

        const { data } = supabase.storage
          .from("vendor-logos")
          .getPublicUrl(path);

        logoUrl = data.publicUrl;
      }

      // --------------------------------------------------
      // Create pending vendor application
      // --------------------------------------------------
      const { error: insertError } = await supabase
        .from("vendor_applications")
        .insert({
          company_name: cleanCompanyName,
          contact_name: cleanContactName,
          contact_email: cleanEmail,
          contact_phone: cleanPhone || null,
          logo_url: logoUrl,
          website: cleanWebsite
            ? cleanWebsite.startsWith("http")
              ? cleanWebsite
              : `https://${cleanWebsite}`
            : null,
          category,
          status: "pending",
        });

      if (insertError) {
        throw new Error(`Submission failed: ${insertError.message}`);
      }

      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while submitting your application."
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Success screen
  // --------------------------------------------------
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#EEF4F9] text-[#0F2438] flex items-center justify-center px-4 py-10 relative overflow-hidden">
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-20 h-[360px] w-[360px] rounded-full bg-[#53D2DB]/20 blur-[110px]" />
          <div className="absolute bottom-[-140px] right-[-100px] h-[420px] w-[420px] rounded-full bg-[#FFE3B3]/25 blur-[120px]" />
        </div>

        <div className="relative w-full max-w-lg">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-white shadow-[0_25px_70px_-25px_rgba(15,36,56,0.3)] p-8 sm:p-10 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#EAF9FA] border border-[#53D2DB]/30 shadow-sm">
              <span className="text-4xl">✓</span>
            </div>

            <img
              src="/innovibe-logo.png"
              alt="InnoVibe Mobility"
              className="h-11 w-auto mx-auto mb-6 object-contain"
            />

            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4F8FBF] mb-2">
              Application received
            </p>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2438] mb-3">
              Thank you for applying
            </h1>

            <p className="text-sm sm:text-base leading-6 text-[#587083] max-w-md mx-auto">
              Your vendor application has been submitted successfully and is
              now pending review by the InnoVibe team.
            </p>

            <div className="mt-7 rounded-2xl bg-[#F4F8FB] border border-[#DDE8F0] p-5 text-left">
              <div className="flex items-start gap-3">
                <div className="text-xl">🔐</div>

                <div>
                  <p className="text-sm font-semibold text-[#0F2438]">
                    What happens next?
                  </p>

                  <p className="mt-1 text-sm leading-5 text-[#64798A]">
                    Once your application is approved, InnoVibe will create
                    your vendor account and provide your login credentials
                    separately.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FFF4DF] border border-[#FFE3B3] px-4 py-2 text-xs font-medium text-[#765A28]">
              <span className="h-2 w-2 rounded-full bg-[#E8A83E]" />
              Application status: Pending review
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // Application form
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-[#EEF4F9] text-[#0F2438] relative overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[460px] w-[460px] rounded-full bg-[#53D2DB]/16 blur-[130px]" />

        <div className="absolute top-1/4 right-[-160px] h-[500px] w-[500px] rounded-full bg-[#4F8FBF]/14 blur-[140px]" />

        <div className="absolute bottom-[-180px] left-1/3 h-[500px] w-[500px] rounded-full bg-[#FFE3B3]/20 blur-[140px]" />

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.8),transparent_65%)]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white border border-[#DCE8F0] shadow-sm flex items-center justify-center">
              <img
                src="/innovibe-logo.png"
                alt="InnoVibe"
                className="h-7 w-auto object-contain"
              />
            </div>

            <div>
              <p className="text-sm font-bold text-[#0F2438]">
                InnoVibe Mobility
              </p>

              <p className="text-[11px] text-[#718596]">
                Vendor Portal
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-[#587083]">
            <span className="h-2 w-2 rounded-full bg-[#53D2DB]" />
            Partner onboarding
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 sm:px-8 py-8 sm:py-12">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-10 items-start">
          {/* Left information panel */}
          <section className="lg:sticky lg:top-8">
            <div className="max-w-lg">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-white shadow-sm px-3.5 py-2 text-xs font-semibold text-[#26648B] mb-5">
                <span className="h-2 w-2 rounded-full bg-[#53D2DB]" />
                Become an InnoVibe partner
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.08] tracking-tight text-[#0F2438]">
                Connect with
                <span className="block text-[#26648B]">
                  InnoVibe Mobility.
                </span>
              </h1>

              <p className="mt-5 text-sm sm:text-base leading-7 text-[#607689] max-w-md">
                Submit your company details to start the vendor onboarding
                process. Our team will review your application before creating
                your secure vendor workspace.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-white border border-[#DCE8F0] shadow-sm flex items-center justify-center text-sm font-bold text-[#26648B]">
                    01
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-[#0F2438]">
                      Submit your details
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#718596]">
                      Tell us about your company and primary contact.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-white border border-[#DCE8F0] shadow-sm flex items-center justify-center text-sm font-bold text-[#26648B]">
                    02
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-[#0F2438]">
                      Application review
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#718596]">
                      The InnoVibe team reviews and approves your application.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-[#FFF4DF] border border-[#FFE3B3] shadow-sm flex items-center justify-center text-sm font-bold text-[#765A28]">
                    03
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-[#0F2438]">
                      Secure vendor access
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-[#718596]">
                      Approved vendors receive credentials for their private
                      InnoVibe workspace.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-2xl bg-[#0E2A40] text-white p-5 shadow-[0_20px_50px_-25px_rgba(14,42,64,0.7)]">
                <div className="flex items-start gap-3">
                  <div className="text-xl">🛡️</div>

                  <div>
                    <p className="text-sm font-semibold">
                      Private vendor workspace
                    </p>

                    <p className="mt-1 text-xs leading-5 text-white/65">
                      Approved vendors receive an isolated workspace for
                      secure communication with authorized InnoVibe employees.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Form */}
          <section>
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl border border-white shadow-[0_25px_70px_-25px_rgba(15,36,56,0.28)] overflow-hidden">
              <div className="px-6 sm:px-8 pt-7 pb-6 border-b border-[#E5EDF3]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4F8FBF]">
                  Vendor registration
                </p>

                <h2 className="mt-2 text-xl sm:text-2xl font-bold text-[#0F2438]">
                  Company information
                </h2>

                <p className="mt-1.5 text-sm text-[#718596]">
                  Please provide accurate business information.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
                {/* Company */}
                <div>
                  <label className="block text-sm font-semibold text-[#29465B] mb-2">
                    Company name
                    <span className="text-[#E05A5A] ml-1">*</span>
                  </label>

                  <input
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. ABC Batteries Pvt Ltd"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAAB7] outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
                  />
                </div>

                {/* Contact row */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#29465B] mb-2">
                      Contact person
                      <span className="text-[#E05A5A] ml-1">*</span>
                    </label>

                    <input
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Full name"
                      className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAAB7] outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#29465B] mb-2">
                      Business email
                      <span className="text-[#E05A5A] ml-1">*</span>
                    </label>

                    <input
                      required
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAAB7] outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
                    />
                  </div>
                </div>

                {/* Phone + category */}
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#29465B] mb-2">
                      Phone
                      <span className="text-xs font-normal text-[#91A0AC] ml-1">
                        Optional
                      </span>
                    </label>

                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+91 XXXXX XXXXX"
                      className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAAB7] outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#29465B] mb-2">
                      Vendor category
                      <span className="text-[#E05A5A] ml-1">*</span>
                    </label>

                    <select
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm text-[#0F2438] outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
                    >
                      <option value="">Select category</option>

                      {vendorCategories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-semibold text-[#29465B] mb-2">
                    Company website
                    <span className="text-xs font-normal text-[#91A0AC] ml-1">
                      Optional
                    </span>
                  </label>

                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="www.company.com"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAAB7] outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
                  />
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-sm font-semibold text-[#29465B] mb-2">
                    Company logo
                    <span className="text-xs font-normal text-[#91A0AC] ml-1">
                      Optional
                    </span>
                  </label>

                  <label className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-[#C9D9E4] bg-[#F8FBFD] px-4 py-4 transition hover:border-[#53D2DB] hover:bg-[#F2FBFC]">
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-white border border-[#DCE8F0] flex items-center justify-center text-xl shadow-sm">
                      {logo ? "✓" : "🏢"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#29465B] truncate">
                        {logo ? logo.name : "Upload your company logo"}
                      </p>

                      <p className="mt-1 text-xs text-[#8396A5]">
                        PNG, JPG, JPEG, WEBP or SVG · Maximum 2 MB
                      </p>
                    </div>

                    <span className="rounded-lg bg-white border border-[#D8E4EC] px-3 py-2 text-xs font-semibold text-[#26648B] shadow-sm group-hover:border-[#53D2DB]">
                      Browse
                    </span>

                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) =>
                        setLogo(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <span className="text-red-500">!</span>

                    <p className="text-sm leading-5 text-red-700">
                      {error}
                    </p>
                  </div>
                )}

                {/* Submit */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-[#26648B] to-[#4F8FBF] px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_-12px_rgba(38,100,139,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-12px_rgba(38,100,139,0.7)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        Submitting application...
                      </span>
                    ) : (
                      "Submit vendor application"
                    )}
                  </button>
                </div>

                <p className="text-center text-[11px] leading-5 text-[#8A9BA8]">
                  By submitting this application, you confirm that the
                  information provided is accurate and that your company is
                  requesting access to the InnoVibe vendor workspace.
                </p>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}