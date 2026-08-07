import Header from "@/components/Header";
import { Link } from "wouter";
import { GARAGE_ROOMS } from "@/data/garageMvp";

export default function Rooms() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            Garage Talk Rooms
          </p>
          <h1 className="text-4xl font-bold mt-2">
            Choose a virtual garage bay
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl">
            Join sample community rooms for vehicles, smart garages, computer
            repair, networking, appliances, creators, and marketplace discovery.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {GARAGE_ROOMS.map((room) => (
            <Link
              key={room.slug}
              href={`/rooms/${room.slug}`}
              className="block rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{room.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {room.category}
                  </p>
                </div>

                <span className="rounded-full border px-3 py-1 text-xs capitalize bg-background">
                  {room.status.replace("-", " ")}
                </span>
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                {room.description}
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {room.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <p className="text-sm font-medium mt-4">
                {room.members.toLocaleString()} members
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}