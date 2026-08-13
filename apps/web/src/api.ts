export type User = {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  cityText: string | null;
};

export type ChatRoom = {
  id: string;
  title: string;
  kind: string;
  ownerId: string | null;
  createdAt: string;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  authorId: string;
  authorUsername?: string;
  body: string;
  createdAt: string;
};

export type Vehicle = {
  id: string;
  type: string;
  fuelType: string;
  make: string;
  model: string;
  year: number;
  nickname: string | null;
  isPrimary: boolean;
  photos: string[];
};

export type FeedPost = {
  id: string;
  authorId: string;
  authorUsername?: string;
  body: string;
  mediaType: string;
  media: string[];
  createdAt: string;
  source?: string;
};

export type Listing = {
  id: string;
  sellerId: string;
  kind: string;
  title: string;
  description: string | null;
  priceCents: number;
  condition: string;
  photos: string[];
  fitsYourVehicle?: boolean;
};

export type LiveSession = {
  id: string;
  hostId: string;
  roomName: string;
  title: string | null;
  kind: string;
  createdAt: string;
};

export type GearHeadResult = {
  diagnosis: string;
  possible_causes: string[];
  next_steps: string[];
  parts: Array<{ name: string; retailer_links?: Record<string, string> }>;
  ev_safety_notes?: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as T;
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function errorCode(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function roomSocketUrl(roomId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/rooms/${roomId}/ws`;
}
