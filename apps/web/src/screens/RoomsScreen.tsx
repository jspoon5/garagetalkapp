import { ChevronRightIcon } from "../icons";
import type { ChatRoom } from "../api";
import { filterRooms, roomImage, roomLane } from "../bays";
import { FilterRail } from "./shared";

export function RoomsScreen({
  rooms,
  filter,
  setFilter,
  onEnterRoom,
  onCreateRoom,
  signedIn,
}: {
  rooms: ChatRoom[];
  filter: string;
  setFilter: (value: string) => void;
  onEnterRoom: (id: string) => void;
  onCreateRoom: () => void;
  signedIn: boolean;
}) {
  const visible = filterRooms(rooms, filter);
  return (
    <>
      <div className="screen-intro">
        <span>COMMUNITY BAYS</span>
        <h1>Walk into a bay.</h1>
        <p>These are live chat rooms on the Garage Talk API — tap one and you’re in the thread.</p>
      </div>
      <FilterRail value={filter} onChange={setFilter} />
      <div className="room-list">
        {visible.map((room, index) => (
          <button
            type="button"
            className={`room-card room-${(index % 3) + 1}`}
            key={room.id}
            onClick={() => onEnterRoom(room.id)}
          >
            <img src={roomImage(room.title)} alt={`${room.title} community`} loading="lazy" decoding="async" />
            <div className="room-overlay" />
            <div className="room-content">
              <span>
                <i /> {roomLane(room.title)} · {room.kind}
              </span>
              <h2>{room.title}</h2>
              <p>Open the room and talk with people on the same machine.</p>
              <b>
                Enter bay <ChevronRightIcon />
              </b>
            </div>
          </button>
        ))}
      </div>
      {visible.length === 0 ? <div className="empty-state">No rooms in this lane yet.</div> : null}
      <button type="button" className="sell-button" onClick={onCreateRoom}>
        {signedIn ? "Open a new bay" : "Sign in to open a bay"}
      </button>
    </>
  );
}
