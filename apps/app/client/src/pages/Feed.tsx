import Header from "@/components/Header";
import { FEED_FILTERS, FEED_POSTS } from "@/data/garageMvp";

export default function Feed() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            Garage Feed
          </p>
          <h1 className="text-4xl font-bold mt-2">
            Clips, tutorials, questions, and project updates
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl">
            A sample-first creator feed for repair videos, build updates,
            quick questions, and Garage Talk community learning.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {FEED_FILTERS.map((filter) => (
            <span
              key={filter}
              className="whitespace-nowrap rounded-full border bg-card px-4 py-2 text-sm"
            >
              {filter}
            </span>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {FEED_POSTS.map((post) => (
            <article
              key={post.title}
              className="rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary capitalize">
                  {post.type}
                </span>
                <span className="rounded-full bg-muted px-3 py-1 text-xs">
                  {post.category}
                </span>
                <span className="rounded-full bg-muted px-3 py-1 text-xs">
                  {post.difficulty}
                </span>
              </div>

              <h2 className="text-2xl font-bold">{post.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                by {post.creator}
              </p>
              <p className="mt-4 text-muted-foreground">{post.excerpt}</p>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}