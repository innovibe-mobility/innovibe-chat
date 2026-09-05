# InnoVibe Chat — Project Overview

**What it is:** An internal Slack-style chat tool built specifically for InnoVibe Mobility employees (30–50 people), so the company doesn't have to pay for Slack.

**Live address (once deployed):** chat.innovibemobility.com

---

## Features

| # | Feature | Status |
|---|---|---|
| 1 | Employee login (sign up / sign in) | ✅ Built |
| 2 | Channels (#general, #hr, #ceo-updates, #service-team, #technicians) | ✅ Built |
| 3 | Real-time messaging (no page refresh needed) | ✅ Built |
| 4 | File sharing in chat | ✅ Built |
| 5 | Mobile-friendly layout (collapsible sidebar, works on phone screens) | ✅ Built |
| 6 | Unlimited chat history (nothing auto-deletes) | ✅ Built-in by design |
| 7 | Free video/audio calls per channel (Jitsi) | ✅ Built |
| 8 | Direct messages (1-on-1 private chat) | 🔜 Next up |
| 9 | Message search | 🔜 Next up |
| 10 | Emoji reactions / threaded replies / notifications | 🔜 Later |

---

## Technologies used (all free at this scale)

| Piece | Tool | What it does |
|---|---|---|
| The app / website itself | **Next.js** | Builds the pages and chat screen |
| Login & accounts | **Supabase Auth** | Handles sign up, sign in, sessions |
| Database (stores messages, channels, users) | **Supabase (PostgreSQL)** | Free tier holds ~1–2 years of chat for this group size |
| Live message updates | **Supabase Realtime** | Messages appear instantly for everyone |
| File uploads | **Supabase Storage** | Free tier: 1GB storage |
| Video/audio calls | **Jitsi Meet** | 100% free, no per-minute charges, no account needed |
| Hosting the website | **Vercel** | Free hosting, same as the ICC dashboards |
| Domain | **chat.innovibemobility.com** | Custom address, needs a DNS record added by whoever manages the main company domain |

**Total monthly cost right now: ₹0.** Only cost to watch: if file uploads grow heavily, Supabase's free 1GB storage may need a small paid upgrade (~$25/month) eventually — not an issue at 30–50 users to start.

---

## How it works (in plain terms)

1. Employee opens **chat.innovibemobility.com**, signs up with their work email
2. They land in **#general** by default, and can click between channels in the sidebar
3. Typing a message and hitting Enter sends it instantly to everyone in that channel
4. Clicking the 📎 icon attaches a file; clicking 📹 **Call** opens a free video/audio call for that channel
5. All messages are stored permanently in our own database (not Slack's, not shared with anyone outside the company)

---

## Rollout plan

1. **Phase 1 (done):** Channels, real-time chat, file sharing, calls, mobile support
2. **Phase 2 (next):** Direct messages + search
3. **Phase 3 (later, if needed):** Emoji reactions, threads, notifications, admin panel

**Recommended approach:** launch Phase 1 to a small pilot group first (not all 30–50 at once), catch any issues, then roll out company-wide.

---

## What's still needed before going live

- [ ] Employer confirms: full rollout vs. pilot group first
- [ ] IT/domain admin adds the DNS record for chat.innovibemobility.com
- [ ] Restrict sign-ups so only @innovibemobility.com emails can join (currently anyone with the link can sign up — needs to be locked down before real launch)
- [ ] Decide who has admin rights to add/remove channels or employees
