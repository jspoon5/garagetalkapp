import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type Attestation = {
  signedAt: string;
  sig: string;
  payloadHash: string;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

export function signPayload(payload: unknown, signer: string, secret = process.env.ATTESTATION_SECRET ?? "dev-attestation-secret") {
  const signedAt = new Date().toISOString();
  const hash = payloadHash(payload);
  const sig = createHmac("sha256", secret).update(`${signer}:${signedAt}:${hash}`).digest("hex");
  return { signedAt, payloadHash: hash, sig };
}

export function verifyAttestation(
  payload: unknown,
  signer: string,
  attestation: Attestation | null | undefined,
  secret = process.env.ATTESTATION_SECRET ?? "dev-attestation-secret",
) {
  if (!attestation) return false;
  if (payloadHash(payload) !== attestation.payloadHash) return false;
  const expected = createHmac("sha256", secret)
    .update(`${signer}:${attestation.signedAt}:${attestation.payloadHash}`)
    .digest("hex");
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(attestation.sig, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
