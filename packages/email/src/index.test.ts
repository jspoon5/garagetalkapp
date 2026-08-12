import { describe, expect, it } from "vitest";
import {
  MemoryEmailClient,
  passwordResetEmailHtml,
  verificationEmailHtml,
  welcomeEmailHtml,
} from "./index.js";

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

  it("builds verification and reset HTML with link fragments", () => {
    const verify = verificationEmailHtml("https://app.test/verify?token=abc123");
    expect(verify).toContain("Verify your Garage Talk email");
    expect(verify).toContain("abc123");

    const reset = passwordResetEmailHtml("https://app.test/reset?token=xyz789");
    expect(reset).toContain("Reset your Garage Talk password");
    expect(reset).toContain("xyz789");
  });
});
