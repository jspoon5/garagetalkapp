import type { Express, Request, Response } from "express";
import OpenAI from "openai";

const DEFAULT_MODEL = process.env.GEARHEAD_AI_MODEL || "gpt-4o-mini";
const DEFAULT_BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";

function isOpenAIConfigured() {
  return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

function buildOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "missing-api-key",
    baseURL: DEFAULT_BASE_URL,
  });
}

function buildSystemPrompt() {
  return [
    "You are GearHead AI, the Garage Talk assistant.",
    "Help users with cars, trucks, motorcycles, aviation concepts, garage projects, computer repair, Wi-Fi, LAN/WLAN, smart-home devices, appliances, creator scripts, livestream planning, and project planning.",
    "Give practical, educational, step-by-step guidance when safe.",
    "Ask for year, make, model, symptoms, codes, environment, and recent changes when needed.",
    "Safety rule: for dangerous, regulated, high-voltage, fuel-system, structural, brake, airbag, steering, lifting, gas, appliance electrical, or safety-critical repairs, recommend a licensed professional or qualified technician.",
    "Do not provide instructions to bypass safety systems, emissions controls, locks, authentication, or legal/regulated protections.",
    "Keep answers clear, calm, and garage-practical.",
  ].join("\n");
}

function fallbackResponse(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("wifi") || lower.includes("wi-fi") || lower.includes("lan") || lower.includes("wlan")) {
    return "GearHead AI demo mode: Start with modem status, router placement, cable checks, speed tests near the router, and Wi-Fi channel congestion. For business wiring or complex network installs, document the layout and consider a qualified network technician.";
  }

  if (lower.includes("washer") || lower.includes("dryer") || lower.includes("appliance")) {
    return "GearHead AI demo mode: For appliances, disconnect power before basic visual checks. For high-voltage, gas, water-leak, or internal electrical repairs, stop and contact a licensed appliance technician.";
  }

  if (lower.includes("script") || lower.includes("video") || lower.includes("live")) {
    return "GearHead AI demo mode: Start your video with the problem, show the tool or part, explain the safe first check, then end with the result and a reminder to follow safe repair practices.";
  }

  return "GearHead AI demo mode: Start with safe basics: document the symptoms, check power or battery state, look for visible damage, scan or read error codes when available, and avoid replacing parts without confirming the cause. For safety-critical work, use a qualified professional.";
}

export function registerGearHeadAiRoutes(app: Express) {
  app.get("/api/gearhead-ai/status", (_req: Request, res: Response) => {
    res.json({
      configured: isOpenAIConfigured(),
      model: DEFAULT_MODEL,
      baseUrl: DEFAULT_BASE_URL,
      mode: isOpenAIConfigured() ? "openai" : "demo-fallback",
    });
  });

  app.post("/api/gearhead-ai/chat", async (req: Request, res: Response) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const context = typeof req.body?.context === "string" ? req.body.context.trim() : "";

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (!isOpenAIConfigured()) {
        return res.json({
          mode: "demo-fallback",
          configured: false,
          answer: fallbackResponse(message),
          safetyNote: "OpenAI is not configured. Add AI_INTEGRATIONS_OPENAI_API_KEY to .env to enable live GearHead AI responses.",
        });
      }

      const openai = buildOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0.35,
        max_tokens: 700,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: context ? `Context: ${context}\n\nUser question: ${message}` : message,
          },
        ],
      });

      const answer = completion.choices[0]?.message?.content?.trim();

      res.json({
        mode: "openai",
        configured: true,
        model: DEFAULT_MODEL,
        answer: answer || "GearHead AI did not return a response. Please try again with more details.",
        safetyNote: "For dangerous, regulated, high-voltage, fuel-system, structural, or safety-critical repairs, consult a licensed professional.",
      });
    } catch (error) {
      console.error("[GearHead AI] Chat error:", error);
      res.status(500).json({
        error: "GearHead AI failed to respond",
        answer: "GearHead AI hit a server error. Check the API key, base URL, model, and server logs.",
      });
    }
  });
}
