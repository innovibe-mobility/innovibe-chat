# InnoVibe Chat — Phase 1 (Channels + DMs + Files)

A basic internal chat tool for InnoVibe Mobility employees: sign in, post in
channels (#general, #hr, #ceo-updates, #service-team, #technicians), and
share files. Messages appear live without refreshing the page.

This is **Phase 1** on purpose. Search and voice/video calls are left out
for now — add them once this core piece is working and employees are
actually using it. (For calls in the meantime, just drop a Google Meet or
Zoom link in a message — most internal tools do this rather than building
their own calling system.)

## What's inside
- `app/login/page.tsx` — sign in / create account
- `app/page.tsx` — the main chat screen (channel list, messages, file upload)
- `supabase/schema.sql` — the database tables + security rules
- `lib/supabaseClient.ts` — connects the app to your Supabase project

## One-time setup (about 15 minutes)

**1. Create a free Supabase project**
   - Go to https://supabase.com, sign up, click "New project"
   - Pick any name (e.g. "innovibe-chat") and a database password (save it somewhere)

**2. Set up the database**
   - In your new Supabase project, open the **SQL Editor** (left sidebar)
   - Open `supabase/schema.sql` from this project, copy all of it, paste it in, click **Run**
   - This creates the tables and the starter channels (#general, #hr, etc.)

**3. Create the file storage bucket**
   - In Supabase, go to **Storage** (left sidebar) → **New bucket**
   - Name it exactly `chat-files`, leave it **not public**, click Create

**4. Get your project keys**
   - Go to **Project Settings → API**
   - Copy the **Project URL** and the **anon public key**

**5. Connect the app to your project**
   - Copy `.env.local.example` to a new file named `.env.local`
   - Paste in your Project URL and anon key from step 4

**6. Run it locally to test**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — create an account, try sending a message.

## Deploying for real (Vercel, same as your ICC dashboards)

1. Push this project to a GitHub repo
2. In Vercel, click **New Project**, import that repo
3. Under **Environment Variables**, add the same two values from your
   `.env.local` file (`NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Click Deploy

That's it — you'll have a live URL employees can sign up and log into.

## Setting up chat.innovibemobility.com as the address

1. In Vercel, open the project → **Settings → Domains**
2. Type in `chat.innovibemobility.com` and click Add
3. Vercel will show a DNS record to add (usually a **CNAME** pointing to `cname.vercel-dns.com`)
4. Go to wherever InnoVibe's main domain (innovibemobility.com) is managed (GoDaddy, Namecheap, Cloudflare, etc.) → DNS settings → add that CNAME record for the `chat` subdomain
5. Wait 10-30 minutes — Vercel shows a green checkmark once live, with free SSL (https) added automatically

Whoever manages InnoVibe's main domain needs to add that DNS record — you likely won't have access to it yourself unless you're also the domain admin
(something like `innovibe-chat.vercel.app`).

## Using your own domain: chat.innovibemobility.com

1. In your Vercel project, go to **Settings → Domains**
2. Type `chat.innovibemobility.com` and click **Add**
3. Vercel will show you a DNS record to add (usually a **CNAME** pointing
   to `cname.vercel-dns.com`)
4. Go to wherever `innovibemobility.com`'s DNS is managed (e.g. GoDaddy,
   Namecheap, Cloudflare — wherever the main website's domain is) and add
   that CNAME record for the `chat` subdomain
5. Wait 5-30 minutes for DNS to update, then Vercel auto-issues a free
   SSL certificate — `https://chat.innovibemobility.com` will be live

Note: you'll need access to the DNS settings for `innovibemobility.com`
— if you don't manage that yourself, ask whoever set up the main
company website (same place the ICC dashboards are hosted).

## Important before real employees use this

- **Turn off public sign-ups** once your team is on it, or anyone with the
  link can create an account. In Supabase: Authentication → Providers →
  restrict sign-ups, or add an invite-only flow later.
- **Use your own company email domain check** if you want to restrict
  sign-up to @innovibemobility.com addresses (ask me and I'll add this).
- This starter does **not** include calls or search yet — see the phased
  plan above.

## What to build next (in order)
1. **Direct messages** — private 1-to-1 channels (the database already
   supports this via `is_private` channels; the UI to create them isn't
   built yet — ask me to add it)
2. **Search** — searching past messages by keyword
3. **Voice/video calls** — the hardest piece; recommend using a service
   like Twilio or Agora rather than building this from scratch
