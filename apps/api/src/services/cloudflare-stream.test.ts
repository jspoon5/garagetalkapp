import { describe, expect, it, vi } from "vitest";
import {
  createStreamDirectUpload,
  getStreamVideo,
  isStubStreamUploadUrl,
  playbackUrlForUid,
  readStreamConfig,
} from "./cloudflare-stream.js";

describe("cloudflare-stream helpers", () => {
  it("reads account + token and ignores stubs", () => {
    expect(
      readStreamConfig({
        CLOUDFLARE_ACCOUNT_ID: "acct",
        CLOUDFLARE_STREAM_TOKEN: "tok",
        CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN: "customer-abc",
      }),
    ).toEqual({
      accountId: "acct",
      token: "tok",
      customerSubdomain: "customer-abc",
    });
    expect(readStreamConfig({ CLOUDFLARE_ACCOUNT_ID: "acct" })).toBeNull();
    expect(isStubStreamUploadUrl("https://upload.videodelivery.net/stub/cf_abc")).toBe(true);
    expect(isStubStreamUploadUrl("https://upload.videodelivery.net/abc123")).toBe(false);
    expect(playbackUrlForUid("uid1", "customer-abc")).toBe(
      "https://customer-abc.cloudflarestream.com/uid1/manifest/video.m3u8",
    );
  });

  it("creates a real direct upload URL and rejects stubs", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        success: true,
        result: {
          uid: "stream-uid-1",
          uploadURL: "https://upload.videodelivery.net/real-upload-token",
        },
      }),
    );
    const direct = await createStreamDirectUpload({
      accountId: "acct",
      token: "tok",
      videoId: "01a00000-0000-7000-8000-000000000001",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(direct).toEqual({
      uid: "stream-uid-1",
      uploadUrl: "https://upload.videodelivery.net/real-upload-token",
    });

    const stubFetch = vi.fn(async () =>
      Response.json({
        success: true,
        result: {
          uid: "bad",
          uploadURL: "https://upload.videodelivery.net/stub/cf_bad",
        },
      }),
    );
    await expect(
      createStreamDirectUpload({
        accountId: "acct",
        token: "tok",
        videoId: "v",
        fetchImpl: stubFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow("stream_stub_rejected");
  });

  it("reads playback when Stream marks ready", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        success: true,
        result: {
          uid: "uid1",
          readyToStream: true,
          duration: 12.5,
          thumbnail: "https://cdn.example/thumb.jpg",
          playback: { hls: "https://customer-abc.cloudflarestream.com/uid1/manifest/video.m3u8" },
          status: { state: "ready" },
        },
      }),
    );
    const details = await getStreamVideo({
      accountId: "acct",
      token: "tok",
      uid: "uid1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(details.readyToStream).toBe(true);
    expect(details.hlsUrl).toContain("manifest/video.m3u8");
  });
});
