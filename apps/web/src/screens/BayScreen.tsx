import { useEffect, useRef, useState } from "react";
import { PaperPlaneIcon, PersonIcon } from "../icons";
import { apiGet, apiSend, roomSocketUrl, type RoomMessage, type User } from "../api";

export function BayScreen({
  roomId,
  roomTitle,
  roomImage,
  user,
  onNeedAccount,
}: {
  roomId: string;
  roomTitle: string;
  roomImage: string;
  user: User | null;
  onNeedAccount: () => void;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const data = await apiGet<{ messages: RoomMessage[] }>(`/rooms/${roomId}/messages?limit=80`);
        if (!cancelled) {
          setMessages((current) => {
            const byId = new Map<string, RoomMessage>();
            for (const message of [...data.messages, ...current]) {
              byId.set(message.id, message);
            }
            return [...byId.values()].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          });
        }
      } catch {
        if (!cancelled) setError("Could not load this bay.");
      }
    }

    void loadHistory();
    void apiGet<{ users: unknown[] }>(`/rooms/${roomId}/presence`)
      .then((data) => {
        if (!cancelled) setOnline(Math.max(1, data.users.length));
      })
      .catch(() => undefined);

    if (user) {
      void apiSend(`/rooms/${roomId}/join`, "POST", {}).catch(() => undefined);
      const socket = new WebSocket(roomSocketUrl(roomId));
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        void loadHistory();
      });
      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          message?: RoomMessage;
          users?: unknown[];
        };
        if (payload.type === "message" && payload.message) {
          setMessages((current) =>
            current.some((item) => item.id === payload.message!.id) ? current : [...current, payload.message!],
          );
        }
        if (payload.type === "presence" && payload.users) {
          setOnline(Math.max(1, payload.users.length));
        }
      });
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void loadHistory();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    if (!user) {
      onNeedAccount();
      return;
    }
    setDraft("");
    setError(null);
    try {
      const data = await apiSend<{ message: RoomMessage }>(`/rooms/${roomId}/messages`, "POST", { body });
      setMessages((current) =>
        current.some((item) => item.id === data.message.id) ? current : [...current, { ...data.message, authorUsername: user.username }],
      );
    } catch {
      setError("Message didn’t send. Try again.");
      setDraft(body);
    }
  }

  return (
    <div className="bay-screen">
      <section className="bay-hero">
        <img src={roomImage} alt="" />
        <div className="bay-hero-shade" />
        <div className="bay-hero-copy">
          <span className="live-pill">
            <i /> {online} inside
          </span>
          <h1>{roomTitle}</h1>
          <p>Live bay — messages persist for everyone in this room.</p>
        </div>
      </section>

      <div className="bay-thread" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty-state">No chatter yet. Be the first wrench in this bay.</p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className={`bay-msg ${message.authorId === user?.id ? "mine" : ""}`}>
            <div className="creator-avatar" aria-hidden="true">
              <PersonIcon />
            </div>
            <div>
              <strong>{message.authorUsername ?? "gearhead"}</strong>
              <p>{message.body}</p>
            </div>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="auth-error">{error}</p> : null}

      {user ? (
        <form
          className="ai-composer bay-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Jump into the bay…"
            autoComplete="off"
          />
          <button type="submit" className="send-button" aria-label="Send message">
            <PaperPlaneIcon />
          </button>
        </form>
      ) : (
        <button type="button" className="bay-gate" onClick={onNeedAccount}>
          Sign in to talk in this bay
        </button>
      )}
    </div>
  );
}
