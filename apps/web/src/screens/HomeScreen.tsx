import { ChevronRightIcon, HeartFilledIcon, HeartIcon, PersonIcon, RocketIcon, VideoIcon } from "../icons";
import { Carousel } from "../components/Carousel";
import type { ChatRoom, FeedPost, LiveSession } from "../api";
import { preferredRoom, roomImage } from "../bays";
import { images, SectionHeading, VehicleTile } from "./shared";

export function HomeScreen({
  rooms,
  posts,
  live,
  liked,
  onLike,
  onEnterRoom,
  onOpenRooms,
  onOpenGearHead,
  onOpenLive,
  onCompose,
  signedIn,
}: {
  rooms: ChatRoom[];
  posts: FeedPost[];
  live: LiveSession | null;
  liked: boolean;
  onLike: (postId?: string) => void;
  onEnterRoom: (id: string) => void;
  onOpenRooms: () => void;
  onOpenGearHead: () => void;
  onOpenLive: () => void;
  onCompose: (body: string) => void;
  signedIn: boolean;
}) {
  const carBay = preferredRoom(rooms, "Cars");
  const lanes = [
    { lane: "Cars" as const, room: preferredRoom(rooms, "Cars") },
    { lane: "Trucks" as const, room: preferredRoom(rooms, "Trucks") },
    { lane: "Motorcycles" as const, room: preferredRoom(rooms, "Motorcycles") },
  ];

  return (
    <>
      <section className="vehicle-hero">
        <img src={images.car} alt="Blue performance car in a dark garage" fetchPriority="high" decoding="async" />
        <div className="vehicle-hero-shade" />
        <div className="hero-copy">
          <span className="live-pill">
            <i /> {carBay ? `${carBay.title} is open` : "Bays warming up"}
          </span>
          <h1>
            Fix it. Build it.
            <br />
            Talk about it.
          </h1>
          <p>Walk into a live bay. Chat, diagnostics, and the market all hit the same Garage Talk API.</p>
          <button
            type="button"
            onClick={() => {
              if (carBay) onEnterRoom(carBay.id);
              else onOpenRooms();
            }}
          >
            Enter the garage <ChevronRightIcon />
          </button>
        </div>
      </section>

      <SectionHeading eyebrow="Pick your lane" title="What are you working on?" action="All bays" onAction={onOpenRooms} />
      <Carousel ariaLabel="Vehicle communities" className="vehicle-carousel" contentClassName="vehicle-carousel-track">
        {lanes.map(({ lane, room }) => (
          <VehicleTile
            key={lane}
            image={roomImage(room?.title ?? lane)}
            title={lane}
            subtitle={room ? room.title : "Opening soon"}
            onClick={() => {
              if (room) onEnterRoom(room.id);
              else onOpenRooms();
            }}
          />
        ))}
      </Carousel>

      <SectionHeading eyebrow="Happening now" title="Live from the bays" action="Join live" onAction={onOpenLive} />
      <article
        className="live-card"
        role="button"
        tabIndex={0}
        onClick={onOpenLive}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenLive();
          }
        }}
      >
        <div className="live-thumb">
          <img src={images.motorcycle} alt="Live bay" loading="lazy" decoding="async" />
          <span className="live-badge">{live ? "LIVE" : "BAY"}</span>
          <span className="viewer-badge">
            <VideoIcon /> {live ? "On air" : "Open"}
          </span>
        </div>
        <div className="live-card-body">
          <div className="creator-avatar">
            <PersonIcon />
          </div>
          <div className="live-copy">
            <strong>{live?.title ?? preferredRoom(rooms, "Motorcycles")?.title ?? "Motorcycle Bench"}</strong>
            <span>{live ? `${live.kind} · tap to walk in` : "Tap to enter the live bay"}</span>
          </div>
          <button
            type="button"
            className="heart-button"
            onClick={(event) => {
              event.stopPropagation();
              onLike();
            }}
            aria-label={liked ? "Unlike live room" : "Like live room"}
          >
            {liked ? <HeartFilledIcon /> : <HeartIcon />}
          </button>
        </div>
      </article>

      <SectionHeading eyebrow="The lot" title="Latest from the feed" action="Post" onAction={() => onCompose("")} />
      {posts.slice(0, 5).map((post) => (
        <article className="feed-card" key={post.id}>
          <strong>{post.authorUsername ?? "gearhead"}</strong>
          <p>{post.body}</p>
          <button type="button" onClick={() => onLike(post.id)}>
            Like
          </button>
        </article>
      ))}
      {posts.length === 0 ? (
        <p className="empty-state">{signedIn ? "No posts yet — drop what you’re wrenching on." : "Sign in to post in the lot."}</p>
      ) : null}

      <button type="button" className="diagnostic-card" onClick={onOpenGearHead}>
        <div className="diagnostic-icon">
          <RocketIcon />
        </div>
        <div>
          <span>GEARHEAD QUICK CHECK</span>
          <strong>Describe the problem. Get a safe first-step plan.</strong>
        </div>
        <ChevronRightIcon />
      </button>
    </>
  );
}
