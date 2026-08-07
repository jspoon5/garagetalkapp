import Header from "@/components/Header";
import { MARKETPLACE_ITEMS } from "@/data/garageMvp";

export default function Marketplace() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            Marketplace Bay
          </p>
          <h1 className="text-4xl font-bold mt-2">
            Parts, tools, services, and creator offers
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl">
            Placeholder marketplace cards for Garage Talk commerce. Payments are
            not live in this MVP.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {MARKETPLACE_ITEMS.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border bg-card p-5 shadow-sm"
            >
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {item.category}
              </span>

              <h2 className="text-xl font-bold mt-4">{item.title}</h2>

              <p className="text-sm text-muted-foreground mt-3">
                {item.note}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
          Stripe/payment placeholder only: no real charges, subscriptions, tips,
          deposits, or promoted listings are active on this MVP page.
        </div>
      </main>
    </div>
  );
}