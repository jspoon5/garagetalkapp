import Header from "@/components/Header";
import { Link, useParams } from "wouter";
import { getRoomBySlug } from "@/data/garageMvp";

export default function RoomDetail() {
  const params = useParams<{ slug: string }>();
  const room = getRoomBySlug(params.slug);

  if (!room) {
    return (
      <div className="min-h-screen bg-background">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold">Room not found</h1>
          <p className="text-muted-foreground mt-3">
            That garage bay does not exist yet.
          </p>
          <Link
            href="/rooms"
            className="inline-block mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Back to rooms
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <Link href="/rooms" className="text-sm text-primary hover:underline">
          Back to rooms
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">
              {room.category}
            </p>
            <h1 className="text-4xl font-bold mt-2">{room.name}</h1>
            <p className="text-muted-foreground mt-3">{room.description}</p>

            <div className="mt-8">
              <h2 className="text-xl font-semibold">Room chat preview</h2>

              <div className="mt-4 space-y-3">
                {room.chat.map((message) => (
                  <div
                    key={`${message.user}-${message.time}`}
                    className="rounded-xl bg-muted p-4"
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold">
                        {message.user}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          ({message.role})
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {message.time}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{message.message}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Message composer placeholder for future live room chat.
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-semibold">Pinned resources</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {room.pinnedResources.map((resource) => (
                  <li key={resource}>{resource}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-semibold">Active users</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {room.activeUsers.map((user) => (
                  <span
                    key={user}
                    className="rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    {user}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border bg-primary/10 p-5 shadow-sm">
              <h2 className="font-semibold">Ask GearHead AI</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {room.gearHeadPrompt}
              </p>
              <Link
                href="/gearhead-ai"
                className="inline-block mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Open GearHead AI
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}