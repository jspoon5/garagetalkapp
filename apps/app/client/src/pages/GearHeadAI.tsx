import { useState } from "react";
import Header from "@/components/Header";
import { GEARHEAD_PROMPTS } from "@/data/garageMvp";

export default function GearHeadAI() {
  const [message, setMessage] = useState("My truck cranks but will not start. What should I check first?");
  const [answer, setAnswer] = useState("Start with safe basics: battery voltage, visible cable condition, fuel level, scan for codes, and listen for fuel pump prime. Do not bypass safety systems. If you smell fuel, see damaged wiring, or suspect a high-risk failure, stop and contact a qualified technician.");
  const [mode, setMode] = useState<"sample" | "openai" | "demo-fallback" | "error">("sample");
  const [loading, setLoading] = useState(false);

  async function askGearHead(promptText = message) {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    setMessage(trimmed);
    setLoading(true);
    setMode("sample");

    try {
      const response = await fetch("/api/gearhead-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, context: "Garage Talk MVP GearHead AI page" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "GearHead AI request failed");
      }

      setAnswer(data.answer || "GearHead AI did not return a response.");
      setMode(data.mode || "openai");
    } catch (error) {
      setMode("error");
      setAnswer(error instanceof Error ? error.message : "GearHead AI failed to respond.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">
            GearHead AI
          </p>
          <h1 className="text-4xl font-bold mt-2">
            Your garage-minded assistant
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl">
            Ask about vehicles, computers, smart-home devices, networks,
            appliances, creator scripts, live sessions, and garage projects.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="space-y-4">
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-sm font-semibold">User</p>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ask GearHead AI about a garage, vehicle, smart-home, networking, appliance, or creator problem..."
                />
                <button
                  type="button"
                  onClick={() => askGearHead()}
                  disabled={loading}
                  className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {loading ? "Asking GearHead..." : "Ask GearHead AI"}
                </button>
              </div>

              <div className="rounded-2xl bg-primary/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">GearHead AI</p>
                  <span className="rounded-full bg-background px-3 py-1 text-xs capitalize text-muted-foreground">
                    {mode === "openai" ? "live" : mode.replace("-", " ")}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {answer}
                </p>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="font-semibold">Suggested prompts</h2>
              <div className="mt-3 space-y-2">
                {GEARHEAD_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => askGearHead(prompt)}
                    className="block w-full rounded-xl bg-muted p-3 text-left text-sm hover:bg-muted/70"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
              <h2 className="font-semibold">Safety disclaimer</h2>
              <p className="text-sm mt-2">
                GearHead AI provides educational guidance. For dangerous,
                regulated, high-voltage, fuel-system, structural, brake,
                steering, airbag, gas, or safety-critical repairs, consult a
                licensed professional or qualified technician.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
