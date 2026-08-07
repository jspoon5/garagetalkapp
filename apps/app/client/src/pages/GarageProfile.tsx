import Header from "@/components/Header";
import { GARAGE_PROFILE_SAMPLE } from "@/data/garageMvp";

export default function GarageProfile() {
  const profile = GARAGE_PROFILE_SAMPLE;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <section className="rounded-2xl border bg-card p-6 shadow-sm mb-6">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            Garage Profile
          </p>

          <h1 className="text-4xl font-bold mt-2">{profile.name}</h1>

          <p className="text-muted-foreground mt-3">{profile.role}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full bg-muted px-3 py-1 text-sm"
              >
                {skill}
              </span>
            ))}
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-bold">Projects</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {profile.projects.map((project) => (
                <li key={project}>{project}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-bold">Vehicles and devices</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {profile.vehiclesAndDevices.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-bold">Favorite rooms</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {profile.favoriteRooms.map((room) => (
                <li key={room}>{room}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-bold">
              Creator and social placeholders
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {profile.links.map((link) => (
                <li key={link}>{link}</li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}