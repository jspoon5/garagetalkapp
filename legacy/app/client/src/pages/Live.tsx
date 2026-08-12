import Header from "@/components/Header";
import { LIVE_EVENTS } from "@/data/garageMvp";

export default function Live() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            Garage Talk Live
          </p>
          <h1 className="text-4xl font-bold mt-2">
            Live rooms and scheduled sessions
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl">
            Sample live session cards for diagnostics clinics, creator reviews,
            networking help, and safety-first repair education.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {LIVE_EVENTS.map((event) => (
            <article
              key={event.title}
              className="rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">{event.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Hosted by {event.host}
                  </p>
                </div>

                <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">
                  {event.status}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                  {event.room}
                </span>
                <span className="rounded-full bg-muted px-3 py-1">
                  {event.category}
                </span>
              </div>

              <p className="mt-4 text-sm font-medium">{event.schedule}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
          Production note: Garage Talk production video rooms should use Jitsi
          as a Service, JaaS, or another production-ready livestream/video
          provider instead of relying on public meet.jit.si embeds.
        </div>
      </main>
    </div>
  );
}