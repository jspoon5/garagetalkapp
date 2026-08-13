import { ChevronRightIcon, HeartFilledIcon, HeartIcon, PersonIcon, RocketIcon, VideoIcon } from "../icons";
import { Carousel } from "../components/Carousel";
import { images, SectionHeading, VehicleTile } from "./shared";

export function HomeScreen({
  liked,
  onLike,
  onOpenRooms,
  onOpenGearHead,
}: {
  liked: boolean;
  onLike: () => void;
  onOpenRooms: () => void;
  onOpenGearHead: () => void;
}) {
  return (
    <>
      <section className="vehicle-hero">
        <img src={images.car} alt="Blue performance car in a dark garage" fetchPriority="high" decoding="async" />
        <div className="vehicle-hero-shade" />
        <div className="hero-copy">
          <span className="live-pill">
            <i /> LIVE COMMUNITY
          </span>
          <h1>
            Fix it. Build it.
            <br />
            Talk about it.
          </h1>
          <p>Real garages, real builders, and GearHead AI in your pocket.</p>
          <button type="button" onClick={onOpenRooms}>
            Enter the garage <ChevronRightIcon />
          </button>
        </div>
      </section>

      <SectionHeading eyebrow="Pick your lane" title="What are you working on?" action="View all" />
      <Carousel ariaLabel="Vehicle communities" className="vehicle-carousel" contentClassName="vehicle-carousel-track">
        <VehicleTile image={images.car} title="Cars" subtitle="12.8K gearheads" />
        <VehicleTile image={images.truck} title="Trucks" subtitle="8.4K gearheads" />
        <VehicleTile image={images.motorcycle} title="Motorcycles" subtitle="6.1K riders" />
      </Carousel>

      <SectionHeading eyebrow="Happening now" title="Live from the bays" action="See schedule" />
      <article className="live-card">
        <div className="live-thumb">
          <img src={images.motorcycle} alt="Motorcycle ready for a repair livestream" loading="lazy" decoding="async" />
          <span className="live-badge">LIVE</span>
          <span className="viewer-badge">
            <VideoIcon /> 238
          </span>
        </div>
        <div className="live-card-body">
          <div className="creator-avatar">
            <PersonIcon />
          </div>
          <div className="live-copy">
            <strong>Saturday Bike Clinic</strong>
            <span>MotoMia · Carb rebuild & tuning</span>
          </div>
          <button
            type="button"
            className="heart-button"
            onClick={onLike}
            aria-label={liked ? "Unlike live room" : "Like live room"}
          >
            {liked ? <HeartFilledIcon /> : <HeartIcon />}
          </button>
        </div>
      </article>

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
