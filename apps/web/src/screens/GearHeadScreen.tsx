import { useEffect, useRef, useState } from "react";
import { CameraIcon, GearIcon, PaperPlaneIcon } from "../icons";
import { Carousel } from "../components/Carousel";
import { ApiError, apiGet, apiSend, type GearHeadResult, type Vehicle } from "../api";
import { formatGearHead, gearHeadReply } from "../bays";
import { images } from "../images";

type ChatTurn = { role: "ai" | "user"; text: string };

const prompts = ["Cranks but won’t start", "Engine light is on", "Truck won’t tow smoothly"];

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
  const [turns, setTurns] = useState<ChatTurn[]>([
    { role: "ai", text: "Hey — what vehicle are we looking at, and what symptoms are you seeing?" },
  ]);
  const [photoNote, setPhotoNote] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    void apiGet<{ vehicles: Vehicle[] }>("/garage/vehicles")
      .then((data) => {
        setVehicles(data.vehicles);
        const primary = data.vehicles.find((vehicle) => vehicle.isPrimary) ?? data.vehicles[0];
        if (primary) setVehicleId(primary.id);
      })
      .catch(() => undefined);
  }, [signedIn]);

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
      });
      setTurns((current) => [...current, { role: "ai", text: formatGearHead(result) }]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        setTurns((current) => [
          ...current,
          { role: "ai", text: "You’re at this month’s GearHead quota. Upgrade later, or use a first-step check for now." },
        ]);
        return;
      }
      setTurns((current) => [...current, { role: "ai", text: gearHeadReply(body) }]);
    }
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
      {vehicles.length > 0 ? (
        <label className="inline-field">
          Vehicle
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
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
      {photoNote ? <p className="safety-note">Photo attach lands in the next pass — describe the leak, light, or noise for now.</p> : null}
      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <button type="button" aria-label="Add a photo" onClick={() => setPhotoNote(true)}>
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
