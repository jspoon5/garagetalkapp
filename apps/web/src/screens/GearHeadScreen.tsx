import { useEffect, useRef, useState } from "react";
import { CameraIcon, GearIcon, PaperPlaneIcon } from "../icons";
import { Carousel } from "../components/Carousel";
import {
  ApiError,
  apiGet,
  apiSend,
  TIER_LABELS,
  type GearHeadResult,
  type PaidTier,
  type UserEntitlement,
  type Vehicle,
} from "../api";
import { formatGearHead, gearHeadReply } from "../bays";
import { images } from "../images";

type ChatTurn = { role: "ai" | "user"; text: string };

const prompts = ["Cranks but won’t start", "Engine light is on", "Truck won’t tow smoothly"];
const GREETING = "Hey — what vehicle are we looking at, and what symptoms are you seeing?";

export function GearHeadScreen({
  signedIn,
  onNeedAccount,
}: {
  signedIn: boolean;
  onNeedAccount: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: "ai", text: GREETING }]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedThreadForVehicle = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    void apiGet<{ vehicles: Vehicle[] }>("/garage/vehicles")
      .then((data) => {
        setVehicles(data.vehicles);
        const primary = data.vehicles.find((vehicle) => vehicle.isPrimary) ?? data.vehicles[0];
        if (primary) setVehicleId(primary.id);
      })
      .catch(() => undefined);
    void apiGet<{ entitlement: UserEntitlement }>("/billing/entitlement")
      .then((data) => setEntitlement(data.entitlement))
      .catch(() => undefined);
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const key = vehicleId || "general";
    if (loadedThreadForVehicle.current === key) return;
    loadedThreadForVehicle.current = key;

    void apiGet<{ threads: Array<{ id: string; vehicleId: string | null; title: string }> }>(
      "/ai/gearhead/threads",
    )
      .then(async (data) => {
        const match = vehicleId
          ? data.threads.find((thread) => thread.vehicleId === vehicleId)
          : data.threads.find((thread) => !thread.vehicleId) ?? data.threads[0];
        if (!match) {
          setThreadId(null);
          setTurns([{ role: "ai", text: GREETING }]);
          return;
        }
        const detail = await apiGet<{
          thread: { id: string };
          messages: Array<{ role: string; content: Record<string, unknown> }>;
        }>(`/ai/gearhead/threads/${match.id}`);
        setThreadId(detail.thread.id);
        const history: ChatTurn[] = detail.messages.map((msg) => {
          const text =
            typeof msg.content.text === "string"
              ? msg.content.text
              : typeof msg.content.diagnosis === "string"
                ? String(msg.content.diagnosis)
                : JSON.stringify(msg.content);
          return {
            role: msg.role === "assistant" ? "ai" : "user",
            text:
              msg.role === "assistant" && msg.content.diagnosis
                ? formatGearHead(msg.content as unknown as GearHeadResult)
                : text,
          };
        });
        setTurns(history.length > 0 ? history : [{ role: "ai", text: GREETING }]);
      })
      .catch(() => undefined);
  }, [signedIn, vehicleId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  async function ask(text: string) {
    const body = text.trim();
    if (!body) return;
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    setQuestion("");
    setTurns((current) => [...current, { role: "user", text: body }]);
    try {
      const result = await apiSend<GearHeadResult>("/ai/gearhead", "POST", {
        message: body,
        vehicleId: vehicleId || undefined,
        threadId: threadId ?? undefined,
        photoUrl: photoUrl ?? undefined,
      });
      setPhotoUrl(null);
      if (result.threadId) setThreadId(result.threadId);
      setTurns((current) => [...current, { role: "ai", text: formatGearHead(result) }]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        const upgradeTier = error.details?.upgradeTier as PaidTier | undefined;
        const quota = error.details?.quota as number | undefined;
        const serverMessage = error.details?.message as string | undefined;
        const upgradeLabel = upgradeTier ? TIER_LABELS[upgradeTier] : null;
        setTurns((current) => [
          ...current,
          {
            role: "ai",
            text:
              serverMessage ??
              (upgradeLabel
                ? `You've used all ${quota ?? 10} GearHead questions this month. Upgrade to ${upgradeLabel} for more diagnostics, or wait until your quota resets.`
                : "You're at this month's GearHead quota. Upgrade your plan or wait for the reset."),
          },
        ]);
        return;
      }
      if (error instanceof ApiError && error.status === 403 && error.code === "photos_not_allowed") {
        setTurns((current) => [
          ...current,
          {
            role: "ai",
            text: "Photo diagnostics need GearHead or higher. Upgrade to attach bay photos, or describe what you see in text.",
          },
        ]);
        return;
      }
      setTurns((current) => [...current, { role: "ai", text: gearHeadReply(body) }]);
    }
  }

  async function startCheckout(tier: PaidTier) {
    const result = await apiSend<{ checkout: { url?: string | null } }>("/billing/checkout", "POST", { tier });
    if (result.checkout?.url) window.location.href = result.checkout.url;
  }

  function onPickPhoto() {
    if (!signedIn) {
      onNeedAccount();
      return;
    }
    if (entitlement && !entitlement.photosAllowed) {
      setTurns((current) => [
        ...current,
        {
          role: "ai",
          text: "Photo attach is a GearHead perk. Upgrade to send bay photos, or keep describing symptoms in text.",
        },
      ]);
      return;
    }
    fileRef.current?.click();
  }

  function onVehicleChange(next: string) {
    loadedThreadForVehicle.current = null;
    setVehicleId(next);
    setThreadId(null);
  }

  return (
    <>
      <section className="ai-hero">
        <img src={images.engine} alt="Engine bay under inspection" decoding="async" />
        <div className="ai-overlay" />
        <div className="ai-orb">
          <GearIcon />
        </div>
        <div className="ai-title">
          <span>GEARHEAD AI</span>
          <h1>Your garage copilot.</h1>
          <p>Safer first steps before you turn a wrench.</p>
        </div>
      </section>
      {entitlement ? (
        <p className="safety-note">
          {entitlement.tierLabel} plan · {entitlement.aiUsage}/{entitlement.aiQuota} questions this month
          {entitlement.upgradeTier ? (
            <>
              {" "}
              ·{" "}
              <button type="button" className="inline-link" onClick={() => void startCheckout(entitlement.upgradeTier!)}>
                Upgrade to {TIER_LABELS[entitlement.upgradeTier]}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {vehicles.length > 0 ? (
        <label className="inline-field">
          Vehicle
          <select value={vehicleId} onChange={(event) => onVehicleChange(event.target.value)}>
            <option value="">General / no vehicle</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.year} {vehicle.make} {vehicle.model}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="chat-thread">
        {turns.map((turn, index) =>
          turn.role === "ai" ? (
            <div className="message ai-message" key={`${turn.role}-${index}`}>
              <div className="mini-ai">
                <GearIcon />
              </div>
              <p>{turn.text}</p>
            </div>
          ) : (
            <div className="message user-message" key={`${turn.role}-${index}`}>
              <p>{turn.text}</p>
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>
      <Carousel ariaLabel="Suggested diagnostic questions" className="prompt-carousel" contentClassName="prompt-carousel-track">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => void ask(prompt)}>
            {prompt}
          </button>
        ))}
      </Carousel>
      {photoUrl ? <p className="safety-note">Photo attached — send your question to analyze it.</p> : null}
      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPhotoUrl(URL.createObjectURL(file));
          }}
        />
        <button
          type="button"
          aria-label="Add a photo"
          disabled={Boolean(entitlement && !entitlement.photosAllowed)}
          onClick={onPickPhoto}
        >
          <CameraIcon />
        </button>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Describe the vehicle problem..."
          autoComplete="off"
        />
        <button type="submit" className="send-button" aria-label="Send question">
          <PaperPlaneIcon />
        </button>
      </form>
      <p className="safety-note">
        Use GearHead AI as a guide. Follow manufacturer instructions and get professional help for dangerous repairs.
      </p>
    </>
  );
}
