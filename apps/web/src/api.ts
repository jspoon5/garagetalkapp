export type User = {
  id: string;
  email: string;
  username: string;
  bio: string | null;
  cityText: string | null;
  tier?: "amateur" | "gearhead" | "racing_pro" | "pro";
  roles?: string[];
};

export type GearHeadResult = {
  diagnosis: string;
  possible_causes: string[];
  next_steps: string[];
  parts: Array<{ name: string; retailer_links?: Record<string, string> }>;
  ev_safety_notes?: string;
  threadId?: string;
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
  ownerId?: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  visibility?: "draft" | "public" | "private";
  hlsUrl: string | null;
  thumbUrl: string | null;
  likeCount: number;
};

export type VideoVisibility = "draft" | "public" | "private";

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

export type ShopAddress = {
  city?: string;
  state?: string;
  line1?: string;
};

export type Shop = {
  id: string;
  ownerUserId?: string;
  name: string;
  slug: string;
  about: string | null;
  address?: ShopAddress;
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
  const res = await fetch(path, {
    credentials: "include",
    headers: adminHeaders(),
  });
  if (!res.ok) throw await apiErrorFrom(res);
  return (await res.json()) as T;
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      ...adminHeaders(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await apiErrorFrom(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const ADMIN_TOTP_KEY = "gt_admin_totp";

export function setAdminTotp(code: string) {
  try {
    sessionStorage.setItem(ADMIN_TOTP_KEY, code);
  } catch {
    // private mode
  }
}

export function clearAdminTotp() {
  try {
    sessionStorage.removeItem(ADMIN_TOTP_KEY);
  } catch {
    // ignore
  }
}

function adminHeaders(): Record<string, string> {
  try {
    const totp = sessionStorage.getItem(ADMIN_TOTP_KEY)?.trim();
    return totp ? { "x-admin-totp": totp } : {};
  } catch {
    return {};
  }
}

async function apiErrorFrom(res: Response): Promise<ApiError> {
  const { code, details } = await errorBody(res);
  return new ApiError(res.status, code, details);
}

async function errorBody(res: Response): Promise<{ code: string; details?: Record<string, unknown> }> {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    const code = typeof data.error === "string" ? data.error : `http_${res.status}`;
    const { error: _ignored, ...rest } = data;
    return { code, details: Object.keys(rest).length > 0 ? rest : undefined };
  } catch {
    return { code: `http_${res.status}` };
  }
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

const IMAGE_UPLOAD_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function uploadImageFile(file: File): Promise<string> {
  if (!(IMAGE_UPLOAD_MIMES as readonly string[]).includes(file.type)) {
    throw new ApiError(400, "invalid_mime");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new ApiError(400, "file_too_large");
  }
  const presigned = await apiSend<{
    assetId: string;
    uploadUrl: string;
    method: "PUT";
    headers: Record<string, string>;
  }>("/uploads/presign", "POST", {
    kind: "generic",
    mimeType: file.type,
    sizeBytes: file.size,
  });
  const put = await fetch(presigned.uploadUrl, {
    method: presigned.method,
    headers: presigned.headers,
    body: file,
  });
  if (!put.ok) throw new ApiError(put.status, "upload_put_failed");
  const completed = await apiSend<{ asset: { publicUrl: string | null } }>(
    `/uploads/${presigned.assetId}/complete`,
    "POST",
  );
  if (!completed.asset.publicUrl) {
    throw new ApiError(503, "upload_storage_unconfigured");
  }
  return completed.asset.publicUrl;
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
