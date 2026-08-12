import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { storage, db } from "./storage";
import { insertVideoSchema, insertChatRoomSchema, insertMessageSchema, insertSearchSchema, insertPodcastEpisodeSchema, insertPodcastThreadSchema, insertPodcastCommentSchema, insertVideoCommentSchema, insertScheduledSessionSchema, insertStreamRecordingSchema, usageSessions, usageEvents, type UsageSession, type AdminUser } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import OpenAI from "openai";
import { google } from 'googleapis';
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { hashPassword, comparePassword } from "./passwordUtils";
import { sendPasswordResetEmail } from "./email";
import { randomBytes, randomUUID } from "crypto";
import twilio from "twilio";
import Busboy from "busboy";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

// Extended request type for admin routes
interface AdminRequest extends Request {
  adminUser?: AdminUser;
  adminSession?: { userId: string };
}

// Lazy initialize Twilio client
let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (accountSid && authToken) {
    try {
      twilioClient = twilio(accountSid, authToken);
      console.log('[Twilio] Client initialized successfully');
      return twilioClient;
    } catch (error) {
      console.error('[Twilio] Failed to initialize client:', error);
      return null;
    }
  }
  
  console.warn('[Twilio] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  return null;
}

// Generate 6-digit OTP code
function generateOTP(): string {
  const bytes = randomBytes(3);
  const num = (bytes[0] * 65536 + bytes[1] * 256 + bytes[2]) % 1000000;
  return num.toString().padStart(6, '0');
}

// Generate Zoom-style meeting ID (9 digits) using crypto-secure randomness
function generateMeetingId(): string {
  const bytes = randomBytes(6); // 48 bits of entropy
  let num = 0;
  for (let i = 0; i < bytes.length; i++) {
    num = (num * 256 + bytes[i]) % 1000000000; // Keep 9 digits max
  }
  return num.toString().padStart(9, '0');
}

// Generate 6-character passcode using crypto-secure randomness
function generatePasscode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I
  const bytes = randomBytes(6);
  let passcode = '';
  for (let i = 0; i < 6; i++) {
    passcode += chars.charAt(bytes[i] % chars.length);
  }
  return passcode;
}

// This is using Replit's AI Integrations service for OpenAI access without requiring your own API key
// Validate that AI Integrations environment variables are available
if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  console.warn('[WARNING] AI_INTEGRATIONS_OPENAI_API_KEY not found. Gearhead Agent search will not work.');
}

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'missing-api-key'
});

// Tier pricing in cents (for Stripe payments)
const TIER_PRICES: Record<string, { amount: number; name: string }> = {
  gearhead: { amount: 999, name: "Gearhead Membership" }, // $9.99/month
  racing_pro: { amount: 1999, name: "Racing Pro Membership" }, // $19.99/month
  pro: { amount: 2999, name: "Pro Membership" }, // $29.99/month
};

// Helper function to get authenticated user ID from session
function getAuthenticatedUserId(req: any): string | null {
  return req.session?.userId || null;
}

function requireAuth(req: any, res: any): string | null {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated. Please sign in first." });
    return null;
  }
  return userId;
}

// Admin authentication middleware
async function requireAdminAuth(req: AdminRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.admin_token;
    
    if (!token) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    
    const session = await storage.getAdminSession(token);
    
    if (!session) {
      res.status(401).json({ error: "Invalid admin session" });
      return;
    }
    
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteAdminSession(token);
      res.status(401).json({ error: "Admin session expired" });
      return;
    }
    
    const adminUser = await storage.getAdminUser(session.adminId);
    
    if (!adminUser || !adminUser.isActive) {
      res.status(401).json({ error: "Admin account not found or inactive" });
      return;
    }
    
    req.adminUser = adminUser;
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// YouTube API client setup
let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=youtube',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('YouTube not connected');
  }
  return accessToken;
}

async function getYouTubeClient() {
  const accessToken = await getAccessToken();
  return google.youtube({ version: 'v3', auth: accessToken });
}

async function searchYouTubeVideos(query: string, maxResults: number = 3) {
  try {
    const youtube = await getYouTubeClient();
    
    const response = await youtube.search.list({
      part: ['snippet'],
      q: `${query} automotive repair how to fix`,
      type: ['video'],
      maxResults,
      order: 'relevance',
      videoDuration: 'medium',
    });

    return response.data.items?.map(item => ({
      id: item.id?.videoId || '',
      title: item.snippet?.title || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      embedUrl: `https://www.youtube.com/embed/${item.id?.videoId}`,
    })) || [];
  } catch (error) {
    console.error('YouTube search error:', error);
    return [];
  }
}

// Initialize admin user with environment variable support
async function initializeAdminUser() {
  try {
    const existingAdmin = await storage.getAdminUserByUsername("admin");
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.warn("[Admin] ADMIN_PASSWORD environment variable not set. Admin user will not be created/updated.");
      return;
    }
    
    if (!existingAdmin) {
      // Create new admin user
      const hashedPassword = await hashPassword(adminPassword);
      await storage.createAdminUser({
        username: "admin",
        email: process.env.ADMIN_EMAIL || "admin@garagetalk.shop",
        password: hashedPassword,
      });
      console.log("[Admin] Created admin user");
    } else {
      // Update the admin password to match the environment variable
      const hashedPassword = await hashPassword(adminPassword);
      await storage.updateAdminCredentials(existingAdmin.id, { password: hashedPassword });
      console.log("[Admin] Updated admin password from environment variable");
    }
  } catch (error) {
    console.error("[Admin] Failed to initialize admin user:", error);
  }
}

