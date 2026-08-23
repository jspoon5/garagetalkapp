export type User = {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  cityText: string | null;
  tier?: "amateur" | "gearhead" | "racing_pro" | "pro";
  isAdmin?: boolean;
};

export type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  roles: string[];
  tier: "amateur" | "gearhead" | "racing_pro" | "pro";
  tierStatus: string;
  suspendedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type AdminStats = {
  users: number;
  paidUsers: number;
  openReports: number;
  activeSubscriptions: number;
  liveSessions: number;
  byTier: {
    amateur: number;
    gearhead: number;
    racing_pro: number;
    pro: number;
  };
};

export type ChatRoom = {
  id: string;
  title: string;
  kind: string;
  ownerId: string | null;
  createdAt: string;
  mapPoint?: { lat: number; lng: number; label: string } | null;
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
  vin?: string | null;
  trim?: string | null;
};

export type ServiceRecord = {
  id: string;
  vehicleId: string;
  date: string;
  mileage: number | null;
  kind: string;
  title: string;
  work: string | null;
  notes: string | null;
  costCents: number | null;
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
  likeCount?: number;
  likedByMe?: boolean;
};

export type FeedComment = {
  id: string;
  postId: string;
  userId: string;
  body: string;
  createdAt: string;
  authorUsername?: string;
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
  saved?: boolean;
};

export type LiveSession = {
  id: string;
  hostId: string;
  roomName: string;
  title: string | null;
  kind: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  scheduledAt?: string | null;
  recordingState?: string;
  recordingReplayUrl?: string | null;
  likeCount?: number;
  likedByMe?: boolean;
};

export type VideoItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  hlsUrl: string | null;
  thumbUrl: string | null;
  likeCount: number;
};

export type PodcastEpisode = {
  id: string;
  showId: string;
  title: string;
  description: string | null;
  audioUrl: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  status: string;
};

export type Shop = {
  id: string;
  name: string;
  slug: string;
  about: string | null;
  serviceArea: string | null;
  specialties: string[];
  photos: string[];
  averageRating?: number;
  unverified?: boolean;
};

export type ShopService = {
  id: string;
  name: string;
  durationMin: number;
  priceBandLowCents: number | null;
  priceBandHighCents: number | null;
};

export type GearHeadResult = {
  diagnosis: string;
  possible_causes: string[];
  next_steps: string[];
  parts: Array<{ name: string; retailer_links?: Record<string, string> }>;
  ev_safety_notes?: string;
};

export type GiftCatalogItem = {
  id: string;
  slug: string;
  name: string;
  coinCost: number;
  animationKey: string;
};

export type PaidTier = "gearhead" | "racing_pro" | "pro";

export type UserEntitlement = {
  tier: string;
  tierLabel: string;
  effectiveTier: string;
  aiUsage: number;
  aiQuota: number;
  photosAllowed: boolean;
  canHostLive: boolean;
  upgradeTier: PaidTier | null;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw await apiErrorFrom(res);
  return (await res.json()) as T;
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await apiErrorFrom(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function apiErrorFrom(res: Response): Promise<ApiError> {
  const { code, details } = await errorBody(res);
  return new ApiError(res.status, code, details);
}

async function errorBody(res: Response): Promise<{ code: string; details?: Record<string, unknown> }> {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    const { error, ...rest } = data;
    const code = typeof error === "string" ? error : `http_${res.status}`;
    return { code, details: Object.keys(rest).length > 0 ? rest : undefined };
  } catch {
    return { code: `http_${res.status}` };
  }
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function checkoutUrl(payload: {
  checkout?: { url?: string | null } | null;
  payment?: { url?: string | null } | null;
}): string | null {
  return payload.checkout?.url ?? payload.payment?.url ?? null;
}

export function roomSocketUrl(roomId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/rooms/${roomId}/ws`;
}

export const TIER_LABELS: Record<PaidTier, string> = {
  gearhead: "GearHead · $9.99/mo",
  racing_pro: "Racing Pro · $19.99/mo",
  pro: "Pro · $29.99/mo",
};
