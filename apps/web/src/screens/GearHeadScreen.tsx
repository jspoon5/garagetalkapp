import { CameraIcon, GearIcon, PaperPlaneIcon } from "../icons";
import { Carousel } from "../components/Carousel";
import { images } from "./shared";

export function GearHeadScreen({
  question,
  setQuestion,
  answer,
  setAnswer,
  submitQuestion,
}: {
  question: string;
  setQuestion: (value: string) => void;
  answer: boolean;
  setAnswer: (value: boolean) => void;
  submitQuestion: () => void;
}) {
  return (
    <>
      <section className="ai-hero">
        <img src={images.engine} alt="Engine bay under inspection" decoding="async" />
        <div className="ai-overlay" />
        <div className="ai-orb">
          <GearIcon />
        </div>
        <div className="ai-title">
          <span>NEBULA AI POWERED</span>
          <h1>Your garage copilot.</h1>
          <p>Safer first steps before you turn a wrench.</p>
        </div>
      </section>
      <div className="chat-thread">
        <div className="message ai-message">
          <div className="mini-ai">
            <GearIcon />
          </div>
          <p>Hey — what vehicle are we looking at, and what symptoms are you seeing?</p>
        </div>
        {question ? (
          <div className="message user-message">
            <p>{question}</p>
          </div>
        ) : null}
        {answer ? (
          <div className="message ai-message">
            <div className="mini-ai">
              <GearIcon />
            </div>
            <p>
              Start safely: park on level ground, set the brake, and check battery voltage and terminal condition. Then
              scan for stored codes before replacing parts.
            </p>
          </div>
        ) : null}
      </div>
      {!answer ? (
        <Carousel ariaLabel="Suggested diagnostic questions" className="prompt-carousel" contentClassName="prompt-carousel-track">
          {["Cranks but won’t start", "Engine light is on", "Truck won’t tow smoothly"].map((prompt) => (
            <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>
              {prompt}
            </button>
          ))}
        </Carousel>
      ) : null}
      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submitQuestion();
        }}
      >
        <button type="button" aria-label="Add a photo">
          <CameraIcon />
        </button>
        <input
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setAnswer(false);
          }}
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