export function registerRoutes(app: Express) {
  // Initialize admin user on startup
  initializeAdminUser();
  
  // Create HTTP server for both Express and WebSocket
  const httpServer = createServer(app);
  // Video routes
  app.get("/api/videos", async (req, res) => {
    try {
      const { category, search } = req.query;
      const filters: { category?: string; search?: string } = {};
      
      if (category && typeof category === "string") {
        filters.category = category;
      }
      if (search && typeof search === "string") {
        filters.search = search;
      }
      
      const videos = await storage.listVideos(filters);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  // Recycle Bin routes - MUST be before /api/videos/:id to avoid route matching issues
  app.get("/api/videos/recycle-bin", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const deletedVideos = await storage.listDeletedVideos(userId);
      res.json(deletedVideos);
    } catch (error) {
      console.error("Error fetching recycle bin:", error);
      res.status(500).json({ error: "Failed to fetch recycle bin" });
    }
  });

  app.post("/api/videos/:id/restore", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const restored = await storage.restoreVideo(req.params.id, userId);
      if (!restored) {
        return res.status(404).json({ error: "Video not found in recycle bin or unauthorized" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error restoring video:", error);
      res.status(500).json({ error: "Failed to restore video" });
    }
  });

  app.delete("/api/videos/:id/permanent", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const purged = await storage.purgeVideo(req.params.id, userId);
      if (!purged) {
        return res.status(404).json({ error: "Video not found in recycle bin or unauthorized" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error permanently deleting video:", error);
      res.status(500).json({ error: "Failed to permanently delete video" });
    }
  });

  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Note: Views are NOT incremented here. They are only incremented when
      // a user actually watches the video via POST /api/videos/:id/view
      // This prevents page loads/refreshes from inflating view counts
      
      res.json(video);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch video" });
    }
  });

  app.post("/api/videos", async (req, res) => {
    try {
      // Require authentication for video uploads
      const userId = requireAuth(req, res);
      if (!userId) return;

      // Get user to populate uploader info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Remove any client-supplied uploader fields (prevent spoofing)
      const { uploaderId: _, uploaderName: __, ...safeBody } = req.body;

      // Parse video data
      const validated = insertVideoSchema.omit({ 
        uploaderId: true, 
        uploaderName: true 
      }).parse(safeBody);
      
      // Create video with server-populated uploader info
      const video = await storage.createVideo({
        ...validated,
        uploaderId: userId,
        uploaderName: user.username,
      });
      res.json(video);
    } catch (error) {
      res.status(400).json({ error: "Invalid video data" });
    }
  });

  // Video upload endpoints
  app.post("/api/videos/upload-url", async (req, res) => {
    try {
      // Require authentication for video uploads
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const objectStorageService = new ObjectStorageService();
      const { uploadURL, videoId } = await objectStorageService.getVideoUploadURL();
      res.json({ uploadURL, videoId });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Avatar upload endpoint - uses busboy for proper binary handling
  app.post("/api/upload-avatar", (req, res) => {
    // Require authentication
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated. Please sign in first." });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    const busboy = Busboy({ headers: req.headers });
    let fileBuffer: Buffer | null = null;
    let filename = 'avatar.jpg';
    let mimeType = 'image/jpeg';

    busboy.on('file', (fieldname, file, info) => {
      const { filename: fname, mimeType: fmime } = info;
      filename = fname || 'avatar.jpg';
      mimeType = fmime || 'image/jpeg';

      const chunks: Buffer[] = [];
      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('finish', async () => {
      try {
        if (!fileBuffer) {
          return res.status(400).json({ error: "No file found in upload" });
        }

        // Validate file size (5MB max)
        if (fileBuffer.length > 5 * 1024 * 1024) {
          return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
        }

        // Validate file type
        if (!mimeType.startsWith('image/')) {
          return res.status(400).json({ error: "Only image files are allowed." });
        }

        // Get extension from filename
        const extension = filename.split('.').pop()?.toLowerCase() || 'jpg';

        // Get signed upload URL
        const objectStorageService = new ObjectStorageService();
        const { uploadURL, avatarPath } = await objectStorageService.getAvatarUploadURL(userId, extension);

        // Upload the file to object storage
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
          },
          body: fileBuffer,
        });

        if (!uploadResponse.ok) {
          console.error('Avatar upload failed:', uploadResponse.status, await uploadResponse.text());
          return res.status(500).json({ error: "Failed to upload avatar to storage" });
        }

        // Return the serving URL
        const serveUrl = objectStorageService.getAvatarServeURL(avatarPath);
        res.json({ url: serveUrl, path: avatarPath });
      } catch (error) {
        console.error("Error uploading avatar:", error);
        res.status(500).json({ error: "Failed to upload avatar" });
      }
    });

    busboy.on('error', (error) => {
      console.error("Busboy error:", error);
      res.status(500).json({ error: "Failed to parse upload" });
    });

    req.pipe(busboy);
  });

  // Serve uploaded avatars
  app.get("/api/avatars/:path", async (req, res) => {
    try {
      const avatarPath = decodeURIComponent(req.params.path);
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.getAvatarFile(avatarPath);
      
      // Determine content type from path extension
      const extension = avatarPath.split('.').pop()?.toLowerCase() || 'jpg';
      const contentTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg', 
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
      };
      const contentType = contentTypes[extension] || 'image/jpeg';
      
      await objectStorageService.downloadAvatar(file, res, contentType);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Avatar not found" });
      }
      console.error("Error serving avatar:", error);
      res.status(500).json({ error: "Failed to serve avatar" });
    }
  });

  // Serve uploaded videos
  app.get("/videos/:videoId", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.getVideoFile(req.params.videoId);
      // Pass req object to access headers for range requests
      (res as any).req = req;
      await objectStorageService.downloadVideo(file, res as any);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Video not found" });
      }
      console.error("Error serving video:", error);
      res.status(500).json({ error: "Failed to serve video" });
    }
  });

  app.post("/api/videos/:id/like", async (req, res) => {
    try {
      await storage.incrementVideoLikes(req.params.id);
      const video = await storage.getVideo(req.params.id);
      res.json({ likes: video?.likes || 0 });
    } catch (error) {
      res.status(500).json({ error: "Failed to like video" });
    }
  });

  // Record a video view
  app.post("/api/videos/:id/view", async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { playbackPosition } = req.body;
      const { view, isNewView } = await storage.recordVideoView(userId, req.params.id, playbackPosition);
      
      // Only increment video's view count for new unique views (not repeat views or progress updates)
      if (isNewView) {
        await storage.incrementVideoViews(req.params.id);
      }
      
      res.json({ success: true, view, isNewView });
    } catch (error) {
      console.error("Error recording video view:", error);
      res.status(500).json({ error: "Failed to record video view" });
    }
  });

  // Get user's recently watched videos
  app.get("/api/users/me/recent-views", async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const recentViews = await storage.getUserRecentViews(userId, limit);
      res.json(recentViews);
    } catch (error) {
      console.error("Error getting recent views:", error);
      res.status(500).json({ error: "Failed to get recent views" });
    }
  });

  // Get popular videos (optionally by country)
  app.get("/api/videos/popular", async (req, res) => {
    try {
      const countryCode = req.query.country as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const videos = await storage.getPopularVideosByCountry(countryCode, limit);
      res.json(videos);
    } catch (error) {
      console.error("Error getting popular videos:", error);
      res.status(500).json({ error: "Failed to get popular videos" });
    }
  });

  // Search videos by popularity and country
  app.get("/api/videos/search", async (req, res) => {
    try {
      const query = req.query.q as string | undefined;
      const countryCode = req.query.country as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const videos = await storage.searchVideosByPopularity(query, countryCode, limit);
      res.json(videos);
    } catch (error) {
      console.error("Error searching videos:", error);
      res.status(500).json({ error: "Failed to search videos" });
    }
  });

  // ===== STREAM RECORDING ENDPOINTS =====
  
  // List recording folders for a user
  app.get("/api/recordings/folders", async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const objectStorageService = new ObjectStorageService();
      const result = await objectStorageService.listRecordingFolders(userId);
      res.json(result);
    } catch (error) {
      console.error("Error listing recording folders:", error);
      res.status(500).json({ error: "Failed to list folders" });
    }
  });

  // Create a new recording folder
  app.post("/api/recordings/folders", async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const { folderName } = req.body;
    if (!folderName || typeof folderName !== 'string') {
      return res.status(400).json({ error: "Folder name is required" });
    }
    
    try {
      const objectStorageService = new ObjectStorageService();
      const sanitizedName = await objectStorageService.createRecordingFolder(userId, folderName);
      res.json({ success: true, message: "Folder created", folderName: sanitizedName });
    } catch (error) {
      console.error("Error creating recording folder:", error);
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  // Upload a stream recording
  app.post("/api/recordings/upload", (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated. Please sign in first." });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    const busboy = Busboy({ 
      headers: req.headers,
      limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for recordings
    });
    
    let fileBuffer: Buffer | null = null;
    let filename = 'recording.webm';
    let mimeType = 'video/webm';
    let title = 'Untitled Recording';
    let description = '';
    let streamType = 'camera';
    let duration = 0;
    let folderPath = '';

    busboy.on('field', (fieldname, value) => {
      if (fieldname === 'title') title = value;
      else if (fieldname === 'description') description = value;
      else if (fieldname === 'streamType') streamType = value;
      else if (fieldname === 'duration') duration = parseInt(value, 10) || 0;
      else if (fieldname === 'folderPath') folderPath = value;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename: fname, mimeType: fmime } = info;
      filename = fname || 'recording.webm';
      mimeType = fmime || 'video/webm';

      const chunks: Buffer[] = [];
      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('finish', async () => {
      try {
        if (!fileBuffer) {
          return res.status(400).json({ error: "No file found in upload" });
        }

        // Get user info
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Upload to private object storage for recordings
        const objectStorageService = new ObjectStorageService();
        
        // Get a signed upload URL for the recording (private path, with optional folder)
        const { uploadURL, recordingId } = await objectStorageService.getRecordingUploadURLWithFolder(userId, folderPath || undefined);
        
        // Upload the file to private storage
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
          },
          body: fileBuffer,
        });

        if (!uploadResponse.ok) {
          console.error('Recording upload failed:', uploadResponse.status, await uploadResponse.text());
          return res.status(500).json({ error: "Failed to upload recording to storage" });
        }

        // Validate and create recording metadata in database
        // URL will point to the streaming endpoint using the database ID
        // storageId stores the object storage UUID for file retrieval
        const recordingData = insertStreamRecordingSchema.parse({
          storageId: recordingId, // Object storage UUID
          title,
          description: description || null,
          userId,
          username: user.username,
          url: '', // Will be updated after we have the DB ID
          duration,
          fileSize: fileBuffer.length,
          mimeType,
          streamType,
          isPublic: false,
          folderPath: folderPath || null,
        });

        const recording = await storage.createStreamRecording(recordingData);
        
        // Update the URL to use the database ID for the streaming endpoint
        const streamUrl = `/api/recordings/${recording.id}/stream`;
        await storage.updateRecordingUrl(recording.id, streamUrl);

        res.json({ 
          success: true, 
          recording: {
            ...recording,
            url: streamUrl, // Return the updated URL
          },
          message: "Recording uploaded successfully" 
        });
      } catch (error) {
        console.error("Error uploading recording:", error);
        res.status(500).json({ error: "Failed to upload recording" });
      }
    });

    busboy.on('error', (error) => {
      console.error("Busboy error:", error);
      res.status(500).json({ error: "Failed to parse upload" });
    });

    req.pipe(busboy);
  });

  // List user's recordings
  app.get("/api/recordings", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const recordings = await storage.listUserRecordings(userId);
      res.json({ recordings });
    } catch (error) {
      console.error("Error listing recordings:", error);
      res.status(500).json({ error: "Failed to list recordings" });
    }
  });

  // List public recordings
  app.get("/api/recordings/public", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const recordings = await storage.listPublicRecordings(limit);
      res.json({ recordings });
    } catch (error) {
      console.error("Error listing public recordings:", error);
      res.status(500).json({ error: "Failed to list public recordings" });
    }
  });

  // Get a specific recording
  app.get("/api/recordings/:id", async (req, res) => {
    try {
      const recording = await storage.getStreamRecording(req.params.id);
      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }

      // Check if user has access (owner or public recording)
      const userId = getAuthenticatedUserId(req);
      if (!recording.isPublic && recording.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Increment views if not the owner
      if (userId !== recording.userId) {
        await storage.incrementRecordingViews(req.params.id);
      }

      res.json({ recording });
    } catch (error) {
      console.error("Error getting recording:", error);
      res.status(500).json({ error: "Failed to get recording" });
    }
  });

  // Update recording visibility
  app.patch("/api/recordings/:id/visibility", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const { isPublic } = req.body;
      if (typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: "isPublic must be a boolean" });
      }

      const recording = await storage.updateRecordingVisibility(req.params.id, userId, isPublic);
      if (!recording) {
        return res.status(404).json({ error: "Recording not found or unauthorized" });
      }

      res.json({ recording });
    } catch (error) {
      console.error("Error updating recording visibility:", error);
      res.status(500).json({ error: "Failed to update recording visibility" });
    }
  });

  // Delete a recording
  app.delete("/api/recordings/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const deleted = await storage.deleteStreamRecording(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Recording not found or unauthorized" });
      }

      res.json({ success: true, message: "Recording deleted" });
    } catch (error) {
      console.error("Error deleting recording:", error);
      res.status(500).json({ error: "Failed to delete recording" });
    }
  });

  // Stream a recording (with authorization check)
  app.get("/api/recordings/:id/stream", async (req, res) => {
    try {
      const recording = await storage.getStreamRecording(req.params.id);
      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }

      // Check if user has access (owner or public recording)
      const userId = getAuthenticatedUserId(req);
      if (!recording.isPublic && recording.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Use storageId to retrieve the file from object storage (with folder path if set)
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.getRecordingFileWithFolder(recording.userId, recording.storageId, recording.folderPath || undefined);
      
      // Pass req object to access headers for range requests
      (res as any).req = req;
      await objectStorageService.downloadRecording(file, res as any);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Recording file not found" });
      }
      console.error("Error streaming recording:", error);
      res.status(500).json({ error: "Failed to stream recording" });
    }
  });

  // Delete video (owner only) - soft delete to recycle bin
  app.delete("/api/videos/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const deleted = await storage.deleteVideo(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Video not found or unauthorized" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting video:", error);
      res.status(500).json({ error: "Failed to delete video" });
    }
  });

  // Video Comment routes
  app.get("/api/videos/:id/comments", async (req, res) => {
    try {
      const comments = await storage.listVideoComments(req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/videos/:id/comments", async (req, res) => {
    try {
      // Require authentication first
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Get user to check tier and populate author info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Amateur (Free) tier can only read, not comment
      if (user.subscriptionTier === "amateur") {
        return res.status(403).json({
          error: "Upgrade required",
          message: "Free tier users can read comments but cannot post. Upgrade to Gearhead or higher!",
        });
      }
      
      // Remove any client-supplied author fields (prevent spoofing)
      const { userId: _, username: __, ...safeBody } = req.body;
      
      // Parse comment data
      const validated = insertVideoCommentSchema.omit({
        userId: true,
        username: true,
      }).parse({
        ...safeBody,
        videoId: req.params.id,
      });
      
      // Create comment with server-populated author info
      const comment = await storage.createVideoComment({
        ...validated,
        userId,
        username: user.username,
      });
      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  app.delete("/api/videos/:videoId/comments/:commentId", async (req, res) => {
    try {
      // Require authentication first
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Delete comment (storage checks ownership)
      const deleted = await storage.deleteVideoComment(req.params.commentId, userId);
      
      if (!deleted) {
        return res.status(404).json({ 
          error: "Comment not found or you don't have permission to delete it" 
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Get user's comments for profile
  app.get("/api/users/:userId/comments", async (req, res) => {
    try {
      const comments = await storage.getUserVideoComments(req.params.userId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user comments" });
    }
  });

  // Screen Share Session routes (Zoom-style meeting ID/passcode system)
  
  // Create a new screen share session
  app.post("/api/screen-share/create", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check tier - require at least Gearhead tier
      if (user.subscriptionTier === "amateur") {
        return res.status(403).json({
          error: "Upgrade required",
          message: "Screen sharing requires Gearhead tier or higher.",
        });
      }
      
      // Generate Zoom-style meeting ID (9-11 digits) and passcode (6 chars)
      const meetingId = generateMeetingId();
      const passcode = generatePasscode();
      
      const session = await storage.createScreenShareSession({
        meetingId,
        passcode,
        hostId: userId,
        hostName: user.username,
        title: req.body.title || null,
      });
      
      res.json({
        meetingId: session.meetingId,
        passcode: session.passcode,
        hostName: session.hostName,
        title: session.title,
        jitsiRoom: `garage-talk-${session.meetingId}`,
      });
    } catch (error) {
      console.error("Error creating screen share session:", error);
      res.status(500).json({ error: "Failed to create screen share session" });
    }
  });
  
  // Join a screen share session (validate meeting ID and passcode)
  app.post("/api/screen-share/join", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const { meetingId, passcode } = req.body;
      
      if (!meetingId || !passcode) {
        return res.status(400).json({ error: "Meeting ID and passcode are required" });
      }
      
      // Normalize meeting ID (remove dashes/spaces)
      const normalizedMeetingId = meetingId.replace(/[-\s]/g, "");
      
      const session = await storage.validateScreenShareSession(normalizedMeetingId, passcode);
      
      if (!session) {
        return res.status(401).json({ error: "Invalid meeting ID or passcode" });
      }
      
      res.json({
        valid: true,
        hostName: session.hostName,
        title: session.title,
        jitsiRoom: `garage-talk-${session.meetingId}`,
      });
    } catch (error) {
      console.error("Error joining screen share session:", error);
      res.status(500).json({ error: "Failed to join screen share session" });
    }
  });
  
  // End a screen share session (host only)
  app.post("/api/screen-share/end", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const { meetingId } = req.body;
      
      if (!meetingId) {
        return res.status(400).json({ error: "Meeting ID is required" });
      }
      
      // Verify the user is the host before ending
      const ended = await storage.endScreenShareSession(meetingId, userId);
      
      if (!ended) {
        return res.status(403).json({ 
          error: "You can only end sessions you're hosting" 
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error ending screen share session:", error);
      res.status(500).json({ error: "Failed to end screen share session" });
    }
  });
  
  // Get active screen share sessions (for browsing)
  app.get("/api/screen-share/active", async (req, res) => {
    try {
      const sessions = await storage.getActiveScreenShareSessions();
      // Don't expose passcodes in the list
      const safeSessions = sessions.map(s => ({
        meetingId: s.meetingId,
        hostName: s.hostName,
        title: s.title,
        participantCount: s.participantCount,
        createdAt: s.createdAt,
      }));
      res.json(safeSessions);
    } catch (error) {
      console.error("Error fetching active sessions:", error);
      res.status(500).json({ error: "Failed to fetch active sessions" });
    }
  });

  // Scheduled Session routes (Calendar Integration)
  
  // Create a new scheduled session
  app.post("/api/scheduled-sessions", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check subscription tier - only paid tiers can schedule
      if (user.subscriptionTier === "amateur") {
        return res.status(403).json({ 
          error: "Upgrade required",
          message: "Scheduling sessions requires a Gearhead or higher subscription" 
        });
      }
      
      // Validate request body using Zod schema
      const validationResult = insertScheduledSessionSchema.safeParse({
        ...req.body,
        hostId: userId,
        hostName: user.username,
        scheduledStart: req.body.scheduledStart ? new Date(req.body.scheduledStart) : undefined,
        scheduledEnd: req.body.scheduledEnd ? new Date(req.body.scheduledEnd) : undefined,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid session data",
          details: validationResult.error.flatten().fieldErrors
        });
      }
      
      const validated = validationResult.data;
      const startDate = validated.scheduledStart;
      const endDate = validated.scheduledEnd;
      
      // Additional temporal validation
      if (startDate <= new Date()) {
        return res.status(400).json({ error: "Session must be scheduled in the future" });
      }
      
      if (endDate <= startDate) {
        return res.status(400).json({ error: "End time must be after start time" });
      }
      
      // Max duration check (8 hours)
      const maxDuration = 8 * 60 * 60 * 1000;
      if (endDate.getTime() - startDate.getTime() > maxDuration) {
        return res.status(400).json({ error: "Session duration cannot exceed 8 hours" });
      }
      
      // Generate meeting credentials for when the session starts
      const meetingId = randomBytes(4).toString('hex').toUpperCase();
      const passcode = randomBytes(3).toString('hex').toUpperCase();
      
      // Try to create Google Calendar event
      let googleCalendarEventId: string | null = null;
      let calendarSyncFailed = false;
      try {
        const { createCalendarEvent, isCalendarConnected } = await import('./googleCalendar');
        if (await isCalendarConnected()) {
          googleCalendarEventId = await createCalendarEvent({
            title: `[Garage Talk] ${validated.title}`,
            description: validated.description || `${validated.sessionType} session - Meeting ID: ${meetingId}`,
            startTime: startDate,
            endTime: endDate,
            attendeeEmails: validated.inviteeEmails || [],
          });
          if (!googleCalendarEventId) {
            calendarSyncFailed = true;
          }
        }
      } catch (calError) {
        console.log("Calendar sync not available:", calError);
        calendarSyncFailed = true;
      }
      
      const session = await storage.createScheduledSession({
        title: validated.title,
        description: validated.description || null,
        sessionType: validated.sessionType,
        hostId: userId,
        hostName: user.username,
        scheduledStart: startDate,
        scheduledEnd: endDate,
        meetingId,
        passcode,
        inviteeEmails: validated.inviteeEmails || [],
      });
      
      // Update googleCalendarEventId separately if we have one
      if (googleCalendarEventId && session.id) {
        await storage.updateScheduledSession(session.id, { googleCalendarEventId });
      }
      
      res.json({
        ...session,
        calendarSynced: !!googleCalendarEventId,
        calendarSyncFailed,
      });
    } catch (error) {
      console.error("Error creating scheduled session:", error);
      res.status(500).json({ error: "Failed to schedule session" });
    }
  });
  
  // Get user's scheduled sessions
  app.get("/api/scheduled-sessions", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const sessions = await storage.listUserScheduledSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching scheduled sessions:", error);
      res.status(500).json({ error: "Failed to fetch scheduled sessions" });
    }
  });
  
  // Get upcoming public sessions
  app.get("/api/scheduled-sessions/upcoming", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const sessions = await storage.listUpcomingSessions(limit);
      // Don't expose passcodes
      const safeSessions = sessions.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        sessionType: s.sessionType,
        hostName: s.hostName,
        scheduledStart: s.scheduledStart,
        scheduledEnd: s.scheduledEnd,
        status: s.status,
      }));
      res.json(safeSessions);
    } catch (error) {
      console.error("Error fetching upcoming sessions:", error);
      res.status(500).json({ error: "Failed to fetch upcoming sessions" });
    }
  });
  
  // Get a specific scheduled session
  app.get("/api/scheduled-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getScheduledSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Only show full details (including credentials) to host
      const userId = (req.session as any)?.userId;
      if (userId === session.hostId) {
        res.json(session);
      } else {
        // Public view without credentials
        const { meetingId, passcode, ...publicSession } = session;
        res.json(publicSession);
      }
    } catch (error) {
      console.error("Error fetching scheduled session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });
  
  // Update a scheduled session
  app.patch("/api/scheduled-sessions/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Verify tier - must still have paid subscription
      const user = await storage.getUser(userId);
      if (!user || user.subscriptionTier === "amateur") {
        return res.status(403).json({ 
          error: "Upgrade required",
          message: "Managing scheduled sessions requires a paid subscription" 
        });
      }
      
      const session = await storage.getScheduledSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (session.hostId !== userId) {
        return res.status(403).json({ error: "Only the host can update this session" });
      }
      
      const { title, description, scheduledStart, scheduledEnd, status } = req.body;
      const updates: any = {};
      
      if (title) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (scheduledStart) updates.scheduledStart = new Date(scheduledStart);
      if (scheduledEnd) updates.scheduledEnd = new Date(scheduledEnd);
      if (status) updates.status = status;
      
      const updated = await storage.updateScheduledSession(req.params.id, updates);
      
      // Try to update calendar event only if we have an event ID
      if (session.googleCalendarEventId && (scheduledStart || scheduledEnd || title)) {
        try {
          const { updateCalendarEvent, isCalendarConnected } = await import('./googleCalendar');
          if (await isCalendarConnected()) {
            await updateCalendarEvent(session.googleCalendarEventId, {
              title: title ? `[Garage Talk] ${title}` : undefined,
              startTime: scheduledStart ? new Date(scheduledStart) : undefined,
              endTime: scheduledEnd ? new Date(scheduledEnd) : undefined,
            });
          }
        } catch (calError) {
          console.log("Calendar update not available:", calError);
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating scheduled session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });
  
  // Cancel a scheduled session
  app.delete("/api/scheduled-sessions/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Verify tier - must still have paid subscription
      const user = await storage.getUser(userId);
      if (!user || user.subscriptionTier === "amateur") {
        return res.status(403).json({ 
          error: "Upgrade required",
          message: "Managing scheduled sessions requires a paid subscription" 
        });
      }
      
      const session = await storage.getScheduledSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (session.hostId !== userId) {
        return res.status(403).json({ error: "Only the host can cancel this session" });
      }
      
      // Try to delete calendar event only if we have an event ID
      if (session.googleCalendarEventId) {
        try {
          const { deleteCalendarEvent, isCalendarConnected } = await import('./googleCalendar');
          if (await isCalendarConnected()) {
            await deleteCalendarEvent(session.googleCalendarEventId);
          }
        } catch (calError) {
          console.log("Calendar delete not available:", calError);
        }
      }
      
      const deleted = await storage.deleteScheduledSession(req.params.id, userId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error cancelling scheduled session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });
  
  // Check calendar connection status
  app.get("/api/calendar/status", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const { isCalendarConnected } = await import('./googleCalendar');
      const connected = await isCalendarConnected();
      res.json({ connected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  // Vehicle routes (My Garage)
  app.get("/api/vehicles", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const userVehicles = await storage.getUserVehicles(userId);
      res.json(userVehicles);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  });

  app.get("/api/vehicles/primary", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const vehicle = await storage.getPrimaryVehicle(userId);
      res.json(vehicle || null);
    } catch (error) {
      console.error("Error fetching primary vehicle:", error);
      res.status(500).json({ error: "Failed to fetch primary vehicle" });
    }
  });

  app.get("/api/vehicles/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      if (vehicle.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this vehicle" });
      }
      res.json(vehicle);
    } catch (error) {
      console.error("Error fetching vehicle:", error);
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  });

  app.post("/api/vehicles", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const { insertVehicleSchema } = await import("@shared/schema");
      const validatedData = insertVehicleSchema.parse({
        ...req.body,
        userId,
      });
      
      const newVehicle = await storage.createVehicle(validatedData);
      res.status(201).json(newVehicle);
    } catch (error: any) {
      console.error("Error creating vehicle:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid vehicle data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create vehicle" });
    }
  });

  app.patch("/api/vehicles/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const updatedVehicle = await storage.updateVehicle(req.params.id, userId, req.body);
      if (!updatedVehicle) {
        return res.status(404).json({ error: "Vehicle not found or not authorized" });
      }
      res.json(updatedVehicle);
    } catch (error) {
      console.error("Error updating vehicle:", error);
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  });

  app.delete("/api/vehicles/:id", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const deleted = await storage.deleteVehicle(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Vehicle not found or not authorized" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      res.status(500).json({ error: "Failed to delete vehicle" });
    }
  });

  app.post("/api/vehicles/:id/primary", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const vehicle = await storage.setPrimaryVehicle(req.params.id, userId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found or not authorized" });
      }
      res.json(vehicle);
    } catch (error) {
      console.error("Error setting primary vehicle:", error);
      res.status(500).json({ error: "Failed to set primary vehicle" });
    }
  });

  // Podcast Episode routes
  app.get("/api/podcasts", async (req, res) => {
    try {
      const { category, search, uploaderTier } = req.query;
      const episodes = await storage.listPodcastEpisodes({
        category: category as string,
        search: search as string,
        uploaderTier: uploaderTier as string,
      });
      res.json(episodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch podcast episodes" });
    }
  });

  // Get upload URL (must come before :id route)
  app.get("/api/podcasts/upload-url", async (req, res) => {
    try {
      // Require authentication for podcast uploads
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const objectStorageService = new ObjectStorageService();
      const { uploadURL, audioId } = await objectStorageService.getAudioUploadURL();
      res.json({ uploadURL, audioId });
    } catch (error) {
      console.error("Error getting audio upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/api/podcasts/:id", async (req, res) => {
    try {
      const episode = await storage.getPodcastEpisode(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "Podcast episode not found" });
      }
      await storage.incrementPodcastViews(req.params.id);
      res.json(episode);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch podcast episode" });
    }
  });

  app.post("/api/podcasts", async (req, res) => {
    try {
      // Require authentication first
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Get user to populate uploader info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remove any client-supplied uploader fields (prevent spoofing)
      const { uploaderId: _, uploaderName: __, ...safeBody } = req.body;
      
      // Parse podcast data
      const validated = insertPodcastEpisodeSchema.omit({
        uploaderId: true,
        uploaderName: true,
      }).parse(safeBody);
      
      // Create podcast with server-populated uploader info
      const episode = await storage.createPodcastEpisode({
        ...validated,
        uploaderId: userId,
        uploaderName: user.username,
      });
      res.json(episode);
    } catch (error) {
      console.error("Error creating podcast:", error);
      res.status(400).json({ error: "Invalid podcast data" });
    }
  });

  app.post("/api/podcasts/:id/like", async (req, res) => {
    try {
      await storage.incrementPodcastLikes(req.params.id);
      const episode = await storage.getPodcastEpisode(req.params.id);
      res.json({ likes: episode?.likes || 0 });
    } catch (error) {
      res.status(500).json({ error: "Failed to like podcast" });
    }
  });

  // Serve uploaded audio files
  app.get("/podcasts/:audioId", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.getAudioFile(req.params.audioId);
      await objectStorageService.downloadAudio(file, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Audio file not found" });
      }
      console.error("Error serving audio:", error);
      res.status(500).json({ error: "Failed to serve audio" });
    }
  });

  // Podcast Thread routes
  app.get("/api/podcasts/:episodeId/threads", async (req, res) => {
    try {
      const threads = await storage.listEpisodeThreads(req.params.episodeId);
      res.json(threads);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  });

  app.post("/api/podcasts/:episodeId/threads", async (req, res) => {
    try {
      // Require authentication first
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Get user to check tier and populate author info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Amateur (Free) tier can only read, not create threads
      if (user.subscriptionTier === "amateur") {
        return res.status(403).json({
          error: "Upgrade required",
          message: "Free tier users can read discussions but cannot create threads. Upgrade to Gearhead or higher!",
        });
      }
      
      // Remove any client-supplied author fields (prevent spoofing)
      const { userId: _, username: __, ...safeBody } = req.body;
      
      // Parse thread data
      const validated = insertPodcastThreadSchema.omit({
        userId: true,
        username: true,
      }).parse({
        ...safeBody,
        episodeId: req.params.episodeId,
      });
      
      // Create thread with server-populated author info
      const thread = await storage.createPodcastThread({
        ...validated,
        userId,
        username: user.username,
      });
      res.json(thread);
    } catch (error) {
      console.error("Error creating thread:", error);
      res.status(400).json({ error: "Invalid thread data" });
    }
  });

  // Podcast Comment routes
  app.get("/api/podcasts/threads/:threadId/comments", async (req, res) => {
    try {
      const comments = await storage.listThreadComments(req.params.threadId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/podcasts/threads/:threadId/comments", async (req, res) => {
    try {
      // Require authentication first
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Get user to check tier and populate author info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Amateur (Free) tier can only read, not comment
      if (user.subscriptionTier === "amateur") {
        return res.status(403).json({
          error: "Upgrade required",
          message: "Free tier users can read comments but cannot post. Upgrade to Gearhead or higher!",
        });
      }
      
      // Remove any client-supplied author fields (prevent spoofing)
      const { userId: _, username: __, ...safeBody } = req.body;
      
      // Parse comment data
      const validated = insertPodcastCommentSchema.omit({
        userId: true,
        username: true,
      }).parse({
        ...safeBody,
        threadId: req.params.threadId,
      });
      
      // Create comment with server-populated author info
      const comment = await storage.createPodcastComment({
        ...validated,
        userId,
        username: user.username,
      });
      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  // Chat room routes
  app.get("/api/chat-rooms", async (req, res) => {
    try {
      const rooms = await storage.listChatRooms();
      res.json(rooms);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat rooms" });
    }
  });

  app.get("/api/chat-rooms/:id", async (req, res) => {
    try {
      const room = await storage.getChatRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Chat room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat room" });
    }
  });

  app.get("/api/chat-rooms/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getRoomMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/chat-rooms", async (req, res) => {
    try {
      // Require authentication for chat room creation
      const userId = requireAuth(req, res);
      if (!userId) return;

      // Get user to populate creator info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Parse chat room data
      const validated = insertChatRoomSchema.parse(req.body);
      
      // Create chat room (creator info can be server-populated if needed)
      const room = await storage.createChatRoom(validated);
      res.json(room);
    } catch (error) {
      console.error("Chat room creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid chat room data" });
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("unique") || errorMessage.includes("duplicate")) {
        return res.status(409).json({ error: "A chat room with this name already exists" });
      }
      res.status(400).json({ error: "Failed to create chat room" });
    }
  });

  // Gearhead Agent search route with real YouTube videos and tier enforcement
  app.post("/api/search/ai", async (req, res) => {
    try {
      const { query, vehicleId } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      // Check if AI Integrations is configured
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        console.error('[Gearhead Agent] AI_INTEGRATIONS_OPENAI_API_KEY not configured');
        return res.status(503).json({ 
          error: "Gearhead Agent is currently unavailable",
          message: "AI service is not properly configured. Please contact support or try again later." 
        });
      }

      // Check if user can perform Gearhead Agent search based on their tier
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const searchPermission = await storage.canPerformAiSearch(userId);

      if (!searchPermission.allowed) {
        return res.status(403).json({
          error: "Gearhead Agent limit reached",
          message: `You've reached your daily limit of 5 Gearhead Agent queries on the ${searchPermission.tier} tier. Upgrade to Gearhead, Racing Pro, or Pro for unlimited queries!`,
          tier: searchPermission.tier,
          remaining: 0,
        });
      }

      // Fetch vehicle context if vehicleId provided
      let vehicleContext = "";
      let vehicle = null;
      if (vehicleId) {
        vehicle = await storage.getVehicle(vehicleId, userId);
        if (vehicle) {
          const vehicleInfo = [
            vehicle.year ? `${vehicle.year}` : "",
            vehicle.make,
            vehicle.model,
            vehicle.trim || ""
          ].filter(Boolean).join(" ");
          
          vehicleContext = `\n\nVehicle Context:
- Vehicle: ${vehicleInfo}
- Type: ${vehicle.vehicleType.replace(/_/g, " ")}
- Fuel/Power Type: ${vehicle.fuelType.replace(/_/g, " ")}
${vehicle.vin ? `- VIN: ${vehicle.vin}` : ""}
${vehicle.notes ? `- Owner Notes: ${vehicle.notes}` : ""}`;

          console.log(`[Gearhead Agent] Using vehicle context for: ${vehicleInfo}`);
        }
      }

      // Record the search
      await storage.createSearch({
        userId,
        query,
        isAiSearch: true,
      });

      // Search YouTube for real automotive repair videos (include vehicle info for better results)
      const youtubeSearchQuery = vehicle 
        ? `${vehicle.year || ""} ${vehicle.make} ${vehicle.model} ${query}`.trim()
        : query;
      console.log(`[Gearhead Agent] Processing query: "${query}"${vehicle ? ` for ${vehicle.make} ${vehicle.model}` : ""}`);
      const youtubeVideos = await searchYouTubeVideos(youtubeSearchQuery, 3);
      console.log(`[Gearhead Agent] YouTube search returned ${youtubeVideos.length} videos`);

      // Build system prompt with vehicle-specific and EV-specific knowledge
      const isElectricVehicle = vehicle && ["battery_electric", "hydrogen", "plug_in_hybrid", "hybrid"].includes(vehicle.fuelType);
      const isAircraft = vehicle && ["plane", "helicopter", "personal_flying_vehicle"].includes(vehicle.vehicleType);
      const isDrone = vehicle && ["personal_drone", "commercial_drone"].includes(vehicle.vehicleType);
      
      let specializedKnowledge = "";
      
      if (isElectricVehicle) {
        specializedKnowledge = `\n\nEV/Hybrid Specialized Knowledge:
- For battery electric vehicles, consider battery management system (BMS) issues, charging system faults, thermal management, and high-voltage safety protocols
- Check for regenerative braking calibration issues, electric motor controller faults, and inverter problems
- Battery degradation, cell balancing issues, and state of charge (SOC) calculation errors are common
- High-voltage interlock loops (HVIL), DC-DC converter issues, and onboard charger (OBC) diagnostics
- For plug-in hybrids, consider transitions between EV and ICE modes, and hybrid battery conditioning
- Always reference proper high-voltage safety procedures and PPE requirements`;
      } else if (isAircraft) {
        specializedKnowledge = `\n\nAviation Specialized Knowledge:
- Consider FAA/EASA maintenance requirements and AD (Airworthiness Directive) compliance
- Check logbook entries and time since overhaul (TSO) for relevant components
- Reference applicable aircraft maintenance manuals (AMM) and service bulletins
- Consider environmental factors: altitude, temperature, and humidity effects on systems
- Emphasize safety-critical inspection procedures and proper sign-off requirements`;
      } else if (isDrone) {
        specializedKnowledge = `\n\nDrone/UAV Specialized Knowledge:
- Consider flight controller calibration, ESC tuning, and motor synchronization
- Check battery health, cell balance, and proper discharge/charge cycles
- GPS/GNSS module issues, compass calibration, and interference considerations
- Firmware version compatibility and proper update procedures
- For commercial drones, consider FAA Part 107 compliance and maintenance logging`;
      }

      const systemPrompt = `You are Gearhead, an expert AI companion for mechanics on Garage Talk. You have a friendly, knowledgeable personality like JARVIS or Cortana - professional yet personable, always ready to help.

Your job is to help mechanics troubleshoot vehicle issues by:
1. Understanding their problem description
2. Providing diagnostic insights and likely causes based on current best practices and technical specifications
3. Suggesting next steps for diagnosis
4. Recommending specific parts and accessories from trusted retailers
${vehicleContext ? `\nThe user is asking about a specific vehicle - tailor your response to that vehicle's known issues, specifications, and maintenance requirements.` : ""}
${specializedKnowledge}

When recommending parts, always suggest items from these trusted retailers:
- RockAuto (rockauto.com) - Great for OEM and aftermarket parts at competitive prices
- Summit Racing (summitracing.com) - Excellent for performance parts and accessories
- AutoZone (autozone.com) - Convenient for common parts with same-day availability
- Amazon (amazon.com) - Wide selection with fast shipping
- Google Shopping (google.com/shopping) - Price comparison across multiple vendors

Respond in JSON format with these fields:
- diagnosis: Detailed explanation of the likely issue (2-3 paragraphs, be specific and technical, reference the specific vehicle if provided). Start with a friendly acknowledgment like "I see what you're dealing with" or "Good catch noticing that issue".
- possibleCauses: Array of specific possible causes with brief explanations (strings, 3-5 items)
- nextSteps: Array of specific diagnostic steps to take (strings, 3-5 items)
- partsRecommendations: Array of objects with {name: string, description: string, retailers: [{name: string, searchUrl: string}]} - recommend 2-4 relevant parts/tools needed for the repair. For searchUrl, create direct search URLs to the retailers (e.g., "https://www.rockauto.com/en/catalog/search?query=brake+pads+2019+honda+civic")
${isElectricVehicle ? "- evSafetyNotes: Array of relevant high-voltage safety considerations (strings, 2-3 items)" : ""}`;

      // Using gpt-4o-mini via Replit AI Integrations
      console.log('[Gearhead Agent] Calling OpenAI API...');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Provide a detailed diagnostic analysis for this ${vehicle ? `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}` : "automotive"} issue, including current best practices and technical specifications: ${query}${vehicleContext}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 8192,
      });

      const aiResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
      console.log('[Gearhead Agent] OpenAI response received, sending results');

      // Only increment search count after successful completion
      await storage.incrementAiSearchCount(userId);

      res.json({
        query,
        vehicle: vehicle ? {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vehicleType: vehicle.vehicleType,
          fuelType: vehicle.fuelType,
        } : null,
        diagnosis: aiResponse.diagnosis || "Unable to provide diagnosis at this time.",
        possibleCauses: aiResponse.possibleCauses || ["Check the diagnosis above for details"],
        recommendedVideos: youtubeVideos,
        nextSteps: aiResponse.nextSteps || [
          "Review the diagnostic information above",
          "Check related videos for visual guidance",
          "Consult vehicle service manual for specifications",
        ],
        partsRecommendations: aiResponse.partsRecommendations || [],
        evSafetyNotes: aiResponse.evSafetyNotes || null,
      });
    } catch (error) {
      console.error("Gearhead Agent error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        error: "Failed to process Gearhead Agent search",
        details: errorMessage 
      });
    }
  });

  // Regular search route
  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      // Record the search (requires authentication)
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      await storage.createSearch({
        userId,
        query,
        isAiSearch: false,
      });

      // Simple fuzzy search through videos
      const videos = await storage.listVideos({ search: query });
      
      res.json({ results: videos });
    } catch (error) {
      res.status(500).json({ error: "Failed to search videos" });
    }
  });

  // Web search route - uses OpenAI to find internet resources
  app.post("/api/search/web", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      // Check if AI is configured
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ 
          error: "Web search is currently unavailable",
          message: "AI service is not properly configured." 
        });
      }

      // Authentication required
      const userId = requireAuth(req, res);
      if (!userId) return;

      // Record the search
      await storage.createSearch({
        userId,
        query,
        isAiSearch: true,
      });

      // Use OpenAI to generate comprehensive automotive resource recommendations
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an automotive expert assistant. When given a search query about cars, trucks, or automotive repair, provide a JSON response with helpful resources. Include:
            1. A list of recommended YouTube video topics/searches that would help
            2. Key websites and forums for automotive help
            3. Relevant repair guides and resources
            4. Related search terms to explore
            
            Format your response as JSON with this structure:
            {
              "summary": "Brief overview of what the user is looking for",
              "videoSuggestions": [
                { "title": "Video topic title", "description": "What this video would cover", "searchTerm": "YouTube search term" }
              ],
              "websites": [
                { "name": "Website name", "url": "URL", "description": "What this resource offers" }
              ],
              "guides": [
                { "title": "Guide title", "description": "What this guide covers" }
              ],
              "relatedSearches": ["related term 1", "related term 2"]
            }`
          },
          {
            role: "user",
            content: `Find automotive videos and resources for: ${query}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const aiResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");

      res.json({
        query,
        ...aiResponse,
      });
    } catch (error) {
      console.error("Web search error:", error);
      res.status(500).json({ error: "Failed to perform web search" });
    }
  });

  // Stripe subscription routes
  app.post("/api/create-subscription", async (req, res) => {
    try {
      const { tier } = req.body;
      
      if (!tier || !TIER_PRICES[tier]) {
        return res.status(400).json({ error: "Invalid tier" });
      }

      // Get authenticated user from session
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated. Please sign in first." });
      }
      
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const tierInfo = TIER_PRICES[tier];
      console.log('[Stripe] Creating checkout session for tier:', tier, 'Amount:', tierInfo.amount);

      const stripe = await getUncachableStripeClient();

      // Create or get Stripe customer
      let customerId = user.stripeCustomerId;
      
      if (customerId) {
        // Verify the customer exists in current Stripe environment (handles test->prod migration)
        try {
          await stripe.customers.retrieve(customerId);
        } catch (verifyError: any) {
          if (verifyError?.code === 'resource_missing') {
            console.log('[Stripe] Customer not found in current environment, creating new customer');
            customerId = null; // Force creation of new customer
          } else {
            throw verifyError;
          }
        }
      }
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId, username: user.username },
        });
        customerId = customer.id;
        
        await storage.updateUser(userId, { 
          stripeCustomerId: customerId 
        });
        console.log('[Stripe] Created new customer:', customerId);
      }

      // Get the host URL for redirect
      const host = req.get('host');
      const protocol = req.protocol;
      const baseUrl = `${protocol}://${host}`;

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: tierInfo.name,
              description: `Monthly subscription to ${tierInfo.name}`,
            },
            unit_amount: tierInfo.amount,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
        cancel_url: `${baseUrl}/subscription/cancel`,
        metadata: {
          userId,
          tier,
        },
      });

      console.log('[Stripe] Checkout session created:', session.id);

      res.json({ 
        url: session.url,
        sessionId: session.id,
      });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // Tip/Gift checkout routes
  app.post("/api/tips/checkout", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { recipientId, giftType, giftName, amount, context, contextId } = req.body;

      if (!recipientId || !giftType || !giftName || !amount || !context) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (typeof amount !== "number" || amount < 100) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const senderId = req.session.userId;
      if (senderId === recipientId) {
        return res.status(400).json({ error: "Cannot send a gift to yourself" });
      }

      const sender = await storage.getUser(senderId);
      const recipient = await storage.getUser(recipientId);
      if (!sender || !recipient) {
        return res.status(404).json({ error: "User not found" });
      }

      const stripe = await getUncachableStripeClient();
      const host = req.get('host');
      const protocol = req.protocol;
      const baseUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${giftName} Gift for ${recipient.username}`,
              description: `Tip from ${sender.username} to ${recipient.username}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/tip/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/tip/cancel`,
        metadata: {
          type: 'tip',
          senderId,
          recipientId,
          giftType,
          giftName,
          context,
          contextId: contextId || '',
        },
      });

      await storage.createTip({
        senderId,
        recipientId,
        giftType,
        giftName,
        amount,
        currency: 'usd',
        context,
        contextId: contextId || null,
        stripeSessionId: session.id,
        status: 'pending',
      });

      console.log('[Tips] Checkout session created:', session.id, `${sender.username} -> ${recipient.username}`);
      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Tip checkout error:", error);
      res.status(500).json({ error: error.message || "Failed to create tip checkout" });
    }
  });

  app.post("/api/tips/complete", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid') {
        await storage.updateTipStatus(sessionId, 'completed');
        res.json({ success: true, status: 'completed' });
      } else {
        res.json({ success: false, status: session.payment_status });
      }
    } catch (error: any) {
      console.error("Tip completion error:", error);
      res.status(500).json({ error: "Failed to verify tip payment" });
    }
  });

  app.get("/api/tips/received/:userId", async (req, res) => {
    try {
      const tips = await storage.getTipsReceived(req.params.userId);
      res.json(tips);
    } catch (error) {
      console.error("Get tips error:", error);
      res.status(500).json({ error: "Failed to get tips" });
    }
  });

  app.get("/api/tips/sent", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const tips = await storage.getTipsSent(req.session.userId);
      res.json(tips);
    } catch (error) {
      console.error("Get sent tips error:", error);
      res.status(500).json({ error: "Failed to get sent tips" });
    }
  });

  // Get Stripe publishable key for frontend
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("Failed to get Stripe publishable key:", error);
      res.status(500).json({ error: "Payment system not configured" });
    }
  });

  // Handle successful checkout - update user subscription
  app.post("/api/subscription/complete", async (req, res) => {
    try {
      const { sessionId, tier } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }

      console.log('[Stripe] Processing subscription completion for session:', sessionId);

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer']
      });

      console.log('[Stripe] Session retrieved:', {
        paymentStatus: session.payment_status,
        userId: session.metadata?.userId,
        tier: session.metadata?.tier,
        customerId: session.customer,
        subscriptionId: session.subscription
      });

      if (session.payment_status !== 'paid') {
        console.log('[Stripe] Payment not completed, status:', session.payment_status);
        return res.status(400).json({ error: "Payment not completed" });
      }

      // Get userId from session metadata (this is the source of truth)
      const userId = session.metadata?.userId;
      const sessionTier = session.metadata?.tier || tier;
      
      if (!userId) {
        console.error('[Stripe] No userId found in session metadata');
        return res.status(400).json({ error: "Invalid session - no user ID" });
      }

      // Verify the user exists
      const user = await storage.getUser(userId);
      if (!user) {
        console.error('[Stripe] User not found:', userId);
        return res.status(404).json({ error: "User not found" });
      }

      // Get customer ID as string
      const customerId = typeof session.customer === 'string' 
        ? session.customer 
        : session.customer?.id;
      
      // Get subscription ID as string
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

      // Update user's subscription tier, customer ID, and subscription ID
      await storage.updateUser(userId, {
        subscriptionTier: sessionTier as "amateur" | "gearhead" | "racing_pro" | "pro",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      console.log('[Stripe] User subscription updated:', {
        userId,
        tier: sessionTier,
        customerId,
        subscriptionId
      });

      res.json({ 
        success: true,
        tier: sessionTier,
      });
    } catch (error: any) {
      console.error("Subscription complete error:", error);
      res.status(500).json({ error: error.message || "Failed to complete subscription" });
    }
  });

  // Get user's current subscription status
  app.get("/api/subscription-status", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        tier: user.subscriptionTier || 'amateur',
        hasActiveSubscription: user.subscriptionTier !== 'amateur',
      });
    } catch (error: any) {
      console.error("[Subscription Status] Error:", error);
      res.status(500).json({ error: error.message || "Failed to get subscription status" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/dashboard/activity", async (req, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      
      // Get recent searches
      const searches = await storage.getUserSearches(userId, 5);
      
      // Get recent videos uploaded by user
      const videos = await storage.getUserVideos(userId);
      
      // Return uploads and searches in the format expected by the Dashboard
      res.json({
        uploads: videos,
        searches: searches.map(s => ({
          query: s.query,
          timestamp: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "",
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  // Authentication routes
  app.post("/api/auth/sign-up", async (req, res) => {
    try {
      const { username, password, email, city } = req.body;
      
      if (!username || typeof username !== "string") {
        return res.status(400).json({ error: "Username is required" });
      }
      
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      
      if (!city || typeof city !== "string") {
        return res.status(400).json({ error: "City is required" });
      }
      
      if (username.trim().length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      
      // Check if email already exists
      const existingUserWithEmail = await storage.getUserByEmail(email.trim().toLowerCase());
      if (existingUserWithEmail) {
        return res.status(409).json({ error: "Email already in use" });
      }
      
      // Hash the password before storing
      const hashedPassword = await hashPassword(password);
      
      const user = await storage.createUser({
        username: username.trim(),
        password: hashedPassword,
        email: email.trim().toLowerCase(),
        city: city.trim(),
        subscriptionTier: "amateur",
      });
      
      // Log the email signup for tracking
      try {
        const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        await storage.logEmailSignup({
          email: email.trim().toLowerCase(),
          userId: user.id,
          username: username.trim(),
          ipAddress,
          userAgent,
          city: city.trim(),
          signupMethod: "email",
        });
      } catch (logError) {
        console.error("Failed to log email signup:", logError);
      }
      
      // Create session
      req.session.userId = user.id;
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("already taken")) {
        return res.status(409).json({ error: "Username already taken" });
      }
      console.error("Sign-up error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/sign-in", async (req, res) => {
    try {
      const { username, password, rememberMe } = req.body;
      
      if (!username || typeof username !== "string") {
        return res.status(400).json({ error: "Username is required" });
      }
      
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      
      const user = await storage.getUserByUsername(username.trim());
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Compare the password with the hashed password
      const passwordMatches = await comparePassword(password, user.password);
      if (!passwordMatches) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Create session
      req.session.userId = user.id;
      
      // If "Remember me" is checked, extend session to 30 days
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Sign-in error:", error);
      res.status(500).json({ error: "Failed to sign in" });
    }
  });

  app.post("/api/auth/email-sign-in", async (req, res) => {
    try {
      const { email, password, rememberMe } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      const passwordMatches = await comparePassword(password, user.password);
      if (!passwordMatches) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      req.session.userId = user.id;
      
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Email sign-in error:", error);
      res.status(500).json({ error: "Failed to sign in" });
    }
  });

  app.post("/api/auth/sign-out", async (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error("Sign-out error:", err);
          return res.status(500).json({ error: "Failed to sign out" });
        }
        res.json({ message: "Signed out successfully" });
      });
    } catch (error) {
      console.error("Sign-out error:", error);
      res.status(500).json({ error: "Failed to sign out" });
    }
  });

  // Helper function to normalize phone numbers
  function normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except leading +
    const hasPlus = phone.startsWith('+');
    const digits = phone.replace(/\D/g, '');
    
    if (hasPlus) {
      // International format provided
      return `+${digits}`;
    } else if (digits.length === 10) {
      // US number without country code (e.g., 4155551234)
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      // US number with country code but no + (e.g., 14155551234)
      return `+${digits}`;
    } else {
      // Assume it's international without the +
      return `+${digits}`;
    }
  }

  // Phone authentication - request OTP
  app.post("/api/auth/phone/request-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phone);
      
      // Validate phone number format (basic E.164 validation)
      if (!/^\+[1-9]\d{6,14}$/.test(normalizedPhone)) {
        return res.status(400).json({ error: "Invalid phone number. Please enter a valid phone number." });
      }
      
      const client = getTwilioClient();
      if (!client) {
        console.error('[Twilio] Client not available - check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
        return res.status(503).json({ error: "SMS service is not configured. Please contact support." });
      }
      
      // Generate OTP and store it
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      await storage.createPhoneVerificationToken({
        phone: normalizedPhone,
        code,
        expiresAt,
      });
      
      // Send SMS via Twilio
      try {
        await client.messages.create({
          body: `Your Garage Talk verification code is: ${code}. It expires in 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: normalizedPhone,
        });
      } catch (smsError) {
        console.error("SMS send error:", smsError);
        return res.status(500).json({ error: "Failed to send verification code. Please try again." });
      }
      
      res.json({ message: "Verification code sent", phone: normalizedPhone });
    } catch (error) {
      console.error("Request OTP error:", error);
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  // Phone authentication - verify OTP and sign in
  app.post("/api/auth/phone/verify-otp", async (req, res) => {
    try {
      const { phone, code, username } = req.body;
      
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Verification code is required" });
      }
      
      const normalizedPhone = normalizePhoneNumber(phone);
      
      // Verify the OTP
      const tokenRecord = await storage.getPhoneVerificationToken(normalizedPhone, code);
      
      if (!tokenRecord) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      if (tokenRecord.used) {
        return res.status(400).json({ error: "This code has already been used" });
      }
      
      if (new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ error: "Verification code has expired" });
      }
      
      // Check if user exists with this phone number BEFORE marking token as used
      let user = await storage.getUserByPhone(normalizedPhone);
      
      if (!user) {
        // For new users, check if username is provided
        if (!username || typeof username !== "string" || username.trim().length < 3) {
          // Don't mark token as used yet - user needs to provide username
          return res.status(400).json({ error: "Username is required for new accounts (min 3 characters)", needsUsername: true });
        }
        
        // Generate a random password for phone-only users
        const randomPassword = randomBytes(32).toString('hex');
        const hashedPassword = await hashPassword(randomPassword);
        
        user = await storage.createUser({
          username: username.trim(),
          password: hashedPassword,
          subscriptionTier: "amateur",
        });
        
        // Update user with phone number
        await storage.updateUserPhone(user.id, normalizedPhone);
        user = await storage.getUser(user.id);
        
        // Log the phone signup for tracking
        try {
          const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || null;
          const userAgent = req.headers['user-agent'] || null;
          await storage.logEmailSignup({
            email: normalizedPhone, // Store phone number in email field for phone signups
            userId: user!.id,
            username: username.trim(),
            ipAddress,
            userAgent,
            signupMethod: "phone",
          });
        } catch (logError) {
          console.error("Failed to log phone signup:", logError);
        }
      }
      
      if (!user) {
        return res.status(500).json({ error: "Failed to create or find user" });
      }
      
      // Now mark token as used since we're completing the sign-in
      await storage.markPhoneVerificationTokenUsed(tokenRecord.id);
      
      // Create session
      req.session.userId = user.id;
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("already taken")) {
        return res.status(409).json({ error: "Username already taken" });
      }
      console.error("Verify OTP error:", error);
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  // Add phone to existing user account (verify and link)
  app.post("/api/users/profile/verify-phone", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { phone, code } = req.body;
      
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Verification code is required" });
      }
      
      const normalizedPhone = normalizePhoneNumber(phone);
      
      // Check if phone is already used by another user
      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({ error: "Phone number already in use by another account" });
      }
      
      // Verify the OTP
      const tokenRecord = await storage.getPhoneVerificationToken(normalizedPhone, code);
      
      if (!tokenRecord) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      if (tokenRecord.used) {
        return res.status(400).json({ error: "This code has already been used" });
      }
      
      if (new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ error: "Verification code has expired" });
      }
      
      // Mark token as used
      await storage.markPhoneVerificationTokenUsed(tokenRecord.id);
      
      // Update user's phone
      await storage.updateUserPhone(userId, normalizedPhone);
      
      const updatedUser = await storage.getUser(userId);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Verify phone error:", error);
      res.status(500).json({ error: "Failed to verify phone" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      
      if (!user) {
        return res.json({ message: "If an account with that email exists, we've sent a password reset link." });
      }
      
      await storage.deleteExpiredTokens();
      
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
      });
      
      try {
        await sendPasswordResetEmail(email, token, user.username);
        res.json({ message: "If an account with that email exists, we've sent a password reset link." });
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
        // Return error to user so they know email failed
        res.status(500).json({ error: "Failed to send password reset email. Please try again later or contact support." });
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Reset token is required" });
      }
      
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      const tokenRecord = await storage.getPasswordResetToken(token);
      
      if (!tokenRecord) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      if (tokenRecord.used) {
        return res.status(400).json({ error: "This reset token has already been used" });
      }
      
      if (new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ error: "This reset token has expired" });
      }
      
      const hashedPassword = await hashPassword(password);
      
      await storage.updateUserPassword(tokenRecord.userId, hashedPassword);
      
      await storage.markTokenAsUsed(token);
      
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // User profile routes
  // Get current user from session
  app.get("/api/users/current", async (req, res) => {
    try {
      // Check if user is authenticated via session
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        // Session references non-existent user, clear it
        req.session.destroy(() => {});
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Get all users with presence status
  app.get("/api/users/presence", async (req, res) => {
    try {
      const allUsers = await storage.getAllUsersWithPresence();
      
      // Return users with sanitized data (no passwords) and presence info
      const usersWithPresence = allUsers.map(user => {
        const { password, ...userWithoutPassword } = user;
        return {
          ...userWithoutPassword,
          isOnline: user.isOnline ?? false,
          lastSeen: user.lastSeen,
        };
      });
      
      res.json(usersWithPresence);
    } catch (error) {
      console.error("Error fetching users presence:", error);
      res.status(500).json({ error: "Failed to fetch presence data" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Don't send password to client
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const { username, subscriptionTier, avatarUrl, avatarType, city, avatarColor, bio, email } = req.body;
      const updates: { username?: string; subscriptionTier?: "amateur" | "gearhead" | "racing_pro" | "pro"; avatarUrl?: string; avatarType?: "color" | "image" | "animated"; city?: string; avatarColor?: string; bio?: string; email?: string } = {};
      
      // Validate email if provided
      if (email !== undefined) {
        if (typeof email !== "string") {
          return res.status(400).json({ error: "Email must be a string" });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: "Please enter a valid email address" });
        }
        // Check if email is already in use by another user
        const existingUser = await storage.getUserByEmail(email.trim().toLowerCase());
        if (existingUser && existingUser.id !== req.params.id) {
          return res.status(409).json({ error: "Email already in use by another account" });
        }
        updates.email = email.trim().toLowerCase();
      }
      
      // Validate username if provided
      if (username !== undefined) {
        if (typeof username !== "string") {
          return res.status(400).json({ error: "Username must be a string" });
        }
        
        if (username.trim().length < 3) {
          return res.status(400).json({ error: "Username must be at least 3 characters" });
        }
        
        if (username.trim().length > 50) {
          return res.status(400).json({ error: "Username must be at most 50 characters" });
        }
        
        updates.username = username.trim();
      }
      
      // Validate subscriptionTier if provided
      if (subscriptionTier !== undefined) {
        const validTiers = ["amateur", "gearhead", "racing_pro", "pro"];
        if (!validTiers.includes(subscriptionTier)) {
          return res.status(400).json({ error: "Invalid subscription tier" });
        }
        updates.subscriptionTier = subscriptionTier;
      }

      // Validate avatarUrl if provided
      if (avatarUrl !== undefined) {
        if (typeof avatarUrl !== "string") {
          return res.status(400).json({ error: "Avatar URL must be a string" });
        }
        updates.avatarUrl = avatarUrl;
      }

      // Validate avatarType if provided
      if (avatarType !== undefined) {
        const validTypes = ["color", "image", "animated"];
        if (!validTypes.includes(avatarType)) {
          return res.status(400).json({ error: "Invalid avatar type. Must be one of: color, image, animated" });
        }
        updates.avatarType = avatarType;
      }

      // Validate city if provided
      if (city !== undefined) {
        if (typeof city !== "string") {
          return res.status(400).json({ error: "City must be a string" });
        }
        if (city.trim().length > 100) {
          return res.status(400).json({ error: "City must be at most 100 characters" });
        }
        updates.city = city.trim();
      }

      // Validate avatarColor if provided
      if (avatarColor !== undefined) {
        if (typeof avatarColor !== "string") {
          return res.status(400).json({ error: "Avatar color must be a string" });
        }
        // Validate hex color format
        if (!/^#[0-9A-Fa-f]{6}$/.test(avatarColor)) {
          return res.status(400).json({ error: "Avatar color must be a valid hex color (e.g., #3b82f6)" });
        }
        updates.avatarColor = avatarColor;
      }

      // Validate bio if provided
      if (bio !== undefined) {
        if (typeof bio !== "string") {
          return res.status(400).json({ error: "Bio must be a string" });
        }
        if (bio.trim().length > 200) {
          return res.status(400).json({ error: "Bio must be at most 200 characters" });
        }
        updates.bio = bio.trim();
      }
      
      // Require at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      
      const updatedUser = await storage.updateUser(req.params.id, updates);
      
      // Don't send password to client
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("already taken")) {
        return res.status(409).json({ error: errorMessage });
      }
      if (errorMessage.includes("not found")) {
        return res.status(404).json({ error: errorMessage });
      }
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // WebSocket server for real-time chat
  // Set up on distinct path to avoid conflict with Vite HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Track connected clients by room
  const roomConnections = new Map<string, Set<WebSocket>>();

  // Track active streams for native WebRTC streaming
  interface ActiveStream {
    streamId: string;
    broadcasterWs: WebSocket;
    broadcasterUsername: string;
    broadcasterUserId: string | null;
    title: string;
    startedAt: Date;
    viewerCount: number;
    streamType: 'camera' | 'screen';
  }
  const activeStreams = new Map<string, ActiveStream>();
  const streamViewers = new Map<string, Set<WebSocket>>();
  const wsToStreamId = new Map<WebSocket, string>();

  // Global presence manager - tracks connected users across all rooms
  interface PresenceEntry {
    connectionCount: number;
    lastSeen: Date;
    username: string;
    offlineTimeout?: NodeJS.Timeout;
  }
  const userPresence = new Map<string, PresenceEntry>();
  const wsToUserId = new Map<WebSocket, string>();

  // Helper to broadcast presence updates to all connected clients
  function broadcastPresence(userId: string, username: string, isOnline: boolean) {
    const message = JSON.stringify({
      type: "presence",
      userId,
      username,
      isOnline,
      timestamp: new Date().toISOString(),
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Mark user as online (called when WebSocket connects with userId)
  async function markUserOnline(userId: string, username: string, ws: WebSocket) {
    const existing = userPresence.get(userId);
    
    // Clear any pending offline timeout
    if (existing?.offlineTimeout) {
      clearTimeout(existing.offlineTimeout);
    }
    
    if (existing) {
      // Increment connection count
      existing.connectionCount++;
      existing.lastSeen = new Date();
      existing.username = username;
    } else {
      // First connection for this user
      userPresence.set(userId, {
        connectionCount: 1,
        lastSeen: new Date(),
        username,
      });
      // Update database and broadcast
      await storage.setUserOnline(userId);
      broadcastPresence(userId, username, true);
    }
    
    wsToUserId.set(ws, userId);
  }

  // Mark user as offline (called when WebSocket disconnects)
  async function markUserOffline(ws: WebSocket) {
    const userId = wsToUserId.get(ws);
    if (!userId) return;
    
    wsToUserId.delete(ws);
    
    const entry = userPresence.get(userId);
    if (!entry) return;
    
    entry.connectionCount--;
    entry.lastSeen = new Date();
    
    if (entry.connectionCount <= 0) {
      // Apply grace period before marking fully offline (handles reconnects)
      entry.offlineTimeout = setTimeout(async () => {
        const currentEntry = userPresence.get(userId);
        if (currentEntry && currentEntry.connectionCount <= 0) {
          await storage.setUserOffline(userId);
          broadcastPresence(userId, currentEntry.username, false);
          userPresence.delete(userId);
        }
      }, 5000); // 5 second grace period
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    let currentRoom: string | null = null;
    let currentUsername = "Anonymous";
    let currentUserId: string | null = null;
    let currentUserCity: string | null = null;

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "joinSpatial":
            // Join spatial chat room
            currentRoom = message.roomId;
            currentUsername = message.username || "Anonymous";
            currentUserId = message.userId || null;
            currentUserCity = message.userCity || null;
            
            // Track user presence (only for authenticated users)
            if (currentUserId && !currentUserId.startsWith('guest-')) {
              await markUserOnline(currentUserId, currentUsername, ws);
            }
            
            // Fetch user data from database if userId is provided
            let userAvatarUrl: string | null = null;
            let userAvatarType: string = "color";
            let userBio: string | null = null;
            if (currentUserId && !currentUserCity) {
              const user = await storage.getUser(currentUserId);
              currentUserCity = user?.city || null;
              userAvatarUrl = user?.avatarUrl || null;
              userAvatarType = user?.avatarType || "color";
              userBio = user?.bio || null;
            }
            
            if (currentRoom) {
              if (!roomConnections.has(currentRoom)) {
                roomConnections.set(currentRoom, new Set());
              }
              roomConnections.get(currentRoom)?.add(ws);

              // Add participant to storage with user profile data
              const participant = await storage.joinRoom({
                roomId: currentRoom,
                userId: currentUserId || "anonymous",
                username: currentUsername,
                x: message.x || "400",
                y: message.y || "300",
                avatarColor: message.avatarColor || "#3b82f6",
                avatarUrl: userAvatarUrl || message.avatarUrl || null,
                avatarType: userAvatarType || message.avatarType || "color",
                expression: null,
                customExpressionUrl: null,
                bio: userBio || message.bio || null,
              });

              // Send current participants to new user
              const participants = await storage.getRoomParticipants(currentRoom);
              ws.send(JSON.stringify({
                type: "participants",
                participants,
              }));

              // Broadcast new participant to all others
              broadcast(currentRoom, {
                type: "participantJoined",
                participant,
              });

              // Send message history
              const history = await storage.getRoomMessages(currentRoom);
              ws.send(JSON.stringify({
                type: "history",
                messages: history,
              }));
            }
            break;

          case "position":
            // Update avatar position
            if (currentRoom && message.x !== undefined && message.y !== undefined && currentUserId) {
              await storage.updateParticipantPosition(
                currentRoom,
                currentUserId,
                parseFloat(message.x),
                parseFloat(message.y)
              );

              // Broadcast position update
              broadcast(currentRoom, {
                type: "positionUpdate",
                userId: currentUserId,
                x: message.x,
                y: message.y,
              });
            }
            break;

          case "expression":
            // Update avatar expression for spatial chat
            if (currentRoom && currentUserId) {
              await storage.updateParticipantExpression(
                currentRoom,
                currentUserId,
                message.expression || null,
                message.customExpressionUrl || null
              );

              // Broadcast expression update to all participants
              broadcast(currentRoom, {
                type: "expressionUpdate",
                userId: currentUserId,
                expression: message.expression,
                customExpressionUrl: message.customExpressionUrl,
              });
            }
            break;

          case "join":
            // Leave previous room if any
            if (currentRoom && roomConnections.has(currentRoom)) {
              roomConnections.get(currentRoom)?.delete(ws);
            }

            // Join new room
            currentRoom = message.roomId;
            currentUsername = message.username || "Anonymous";
            currentUserId = message.userId || null;
            currentUserCity = message.city || null;
            
            // Track user presence (only for authenticated users)
            if (currentUserId && !currentUserId.startsWith('guest-')) {
              await markUserOnline(currentUserId, currentUsername, ws);
            }
            
            // Store user profile data for regular chat
            let currentAvatarUrl: string | null = message.avatarUrl || null;
            let currentAvatarColor: string | null = message.avatarColor || null;
            let currentBio: string | null = message.bio || null;
            
            // If userId provided but no profile data, fetch from database
            if (currentUserId && (!currentAvatarUrl || !currentUserCity)) {
              const chatUser = await storage.getUser(currentUserId);
              if (chatUser) {
                currentAvatarUrl = currentAvatarUrl || chatUser.avatarUrl || null;
                currentAvatarColor = currentAvatarColor || chatUser.avatarColor || null;
                currentUserCity = currentUserCity || chatUser.city || null;
                currentBio = currentBio || chatUser.bio || null;
              }
            }
            
            // Store profile data in connection context for later messages
            (ws as any).chatProfile = {
              avatarUrl: currentAvatarUrl,
              avatarColor: currentAvatarColor,
              bio: currentBio,
              city: currentUserCity,
            };
            
            if (currentRoom) {
              if (!roomConnections.has(currentRoom)) {
                roomConnections.set(currentRoom, new Set());
              }
              roomConnections.get(currentRoom)?.add(ws);

              // Send system message
              const joinMsg = await storage.createMessage({
                roomId: currentRoom,
                userId: currentUserId || "system",
                username: "System",
                content: `${currentUsername} joined the room`,
                isSystem: true,
              });

              // Broadcast to all in room
              broadcast(currentRoom, {
                type: "message",
                message: joinMsg,
              });

              // Send message history with enriched user profiles
              const history = await storage.getRoomMessages(currentRoom);
              
              // Enrich history messages with user profile data
              const historyUserIds = Array.from(new Set(history.map(m => m.userId).filter(id => id !== 'system' && id !== 'anonymous')));
              const historyProfiles = new Map<string, {avatarUrl: string | null, avatarColor: string | null, bio: string | null}>();
              
              for (const historyUserId of historyUserIds) {
                const historyUser = await storage.getUser(historyUserId);
                if (historyUser) {
                  historyProfiles.set(historyUserId, {
                    avatarUrl: historyUser.avatarUrl || null,
                    avatarColor: historyUser.avatarColor || null,
                    bio: historyUser.bio || null,
                  });
                }
              }
              
              const enrichedHistory = history.map(msg => ({
                ...msg,
                avatarUrl: historyProfiles.get(msg.userId)?.avatarUrl || null,
                avatarColor: historyProfiles.get(msg.userId)?.avatarColor || null,
                bio: historyProfiles.get(msg.userId)?.bio || null,
              }));
              
              ws.send(JSON.stringify({
                type: "history",
                messages: enrichedHistory,
              }));
            }
            break;

          case "message":
            if (currentRoom) {
              const chatProfile = (ws as any).chatProfile || {};
              const newMsg = await storage.createMessage({
                roomId: currentRoom,
                userId: currentUserId || "anonymous",
                username: currentUsername,
                userCity: currentUserCity || chatProfile.city || undefined,
                content: message.content,
              });

              // Augment message with profile data for display
              const augmentedMsg = {
                ...newMsg,
                avatarUrl: chatProfile.avatarUrl || null,
                avatarColor: chatProfile.avatarColor || null,
                bio: chatProfile.bio || null,
              };

              broadcast(currentRoom, {
                type: "message",
                message: augmentedMsg,
              });
            }
            break;

          case "leave":
            if (currentRoom) {
              roomConnections.get(currentRoom)?.delete(ws);
              
              const leaveMsg = await storage.createMessage({
                roomId: currentRoom,
                userId: currentUserId || "system",
                username: "System",
                content: `${currentUsername} left the room`,
                isSystem: true,
              });

              broadcast(currentRoom, {
                type: "message",
                message: leaveMsg,
              });

              currentRoom = null;
            }
            break;

          case "leaveSpatial":
            // Leave spatial chat room
            if (currentRoom && currentUserId) {
              await storage.leaveRoom(currentRoom, currentUserId);
              roomConnections.get(currentRoom)?.delete(ws);

              // Broadcast participant left
              broadcast(currentRoom, {
                type: "participantLeft",
                userId: currentUserId,
              });

              currentRoom = null;
            }
            break;

          // Native WebRTC Streaming - Create a stream
          case "createStream": {
            const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const stream: ActiveStream = {
              streamId,
              broadcasterWs: ws,
              broadcasterUsername: message.username || currentUsername || "Anonymous",
              broadcasterUserId: message.userId || currentUserId,
              title: message.title || "Live Stream",
              startedAt: new Date(),
              viewerCount: 0,
              streamType: message.streamType || 'camera',
            };
            activeStreams.set(streamId, stream);
            streamViewers.set(streamId, new Set());
            wsToStreamId.set(ws, streamId);

            ws.send(JSON.stringify({
              type: "streamCreated",
              streamId,
              title: stream.title,
            }));

            // Broadcast to all connected clients about new stream
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "newStreamAvailable",
                  stream: {
                    streamId,
                    broadcasterUsername: stream.broadcasterUsername,
                    title: stream.title,
                    startedAt: stream.startedAt,
                    viewerCount: 0,
                    streamType: stream.streamType,
                  },
                }));
              }
            });
            break;
          }

          // Native WebRTC Streaming - Join as viewer
          case "joinStream": {
            const stream = activeStreams.get(message.streamId);
            if (!stream) {
              ws.send(JSON.stringify({
                type: "error",
                message: "Stream not found",
              }));
              break;
            }

            streamViewers.get(message.streamId)?.add(ws);
            wsToStreamId.set(ws, message.streamId);
            stream.viewerCount++;

            // Notify broadcaster that a viewer wants to connect
            stream.broadcasterWs.send(JSON.stringify({
              type: "viewerJoined",
              viewerId: message.viewerId || `viewer_${Date.now()}`,
              streamId: message.streamId,
            }));

            ws.send(JSON.stringify({
              type: "joinedStream",
              streamId: message.streamId,
              broadcasterUsername: stream.broadcasterUsername,
              title: stream.title,
            }));
            break;
          }

          // WebRTC signaling - Offer
          case "rtcOffer": {
            const stream = activeStreams.get(message.streamId);
            if (!stream) break;

            // Send offer to specific viewer (from broadcaster)
            streamViewers.get(message.streamId)?.forEach((viewer) => {
              if (viewer.readyState === WebSocket.OPEN) {
                viewer.send(JSON.stringify({
                  type: "rtcOffer",
                  offer: message.offer,
                  streamId: message.streamId,
                }));
              }
            });
            break;
          }

          // WebRTC signaling - Answer
          case "rtcAnswer": {
            const stream = activeStreams.get(message.streamId);
            if (!stream) break;

            // Send answer to broadcaster (from viewer)
            stream.broadcasterWs.send(JSON.stringify({
              type: "rtcAnswer",
              answer: message.answer,
              viewerId: message.viewerId,
              streamId: message.streamId,
            }));
            break;
          }

          // WebRTC signaling - ICE Candidate
          case "iceCandidate": {
            const stream = activeStreams.get(message.streamId);
            if (!stream) break;

            if (message.fromBroadcaster) {
              // Send to all viewers
              streamViewers.get(message.streamId)?.forEach((viewer) => {
                if (viewer.readyState === WebSocket.OPEN) {
                  viewer.send(JSON.stringify({
                    type: "iceCandidate",
                    candidate: message.candidate,
                    streamId: message.streamId,
                  }));
                }
              });
            } else {
              // Send to broadcaster
              stream.broadcasterWs.send(JSON.stringify({
                type: "iceCandidate",
                candidate: message.candidate,
                viewerId: message.viewerId,
                streamId: message.streamId,
              }));
            }
            break;
          }

          // Native WebRTC Streaming - End stream
          case "endStream": {
            const streamId = wsToStreamId.get(ws);
            if (streamId && activeStreams.has(streamId)) {
              // Notify all viewers
              streamViewers.get(streamId)?.forEach((viewer) => {
                if (viewer.readyState === WebSocket.OPEN) {
                  viewer.send(JSON.stringify({
                    type: "streamEnded",
                    streamId,
                  }));
                }
                wsToStreamId.delete(viewer);
              });

              // Clean up
              activeStreams.delete(streamId);
              streamViewers.delete(streamId);
              wsToStreamId.delete(ws);

              // Broadcast stream removal
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: "streamRemoved",
                    streamId,
                  }));
                }
              });
            }
            break;
          }

          // Get list of active streams
          case "getActiveStreams": {
            const streams = Array.from(activeStreams.values()).map(s => ({
              streamId: s.streamId,
              broadcasterUsername: s.broadcasterUsername,
              title: s.title,
              startedAt: s.startedAt,
              viewerCount: s.viewerCount,
              streamType: s.streamType,
            }));
            ws.send(JSON.stringify({
              type: "activeStreams",
              streams,
            }));
            break;
          }

          // Leave stream as viewer
          case "leaveStream": {
            const streamId = wsToStreamId.get(ws);
            if (streamId) {
              streamViewers.get(streamId)?.delete(ws);
              const stream = activeStreams.get(streamId);
              if (stream) {
                stream.viewerCount = Math.max(0, stream.viewerCount - 1);
              }
              wsToStreamId.delete(ws);

              ws.send(JSON.stringify({
                type: "leftStream",
                streamId,
              }));
            }
            break;
          }

          // Get all online users
          case "getOnlineUsers": {
            const onlineUsers = Array.from(userPresence.entries()).map(([id, entry]) => ({
              userId: id,
              username: entry.username,
              isOnline: true,
              lastSeen: entry.lastSeen.toISOString(),
            }));
            
            ws.send(JSON.stringify({
              type: "onlineUsers",
              users: onlineUsers,
            }));
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", async () => {
      // Track user going offline
      await markUserOffline(ws);
      
      // Clean up native streaming if broadcaster disconnects
      const streamId = wsToStreamId.get(ws);
      if (streamId) {
        const stream = activeStreams.get(streamId);
        if (stream && stream.broadcasterWs === ws) {
          // Broadcaster disconnected - end the stream
          streamViewers.get(streamId)?.forEach((viewer) => {
            if (viewer.readyState === WebSocket.OPEN) {
              viewer.send(JSON.stringify({
                type: "streamEnded",
                streamId,
                reason: "broadcaster_disconnected",
              }));
            }
            wsToStreamId.delete(viewer);
          });
          activeStreams.delete(streamId);
          streamViewers.delete(streamId);

          // Broadcast stream removal
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "streamRemoved",
                streamId,
              }));
            }
          });
        } else {
          // Viewer disconnected
          streamViewers.get(streamId)?.delete(ws);
          if (stream) {
            stream.viewerCount = Math.max(0, stream.viewerCount - 1);
          }
        }
        wsToStreamId.delete(ws);
      }

      if (currentRoom && roomConnections.has(currentRoom)) {
        roomConnections.get(currentRoom)?.delete(ws);
        
        // Remove from spatial room (cleanup regardless of explicit leave message)
        const room = await storage.getChatRoom(currentRoom);
        if (room && currentUserId) {
          await storage.leaveRoom(currentRoom, currentUserId);
          
          // Notify others that participant left
          broadcast(currentRoom, {
            type: "participantLeft",
            userId: currentUserId,
          });
          
          // Also send chat system message (only if room still exists and currentRoom is not null)
          if (currentRoom && currentUserId) {
            try {
              const leaveMsg = await storage.createMessage({
                roomId: currentRoom,
                userId: currentUserId,
                username: "System",
                content: `${currentUsername} disconnected`,
                isSystem: true,
              });

              broadcast(currentRoom, {
                type: "message",
                message: leaveMsg,
              });
            } catch (error) {
              console.error("Failed to create leave message:", error);
            }
          }
        }
      }
    });
  });

  function broadcast(roomId: string, data: any) {
    const connections = roomConnections.get(roomId);
    if (!connections) return;

    const message = JSON.stringify(data);
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // ==================== ANALYTICS / MONITORING ROUTES ====================
  
  // In-memory active sessions for real-time tracking
  const activeSessions = new Map<string, { userId: string | null; lastHeartbeat: Date; startedAt: Date }>();

  // Start a new usage session
  app.post("/api/analytics/session/start", async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      const sessionToken = randomBytes(16).toString('hex');
      const userAgent = req.headers['user-agent'] || null;
      const ipAddress = req.ip || req.connection?.remoteAddress || null;

      // Store in database
      await db.insert(usageSessions).values({
        userId: userId || null,
        sessionToken,
        userAgent,
        ipAddress,
        isActive: true,
      });

      // Track in memory for real-time counts
      activeSessions.set(sessionToken, {
        userId,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
      });

      console.log('[Analytics] Session started:', sessionToken, 'User:', userId || 'anonymous');

      res.json({ sessionToken });
    } catch (error: any) {
      console.error("[Analytics] Start session error:", error);
      res.status(500).json({ error: "Failed to start session" });
    }
  });

  // Heartbeat to keep session alive and track duration
  app.post("/api/analytics/session/heartbeat", async (req, res) => {
    try {
      const { sessionToken } = req.body;
      
      if (!sessionToken) {
        return res.status(400).json({ error: "Session token required" });
      }

      const now = new Date();
      
      // Update in-memory tracker
      const session = activeSessions.get(sessionToken);
      if (session) {
        session.lastHeartbeat = now;
      }

      // Update database
      await db.update(usageSessions)
        .set({ lastHeartbeat: now })
        .where(eq(usageSessions.sessionToken, sessionToken));

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Analytics] Heartbeat error:", error);
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  // End a session
  app.post("/api/analytics/session/end", async (req, res) => {
    try {
      const { sessionToken } = req.body;
      
      if (!sessionToken) {
        return res.status(400).json({ error: "Session token required" });
      }

      const now = new Date();
      
      // Get session from database to calculate duration
      const [session] = await db.select()
        .from(usageSessions)
        .where(eq(usageSessions.sessionToken, sessionToken));

      if (session && session.startedAt) {
        const durationSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
        
        await db.update(usageSessions)
          .set({ 
            endedAt: now,
            isActive: false,
            durationSeconds,
          })
          .where(eq(usageSessions.sessionToken, sessionToken));
      }

      // Remove from in-memory tracker
      activeSessions.delete(sessionToken);

      console.log('[Analytics] Session ended:', sessionToken);

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Analytics] End session error:", error);
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // Track an event
  app.post("/api/analytics/event", async (req, res) => {
    try {
      const { sessionToken, eventType, eventData, page } = req.body;
      const userId = getAuthenticatedUserId(req);

      if (!sessionToken || !eventType) {
        return res.status(400).json({ error: "Session token and event type required" });
      }

      await db.insert(usageEvents).values({
        sessionId: sessionToken,
        userId: userId || null,
        eventType,
        eventData: eventData ? JSON.stringify(eventData) : null,
        page,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Analytics] Event tracking error:", error);
      res.status(500).json({ error: "Failed to track event" });
    }
  });

  // Get current active user count (real-time)
  app.get("/api/analytics/active-users", async (req, res) => {
    try {
      // Clean up stale sessions (no heartbeat in 2 minutes)
      const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
      for (const [token, session] of Array.from(activeSessions.entries())) {
        if (session.lastHeartbeat < staleThreshold) {
          activeSessions.delete(token);
          // Mark as inactive in database
          await db.update(usageSessions)
            .set({ isActive: false, endedAt: new Date() })
            .where(eq(usageSessions.sessionToken, token));
        }
      }

      const activeCount = activeSessions.size;
      const uniqueUsers = new Set(
        Array.from(activeSessions.values())
          .filter(s => s.userId)
          .map(s => s.userId)
      ).size;

      res.json({
        activeSessionsCount: activeCount,
        uniqueUsersCount: uniqueUsers,
        timestamp: new Date(),
      });
    } catch (error: any) {
      console.error("[Analytics] Active users error:", error);
      res.status(500).json({ error: "Failed to get active users" });
    }
  });

  // Get analytics dashboard data
  app.get("/api/analytics/dashboard", async (req, res) => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get sessions from last 24 hours
      const recentSessions = await db.select()
        .from(usageSessions)
        .where(sql`${usageSessions.startedAt} > ${oneDayAgo}`);

      // Calculate stats
      const totalSessions24h = recentSessions.length;
      const uniqueUsers24h = new Set(recentSessions.filter(s => s.userId).map(s => s.userId)).size;
      const completedSessions = recentSessions.filter(s => s.durationSeconds !== null);
      const avgDuration = completedSessions.length > 0
        ? Math.round(completedSessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / completedSessions.length)
        : 0;

      // Get current active count
      const activeCount = activeSessions.size;

      // Get weekly session counts by day
      const weeklyData = await db.select({
        date: sql<string>`DATE(${usageSessions.startedAt})`,
        count: sql<number>`COUNT(*)`,
      })
        .from(usageSessions)
        .where(sql`${usageSessions.startedAt} > ${oneWeekAgo}`)
        .groupBy(sql`DATE(${usageSessions.startedAt})`)
        .orderBy(sql`DATE(${usageSessions.startedAt})`);

      res.json({
        currentActive: activeCount,
        last24Hours: {
          totalSessions: totalSessions24h,
          uniqueUsers: uniqueUsers24h,
          avgSessionDuration: avgDuration,
        },
        weeklyTrend: weeklyData,
        timestamp: now,
      });
    } catch (error: any) {
      console.error("[Analytics] Dashboard error:", error);
      res.status(500).json({ error: "Failed to get analytics data" });
    }
  });

  // Cleanup job: Run periodically to close stale sessions
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
      
      // Close sessions with no heartbeat
      await db.update(usageSessions)
        .set({ isActive: false, endedAt: new Date() })
        .where(and(
          eq(usageSessions.isActive, true),
          sql`${usageSessions.lastHeartbeat} < ${staleThreshold}`
        ));
    } catch (error) {
      console.error('[Analytics] Cleanup job error:', error);
    }
  }, 60000); // Run every minute

  // ============================================
  // Admin Authentication Routes
  // ============================================

  // Admin Login - Step 1: Validate credentials and send 2FA codes
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const adminUser = await storage.getAdminUserByUsername(username);
      
      if (!adminUser) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!adminUser.isActive) {
        return res.status(401).json({ error: "Admin account is inactive" });
      }

      const passwordValid = await comparePassword(password, adminUser.password);
      
      if (!passwordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if admin has phone configured for 2FA
            // Check if admin has phone configured for 2FA
      const admin2FAEnabled =
        process.env.NODE_ENV === "production" ||
        process.env.ADMIN_2FA_ENABLED === "true";

      if (admin2FAEnabled && !adminUser.phone) {
        return res.status(400).json({ error: "No phone number configured for 2FA. Please contact support." });
      }

      if (!admin2FAEnabled) {
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await storage.createAdminSession({
          adminId: adminUser.id,
          token,
          expiresAt,
        });

        res.cookie("admin_token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000,
        });

        return res.json({
          success: true,
          requires2FA: false,
          admin: {
            id: adminUser.id,
            username: adminUser.username,
            email: adminUser.email,
          },
        });
      }

      // Generate cryptographically secure 6-digit codes
      const { randomBytes } = await import('crypto');
      const generateSecureCode = () => {
        const buffer = randomBytes(4);
        const num = buffer.readUInt32BE(0);
        return (100000 + (num % 900000)).toString();
      };
      const emailCode = generateSecureCode();
      const phoneCode = generateSecureCode();
      
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      // Clean up expired tokens
      await storage.cleanExpiredLoginTokens();
      
      const loginToken = await storage.createAdminLoginToken({
        adminId: adminUser.id,
        emailCode,
        phoneCode,
        expiresAt,
      });

      let emailSent = false;
      let smsSent = false;
      
      try {
        const { sendAdminLoginEmail } = await import('./email');
        await sendAdminLoginEmail(adminUser.email, emailCode, adminUser.username);
        emailSent = true;
        console.log("[Admin Login 2FA] Email sent to:", adminUser.email);
      } catch (emailError) {
        console.error("[Admin Login 2FA] Failed to send email:", emailError);
      }

      try {
        const { sendAdminLoginSMS } = await import('./twilio');
        await sendAdminLoginSMS(adminUser.phone, phoneCode);
        smsSent = true;
        console.log("[Admin Login 2FA] SMS sent to:", adminUser.phone);
      } catch (smsError) {
        console.error("[Admin Login 2FA] Failed to send SMS:", smsError);
      }

      // If both failed, create direct session (fallback when 2FA services unavailable)
      if (!emailSent && !smsSent) {
        await storage.markLoginTokenUsed(loginToken.id);
        console.log("[Admin Login] 2FA services unavailable, creating direct session");
        
        // Create session directly
        const sessionToken = randomUUID();
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        await storage.createAdminSession({
          adminId: adminUser.id,
          token: sessionToken,
          expiresAt: sessionExpiresAt,
        });

        // Set cookie
        res.cookie("admin_token", sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000,
        });

        return res.json({ 
          success: true, 
          message: "Logged in (2FA temporarily bypassed due to service issues)",
          admin: { id: adminUser.id, username: adminUser.username, email: adminUser.email }
        });
      }

      res.json({ 
        requires2FA: true,
        loginId: loginToken.id,
        maskedEmail: adminUser.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        maskedPhone: adminUser.phone.replace(/(.{3})(.*)(.{2})/, "$1***$3"),
        emailSent,
        smsSent,
      });
    } catch (error: any) {
      console.error("[Admin] Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Admin Login - Step 2a: Verify email code
  app.post("/api/admin/login/verify-email", async (req, res) => {
    try {
      const { loginId, code } = req.body;

      if (!loginId || !code) {
        return res.status(400).json({ error: "Login ID and code are required" });
      }

      const loginToken = await storage.getAdminLoginToken(loginId);
      
      if (!loginToken) {
        return res.status(400).json({ error: "Invalid or expired login session" });
      }

      if (loginToken.used) {
        return res.status(400).json({ error: "Login session already used" });
      }

      if (new Date() > loginToken.expiresAt) {
        return res.status(400).json({ error: "Login session expired. Please start again." });
      }

      if (loginToken.emailCode !== code) {
        return res.status(400).json({ error: "Invalid email code" });
      }

      await storage.updateLoginTokenVerification(loginId, { emailVerified: true });

      res.json({ success: true, emailVerified: true });
    } catch (error: any) {
      console.error("[Admin Login 2FA] Email verify error:", error);
      res.status(500).json({ error: "Failed to verify email code" });
    }
  });

  // Admin Login - Step 2b: Verify phone code
  app.post("/api/admin/login/verify-phone", async (req, res) => {
    try {
      const { loginId, code } = req.body;

      if (!loginId || !code) {
        return res.status(400).json({ error: "Login ID and code are required" });
      }

      const loginToken = await storage.getAdminLoginToken(loginId);
      
      if (!loginToken) {
        return res.status(400).json({ error: "Invalid or expired login session" });
      }

      if (loginToken.used) {
        return res.status(400).json({ error: "Login session already used" });
      }

      if (new Date() > loginToken.expiresAt) {
        return res.status(400).json({ error: "Login session expired. Please start again." });
      }

      if (loginToken.phoneCode !== code) {
        return res.status(400).json({ error: "Invalid SMS code" });
      }

      await storage.updateLoginTokenVerification(loginId, { phoneVerified: true });

      res.json({ success: true, phoneVerified: true });
    } catch (error: any) {
      console.error("[Admin Login 2FA] Phone verify error:", error);
      res.status(500).json({ error: "Failed to verify SMS code" });
    }
  });

  // Admin Login - Step 3: Complete login after 2FA verification
  app.post("/api/admin/login/complete", async (req, res) => {
    try {
      const { loginId } = req.body;

      if (!loginId) {
        return res.status(400).json({ error: "Login ID is required" });
      }

      const loginToken = await storage.getAdminLoginToken(loginId);
      
      if (!loginToken) {
        return res.status(400).json({ error: "Invalid or expired login session" });
      }

      if (loginToken.used) {
        return res.status(400).json({ error: "Login session already used" });
      }

      if (new Date() > loginToken.expiresAt) {
        return res.status(400).json({ error: "Login session expired. Please start again." });
      }

      if (!loginToken.emailVerified || !loginToken.phoneVerified) {
        return res.status(400).json({ error: "Both email and phone verification required" });
      }

      // Mark login token as used
      await storage.markLoginTokenUsed(loginId);

      // Get admin user
      const adminUser = await storage.getAdminUser(loginToken.adminId);
      if (!adminUser) {
        return res.status(400).json({ error: "Admin user not found" });
      }

      // Create session
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await storage.createAdminSession({
        adminId: adminUser.id,
        token,
        expiresAt,
      });

      await storage.updateAdminUserLastLogin(adminUser.id);

      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
      });

      const { password: _, ...safeAdminUser } = adminUser;
      res.json({ 
        success: true, 
        admin: safeAdminUser,
      });
    } catch (error: any) {
      console.error("[Admin Login] Complete error:", error);
      res.status(500).json({ error: "Failed to complete login" });
    }
  });

  // Admin Logout
  app.post("/api/admin/logout", async (req, res) => {
    try {
      const token = req.cookies?.admin_token;
      
      if (token) {
        await storage.deleteAdminSession(token);
      }

      res.clearCookie("admin_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Admin] Logout error:", error);
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  // ============================================
  // Admin Password Recovery (2FA with Email + Phone)
  // ============================================

  // Step 1: Initiate recovery - sends codes to email and phone
  app.post("/api/admin/recovery/initiate", async (req, res) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const adminUser = await storage.getAdminUserByUsername(username);
      
      if (!adminUser) {
        return res.json({ success: true, message: "If the account exists, recovery codes have been sent" });
      }

      if (!adminUser.phone) {
        return res.status(400).json({ error: "No phone number configured for this admin account. Please contact support." });
      }

      // Generate cryptographically secure 6-digit codes
      const { randomBytes } = await import('crypto');
      const generateSecureCode = () => {
        const buffer = randomBytes(4);
        const num = buffer.readUInt32BE(0);
        return (100000 + (num % 900000)).toString();
      };
      const emailCode = generateSecureCode();
      const phoneCode = generateSecureCode();
      
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      
      // Invalidate any existing recovery tokens for this admin
      await storage.cleanExpiredRecoveryTokens();
      
      const recoveryToken = await storage.createAdminRecoveryToken({
        adminId: adminUser.id,
        emailCode,
        phoneCode,
        expiresAt,
      });

      let emailSent = false;
      let smsSent = false;
      
      try {
        const { sendAdminRecoveryEmail } = await import('./email');
        await sendAdminRecoveryEmail(adminUser.email, emailCode, adminUser.username);
        emailSent = true;
        console.log("[Admin Recovery] Email sent to:", adminUser.email);
      } catch (emailError) {
        console.error("[Admin Recovery] Failed to send email:", emailError);
      }

      try {
        const { sendAdminRecoverySMS } = await import('./twilio');
        await sendAdminRecoverySMS(adminUser.phone, phoneCode);
        smsSent = true;
        console.log("[Admin Recovery] SMS sent to:", adminUser.phone);
      } catch (smsError) {
        console.error("[Admin Recovery] Failed to send SMS:", smsError);
      }

      // Check if at least one delivery method succeeded
      if (!emailSent && !smsSent) {
        // Both failed - mark token as used to prevent abuse
        await storage.markRecoveryTokenUsed(recoveryToken.id);
        return res.status(500).json({ error: "Failed to send verification codes. Please try again later or contact support." });
      }

      res.json({ 
        success: true, 
        recoveryId: recoveryToken.id,
        maskedEmail: adminUser.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        maskedPhone: adminUser.phone.replace(/(.{3})(.*)(.{2})/, "$1***$3"),
        emailSent,
        smsSent,
      });
    } catch (error: any) {
      console.error("[Admin Recovery] Initiate error:", error);
      res.status(500).json({ error: "Failed to initiate recovery" });
    }
  });

  // Step 2: Verify email code
  app.post("/api/admin/recovery/verify-email", async (req, res) => {
    try {
      const { recoveryId, code } = req.body;

      if (!recoveryId || !code) {
        return res.status(400).json({ error: "Recovery ID and code are required" });
      }

      const token = await storage.getAdminRecoveryToken(recoveryId);
      
      if (!token) {
        return res.status(400).json({ error: "Invalid or expired recovery session" });
      }

      if (token.used) {
        return res.status(400).json({ error: "This recovery session has already been used" });
      }

      if (new Date() > token.expiresAt) {
        return res.status(400).json({ error: "Recovery session has expired" });
      }

      if (token.emailCode !== code) {
        return res.status(400).json({ error: "Invalid email verification code" });
      }

      await storage.updateRecoveryTokenVerification(recoveryId, { emailVerified: true });

      res.json({ success: true, emailVerified: true });
    } catch (error: any) {
      console.error("[Admin Recovery] Verify email error:", error);
      res.status(500).json({ error: "Failed to verify email code" });
    }
  });

  // Step 3: Verify phone code
  app.post("/api/admin/recovery/verify-phone", async (req, res) => {
    try {
      const { recoveryId, code } = req.body;

      if (!recoveryId || !code) {
        return res.status(400).json({ error: "Recovery ID and code are required" });
      }

      const token = await storage.getAdminRecoveryToken(recoveryId);
      
      if (!token) {
        return res.status(400).json({ error: "Invalid or expired recovery session" });
      }

      if (token.used) {
        return res.status(400).json({ error: "This recovery session has already been used" });
      }

      if (new Date() > token.expiresAt) {
        return res.status(400).json({ error: "Recovery session has expired" });
      }

      if (token.phoneCode !== code) {
        return res.status(400).json({ error: "Invalid phone verification code" });
      }

      await storage.updateRecoveryTokenVerification(recoveryId, { phoneVerified: true });

      res.json({ success: true, phoneVerified: true });
    } catch (error: any) {
      console.error("[Admin Recovery] Verify phone error:", error);
      res.status(500).json({ error: "Failed to verify phone code" });
    }
  });

  // Step 4: Reset password (requires both codes verified)
  app.post("/api/admin/recovery/reset-password", async (req, res) => {
    try {
      const { recoveryId, newPassword } = req.body;

      if (!recoveryId || !newPassword) {
        return res.status(400).json({ error: "Recovery ID and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const token = await storage.getAdminRecoveryToken(recoveryId);
      
      if (!token) {
        return res.status(400).json({ error: "Invalid or expired recovery session" });
      }

      if (token.used) {
        return res.status(400).json({ error: "This recovery session has already been used" });
      }

      if (new Date() > token.expiresAt) {
        return res.status(400).json({ error: "Recovery session has expired" });
      }

      if (!token.emailVerified || !token.phoneVerified) {
        return res.status(400).json({ error: "Both email and phone verification required" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateAdminCredentials(token.adminId, { password: hashedPassword });
      
      await storage.markRecoveryTokenUsed(recoveryId);

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error: any) {
      console.error("[Admin Recovery] Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Admin: Update phone number (for setting up 2FA)
  app.post("/api/admin/update-phone", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const phoneRegex = /^\+?[1-9]\d{9,14}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return res.status(400).json({ error: "Invalid phone number format. Please use international format (e.g., +1234567890)" });
      }

      const updatedAdmin = await storage.updateAdminPhone(req.adminUser!.id, phone);
      
      if (!updatedAdmin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      res.json({ success: true, phone: updatedAdmin.phone });
    } catch (error: any) {
      console.error("[Admin] Update phone error:", error);
      res.status(500).json({ error: "Failed to update phone number" });
    }
  });

  // Admin: Create checkout session for a specific user (for testing)
  app.post("/api/admin/create-checkout", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const { userId, tier } = req.body;
      
      if (!tier || !TIER_PRICES[tier]) {
        return res.status(400).json({ error: "Invalid tier" });
      }

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const tierInfo = TIER_PRICES[tier];
      console.log('[Admin Stripe] Creating checkout session for user:', user.username, 'tier:', tier);

      const stripe = await getUncachableStripeClient();

      // Create or get Stripe customer
      let customerId = user.stripeCustomerId;
      
      if (customerId) {
        // Verify the customer exists in current Stripe environment (handles test->prod migration)
        try {
          await stripe.customers.retrieve(customerId);
        } catch (verifyError: any) {
          if (verifyError?.code === 'resource_missing') {
            console.log('[Admin Stripe] Customer not found in current environment, creating new customer');
            customerId = null; // Force creation of new customer
          } else {
            throw verifyError;
          }
        }
      }
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId, username: user.username },
        });
        customerId = customer.id;
        
        await storage.updateUser(userId, { 
          stripeCustomerId: customerId 
        });
        console.log('[Admin Stripe] Created new customer:', customerId);
      }

      // Get the host URL for redirect
      const host = req.get('host');
      const protocol = req.protocol;
      const baseUrl = `${protocol}://${host}`;

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Garage Talk ${tierInfo.name} Subscription`,
              description: `Monthly subscription to Garage Talk ${tierInfo.name} tier`,
            },
            unit_amount: tierInfo.amount,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
        cancel_url: `${baseUrl}/subscription/cancel`,
        metadata: {
          userId,
          tier,
          adminTest: 'true',
        },
      });

      console.log('[Admin Stripe] Checkout session created:', session.id);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Admin Stripe] Checkout error:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // Temporary direct admin login bypass (remove in production)
  app.get("/api/admin/direct-login/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Verify this token exists in admin_sessions
      const session = await storage.getAdminSession(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      
      // Set the cookie
      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
      
      // Redirect to admin dashboard
      res.redirect("/admin");
    } catch (error: any) {
      console.error("[Admin] Direct login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Get current admin user
  app.get("/api/admin/me", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { password: _, ...safeAdminUser } = req.adminUser;
      res.json({ admin: safeAdminUser });
    } catch (error: any) {
      console.error("[Admin] Get me error:", error);
      res.status(500).json({ error: "Failed to get admin user" });
    }
  });

  // Update admin credentials (email/password)
  app.patch("/api/admin/me", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { email, currentPassword, newPassword } = req.body;
      const updates: { email?: string; password?: string } = {};

      if (email && email !== req.adminUser.email) {
        updates.email = email;
      }

      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Current password is required to change password" });
        }
        const passwordValid = await comparePassword(currentPassword, req.adminUser.password);
        if (!passwordValid) {
          return res.status(403).json({ error: "Current password is incorrect" });
        }
        if (newPassword.length < 6) {
          return res.status(400).json({ error: "New password must be at least 6 characters" });
        }
        updates.password = await hashPassword(newPassword);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No changes provided" });
      }

      const updatedAdmin = await storage.updateAdminCredentials(req.adminUser.id, updates);
      if (!updatedAdmin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const { password: _, ...safeAdminUser } = updatedAdmin;
      res.json({ admin: safeAdminUser, message: "Credentials updated successfully" });
    } catch (error: any) {
      console.error("[Admin] Update credentials error:", error);
      if (error.message?.includes("already in use")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update credentials" });
    }
  });

  // Get dashboard statistics (admin only)
  app.get("/api/admin/stats", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const stats = await storage.getAdminDashboardStats();
      
      const safeRecentSignups = stats.recentSignups.map(user => {
        const { password: _, ...safeUser } = user;
        return safeUser;
      });

      res.json({
        totalUsers: stats.totalUsers,
        activeSubscriptions: stats.activeSubscriptions,
        recentSignups: safeRecentSignups,
        tierBreakdown: stats.tierBreakdown,
      });
    } catch (error: any) {
      console.error("[Admin] Get stats error:", error);
      res.status(500).json({ error: "Failed to get dashboard statistics" });
    }
  });

  // Get email/phone signup log (admin only)
  app.get("/api/admin/signup-log", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const signups = await storage.getEmailSignups(limit);
      const count = await storage.getEmailSignupCount();
      
      res.json({
        signups,
        total: count,
        limit,
      });
    } catch (error: any) {
      console.error("[Admin] Get signup log error:", error);
      res.status(500).json({ error: "Failed to get signup log" });
    }
  });

  // List all users with pagination (admin only)
  app.get("/api/admin/users", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      const result = await storage.listAllUsers(page, limit);
      
      const safeUsers = result.users.map(user => {
        const { password: _, ...safeUser } = user;
        return safeUser;
      });

      res.json({
        users: safeUsers,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      });
    } catch (error: any) {
      console.error("[Admin] List users error:", error);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // Search for a user by username (admin only) - case-insensitive
  app.get("/api/admin/users/search", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const username = req.query.username as string;
      
      if (!username || !username.trim()) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      // Use case-insensitive search
      const user = await storage.getUserByUsernameCaseInsensitive(username.trim());
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remove password from response
      const { password: _, ...safeUser } = user;
      
      res.json({ user: safeUser });
    } catch (error: any) {
      console.error("[Admin] Search user error:", error);
      res.status(500).json({ error: "Failed to search for user" });
    }
  });

  // Update user subscription tier (admin only - for DevOps testing)
  app.patch("/api/admin/users/:userId/tier", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const { userId } = req.params;
      const { tier } = req.body;

      const validTiers = ["amateur", "gearhead", "racing_pro", "pro"];
      if (!tier || !validTiers.includes(tier)) {
        return res.status(400).json({ error: "Invalid tier. Must be one of: amateur, gearhead, racing_pro, pro" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.updateUser(userId, {
        subscriptionTier: tier as "amateur" | "gearhead" | "racing_pro" | "pro",
      });

      console.log(`[Admin] Updated user ${userId} tier to ${tier} by admin ${req.adminSession?.userId}`);

      const updatedUser = await storage.getUser(userId);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found after update" });
      }

      const { password: _, ...safeUser } = updatedUser;
      res.json({ user: safeUser, message: `User tier updated to ${tier}` });
    } catch (error: any) {
      console.error("[Admin] Update user tier error:", error);
      res.status(500).json({ error: "Failed to update user tier" });
    }
  });

  // Cleanup expired admin sessions periodically
  setInterval(async () => {
    try {
      await storage.cleanExpiredAdminSessions();
    } catch (error) {
      console.error('[Admin] Session cleanup error:', error);
    }
  }, 60 * 60 * 1000); // Run every hour

  // ============================================================================
  // ANALYTICS ENDPOINTS
  // ============================================================================

  // Helper function to detect device type from user-agent
  function detectDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (/tablet|ipad|playbook|silk/.test(ua)) {
      return "tablet";
    }
    if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) {
      return "mobile";
    }
    return "desktop";
  }

  // Helper function to parse browser from user-agent
  function detectBrowser(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('edg')) return 'Edge';
    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('safari')) return 'Safari';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
    return 'Other';
  }

  // Helper function to parse OS from user-agent
  function detectOS(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    return 'Other';
  }

  // Country to language code mapping
  const countryToLanguage: Record<string, string> = {
    // Global languages
    'US': 'en', 'GB': 'en', 'AU': 'en', 'CA': 'en', 'NZ': 'en', 'IE': 'en',
    'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'CL': 'es', 'PE': 'es', 'VE': 'es', 'EC': 'es', 'CU': 'es', 'DO': 'es', 'GT': 'es', 'HN': 'es', 'SV': 'es', 'NI': 'es', 'CR': 'es', 'PA': 'es', 'UY': 'es', 'PY': 'es', 'BO': 'es',
    'FR': 'fr', 'BE': 'fr', 'CH': 'fr', 'LU': 'fr', 'MC': 'fr',
    'DE': 'de', 'AT': 'de', 'LI': 'de',
    'BR': 'pt', 'PT': 'pt', 'AO': 'pt', 'MZ': 'pt',
    'CN': 'zh', 'TW': 'zh', 'HK': 'zh', 'SG': 'zh',
    'PL': 'pl',
    'RU': 'ru', 'BY': 'ru', 'KZ': 'ru', 'KG': 'ru',
    'UA': 'uk',
    'RO': 'ro', 'MD': 'ro',
    'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'IQ': 'ar', 'JO': 'ar', 'KW': 'ar', 'LB': 'ar', 'LY': 'ar', 'MA': 'ar', 'OM': 'ar', 'QA': 'ar', 'SY': 'ar', 'TN': 'ar', 'YE': 'ar', 'BH': 'ar', 'DZ': 'ar',
    'IL': 'he',
    'IT': 'it', 'SM': 'it', 'VA': 'it',
    'GR': 'el', 'CY': 'el',
    'NL': 'nl', 'SR': 'nl',
    // African languages
    'NG': 'pcm', // Nigeria - default to Pidgin (most widely spoken)
    'KE': 'sw',  // Kenya - Kiswahili
    'TZ': 'sw',  // Tanzania - Kiswahili
    'UG': 'sw',  // Uganda - Kiswahili
    'ZA': 'af',  // South Africa - Afrikaans
    'NA': 'af',  // Namibia - Afrikaans
    // South Asian and Central Asian languages
    'IR': 'fa',  // Iran - Farsi/Persian
    'TJ': 'fa',  // Tajikistan - Farsi/Persian (Tajiki dialect)
    'IN': 'hi',  // India - Hindi
    'NP': 'hi',  // Nepal - Hindi widely spoken
    'PK': 'ur',  // Pakistan - Urdu
    'AF': 'ps',  // Afghanistan - Pashto
    // Finland
    'FI': 'fi',  // Finland - Finnish
  };

  // Detect language based on IP address
  app.get("/api/detect-language", async (req, res) => {
    try {
      const forwardedFor = req.headers['x-forwarded-for'];
      const clientIp = typeof forwardedFor === 'string' 
        ? forwardedFor.split(',')[0].trim() 
        : req.socket.remoteAddress || 'unknown';

      let detectedLanguage = 'en'; // Default to English
      let countryCode: string | null = null;

      // Only call external API for non-local IPs
      if (clientIp && clientIp !== 'unknown' && !clientIp.startsWith('127.') && !clientIp.startsWith('::1') && !clientIp.startsWith('192.168.') && !clientIp.startsWith('10.')) {
        try {
          const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,countryCode`);
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.status === 'success' && geoData.countryCode) {
              countryCode = geoData.countryCode;
              detectedLanguage = countryToLanguage[geoData.countryCode] || 'en';
            }
          }
        } catch (geoError) {
          console.warn('[Language Detection] IP geolocation lookup failed:', geoError);
        }
      }

      res.json({ 
        language: detectedLanguage, 
        countryCode,
        detected: countryCode !== null 
      });
    } catch (error: any) {
      console.error("[Language Detection] Error:", error);
      res.json({ language: 'en', countryCode: null, detected: false });
    }
  });

  // Get user's location based on their IP address (VPN-friendly)
  app.get("/api/location/ip", async (req, res) => {
    try {
      // Get IP address from request (will match VPN IP if user is using VPN)
      const forwardedFor = req.headers['x-forwarded-for'];
      const clientIp = typeof forwardedFor === 'string' 
        ? forwardedFor.split(',')[0].trim() 
        : req.socket.remoteAddress || 'unknown';

      // Default location (used for local/unknown IPs)
      let location = {
        city: null as string | null,
        region: null as string | null,
        country: null as string | null,
        countryCode: null as string | null,
        lat: null as number | null,
        lon: null as number | null,
        displayName: null as string | null,
      };

      // Only call external API for non-local IPs
      if (clientIp && clientIp !== 'unknown' && !clientIp.startsWith('127.') && !clientIp.startsWith('::1') && !clientIp.startsWith('192.168.') && !clientIp.startsWith('10.')) {
        try {
          const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,regionName,city,lat,lon`);
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.status === 'success') {
              location = {
                city: geoData.city || null,
                region: geoData.regionName || null,
                country: geoData.country || null,
                countryCode: geoData.countryCode || null,
                lat: geoData.lat || null,
                lon: geoData.lon || null,
                displayName: geoData.city 
                  ? `${geoData.city}, ${geoData.regionName || geoData.country}`
                  : geoData.regionName || geoData.country || null,
              };
            }
          }
        } catch (geoError) {
          console.warn('[Location] IP geolocation lookup failed:', geoError);
        }
      }

      res.json(location);
    } catch (error: any) {
      console.error("[Location] Get IP location error:", error);
      res.status(500).json({ error: "Failed to get location" });
    }
  });

  // Record a page view (public endpoint - no auth required)
  app.post("/api/analytics/pageview", async (req, res) => {
    try {
      const { sessionId, pageUrl, pagePath, referrer, source, userId } = req.body;

      if (!sessionId || !pageUrl || !pagePath) {
        return res.status(400).json({ error: "sessionId, pageUrl, and pagePath are required" });
      }

      // Get IP address from request
      const forwardedFor = req.headers['x-forwarded-for'];
      const clientIp = typeof forwardedFor === 'string' 
        ? forwardedFor.split(',')[0].trim() 
        : req.socket.remoteAddress || 'unknown';

      // Get user-agent
      const userAgent = req.headers['user-agent'] || '';
      const deviceType = detectDeviceType(userAgent);
      const browser = detectBrowser(userAgent);
      const os = detectOS(userAgent);

      // Fetch geolocation data from ip-api.com
      let country: string | null = null;
      let countryCode: string | null = null;
      let city: string | null = null;

      try {
        // Only call external API for non-local IPs
        if (clientIp && clientIp !== 'unknown' && !clientIp.startsWith('127.') && !clientIp.startsWith('::1')) {
          const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,city`);
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.status === 'success') {
              country = geoData.country || null;
              countryCode = geoData.countryCode || null;
              city = geoData.city || null;
            }
          }
        }
      } catch (geoError) {
        console.warn('[Analytics] Geolocation lookup failed:', geoError);
      }

      const pageView = await storage.createPageView({
        userId: userId || null,
        sessionId,
        pageUrl,
        pagePath,
        referrer: referrer || null,
        source: source || null,
        deviceType,
        browser,
        os,
        country,
        countryCode,
        city,
        ipAddress: clientIp,
      });

      res.json({ success: true, id: pageView.id });
    } catch (error: any) {
      console.error("[Analytics] Record page view error:", error);
      res.status(500).json({ error: "Failed to record page view" });
    }
  });

  // Get analytics stats (admin only)
  app.get("/api/admin/analytics", requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const stats = await storage.getAnalyticsStats();
      res.json(stats);
    } catch (error: any) {
      console.error("[Admin] Get analytics error:", error);
      res.status(500).json({ error: "Failed to get analytics statistics" });
    }
  });

  return httpServer;
}
