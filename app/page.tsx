import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-graphite-900 text-white flex flex-col">
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-signal-500 text-graphite-900 flex items-center justify-center text-sm font-bold">
            ⚡
          </span>
          <span className="font-display font-semibold tracking-tight text-lg">
            InnoVibe
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium bg-signal-500 hover:bg-signal-600 text-graphite-900 rounded-lg px-4 py-2 transition"
        >
          Log in / Sign up
        </Link>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 text-center md:text-left">
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
            One place for InnoVibe Mobility
            <br className="hidden md:block" /> to talk, share, and stay in sync.
          </h1>
          <p className="mt-5 text-graphite-300 text-lg max-w-xl mx-auto md:mx-0">
            Channels for every team, direct messages, file sharing, and free
            video calls with automatic summaries — built for how the service
            and technician teams actually work.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block bg-signal-500 hover:bg-signal-600 text-graphite-900 font-semibold rounded-lg px-6 py-3 transition"
          >
            Get started
          </Link>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-5 text-graphite-400 text-xs text-center md:text-left">
        InnoVibe Mobility — internal use only
      </footer>
    </div>
  );
}
