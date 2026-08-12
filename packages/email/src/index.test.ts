import { describe, expect, it } from "vitest";
import { MemoryEmailClient, welcomeEmailHtml } from "./index.js";

describe("email", () => {
  it("records memory sends", async () => {
    const client = new MemoryEmailClient();
    await client.send({
      to: "user@example.com",
      subject: "Welcome",
      html: welcomeEmailHtml("wrench"),
    });
    expect(client.sent).toHaveLength(1);
  });
});
