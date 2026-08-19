import { useEffect, useState } from "react";
import { apiGet, apiSend, formatUsd, type ServiceRecord, type Vehicle } from "../api";
import { roomImage } from "../bays";
import { images } from "./shared";

export function VehicleScreen({
  vehicleId,
  onOpenBay,
}: {
  vehicleId: string;
  onOpenBay: (type: string) => void;
}) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [mileage, setMileage] = useState("");
  const [kind, setKind] = useState("oil");
  const [title, setTitle] = useState("");
  const [work, setWork] = useState("");
  const [symptom, setSymptom] = useState("");
  const [brief, setBrief] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ vehicle: Vehicle }>(`/garage/vehicles/${vehicleId}`);
    setVehicle(data.vehicle);
    setNickname(data.vehicle.nickname ?? "");
    const service = await apiGet<{ records: ServiceRecord[] }>(`/garage/vehicles/${vehicleId}/service-records`);
    setRecords(service.records);
  }

  useEffect(() => {
    void load().catch(() => setError("Could not load this vehicle."));
  }, [vehicleId]);

  async function saveEdits() {
    if (!vehicle) return;
    await apiSend(`/garage/vehicles/${vehicle.id}`, "PATCH", { nickname: nickname.trim() || null });
    setEditing(false);
    await load();
  }

  async function addRecord() {
    if (!title.trim()) return;
    await apiSend(`/garage/vehicles/${vehicleId}/service-records`, "POST", {
      date: new Date().toISOString(),
      mileage: mileage ? Number(mileage) : null,
      kind,
      title: title.trim(),
      work: work.trim() || null,
    });
    setTitle("");
    setWork("");
    setMileage("");
    await load();
  }

  async function runDiagnostic() {
    const text = symptom.trim();
    if (!text) return;
    const session = await apiSend<{ session?: { id: string }; output?: { hypotheses?: Array<{ fault: string }> } }>(
      "/diagnostics/sessions",
      "POST",
      { vehicleId, symptomText: text, photos: [], audioClips: [], dtcCodes: [] },
    );
    const fault = session.output?.hypotheses?.[0]?.fault;
    setBrief(fault ?? "Diagnostic session saved. Open GearHead for a full first-step plan.");
  }

  if (!vehicle) {
    return <p className="empty-state">{error ?? "Loading this build…"}</p>;
  }

  const label = vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <>
      <section className="profile-hero">
        <img src={vehicle.photos[0] ?? roomImage(vehicle.type)} alt={label} decoding="async" />
        <div className="profile-shade" />
        <div className="profile-identity">
          <div>
            <span>{vehicle.type.toUpperCase()}</span>
            <h1>{label}</h1>
            <p>
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim ? ` ${vehicle.trim}` : ""} · {vehicle.fuelType}
            </p>
          </div>
        </div>
      </section>
      {error ? <p className="auth-error">{error}</p> : null}
      <div className="profile-actions">
        <button type="button" onClick={() => setEditing((open) => !open)}>
          Edit vehicle
        </button>
        <button type="button" onClick={() => onOpenBay(vehicle.type)}>
          Open matching bay
        </button>
      </div>
      {editing ? (
        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdits();
          }}
        >
          <span>EDIT BUILD</span>
          <label>
            Nickname
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <button type="submit">Save changes</button>
        </form>
      ) : null}
      <div className="screen-intro">
        <span>SERVICE LOG</span>
        <h1>What this machine has seen.</h1>
      </div>
      {records.map((record) => (
        <article className="feed-card" key={record.id}>
          <strong>{record.title}</strong>
          <p>
            {record.kind}
            {record.mileage != null ? ` · ${record.mileage.toLocaleString()} mi` : ""}
            {record.costCents != null ? ` · ${formatUsd(record.costCents)}` : ""}
          </p>
          {record.work ? <p>{record.work}</p> : null}
        </article>
      ))}
      {records.length === 0 ? <p className="empty-state">No service records yet.</p> : null}
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void addRecord().catch(() => setError("Could not save that service record."));
        }}
      >
        <span>ADD SERVICE</span>
        <label>
          Kind
          <input value={kind} onChange={(event) => setKind(event.target.value)} required />
        </label>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Mileage
          <input value={mileage} onChange={(event) => setMileage(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          Work
          <input value={work} onChange={(event) => setWork(event.target.value)} />
        </label>
        <button type="submit">Save record</button>
      </form>
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void runDiagnostic().catch(() => setError("Could not start a diagnostic session."));
        }}
      >
        <span>SOFTWARE DIAGNOSTIC</span>
        <p>No dongle required — describe the symptom and we’ll open a diagnostic session.</p>
        <label>
          Symptom
          <input value={symptom} onChange={(event) => setSymptom(event.target.value)} required />
        </label>
        <button type="submit">Run session</button>
        {brief ? <p className="empty-state">{brief}</p> : null}
      </form>
      <img className="stack-foot" src={images.engine} alt="" />
    </>
  );
}
