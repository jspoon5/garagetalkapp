import { z } from "zod";

export const emailPayloadSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});

export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export interface EmailClient {
  send(payload: EmailPayload): Promise<{ id: string }>;
}

/** Dev/test client — records sends without calling Resend. */
export class MemoryEmailClient implements EmailClient {
  readonly sent: EmailPayload[] = [];
  async send(payload: EmailPayload): Promise<{ id: string }> {
    const parsed = emailPayloadSchema.parse(payload);
    this.sent.push(parsed);
    return { id: `mem_${this.sent.length}` };
  }
}

export function welcomeEmailHtml(username: string): string {
  return `<p>Welcome to Garage Talk, ${username}.</p>`;
}

export function verificationEmailHtml(link: string): string {
  return `<p>Verify your Garage Talk email:</p><p><a href="${link}">${link}</a></p>`;
}

export function passwordResetEmailHtml(link: string): string {
  return `<p>Reset your Garage Talk password:</p><p><a href="${link}">${link}</a></p>`;
}
