import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestDb } from "./test/pglite.js";

type JsonMessage = { type?: string; [key: string]: unknown };
type TestSocket = {
  on(event: "message", listener: (raw: { toString(): string }) => void): void;
};

class WsRecorder {
  private readonly queue: JsonMessage[] = [];
  private readonly waiters: Array<(message: JsonMessage) => void> = [];

  attach(ws: TestSocket): void {
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as JsonMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    });
  }

  next(type: string): Promise<JsonMessage> {
    const index = this.queue.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 1000);
      this.waiters.push((message) => {
        clearTimeout(timeout);
        if (message.type === type) resolve(message);
        else {
          this.queue.push(message);
          this.next(type).then(resolve, reject);
        }
      });
    });
  }
}

describe("chat and presence A5", () => {
  let client: Awaited<ReturnType<typeof createTestDb>>["client"];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let aliceCookie: string;
  let bobCookie: string;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    client = ctx.client;
    app = await buildApp({ db: ctx.db, trustedOrigins: ["http://localhost:5173"] });
    const alice = await register("alice-chat@example.com", "alicechat");
    const bob = await register("bob-chat@example.com", "bobchat");
    aliceCookie = alice.cookie;
    bobCookie = bob.cookie;
    aliceId = alice.userId;
    bobId = bob.userId;
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  async function register(email: string, username: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, username, password: "correct-horse-battery", birthYear: 1995, ageConfirmed: true },
    });
    const setCookie = res.headers["set-cookie"];
    return {
      cookie: String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!,
      userId: res.json().user.id as string,
    };
  }

  async function connect(roomId: string, cookie: string) {
    const recorder = new WsRecorder();
    const ws = await app.injectWS(
      `/rooms/${roomId}/ws`,
      { headers: { cookie } },
      { onInit: (socket) => recorder.attach(socket) },
    );
    await recorder.next("ready");
    return { ws, recorder };
  }

  it("lets two clients converse with acks, typing, history, and refresh-tolerant presence", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { cookie: aliceCookie },
      payload: { title: "Live diagnostics" },
    });
    expect(created.statusCode).toBe(201);
    const roomId = created.json().room.id as string;

    const alice = await connect(roomId, aliceCookie);
    const bob = await connect(roomId, bobCookie);

    alice.ws.send(JSON.stringify({ type: "message", clientId: "a1", body: "Knock at idle?" }));
    expect(await alice.recorder.next("ack")).toMatchObject({ clientId: "a1" });
    expect(await bob.recorder.next("message")).toMatchObject({
      message: { authorId: aliceId, body: "Knock at idle?" },
    });

    bob.ws.send(JSON.stringify({ type: "typing", isTyping: true }));
    expect(await alice.recorder.next("typing")).toMatchObject({ userId: bobId, isTyping: true });

    bob.ws.send(JSON.stringify({ type: "message", clientId: "b1", body: "Check oil pressure." }));
    expect(await bob.recorder.next("ack")).toMatchObject({ clientId: "b1" });
    expect(await alice.recorder.next("message")).toMatchObject({
      message: { authorId: bobId, body: "Check oil pressure." },
    });

    const history = await app.inject({ method: "GET", url: `/rooms/${roomId}/messages?limit=1` });
    expect(history.statusCode).toBe(200);
    expect(history.json().messages).toHaveLength(1);

    alice.ws.terminate();
    const aliceRefresh = await connect(roomId, aliceCookie);
    const presence = await app.inject({ method: "GET", url: `/rooms/${roomId}/presence` });
    expect(presence.json().users.map((u: { userId: string }) => u.userId)).toEqual(
      expect.arrayContaining([aliceId, bobId]),
    );

    aliceRefresh.ws.terminate();
    bob.ws.terminate();
  });
});
