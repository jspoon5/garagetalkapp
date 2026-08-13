import { ChevronRightIcon } from "../icons";
import { FilterRail, images } from "./shared";

const rooms = [
  { type: "Cars", title: "Car Garage", members: "428 inside", image: images.car, note: "Diagnostics, classics & daily drivers" },
  { type: "Trucks", title: "Truck Bay", members: "313 inside", image: images.truck, note: "Diesel, towing & off-road builds" },
  { type: "Motorcycles", title: "Motorcycle Bench", members: "192 inside", image: images.motorcycle, note: "Repairs, custom bikes & pre-ride safety" },
];

export function RoomsScreen({ filter, setFilter }: { filter: string; setFilter: (value: string) => void }) {
  const visible = filter === "All" ? rooms : rooms.filter((room) => room.type === filter);
  return (
    <>
      <div className="screen-intro">
        <span>COMMUNITY BAYS</span>
        <h1>Pull into a room.</h1>
        <p>Find people who understand the machine you are working on.</p>
      </div>
      <FilterRail value={filter} onChange={setFilter} />
      <div className="room-list">
        {visible.map((room, index) => (
          <button type="button" className={`room-card room-${index + 1}`} key={room.title}>
            <img src={room.image} alt={`${room.title} community`} loading="lazy" decoding="async" />
            <div className="room-overlay" />
            <div className="room-content">
              <span>
                <i /> {room.members}
              </span>
              <h2>{room.title}</h2>
              <p>{room.note}</p>
              <b>
                Enter bay <ChevronRightIcon />
              </b>
            </div>
          </button>
        ))}
      </div>
      {visible.length === 0 ? <div className="empty-state">More vehicle rooms are pulling in soon.</div> : null}
    </>
  );
}
