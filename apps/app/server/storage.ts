import {
  type User,
  type InsertUser,
  type Video,
  type InsertVideo,
  type VideoComment,
  type InsertVideoComment,
  type ChatRoom,
  type InsertChatRoom,
  type Message,
  type InsertMessage,
  type Search,
  type InsertSearch,
  type RoomParticipant,
  type InsertRoomParticipant,
  type PodcastEpisode,
  type InsertPodcastEpisode,
  type PodcastThread,
  type InsertPodcastThread,
  type PodcastComment,
  type InsertPodcastComment,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type PhoneVerificationToken,
  type InsertPhoneVerificationToken,
  type ScreenShareSession,
  type InsertScreenShareSession,
  type ScheduledSession,
  type InsertScheduledSession,
  type AdminUser,
  type InsertAdminUser,
  type AdminSession,
  type InsertAdminSession,
  type AdminRecoveryToken,
  type InsertAdminRecoveryToken,
  adminRecoveryTokens,
  type AdminLoginToken,
  type InsertAdminLoginToken,
  adminLoginTokens,
  type AnalyticsPageView,
  type InsertAnalyticsPageView,
  type Vehicle,
  type InsertVehicle,
  type UserVideoView,
  type InsertUserVideoView,
  type EmailSignupLog,
  type InsertEmailSignupLog,
  users,
  videos,
  videoComments,
  chatRooms,
  messages,
  searches,
  roomParticipants,
  podcastEpisodes,
  podcastThreads,
  podcastComments,
  passwordResetTokens,
  phoneVerificationTokens,
  screenShareSessions,
  scheduledSessions,
  adminUsers,
  adminSessions,
  analyticsPageViews,
  streamRecordings,
  vehicles,
  userVideoViews,
  emailSignupLog,
  type InsertStreamRecording,
  type StreamRecording,
  type Tip,
  type InsertTip,
  tips,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, desc, asc, ilike, or, sql as drizzleSql } from "drizzle-orm";
import ws from "ws";

// Configure WebSocket for neon-serverless BEFORE creating any connections
if (typeof neonConfig.webSocketConstructor === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<Pick<User, 'username' | 'subscriptionTier' | 'email' | 'avatarUrl' | 'avatarColor' | 'city' | 'bio' | 'squareCustomerId' | 'squarePaymentId' | 'stripeCustomerId' | 'stripeSubscriptionId'>>): Promise<User>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;

  // Videos
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: string): Promise<Video | undefined>;
  listVideos(filters?: { category?: string; search?: string }): Promise<Video[]>;
  incrementVideoViews(id: string): Promise<void>;
  incrementVideoLikes(id: string): Promise<void>;
  getUserVideos(uploaderId: string): Promise<Video[]>;
  deleteVideo(videoId: string, userId: string): Promise<boolean>;

  // Recycle Bin
  listDeletedVideos(uploaderId: string): Promise<Video[]>;
  restoreVideo(videoId: string, userId: string): Promise<boolean>;
  purgeVideo(videoId: string, userId: string): Promise<boolean>;

  // Chat Rooms
  createChatRoom(room: InsertChatRoom): Promise<ChatRoom>;
  getChatRoom(id: string): Promise<ChatRoom | undefined>;
  getChatRoomByName(name: string): Promise<ChatRoom | undefined>;
  listChatRooms(): Promise<ChatRoom[]>;

  // Messages
  createMessage(message: InsertMessage): Promise<Message>;
  getRoomMessages(roomId: string, limit?: number): Promise<Message[]>;

  // Searches
  createSearch(search: InsertSearch): Promise<Search>;
  getUserSearches(userId: string, limit?: number): Promise<Search[]>;
  
  // AI Search tier enforcement
  canPerformAiSearch(userId: string): Promise<{ allowed: boolean; remaining?: number; tier: string }>;
  incrementAiSearchCount(userId: string): Promise<void>;

  // Dashboard stats
  getUserStats(userId: string): Promise<{
    videosUploaded: number;
    searchesPerformed: number;
    activeChats: number;
  }>;

  // Room Participants (for spatial chat)
  joinRoom(participant: InsertRoomParticipant): Promise<RoomParticipant>;
  leaveRoom(roomId: string, userId: string): Promise<void>;
  updateParticipantPosition(roomId: string, userId: string, x: number, y: number): Promise<void>;
  updateParticipantExpression(roomId: string, userId: string, expression: string | null, customExpressionUrl: string | null): Promise<void>;
  getRoomParticipants(roomId: string): Promise<RoomParticipant[]>;
  getParticipant(roomId: string, userId: string): Promise<RoomParticipant | undefined>;

  // Podcast Episodes
  createPodcastEpisode(episode: InsertPodcastEpisode): Promise<PodcastEpisode>;
  getPodcastEpisode(id: string): Promise<PodcastEpisode | undefined>;
  listPodcastEpisodes(filters?: { category?: string; search?: string; uploaderTier?: string }): Promise<PodcastEpisode[]>;
  incrementPodcastViews(id: string): Promise<void>;
  incrementPodcastLikes(id: string): Promise<void>;
  getUserPodcastCount(userId: string): Promise<number>;
  featuredPodcast(id: string, isFeatured: boolean): Promise<void>;

  // Podcast Threads
  createPodcastThread(thread: InsertPodcastThread): Promise<PodcastThread>;
  getPodcastThread(id: string): Promise<PodcastThread | undefined>;
  listEpisodeThreads(episodeId: string): Promise<PodcastThread[]>;
  incrementThreadCommentCount(threadId: string): Promise<void>;

  // Podcast Comments
  createPodcastComment(comment: InsertPodcastComment): Promise<PodcastComment>;
  listThreadComments(threadId: string): Promise<PodcastComment[]>;

  // Video Comments
  createVideoComment(comment: InsertVideoComment): Promise<VideoComment>;
  listVideoComments(videoId: string): Promise<VideoComment[]>;
  getUserVideoComments(userId: string): Promise<VideoComment[]>;
  deleteVideoComment(commentId: string, userId: string): Promise<boolean>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markTokenAsUsed(token: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;

  // Phone Verification
  createPhoneVerificationToken(token: InsertPhoneVerificationToken): Promise<PhoneVerificationToken>;
  getPhoneVerificationToken(phone: string, code: string): Promise<PhoneVerificationToken | undefined>;
  markPhoneVerificationTokenUsed(id: string): Promise<void>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  updateUserPhone(userId: string, phone: string): Promise<void>;
  updateUserCity(userId: string, city: string): Promise<void>;

  // Screen Share Sessions
  createScreenShareSession(session: InsertScreenShareSession): Promise<ScreenShareSession>;
  getScreenShareSession(meetingId: string): Promise<ScreenShareSession | undefined>;
  validateScreenShareSession(meetingId: string, passcode: string): Promise<ScreenShareSession | null>;
  endScreenShareSession(meetingId: string, hostId: string): Promise<boolean>;
  getActiveScreenShareSessions(): Promise<ScreenShareSession[]>;

  // Scheduled Sessions (Calendar Integration)
  createScheduledSession(session: InsertScheduledSession): Promise<ScheduledSession>;
  getScheduledSession(id: string): Promise<ScheduledSession | undefined>;
  updateScheduledSession(id: string, updates: Partial<ScheduledSession>): Promise<ScheduledSession | null>;
  deleteScheduledSession(id: string, hostId: string): Promise<boolean>;
  listUserScheduledSessions(userId: string): Promise<ScheduledSession[]>;
  listUpcomingSessions(limit?: number): Promise<ScheduledSession[]>;
  confirmSessionAttendance(sessionId: string, email: string): Promise<boolean>;
  getSessionsNeedingReminder(): Promise<ScheduledSession[]>;
  markReminderSent(sessionId: string): Promise<void>;

  // Admin Users
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  getAdminUserByUsername(username: string): Promise<AdminUser | undefined>;
  getAdminUserByEmail(email: string): Promise<AdminUser | undefined>;
  createAdminUser(data: InsertAdminUser): Promise<AdminUser>;
  updateAdminUserLastLogin(id: string): Promise<void>;
  updateAdminCredentials(id: string, updates: { email?: string; password?: string }): Promise<AdminUser | null>;

  // Admin Sessions
  getAdminSession(token: string): Promise<AdminSession | undefined>;
  createAdminSession(data: InsertAdminSession): Promise<AdminSession>;
  deleteAdminSession(token: string): Promise<void>;
  cleanExpiredAdminSessions(): Promise<void>;

  // Admin Recovery Tokens (2FA password recovery)
  createAdminRecoveryToken(data: InsertAdminRecoveryToken): Promise<AdminRecoveryToken>;
  getAdminRecoveryToken(id: string): Promise<AdminRecoveryToken | undefined>;
  getActiveRecoveryTokenForAdmin(adminId: string): Promise<AdminRecoveryToken | undefined>;
  updateRecoveryTokenVerification(id: string, updates: { emailVerified?: boolean; phoneVerified?: boolean }): Promise<AdminRecoveryToken | undefined>;
  markRecoveryTokenUsed(id: string): Promise<void>;
  cleanExpiredRecoveryTokens(): Promise<void>;
  updateAdminPhone(id: string, phone: string): Promise<AdminUser | null>;

  // Admin Login Tokens (2FA login)
  createAdminLoginToken(data: InsertAdminLoginToken): Promise<AdminLoginToken>;
  getAdminLoginToken(id: string): Promise<AdminLoginToken | undefined>;
  updateLoginTokenVerification(id: string, updates: { emailVerified?: boolean; phoneVerified?: boolean }): Promise<AdminLoginToken | undefined>;
  markLoginTokenUsed(id: string): Promise<void>;
  cleanExpiredLoginTokens(): Promise<void>;

  // Admin Dashboard Data
  listAllUsers(page?: number, limit?: number): Promise<{ users: User[]; total: number }>;
  getAdminDashboardStats(): Promise<{
    totalUsers: number;
    activeSubscriptions: number;
    recentSignups: User[];
    tierBreakdown: Record<string, number>;
    cityBreakdown: Array<{ city: string; count: number }>;
    recentQueries: Array<{ query: string; username: string; city: string | null; isAiSearch: boolean; createdAt: Date | null }>;
  }>;

  // Analytics
  createPageView(data: InsertAnalyticsPageView): Promise<AnalyticsPageView>;
  getAnalyticsStats(): Promise<{
    activeUsers: number;
    totalPageViews: number;
    deviceBreakdown: Record<string, number>;
    countryBreakdown: Array<{ country: string; countryCode: string; count: number }>;
    sourceBreakdown: Record<string, number>;
    recentPageViews: AnalyticsPageView[];
    activeUsersList: Array<{ id: string; username: string; email: string | null; lastSeen: Date | null }>;
  }>;

  // Stream Recordings
  createStreamRecording(recording: InsertStreamRecording): Promise<StreamRecording>;
  getStreamRecording(id: string): Promise<StreamRecording | undefined>;
  listUserRecordings(userId: string): Promise<StreamRecording[]>;
  listPublicRecordings(limit?: number): Promise<StreamRecording[]>;
  deleteStreamRecording(id: string, userId: string): Promise<boolean>;
  incrementRecordingViews(id: string): Promise<void>;
  updateRecordingVisibility(id: string, userId: string, isPublic: boolean): Promise<StreamRecording | null>;
  updateRecordingUrl(id: string, url: string): Promise<void>;

  // User Vehicles (My Garage)
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  getVehicle(id: string, userId?: string): Promise<Vehicle | undefined>;
  getUserVehicles(userId: string): Promise<Vehicle[]>;
  updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | null>;
  deleteVehicle(id: string, userId: string): Promise<boolean>;
  setPrimaryVehicle(id: string, userId: string): Promise<Vehicle | null>;
  getPrimaryVehicle(userId: string): Promise<Vehicle | undefined>;

  // User Video Views (Watch History)
  recordVideoView(userId: string, videoId: string, playbackPosition?: number): Promise<{ view: UserVideoView; isNewView: boolean }>;
  getUserRecentViews(userId: string, limit?: number): Promise<(UserVideoView & { video?: Video })[]>;
  getVideoViewCount(videoId: string): Promise<number>;
  
  // Video Popularity by Country
  getPopularVideosByCountry(countryCode?: string, limit?: number): Promise<Video[]>;
  searchVideosByPopularity(query?: string, countryCode?: string, limit?: number): Promise<Video[]>;
  
  // User Presence
  setUserOnline(userId: string): Promise<void>;
  setUserOffline(userId: string): Promise<void>;
  updateUserLastSeen(userId: string): Promise<void>;
  getAllUsersWithPresence(): Promise<User[]>;
  
  // Email Signup Log
  logEmailSignup(data: InsertEmailSignupLog): Promise<EmailSignupLog>;
  getEmailSignups(limit?: number): Promise<EmailSignupLog[]>;
  getEmailSignupCount(): Promise<number>;

  // Tips
  createTip(tipData: InsertTip): Promise<Tip>;
  updateTipStatus(stripeSessionId: string, status: string): Promise<void>;
  getTipsReceived(userId: string): Promise<Tip[]>;
  getTipsSent(userId: string): Promise<Tip[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private videos: Map<string, Video>;
  private chatRooms: Map<string, ChatRoom>;
  private messages: Map<string, Message>;
  private searches: Map<string, Search>;
  private roomParticipants: Map<string, RoomParticipant>;
  private podcastEpisodes: Map<string, PodcastEpisode>;
  private podcastThreads: Map<string, PodcastThread>;
  private podcastComments: Map<string, PodcastComment>;
  private videoComments: Map<string, VideoComment>;
  private adminUsersMap: Map<string, AdminUser>;
  private adminSessionsMap: Map<string, AdminSession>;
  private adminRecoveryTokensMap: Map<string, AdminRecoveryToken>;
  private adminLoginTokensMap: Map<string, AdminLoginToken>;
  private analyticsPageViewsMap: Map<string, AnalyticsPageView>;

  constructor() {
    this.users = new Map();
    this.videos = new Map();
    this.videoComments = new Map();
    this.chatRooms = new Map();
    this.messages = new Map();
    this.searches = new Map();
    this.roomParticipants = new Map();
    this.podcastEpisodes = new Map();
    this.podcastThreads = new Map();
    this.podcastComments = new Map();
    this.adminUsersMap = new Map();
    this.adminSessionsMap = new Map();
    this.adminRecoveryTokensMap = new Map();
    this.adminLoginTokensMap = new Map();
    this.analyticsPageViewsMap = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase(),
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const existingUser = await this.getUserByUsername(insertUser.username);
    if (existingUser) {
      throw new Error("Username already taken");
    }
    
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      email: insertUser.email || null,
      phone: insertUser.phone || null,
      avatarUrl: insertUser.avatarUrl || null,
      city: insertUser.city || null,
      subscriptionTier: insertUser.subscriptionTier || "amateur",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      squareCustomerId: null,
      squarePaymentId: null,
      subscriptionStatus: null,
      aiSearchCount: null,
      aiSearchResetDate: null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<Pick<User, 'username' | 'subscriptionTier' | 'email' | 'avatarUrl' | 'avatarColor' | 'city' | 'bio' | 'squareCustomerId' | 'squarePaymentId' | 'stripeCustomerId' | 'stripeSubscriptionId'>>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    
    // Check if username is being changed and if it's already taken
    if (updates.username && updates.username !== user.username) {
      const existingUser = Array.from(this.users.values()).find(
        u => u.username === updates.username && u.id !== id
      );
      if (existingUser) {
        throw new Error('Username already taken');
      }
    }
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = {
      ...insertVideo,
      id,
      description: insertVideo.description || null,
      thumbnail: insertVideo.thumbnail || null,
      duration: insertVideo.duration || null,
      views: 0,
      likes: 0,
      tags: insertVideo.tags || [],
      createdAt: new Date(),
    };
    this.videos.set(id, video);
    return video;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async listVideos(filters?: { category?: string; search?: string }): Promise<Video[]> {
    let videos = Array.from(this.videos.values()).filter(v => v.isDeleted !== true);

    if (filters?.category) {
      videos = videos.filter(v => v.category === filters.category);
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      videos = videos.filter(v =>
        v.title.toLowerCase().includes(searchLower) ||
        v.description?.toLowerCase().includes(searchLower) ||
        (v.tags && v.tags.some(tag => tag.toLowerCase().includes(searchLower)))
      );
    }

    return videos.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async incrementVideoViews(id: string): Promise<void> {
    const video = this.videos.get(id);
    if (video && video.views !== null) {
      video.views++;
      this.videos.set(id, video);
    }
  }

  async incrementVideoLikes(id: string): Promise<void> {
    const video = this.videos.get(id);
    if (video && video.likes !== null) {
      video.likes++;
      this.videos.set(id, video);
    }
  }

  async getUserVideos(uploaderId: string): Promise<Video[]> {
    return Array.from(this.videos.values())
      .filter(v => v.uploaderId === uploaderId && v.isDeleted !== true)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async deleteVideo(videoId: string, userId: string): Promise<boolean> {
    const video = this.videos.get(videoId);
    if (!video || video.uploaderId !== userId) {
      return false;
    }
    // Soft delete - mark as deleted instead of removing
    video.isDeleted = true;
    video.deletedAt = new Date();
    return true;
  }

  async listDeletedVideos(uploaderId: string): Promise<Video[]> {
    return Array.from(this.videos.values()).filter(
      (v) => v.uploaderId === uploaderId && v.isDeleted === true
    );
  }

  async restoreVideo(videoId: string, userId: string): Promise<boolean> {
    const video = this.videos.get(videoId);
    if (!video || video.uploaderId !== userId || !video.isDeleted) {
      return false;
    }
    video.isDeleted = false;
    video.deletedAt = null;
    return true;
  }

  async purgeVideo(videoId: string, userId: string): Promise<boolean> {
    const video = this.videos.get(videoId);
    if (!video || video.uploaderId !== userId || !video.isDeleted) {
      return false;
    }
    this.videos.delete(videoId);
    return true;
  }

  async createChatRoom(insertRoom: InsertChatRoom): Promise<ChatRoom> {
    const id = randomUUID();
    const room: ChatRoom = {
      ...insertRoom,
      id,
      description: insertRoom.description || null,
      createdAt: new Date(),
    };
    this.chatRooms.set(id, room);
    return room;
  }

  async getChatRoom(id: string): Promise<ChatRoom | undefined> {
    return this.chatRooms.get(id);
  }

  async getChatRoomByName(name: string): Promise<ChatRoom | undefined> {
    return Array.from(this.chatRooms.values()).find(r => r.name === name);
  }

  async listChatRooms(): Promise<ChatRoom[]> {
    return Array.from(this.chatRooms.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      isSystem: insertMessage.isSystem ? 1 : 0,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getRoomMessages(roomId: string, limit: number = 50): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(m => m.roomId === roomId)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0))
      .slice(-limit);
  }

  async createSearch(insertSearch: InsertSearch): Promise<Search> {
    const id = randomUUID();
    const search: Search = {
      ...insertSearch,
      id,
      isAiSearch: insertSearch.isAiSearch ? 1 : 0,
      response: insertSearch.response || null,
      createdAt: new Date(),
    };
    this.searches.set(id, search);
    return search;
  }

  async getUserSearches(userId: string, limit: number = 10): Promise<Search[]> {
    return Array.from(this.searches.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async canPerformAiSearch(userId: string): Promise<{ allowed: boolean; remaining?: number; tier: string }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { allowed: false, tier: "unknown" };
    }

    const tier = user.subscriptionTier || "amateur";

    // All tiers get unlimited searches
    return { allowed: true, tier };
  }

  async incrementAiSearchCount(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    user.aiSearchCount = (user.aiSearchCount || 0) + 1;
    if (!user.aiSearchResetDate) {
      user.aiSearchResetDate = new Date();
    }
    this.users.set(userId, user);
  }

  async getUserStats(userId: string): Promise<{
    videosUploaded: number;
    searchesPerformed: number;
    activeChats: number;
  }> {
    const videos = Array.from(this.videos.values()).filter(v => v.uploaderId === userId);
    const searches = Array.from(this.searches.values()).filter(s => s.userId === userId);
    
    // Count unique rooms the user has sent messages in
    const userMessages = Array.from(this.messages.values()).filter(m => m.userId === userId);
    const uniqueRooms = new Set(userMessages.map(m => m.roomId));

    return {
      videosUploaded: videos.length,
      searchesPerformed: searches.length,
      activeChats: uniqueRooms.size,
    };
  }

  async joinRoom(participant: InsertRoomParticipant): Promise<RoomParticipant> {
    const key = `${participant.roomId}-${participant.userId}`;
    const existing = this.roomParticipants.get(key);
    
    if (existing) {
      existing.lastUpdate = new Date();
      this.roomParticipants.set(key, existing);
      return existing;
    }

    const newParticipant: RoomParticipant = {
      id: randomUUID(),
      roomId: participant.roomId,
      userId: participant.userId,
      username: participant.username,
      x: participant.x ?? "400",
      y: participant.y ?? "300",
      avatarColor: participant.avatarColor ?? "#3b82f6",
      avatarUrl: participant.avatarUrl ?? null,
      avatarType: participant.avatarType ?? "color",
      expression: participant.expression ?? null,
      customExpressionUrl: participant.customExpressionUrl ?? null,
      bio: participant.bio ?? null,
      lastUpdate: new Date(),
    };

    this.roomParticipants.set(key, newParticipant);
    return newParticipant;
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const key = `${roomId}-${userId}`;
    this.roomParticipants.delete(key);
  }

  async updateParticipantPosition(roomId: string, userId: string, x: number, y: number): Promise<void> {
    const key = `${roomId}-${userId}`;
    const participant = this.roomParticipants.get(key);
    
    if (participant) {
      participant.x = x.toString();
      participant.y = y.toString();
      participant.lastUpdate = new Date();
      this.roomParticipants.set(key, participant);
    }
  }

  async updateParticipantExpression(roomId: string, userId: string, expression: string | null, customExpressionUrl: string | null): Promise<void> {
    const key = `${roomId}-${userId}`;
    const participant = this.roomParticipants.get(key);
    
    if (participant) {
      participant.expression = expression;
      participant.customExpressionUrl = customExpressionUrl;
      participant.lastUpdate = new Date();
      this.roomParticipants.set(key, participant);
    }
  }

  async getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
    return Array.from(this.roomParticipants.values())
      .filter(p => p.roomId === roomId);
  }

  async getParticipant(roomId: string, userId: string): Promise<RoomParticipant | undefined> {
    const key = `${roomId}-${userId}`;
    return this.roomParticipants.get(key);
  }

  // Podcast Episodes
  async createPodcastEpisode(episode: InsertPodcastEpisode): Promise<PodcastEpisode> {
    const newEpisode: PodcastEpisode = {
      id: randomUUID(),
      ...episode,
      description: episode.description || null,
      tags: episode.tags || null,
      views: 0,
      likes: 0,
      isFeatured: episode.isFeatured ?? false,
      createdAt: new Date(),
    };
    this.podcastEpisodes.set(newEpisode.id, newEpisode);
    return newEpisode;
  }

  async getPodcastEpisode(id: string): Promise<PodcastEpisode | undefined> {
    return this.podcastEpisodes.get(id);
  }

  async listPodcastEpisodes(filters?: { category?: string; search?: string; uploaderTier?: string }): Promise<PodcastEpisode[]> {
    let episodes = Array.from(this.podcastEpisodes.values());
    
    if (filters?.category) {
      episodes = episodes.filter(e => e.category === filters.category);
    }
    
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      episodes = episodes.filter(e => 
        e.title.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower)
      );
    }
    
    if (filters?.uploaderTier) {
      episodes = episodes.filter(e => e.uploaderTier === filters.uploaderTier);
    }
    
    return episodes.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
  }

  async incrementPodcastViews(id: string): Promise<void> {
    const episode = this.podcastEpisodes.get(id);
    if (episode) {
      episode.views = (episode.views ?? 0) + 1;
      this.podcastEpisodes.set(id, episode);
    }
  }

  async incrementPodcastLikes(id: string): Promise<void> {
    const episode = this.podcastEpisodes.get(id);
    if (episode) {
      episode.likes = (episode.likes ?? 0) + 1;
      this.podcastEpisodes.set(id, episode);
    }
  }

  async getUserPodcastCount(userId: string): Promise<number> {
    return Array.from(this.podcastEpisodes.values())
      .filter(e => e.uploaderId === userId).length;
  }

  async featuredPodcast(id: string, isFeatured: boolean): Promise<void> {
    const episode = this.podcastEpisodes.get(id);
    if (episode) {
      episode.isFeatured = isFeatured;
      this.podcastEpisodes.set(id, episode);
    }
  }

  // Podcast Threads
  async createPodcastThread(thread: InsertPodcastThread): Promise<PodcastThread> {
    const newThread: PodcastThread = {
      id: randomUUID(),
      ...thread,
      isPinned: thread.isPinned ?? false,
      commentCount: 0,
      createdAt: new Date(),
    };
    this.podcastThreads.set(newThread.id, newThread);
    return newThread;
  }

  async getPodcastThread(id: string): Promise<PodcastThread | undefined> {
    return this.podcastThreads.get(id);
  }

  async listEpisodeThreads(episodeId: string): Promise<PodcastThread[]> {
    return Array.from(this.podcastThreads.values())
      .filter(t => t.episodeId === episodeId)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.createdAt!.getTime() - a.createdAt!.getTime();
      });
  }

  async incrementThreadCommentCount(threadId: string): Promise<void> {
    const thread = this.podcastThreads.get(threadId);
    if (thread) {
      thread.commentCount = (thread.commentCount ?? 0) + 1;
      this.podcastThreads.set(threadId, thread);
    }
  }

  // Podcast Comments
  async createPodcastComment(comment: InsertPodcastComment): Promise<PodcastComment> {
    const newComment: PodcastComment = {
      id: randomUUID(),
      ...comment,
      createdAt: new Date(),
    };
    this.podcastComments.set(newComment.id, newComment);
    await this.incrementThreadCommentCount(comment.threadId);
    return newComment;
  }

  async listThreadComments(threadId: string): Promise<PodcastComment[]> {
    return Array.from(this.podcastComments.values())
      .filter(c => c.threadId === threadId)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async createVideoComment(comment: InsertVideoComment): Promise<VideoComment> {
    const newComment: VideoComment = {
      id: randomUUID(),
      ...comment,
      createdAt: new Date(),
    };
    this.videoComments.set(newComment.id, newComment);
    return newComment;
  }

  async listVideoComments(videoId: string): Promise<VideoComment[]> {
    return Array.from(this.videoComments.values())
      .filter(c => c.videoId === videoId)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async getUserVideoComments(userId: string): Promise<VideoComment[]> {
    return Array.from(this.videoComments.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime()); // Most recent first
  }

  async deleteVideoComment(commentId: string, userId: string): Promise<boolean> {
    const comment = this.videoComments.get(commentId);
    if (!comment || comment.userId !== userId) {
      return false; // Comment doesn't exist or user doesn't own it
    }
    return this.videoComments.delete(commentId);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.password = hashedPassword;
      this.users.set(id, user);
    }
  }

  // Password Reset Tokens - stub implementations for MemStorage
  private passwordResetTokens: Map<string, PasswordResetToken> = new Map();

  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const newToken: PasswordResetToken = {
      id: randomUUID(),
      ...token,
      used: false,
      createdAt: new Date(),
    };
    this.passwordResetTokens.set(token.token, newToken);
    return newToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    return this.passwordResetTokens.get(token);
  }

  async markTokenAsUsed(token: string): Promise<void> {
    const tokenRecord = this.passwordResetTokens.get(token);
    if (tokenRecord) {
      tokenRecord.used = true;
      this.passwordResetTokens.set(token, tokenRecord);
    }
  }

  async deleteExpiredTokens(): Promise<void> {
    const now = new Date();
    const keysToDelete: string[] = [];
    this.passwordResetTokens.forEach((token, key) => {
      if (token.expiresAt < now || token.used) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.passwordResetTokens.delete(key));
  }

  // Phone Verification - stub implementations for MemStorage
  private phoneVerificationTokens: Map<string, PhoneVerificationToken> = new Map();

  async createPhoneVerificationToken(token: InsertPhoneVerificationToken): Promise<PhoneVerificationToken> {
    const newToken: PhoneVerificationToken = {
      id: randomUUID(),
      ...token,
      used: false,
      createdAt: new Date(),
    };
    this.phoneVerificationTokens.set(`${token.phone}-${token.code}`, newToken);
    return newToken;
  }

  async getPhoneVerificationToken(phone: string, code: string): Promise<PhoneVerificationToken | undefined> {
    return this.phoneVerificationTokens.get(`${phone}-${code}`);
  }

  async markPhoneVerificationTokenUsed(id: string): Promise<void> {
    this.phoneVerificationTokens.forEach((token, key) => {
      if (token.id === id) {
        token.used = true;
        this.phoneVerificationTokens.set(key, token);
      }
    });
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.phone === phone);
  }

  async updateUserPhone(userId: string, phone: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      (user as any).phone = phone;
      this.users.set(userId, user);
    }
  }

  async updateUserCity(userId: string, city: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      (user as any).city = city;
      this.users.set(userId, user);
    }
  }

  // Screen Share Sessions
  private screenShareSessions: Map<string, ScreenShareSession> = new Map();

  async createScreenShareSession(session: InsertScreenShareSession): Promise<ScreenShareSession> {
    const newSession: ScreenShareSession = {
      id: randomUUID(),
      ...session,
      title: session.title || null,
      isActive: true,
      participantCount: 1,
      createdAt: new Date(),
      endedAt: null,
    };
    this.screenShareSessions.set(session.meetingId, newSession);
    return newSession;
  }

  async getScreenShareSession(meetingId: string): Promise<ScreenShareSession | undefined> {
    return this.screenShareSessions.get(meetingId);
  }

  async validateScreenShareSession(meetingId: string, passcode: string): Promise<ScreenShareSession | null> {
    const session = this.screenShareSessions.get(meetingId);
    if (session && session.isActive && session.passcode === passcode) {
      return session;
    }
    return null;
  }

  async endScreenShareSession(meetingId: string, hostId: string): Promise<boolean> {
    const session = this.screenShareSessions.get(meetingId);
    if (session && session.hostId === hostId) {
      session.isActive = false;
      session.endedAt = new Date();
      this.screenShareSessions.set(meetingId, session);
      return true;
    }
    return false;
  }

  async getActiveScreenShareSessions(): Promise<ScreenShareSession[]> {
    return Array.from(this.screenShareSessions.values())
      .filter(s => s.isActive)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  // Scheduled Sessions - stub implementations for MemStorage
  private scheduledSessionsMap: Map<string, ScheduledSession> = new Map();

  async createScheduledSession(session: InsertScheduledSession): Promise<ScheduledSession> {
    const newSession: ScheduledSession = {
      id: randomUUID(),
      ...session,
      status: session.status || "scheduled",
      description: session.description || null,
      meetingId: session.meetingId || null,
      passcode: session.passcode || null,
      googleCalendarEventId: null,
      inviteeEmails: session.inviteeEmails || [],
      confirmedAttendees: [],
      reminderSent: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.scheduledSessionsMap.set(newSession.id, newSession);
    return newSession;
  }

  async getScheduledSession(id: string): Promise<ScheduledSession | undefined> {
    return this.scheduledSessionsMap.get(id);
  }

  async updateScheduledSession(id: string, updates: Partial<ScheduledSession>): Promise<ScheduledSession | null> {
    const session = this.scheduledSessionsMap.get(id);
    if (!session) return null;
    const updated = { ...session, ...updates, updatedAt: new Date() };
    this.scheduledSessionsMap.set(id, updated);
    return updated;
  }

  async deleteScheduledSession(id: string, hostId: string): Promise<boolean> {
    const session = this.scheduledSessionsMap.get(id);
    if (session && session.hostId === hostId) {
      this.scheduledSessionsMap.delete(id);
      return true;
    }
    return false;
  }

  async listUserScheduledSessions(userId: string): Promise<ScheduledSession[]> {
    return Array.from(this.scheduledSessionsMap.values())
      .filter(s => s.hostId === userId)
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
  }

  async listUpcomingSessions(limit: number = 20): Promise<ScheduledSession[]> {
    const now = new Date();
    return Array.from(this.scheduledSessionsMap.values())
      .filter(s => s.scheduledStart > now && (s.status === "scheduled" || s.status === "confirmed"))
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
      .slice(0, limit);
  }

  async confirmSessionAttendance(sessionId: string, email: string): Promise<boolean> {
    const session = this.scheduledSessionsMap.get(sessionId);
    if (!session) return false;
    const attendees = session.confirmedAttendees || [];
    if (!attendees.includes(email)) {
      session.confirmedAttendees = [...attendees, email];
      session.updatedAt = new Date();
      this.scheduledSessionsMap.set(sessionId, session);
    }
    return true;
  }

  async getSessionsNeedingReminder(): Promise<ScheduledSession[]> {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    return Array.from(this.scheduledSessionsMap.values())
      .filter(s => !s.reminderSent && s.scheduledStart > now && s.scheduledStart < oneHourLater && 
              (s.status === "scheduled" || s.status === "confirmed"));
  }

  async markReminderSent(sessionId: string): Promise<void> {
    const session = this.scheduledSessionsMap.get(sessionId);
    if (session) {
      session.reminderSent = true;
      session.updatedAt = new Date();
      this.scheduledSessionsMap.set(sessionId, session);
    }
  }

  // Admin Users
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    return this.adminUsersMap.get(id);
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    return Array.from(this.adminUsersMap.values()).find(u => u.username === username);
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    return Array.from(this.adminUsersMap.values()).find(u => u.email === email);
  }

  async createAdminUser(data: InsertAdminUser): Promise<AdminUser> {
    const existingUsername = await this.getAdminUserByUsername(data.username);
    if (existingUsername) {
      throw new Error("Admin username already taken");
    }
    const existingEmail = await this.getAdminUserByEmail(data.email);
    if (existingEmail) {
      throw new Error("Admin email already taken");
    }

    const newAdmin: AdminUser = {
      id: randomUUID(),
      username: data.username,
      email: data.email,
      phone: data.phone || null,
      password: data.password,
      role: data.role || "developer",
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
    };
    this.adminUsersMap.set(newAdmin.id, newAdmin);
    return newAdmin;
  }

  async updateAdminUserLastLogin(id: string): Promise<void> {
    const admin = this.adminUsersMap.get(id);
    if (admin) {
      admin.lastLoginAt = new Date();
      this.adminUsersMap.set(id, admin);
    }
  }

  async updateAdminCredentials(id: string, updates: { email?: string; password?: string }): Promise<AdminUser | null> {
    const admin = this.adminUsersMap.get(id);
    if (!admin) {
      return null;
    }
    if (updates.email && updates.email !== admin.email) {
      const existingEmail = await this.getAdminUserByEmail(updates.email);
      if (existingEmail) {
        throw new Error("Email already in use by another admin");
      }
      admin.email = updates.email;
    }
    if (updates.password) {
      admin.password = updates.password;
    }
    this.adminUsersMap.set(id, admin);
    return admin;
  }

  // Admin Sessions
  async getAdminSession(token: string): Promise<AdminSession | undefined> {
    return this.adminSessionsMap.get(token);
  }

  async createAdminSession(data: InsertAdminSession): Promise<AdminSession> {
    const newSession: AdminSession = {
      id: randomUUID(),
      adminId: data.adminId,
      token: data.token,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.adminSessionsMap.set(data.token, newSession);
    return newSession;
  }

  async deleteAdminSession(token: string): Promise<void> {
    this.adminSessionsMap.delete(token);
  }

  async cleanExpiredAdminSessions(): Promise<void> {
    const now = new Date();
    const tokensToDelete: string[] = [];
    this.adminSessionsMap.forEach((session, token) => {
      if (session.expiresAt < now) {
        tokensToDelete.push(token);
      }
    });
    tokensToDelete.forEach(token => this.adminSessionsMap.delete(token));
  }

  // Admin Recovery Tokens
  async createAdminRecoveryToken(data: InsertAdminRecoveryToken): Promise<AdminRecoveryToken> {
    const newToken: AdminRecoveryToken = {
      id: randomUUID(),
      adminId: data.adminId,
      emailCode: data.emailCode,
      phoneCode: data.phoneCode,
      emailVerified: false,
      phoneVerified: false,
      expiresAt: data.expiresAt,
      used: false,
      createdAt: new Date(),
    };
    this.adminRecoveryTokensMap.set(newToken.id, newToken);
    return newToken;
  }

  async getAdminRecoveryToken(id: string): Promise<AdminRecoveryToken | undefined> {
    return this.adminRecoveryTokensMap.get(id);
  }

  async getActiveRecoveryTokenForAdmin(adminId: string): Promise<AdminRecoveryToken | undefined> {
    const now = new Date();
    return Array.from(this.adminRecoveryTokensMap.values()).find(
      token => token.adminId === adminId && !token.used && token.expiresAt > now
    );
  }

  async updateRecoveryTokenVerification(id: string, updates: { emailVerified?: boolean; phoneVerified?: boolean }): Promise<AdminRecoveryToken | undefined> {
    const token = this.adminRecoveryTokensMap.get(id);
    if (!token) {
      return undefined;
    }
    if (updates.emailVerified !== undefined) {
      token.emailVerified = updates.emailVerified;
    }
    if (updates.phoneVerified !== undefined) {
      token.phoneVerified = updates.phoneVerified;
    }
    this.adminRecoveryTokensMap.set(id, token);
    return token;
  }

  async markRecoveryTokenUsed(id: string): Promise<void> {
    const token = this.adminRecoveryTokensMap.get(id);
    if (token) {
      token.used = true;
      this.adminRecoveryTokensMap.set(id, token);
    }
  }

  async cleanExpiredRecoveryTokens(): Promise<void> {
    const now = new Date();
    const idsToDelete: string[] = [];
    this.adminRecoveryTokensMap.forEach((token, id) => {
      if (token.expiresAt < now) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.adminRecoveryTokensMap.delete(id));
  }

  async updateAdminPhone(id: string, phone: string): Promise<AdminUser | null> {
    const admin = this.adminUsersMap.get(id);
    if (!admin) {
      return null;
    }
    admin.phone = phone;
    this.adminUsersMap.set(id, admin);
    return admin;
  }

  // Admin Login Tokens (2FA login)
  async createAdminLoginToken(data: InsertAdminLoginToken): Promise<AdminLoginToken> {
    const newToken: AdminLoginToken = {
      id: randomUUID(),
      adminId: data.adminId,
      emailCode: data.emailCode,
      phoneCode: data.phoneCode,
      emailVerified: false,
      phoneVerified: false,
      expiresAt: data.expiresAt,
      used: false,
      createdAt: new Date(),
    };
    this.adminLoginTokensMap.set(newToken.id, newToken);
    return newToken;
  }

  async getAdminLoginToken(id: string): Promise<AdminLoginToken | undefined> {
    return this.adminLoginTokensMap.get(id);
  }

  async updateLoginTokenVerification(id: string, updates: { emailVerified?: boolean; phoneVerified?: boolean }): Promise<AdminLoginToken | undefined> {
    const token = this.adminLoginTokensMap.get(id);
    if (!token) {
      return undefined;
    }
    if (updates.emailVerified !== undefined) {
      token.emailVerified = updates.emailVerified;
    }
    if (updates.phoneVerified !== undefined) {
      token.phoneVerified = updates.phoneVerified;
    }
    this.adminLoginTokensMap.set(id, token);
    return token;
  }

  async markLoginTokenUsed(id: string): Promise<void> {
    const token = this.adminLoginTokensMap.get(id);
    if (token) {
      token.used = true;
      this.adminLoginTokensMap.set(id, token);
    }
  }

  async cleanExpiredLoginTokens(): Promise<void> {
    const now = new Date();
    const idsToDelete: string[] = [];
    this.adminLoginTokensMap.forEach((token, id) => {
      if (token.expiresAt < now) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach(id => this.adminLoginTokensMap.delete(id));
  }

  // Admin Dashboard Data
  async listAllUsers(page: number = 1, limit: number = 20): Promise<{ users: User[]; total: number }> {
    const allUsers = Array.from(this.users.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    const total = allUsers.length;
    const offset = (page - 1) * limit;
    const users = allUsers.slice(offset, offset + limit);
    return { users, total };
  }

  async getAdminDashboardStats(): Promise<{
    totalUsers: number;
    activeSubscriptions: number;
    recentSignups: User[];
    tierBreakdown: Record<string, number>;
    cityBreakdown: Array<{ city: string; count: number }>;
    recentQueries: Array<{ query: string; username: string; city: string | null; isAiSearch: boolean; createdAt: Date | null }>;
  }> {
    const allUsers = Array.from(this.users.values());
    const totalUsers = allUsers.length;
    const activeSubscriptions = allUsers.filter(u => 
      u.subscriptionTier && u.subscriptionTier !== "amateur"
    ).length;
    const recentSignups = allUsers
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 5);
    
    const tierBreakdown: Record<string, number> = {};
    allUsers.forEach(u => {
      const tier = u.subscriptionTier || "amateur";
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
    });

    // City breakdown
    const cityCounts: Record<string, number> = {};
    allUsers.forEach(u => {
      if (u.city) {
        cityCounts[u.city] = (cityCounts[u.city] || 0) + 1;
      }
    });
    const cityBreakdown = Object.entries(cityCounts)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent queries
    const allSearches = Array.from(this.searches.values());
    const recentQueries = allSearches
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 15)
      .map(s => {
        const user = this.users.get(s.userId);
        return {
          query: s.query,
          username: user?.username || "Unknown",
          city: user?.city || null,
          isAiSearch: Boolean(s.isAiSearch),
          createdAt: s.createdAt
        };
      });

    return { totalUsers, activeSubscriptions, recentSignups, tierBreakdown, cityBreakdown, recentQueries };
  }

  // Analytics
  async createPageView(data: InsertAnalyticsPageView): Promise<AnalyticsPageView> {
    const newPageView: AnalyticsPageView = {
      id: randomUUID(),
      userId: data.userId || null,
      sessionId: data.sessionId,
      pageUrl: data.pageUrl,
      pagePath: data.pagePath,
      referrer: data.referrer || null,
      source: data.source || null,
      deviceType: data.deviceType,
      browser: data.browser || null,
      os: data.os || null,
      country: data.country || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      ipAddress: data.ipAddress || null,
      createdAt: new Date(),
    };
    this.analyticsPageViewsMap.set(newPageView.id, newPageView);
    return newPageView;
  }

  async getAnalyticsStats(): Promise<{
    activeUsers: number;
    totalPageViews: number;
    deviceBreakdown: Record<string, number>;
    countryBreakdown: Array<{ country: string; countryCode: string; count: number }>;
    sourceBreakdown: Record<string, number>;
    recentPageViews: AnalyticsPageView[];
    activeUsersList: Array<{ id: string; username: string; email: string | null; lastSeen: Date | null }>;
  }> {
    const allPageViews = Array.from(this.analyticsPageViewsMap.values());
    const totalPageViews = allPageViews.length;

    // Active users: unique sessionIds from last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentSessions = new Set(
      allPageViews
        .filter(pv => pv.createdAt && pv.createdAt >= thirtyMinutesAgo)
        .map(pv => pv.sessionId)
    );
    const activeUsers = recentSessions.size;

    // Active logged-in users with their details
    const activeUserMap = new Map<string, { userId: string; lastSeen: Date }>();
    allPageViews
      .filter(pv => pv.userId && pv.createdAt && pv.createdAt >= thirtyMinutesAgo)
      .forEach(pv => {
        const existing = activeUserMap.get(pv.userId!);
        if (!existing || (pv.createdAt && pv.createdAt > existing.lastSeen)) {
          activeUserMap.set(pv.userId!, { userId: pv.userId!, lastSeen: pv.createdAt! });
        }
      });
    
    const activeUsersList: Array<{ id: string; username: string; email: string | null; lastSeen: Date | null }> = [];
    activeUserMap.forEach(({ lastSeen }, userId) => {
      const user = this.users.get(userId);
      if (user) {
        activeUsersList.push({ id: user.id, username: user.username, email: user.email, lastSeen });
      }
    });
    activeUsersList.sort((a, b) => (b.lastSeen?.getTime() || 0) - (a.lastSeen?.getTime() || 0));

    // Device breakdown
    const deviceBreakdown: Record<string, number> = {};
    allPageViews.forEach(pv => {
      const device = pv.deviceType || "unknown";
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
    });

    // Country breakdown
    const countryMap = new Map<string, { country: string; countryCode: string; count: number }>();
    allPageViews.forEach(pv => {
      const country = pv.country || "Unknown";
      const countryCode = pv.countryCode || "XX";
      const key = `${country}-${countryCode}`;
      const existing = countryMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        countryMap.set(key, { country, countryCode, count: 1 });
      }
    });
    const countryBreakdown = Array.from(countryMap.values())
      .sort((a, b) => b.count - a.count);

    // Source breakdown (use source or referrer)
    const sourceBreakdown: Record<string, number> = {};
    allPageViews.forEach(pv => {
      const source = pv.source || pv.referrer || "direct";
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    });

    // Recent page views (last 10)
    const recentPageViews = allPageViews
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 10);

    return { activeUsers, totalPageViews, deviceBreakdown, countryBreakdown, sourceBreakdown, recentPageViews, activeUsersList };
  }

  // Stream Recordings (MemStorage stubs)
  async createStreamRecording(recording: InsertStreamRecording): Promise<StreamRecording> {
    throw new Error("Stream recordings not supported in MemStorage");
  }

  async getStreamRecording(id: string): Promise<StreamRecording | undefined> {
    return undefined;
  }

  async listUserRecordings(userId: string): Promise<StreamRecording[]> {
    return [];
  }

  async listPublicRecordings(limit?: number): Promise<StreamRecording[]> {
    return [];
  }

  async deleteStreamRecording(id: string, userId: string): Promise<boolean> {
    return false;
  }

  async incrementRecordingViews(id: string): Promise<void> {
    // No-op
  }

  async updateRecordingVisibility(id: string, userId: string, isPublic: boolean): Promise<StreamRecording | null> {
    return null;
  }

  async updateRecordingUrl(id: string, url: string): Promise<void> {
    // No-op for MemStorage
  }

  // User Vehicles (MemStorage stubs)
  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    throw new Error("Vehicles not supported in MemStorage");
  }

  async getVehicle(id: string, userId?: string): Promise<Vehicle | undefined> {
    return undefined;
  }

  async getUserVehicles(userId: string): Promise<Vehicle[]> {
    return [];
  }

  async updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | null> {
    return null;
  }

  async deleteVehicle(id: string, userId: string): Promise<boolean> {
    return false;
  }

  async setPrimaryVehicle(id: string, userId: string): Promise<Vehicle | null> {
    return null;
  }

  async getPrimaryVehicle(userId: string): Promise<Vehicle | undefined> {
    return undefined;
  }

  // User Video Views (Watch History) - MemStorage stubs
  async recordVideoView(userId: string, videoId: string, playbackPosition?: number): Promise<{ view: UserVideoView; isNewView: boolean }> {
    throw new Error("Video views not supported in MemStorage");
  }

  async getUserRecentViews(userId: string, limit?: number): Promise<(UserVideoView & { video?: Video })[]> {
    throw new Error("Video views not supported in MemStorage");
  }

  async getVideoViewCount(videoId: string): Promise<number> {
    throw new Error("Video views not supported in MemStorage");
  }

  // Video Popularity by Country - MemStorage stubs
  async getPopularVideosByCountry(countryCode?: string, limit?: number): Promise<Video[]> {
    throw new Error("Video popularity not supported in MemStorage");
  }

  async searchVideosByPopularity(query?: string, countryCode?: string, limit?: number): Promise<Video[]> {
    throw new Error("Video popularity search not supported in MemStorage");
  }

  // User Presence - MemStorage stubs
  async setUserOnline(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, isOnline: true, lastSeen: new Date() });
    }
  }

  async setUserOffline(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, isOnline: false, lastSeen: new Date() });
    }
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, lastSeen: new Date() });
    }
  }

  async getAllUsersWithPresence(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Email Signup Log - MemStorage stubs
  async logEmailSignup(data: InsertEmailSignupLog): Promise<EmailSignupLog> {
    throw new Error("Email signup log not supported in MemStorage");
  }

  async getEmailSignups(limit?: number): Promise<EmailSignupLog[]> {
    throw new Error("Email signup log not supported in MemStorage");
  }

  async getEmailSignupCount(): Promise<number> {
    throw new Error("Email signup log not supported in MemStorage");
  }

  async createTip(tipData: InsertTip): Promise<Tip> {
    throw new Error("Tips not supported in MemStorage");
  }

  async updateTipStatus(stripeSessionId: string, status: string): Promise<void> {
    throw new Error("Tips not supported in MemStorage");
  }

  async getTipsReceived(userId: string): Promise<Tip[]> {
    return [];
  }

  async getTipsSent(userId: string): Promise<Tip[]> {
    return [];
  }
}

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(ilike(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const existingUser = await this.getUserByUsername(insertUser.username);
    if (existingUser) {
      throw new Error("Username already taken");
    }

    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async updateUser(id: string, updates: Partial<Pick<User, 'username' | 'subscriptionTier' | 'email' | 'avatarUrl' | 'avatarColor' | 'city' | 'bio' | 'squareCustomerId' | 'squarePaymentId' | 'stripeCustomerId' | 'stripeSubscriptionId'>>): Promise<User> {
    if (updates.username) {
      const existingUser = await this.db
        .select()
        .from(users)
        .where(and(eq(users.username, updates.username), drizzleSql`${users.id} != ${id}`));
      
      if (existingUser.length > 0) {
        throw new Error('Username already taken');
      }
    }

    const result = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`User with id ${id} not found`);
    }
    
    return result[0];
  }

  // Videos
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const result = await this.db.insert(videos).values(insertVideo).returning();
    return result[0];
  }

  async getVideo(id: string): Promise<Video | undefined> {
    const result = await this.db.select().from(videos).where(eq(videos.id, id));
    return result[0];
  }

  async listVideos(filters?: { category?: string; search?: string }): Promise<Video[]> {
    let query = this.db.select().from(videos);
    const conditions = [];

    // Filter out deleted videos
    conditions.push(or(eq(videos.isDeleted, false), drizzleSql`${videos.isDeleted} IS NULL`));

    if (filters?.category) {
      conditions.push(eq(videos.category, filters.category));
    }

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(videos.title, searchPattern),
          ilike(videos.description, searchPattern)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.orderBy(desc(videos.createdAt));
  }

  async incrementVideoViews(id: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ views: drizzleSql`${videos.views} + 1` })
      .where(eq(videos.id, id));
  }

  async incrementVideoLikes(id: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ likes: drizzleSql`${videos.likes} + 1` })
      .where(eq(videos.id, id));
  }

  async getUserVideos(uploaderId: string): Promise<Video[]> {
    return this.db
      .select()
      .from(videos)
      .where(and(
        eq(videos.uploaderId, uploaderId),
        or(eq(videos.isDeleted, false), drizzleSql`${videos.isDeleted} IS NULL`)
      ))
      .orderBy(desc(videos.createdAt));
  }

  async deleteVideo(videoId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(videos)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(and(eq(videos.id, videoId), eq(videos.uploaderId, userId)))
      .returning();
    return result.length > 0;
  }

  async listDeletedVideos(uploaderId: string): Promise<Video[]> {
    return await this.db
      .select()
      .from(videos)
      .where(and(eq(videos.uploaderId, uploaderId), eq(videos.isDeleted, true)))
      .orderBy(desc(videos.deletedAt));
  }

  async restoreVideo(videoId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(videos)
      .set({ isDeleted: false, deletedAt: null })
      .where(and(
        eq(videos.id, videoId),
        eq(videos.uploaderId, userId),
        eq(videos.isDeleted, true)
      ))
      .returning();
    return result.length > 0;
  }

  async purgeVideo(videoId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(videos)
      .where(and(
        eq(videos.id, videoId),
        eq(videos.uploaderId, userId),
        eq(videos.isDeleted, true)
      ))
      .returning();
    return result.length > 0;
  }

  // Chat Rooms
  async createChatRoom(insertRoom: InsertChatRoom): Promise<ChatRoom> {
    const result = await this.db.insert(chatRooms).values(insertRoom).returning();
    return result[0];
  }

  async getChatRoom(id: string): Promise<ChatRoom | undefined> {
    const result = await this.db.select().from(chatRooms).where(eq(chatRooms.id, id));
    return result[0];
  }

  async getChatRoomByName(name: string): Promise<ChatRoom | undefined> {
    const result = await this.db.select().from(chatRooms).where(eq(chatRooms.name, name));
    return result[0];
  }

  async listChatRooms(): Promise<ChatRoom[]> {
    return this.db.select().from(chatRooms).orderBy(desc(chatRooms.createdAt));
  }

  // Messages
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await this.db.insert(messages).values({
      ...insertMessage,
      isSystem: insertMessage.isSystem ? 1 : 0,
    }).returning();
    return result[0];
  }

  async getRoomMessages(roomId: string, limit: number = 50): Promise<Message[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
  }

  // Searches
  async createSearch(insertSearch: InsertSearch): Promise<Search> {
    const result = await this.db.insert(searches).values({
      ...insertSearch,
      isAiSearch: insertSearch.isAiSearch ? 1 : 0,
    }).returning();
    return result[0];
  }

  async getUserSearches(userId: string, limit: number = 10): Promise<Search[]> {
    return this.db
      .select()
      .from(searches)
      .where(eq(searches.userId, userId))
      .orderBy(desc(searches.createdAt))
      .limit(limit);
  }

  async canPerformAiSearch(userId: string): Promise<{ allowed: boolean; remaining?: number; tier: string }> {
    const user = await this.getUser(userId);
    if (!user) {
      return { allowed: false, tier: "unknown" };
    }

    const tier = user.subscriptionTier || "amateur";

    // All tiers get unlimited searches
    return { allowed: true, tier };
  }

  async incrementAiSearchCount(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    await this.db
      .update(users)
      .set({
        aiSearchCount: drizzleSql`${users.aiSearchCount} + 1`,
        aiSearchResetDate: user.aiSearchResetDate || new Date(),
      })
      .where(eq(users.id, userId));
  }

  async getUserStats(userId: string): Promise<{
    videosUploaded: number;
    searchesPerformed: number;
    activeChats: number;
  }> {
    const [videoCount, searchCount, chatCount] = await Promise.all([
      this.db.select({ count: drizzleSql<number>`count(*)` }).from(videos).where(eq(videos.uploaderId, userId)),
      this.db.select({ count: drizzleSql<number>`count(*)` }).from(searches).where(eq(searches.userId, userId)),
      this.db.select({ count: drizzleSql<number>`count(distinct ${messages.roomId})` }).from(messages).where(eq(messages.userId, userId)),
    ]);

    return {
      videosUploaded: Number(videoCount[0]?.count || 0),
      searchesPerformed: Number(searchCount[0]?.count || 0),
      activeChats: Number(chatCount[0]?.count || 0),
    };
  }

  // Room Participants
  async joinRoom(participant: InsertRoomParticipant): Promise<RoomParticipant> {
    const existing = await this.getParticipant(participant.roomId, participant.userId);
    
    if (existing) {
      const result = await this.db
        .update(roomParticipants)
        .set({ lastUpdate: new Date() })
        .where(and(
          eq(roomParticipants.roomId, participant.roomId),
          eq(roomParticipants.userId, participant.userId)
        ))
        .returning();
      return result[0];
    }

    const result = await this.db.insert(roomParticipants).values(participant).returning();
    return result[0];
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.db
      .delete(roomParticipants)
      .where(and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      ));
  }

  async updateParticipantPosition(roomId: string, userId: string, x: number, y: number): Promise<void> {
    await this.db
      .update(roomParticipants)
      .set({ 
        x: x.toString(), 
        y: y.toString(),
        lastUpdate: new Date()
      })
      .where(and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      ));
  }

  async updateParticipantExpression(roomId: string, userId: string, expression: string | null, customExpressionUrl: string | null): Promise<void> {
    await this.db
      .update(roomParticipants)
      .set({ 
        expression,
        customExpressionUrl,
        lastUpdate: new Date()
      })
      .where(and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      ));
  }

  async getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
    return this.db
      .select()
      .from(roomParticipants)
      .where(eq(roomParticipants.roomId, roomId));
  }

  async getParticipant(roomId: string, userId: string): Promise<RoomParticipant | undefined> {
    const result = await this.db
      .select()
      .from(roomParticipants)
      .where(and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      ));
    return result[0];
  }

  // Podcast Episodes
  async createPodcastEpisode(episode: InsertPodcastEpisode): Promise<PodcastEpisode> {
    const result = await this.db.insert(podcastEpisodes).values(episode).returning();
    return result[0];
  }

  async getPodcastEpisode(id: string): Promise<PodcastEpisode | undefined> {
    const result = await this.db.select().from(podcastEpisodes).where(eq(podcastEpisodes.id, id));
    return result[0];
  }

  async listPodcastEpisodes(filters?: { category?: string; search?: string; uploaderTier?: string }): Promise<PodcastEpisode[]> {
    let query = this.db.select().from(podcastEpisodes);
    const conditions = [];

    if (filters?.category) {
      conditions.push(eq(podcastEpisodes.category, filters.category));
    }

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(podcastEpisodes.title, searchPattern),
          ilike(podcastEpisodes.description, searchPattern)
        )
      );
    }

    if (filters?.uploaderTier) {
      conditions.push(drizzleSql`${podcastEpisodes.uploaderTier} = ${filters.uploaderTier}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.orderBy(desc(podcastEpisodes.createdAt));
  }

  async incrementPodcastViews(id: string): Promise<void> {
    await this.db
      .update(podcastEpisodes)
      .set({ views: drizzleSql`${podcastEpisodes.views} + 1` })
      .where(eq(podcastEpisodes.id, id));
  }

  async incrementPodcastLikes(id: string): Promise<void> {
    await this.db
      .update(podcastEpisodes)
      .set({ likes: drizzleSql`${podcastEpisodes.likes} + 1` })
      .where(eq(podcastEpisodes.id, id));
  }

  async getUserPodcastCount(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.uploaderId, userId));
    return Number(result[0]?.count || 0);
  }

  async featuredPodcast(id: string, isFeatured: boolean): Promise<void> {
    await this.db
      .update(podcastEpisodes)
      .set({ isFeatured })
      .where(eq(podcastEpisodes.id, id));
  }

  // Podcast Threads
  async createPodcastThread(thread: InsertPodcastThread): Promise<PodcastThread> {
    const result = await this.db.insert(podcastThreads).values(thread).returning();
    return result[0];
  }

  async getPodcastThread(id: string): Promise<PodcastThread | undefined> {
    const result = await this.db.select().from(podcastThreads).where(eq(podcastThreads.id, id));
    return result[0];
  }

  async listEpisodeThreads(episodeId: string): Promise<PodcastThread[]> {
    return this.db
      .select()
      .from(podcastThreads)
      .where(eq(podcastThreads.episodeId, episodeId))
      .orderBy(desc(podcastThreads.isPinned), desc(podcastThreads.createdAt));
  }

  async incrementThreadCommentCount(threadId: string): Promise<void> {
    await this.db
      .update(podcastThreads)
      .set({ commentCount: drizzleSql`${podcastThreads.commentCount} + 1` })
      .where(eq(podcastThreads.id, threadId));
  }

  // Podcast Comments
  async createPodcastComment(comment: InsertPodcastComment): Promise<PodcastComment> {
    const result = await this.db.insert(podcastComments).values(comment).returning();
    await this.incrementThreadCommentCount(comment.threadId);
    return result[0];
  }

  async listThreadComments(threadId: string): Promise<PodcastComment[]> {
    return this.db
      .select()
      .from(podcastComments)
      .where(eq(podcastComments.threadId, threadId))
      .orderBy(asc(podcastComments.createdAt));
  }

  // Video Comments
  async createVideoComment(comment: InsertVideoComment): Promise<VideoComment> {
    const result = await this.db.insert(videoComments).values(comment).returning();
    return result[0];
  }

  async listVideoComments(videoId: string): Promise<VideoComment[]> {
    return this.db
      .select()
      .from(videoComments)
      .where(eq(videoComments.videoId, videoId))
      .orderBy(asc(videoComments.createdAt));
  }

  async getUserVideoComments(userId: string): Promise<VideoComment[]> {
    return this.db
      .select()
      .from(videoComments)
      .where(eq(videoComments.userId, userId))
      .orderBy(desc(videoComments.createdAt));
  }

  async deleteVideoComment(commentId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(videoComments)
      .where(and(
        eq(videoComments.id, commentId),
        eq(videoComments.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await this.db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id));
  }

  // Password Reset Tokens
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const result = await this.db.insert(passwordResetTokens).values(token).returning();
    return result[0];
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const result = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return result[0];
  }

  async markTokenAsUsed(token: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredTokens(): Promise<void> {
    await this.db
      .delete(passwordResetTokens)
      .where(
        or(
          drizzleSql`${passwordResetTokens.expiresAt} < NOW()`,
          eq(passwordResetTokens.used, true)
        )
      );
  }

  // Phone Verification
  async createPhoneVerificationToken(token: InsertPhoneVerificationToken): Promise<PhoneVerificationToken> {
    const result = await this.db.insert(phoneVerificationTokens).values(token).returning();
    return result[0];
  }

  async getPhoneVerificationToken(phone: string, code: string): Promise<PhoneVerificationToken | undefined> {
    const result = await this.db
      .select()
      .from(phoneVerificationTokens)
      .where(
        and(
          eq(phoneVerificationTokens.phone, phone),
          eq(phoneVerificationTokens.code, code),
          eq(phoneVerificationTokens.used, false)
        )
      )
      .orderBy(desc(phoneVerificationTokens.createdAt));
    return result[0];
  }

  async markPhoneVerificationTokenUsed(id: string): Promise<void> {
    await this.db
      .update(phoneVerificationTokens)
      .set({ used: true })
      .where(eq(phoneVerificationTokens.id, id));
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone));
    return result[0];
  }

  async updateUserPhone(userId: string, phone: string): Promise<void> {
    await this.db
      .update(users)
      .set({ phone })
      .where(eq(users.id, userId));
  }

  async updateUserCity(userId: string, city: string): Promise<void> {
    await this.db
      .update(users)
      .set({ city })
      .where(eq(users.id, userId));
  }

  // Screen Share Sessions
  async createScreenShareSession(session: InsertScreenShareSession): Promise<ScreenShareSession> {
    const result = await this.db.insert(screenShareSessions).values(session).returning();
    return result[0];
  }

  async getScreenShareSession(meetingId: string): Promise<ScreenShareSession | undefined> {
    const result = await this.db
      .select()
      .from(screenShareSessions)
      .where(eq(screenShareSessions.meetingId, meetingId));
    return result[0];
  }

  async validateScreenShareSession(meetingId: string, passcode: string): Promise<ScreenShareSession | null> {
    const result = await this.db
      .select()
      .from(screenShareSessions)
      .where(
        and(
          eq(screenShareSessions.meetingId, meetingId),
          eq(screenShareSessions.passcode, passcode),
          eq(screenShareSessions.isActive, true)
        )
      );
    return result[0] || null;
  }

  async endScreenShareSession(meetingId: string, hostId: string): Promise<boolean> {
    const result = await this.db
      .update(screenShareSessions)
      .set({ isActive: false, endedAt: new Date() })
      .where(
        and(
          eq(screenShareSessions.meetingId, meetingId),
          eq(screenShareSessions.hostId, hostId)
        )
      )
      .returning();
    return result.length > 0;
  }

  async getActiveScreenShareSessions(): Promise<ScreenShareSession[]> {
    return this.db
      .select()
      .from(screenShareSessions)
      .where(eq(screenShareSessions.isActive, true))
      .orderBy(desc(screenShareSessions.createdAt));
  }

  // Scheduled Sessions (Calendar Integration)
  async createScheduledSession(session: InsertScheduledSession): Promise<ScheduledSession> {
    const result = await this.db.insert(scheduledSessions).values(session).returning();
    return result[0];
  }

  async getScheduledSession(id: string): Promise<ScheduledSession | undefined> {
    const result = await this.db
      .select()
      .from(scheduledSessions)
      .where(eq(scheduledSessions.id, id));
    return result[0];
  }

  async updateScheduledSession(id: string, updates: Partial<ScheduledSession>): Promise<ScheduledSession | null> {
    const result = await this.db
      .update(scheduledSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scheduledSessions.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteScheduledSession(id: string, hostId: string): Promise<boolean> {
    const result = await this.db
      .delete(scheduledSessions)
      .where(
        and(
          eq(scheduledSessions.id, id),
          eq(scheduledSessions.hostId, hostId)
        )
      )
      .returning();
    return result.length > 0;
  }

  async listUserScheduledSessions(userId: string): Promise<ScheduledSession[]> {
    return this.db
      .select()
      .from(scheduledSessions)
      .where(eq(scheduledSessions.hostId, userId))
      .orderBy(asc(scheduledSessions.scheduledStart));
  }

  async listUpcomingSessions(limit: number = 20): Promise<ScheduledSession[]> {
    return this.db
      .select()
      .from(scheduledSessions)
      .where(
        and(
          drizzleSql`${scheduledSessions.scheduledStart} > NOW()`,
          drizzleSql`${scheduledSessions.status} IN ('scheduled', 'confirmed')`
        )
      )
      .orderBy(asc(scheduledSessions.scheduledStart))
      .limit(limit);
  }

  async confirmSessionAttendance(sessionId: string, email: string): Promise<boolean> {
    const session = await this.getScheduledSession(sessionId);
    if (!session) return false;
    
    const currentAttendees = session.confirmedAttendees || [];
    if (currentAttendees.includes(email)) return true;
    
    await this.db
      .update(scheduledSessions)
      .set({ 
        confirmedAttendees: [...currentAttendees, email],
        updatedAt: new Date()
      })
      .where(eq(scheduledSessions.id, sessionId));
    return true;
  }

  async getSessionsNeedingReminder(): Promise<ScheduledSession[]> {
    // Get sessions starting in the next hour that haven't had reminder sent
    return this.db
      .select()
      .from(scheduledSessions)
      .where(
        and(
          eq(scheduledSessions.reminderSent, false),
          drizzleSql`${scheduledSessions.scheduledStart} > NOW()`,
          drizzleSql`${scheduledSessions.scheduledStart} < NOW() + INTERVAL '1 hour'`,
          drizzleSql`${scheduledSessions.status} IN ('scheduled', 'confirmed')`
        )
      );
  }

  async markReminderSent(sessionId: string): Promise<void> {
    await this.db
      .update(scheduledSessions)
      .set({ reminderSent: true, updatedAt: new Date() })
      .where(eq(scheduledSessions.id, sessionId));
  }

  // Admin Users
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    const result = await this.db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return result[0];
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    const result = await this.db.select().from(adminUsers).where(eq(adminUsers.username, username));
    return result[0];
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    const result = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return result[0];
  }

  async createAdminUser(data: InsertAdminUser): Promise<AdminUser> {
    const existingUsername = await this.getAdminUserByUsername(data.username);
    if (existingUsername) {
      throw new Error("Admin username already taken");
    }
    const existingEmail = await this.getAdminUserByEmail(data.email);
    if (existingEmail) {
      throw new Error("Admin email already taken");
    }

    const result = await this.db.insert(adminUsers).values({
      username: data.username,
      email: data.email,
      password: data.password,
      role: data.role || "developer",
    }).returning();
    return result[0];
  }

  async updateAdminUserLastLogin(id: string): Promise<void> {
    await this.db
      .update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, id));
  }

  async updateAdminCredentials(id: string, updates: { email?: string; password?: string }): Promise<AdminUser | null> {
    const admin = await this.getAdminUser(id);
    if (!admin) {
      return null;
    }
    if (updates.email && updates.email !== admin.email) {
      const existingEmail = await this.getAdminUserByEmail(updates.email);
      if (existingEmail) {
        throw new Error("Email already in use by another admin");
      }
    }
    const updateData: Partial<AdminUser> = {};
    if (updates.email) updateData.email = updates.email;
    if (updates.password) updateData.password = updates.password;

    if (Object.keys(updateData).length === 0) {
      return admin;
    }

    const result = await this.db
      .update(adminUsers)
      .set(updateData)
      .where(eq(adminUsers.id, id))
      .returning();
    return result[0] || null;
  }

  // Admin Sessions
  async getAdminSession(token: string): Promise<AdminSession | undefined> {
    const result = await this.db.select().from(adminSessions).where(eq(adminSessions.token, token));
    return result[0];
  }

  async createAdminSession(data: InsertAdminSession): Promise<AdminSession> {
    const result = await this.db.insert(adminSessions).values(data).returning();
    return result[0];
  }

  async deleteAdminSession(token: string): Promise<void> {
    await this.db.delete(adminSessions).where(eq(adminSessions.token, token));
  }

  async cleanExpiredAdminSessions(): Promise<void> {
    await this.db
      .delete(adminSessions)
      .where(drizzleSql`${adminSessions.expiresAt} < NOW()`);
  }

  // Admin Recovery Tokens
  async createAdminRecoveryToken(data: InsertAdminRecoveryToken): Promise<AdminRecoveryToken> {
    const result = await this.db.insert(adminRecoveryTokens).values(data).returning();
    return result[0];
  }

  async getAdminRecoveryToken(id: string): Promise<AdminRecoveryToken | undefined> {
    const result = await this.db.select().from(adminRecoveryTokens).where(eq(adminRecoveryTokens.id, id));
    return result[0];
  }

  async getActiveRecoveryTokenForAdmin(adminId: string): Promise<AdminRecoveryToken | undefined> {
    const result = await this.db
      .select()
      .from(adminRecoveryTokens)
      .where(
        and(
          eq(adminRecoveryTokens.adminId, adminId),
          eq(adminRecoveryTokens.used, false),
          drizzleSql`${adminRecoveryTokens.expiresAt} > NOW()`
        )
      );
    return result[0];
  }

  async updateRecoveryTokenVerification(id: string, updates: { emailVerified?: boolean; phoneVerified?: boolean }): Promise<AdminRecoveryToken | undefined> {
    const updateData: Partial<AdminRecoveryToken> = {};
    if (updates.emailVerified !== undefined) {
      updateData.emailVerified = updates.emailVerified;
    }
    if (updates.phoneVerified !== undefined) {
      updateData.phoneVerified = updates.phoneVerified;
    }
    if (Object.keys(updateData).length === 0) {
      return this.getAdminRecoveryToken(id);
    }
    const result = await this.db
      .update(adminRecoveryTokens)
      .set(updateData)
      .where(eq(adminRecoveryTokens.id, id))
      .returning();
    return result[0];
  }

  async markRecoveryTokenUsed(id: string): Promise<void> {
    await this.db
      .update(adminRecoveryTokens)
      .set({ used: true })
      .where(eq(adminRecoveryTokens.id, id));
  }

  async cleanExpiredRecoveryTokens(): Promise<void> {
    await this.db
      .delete(adminRecoveryTokens)
      .where(drizzleSql`${adminRecoveryTokens.expiresAt} < NOW()`);
  }

  async updateAdminPhone(id: string, phone: string): Promise<AdminUser | null> {
    const result = await this.db
      .update(adminUsers)
      .set({ phone })
      .where(eq(adminUsers.id, id))
      .returning();
    return result[0] || null;
  }

  // Admin Login Tokens (2FA login)
  async createAdminLoginToken(data: InsertAdminLoginToken): Promise<AdminLoginToken> {
    const result = await this.db.insert(adminLoginTokens).values(data).returning();
    return result[0];
  }

  async getAdminLoginToken(id: string): Promise<AdminLoginToken | undefined> {
    const result = await this.db.select().from(adminLoginTokens).where(eq(adminLoginTokens.id, id));
    return result[0];
  }

  async updateLoginTokenVerification(id: string, updates: { emailVerified?: boolean; phoneVerified?: boolean }): Promise<AdminLoginToken | undefined> {
    const updateData: Partial<AdminLoginToken> = {};
    if (updates.emailVerified !== undefined) {
      updateData.emailVerified = updates.emailVerified;
    }
    if (updates.phoneVerified !== undefined) {
      updateData.phoneVerified = updates.phoneVerified;
    }
    if (Object.keys(updateData).length === 0) {
      return this.getAdminLoginToken(id);
    }
    const result = await this.db
      .update(adminLoginTokens)
      .set(updateData)
      .where(eq(adminLoginTokens.id, id))
      .returning();
    return result[0];
  }

  async markLoginTokenUsed(id: string): Promise<void> {
    await this.db
      .update(adminLoginTokens)
      .set({ used: true })
      .where(eq(adminLoginTokens.id, id));
  }

  async cleanExpiredLoginTokens(): Promise<void> {
    await this.db
      .delete(adminLoginTokens)
      .where(drizzleSql`${adminLoginTokens.expiresAt} < NOW()`);
  }

  // Admin Dashboard Data
  async listAllUsers(page: number = 1, limit: number = 20): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const countResult = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(users);
    const total = Number(countResult[0]?.count || 0);

    const userList = await this.db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return { users: userList, total };
  }

  async getAdminDashboardStats(): Promise<{
    totalUsers: number;
    activeSubscriptions: number;
    recentSignups: User[];
    tierBreakdown: Record<string, number>;
    cityBreakdown: Array<{ city: string; count: number }>;
    recentQueries: Array<{ query: string; username: string; city: string | null; isAiSearch: boolean; createdAt: Date | null }>;
  }> {
    const countResult = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(users);
    const totalUsers = Number(countResult[0]?.count || 0);

    const subscriptionResult = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(users)
      .where(drizzleSql`${users.subscriptionTier} != 'amateur'`);
    const activeSubscriptions = Number(subscriptionResult[0]?.count || 0);

    const recentSignups = await this.db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(5);

    const tierCounts = await this.db
      .select({ 
        tier: users.subscriptionTier, 
        count: drizzleSql<number>`count(*)` 
      })
      .from(users)
      .groupBy(users.subscriptionTier);

    const tierBreakdown: Record<string, number> = {};
    tierCounts.forEach(row => {
      tierBreakdown[row.tier || "amateur"] = Number(row.count);
    });

    // City breakdown - count users by city
    const cityCounts = await this.db
      .select({ 
        city: users.city, 
        count: drizzleSql<number>`count(*)` 
      })
      .from(users)
      .where(drizzleSql`${users.city} IS NOT NULL AND ${users.city} != ''`)
      .groupBy(users.city)
      .orderBy(desc(drizzleSql`count(*)`))
      .limit(10);

    const cityBreakdown = cityCounts.map(row => ({
      city: row.city || "Unknown",
      count: Number(row.count)
    }));

    // Recent queries with user info - join searches with users
    const recentQueriesResult = await this.db
      .select({
        query: searches.query,
        username: users.username,
        city: users.city,
        isAiSearch: searches.isAiSearch,
        createdAt: searches.createdAt
      })
      .from(searches)
      .leftJoin(users, eq(searches.userId, users.id))
      .orderBy(desc(searches.createdAt))
      .limit(15);

    const recentQueries = recentQueriesResult.map(row => ({
      query: row.query,
      username: row.username || "Unknown",
      city: row.city,
      isAiSearch: Boolean(row.isAiSearch),
      createdAt: row.createdAt
    }));

    return { totalUsers, activeSubscriptions, recentSignups, tierBreakdown, cityBreakdown, recentQueries };
  }

  // Analytics
  async createPageView(data: InsertAnalyticsPageView): Promise<AnalyticsPageView> {
    const result = await this.db.insert(analyticsPageViews).values(data).returning();
    return result[0];
  }

  async getAnalyticsStats(): Promise<{
    activeUsers: number;
    totalPageViews: number;
    deviceBreakdown: Record<string, number>;
    countryBreakdown: Array<{ country: string; countryCode: string; count: number }>;
    sourceBreakdown: Record<string, number>;
    recentPageViews: AnalyticsPageView[];
    activeUsersList: Array<{ id: string; username: string; email: string | null; lastSeen: Date | null }>;
  }> {
    // Total page views
    const totalResult = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(analyticsPageViews);
    const totalPageViews = Number(totalResult[0]?.count || 0);

    // Active users: unique sessionIds from last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeResult = await this.db
      .select({ count: drizzleSql<number>`count(distinct ${analyticsPageViews.sessionId})` })
      .from(analyticsPageViews)
      .where(drizzleSql`${analyticsPageViews.createdAt} >= ${thirtyMinutesAgo}`);
    const activeUsers = Number(activeResult[0]?.count || 0);

    // Active logged-in users with their details (last 30 mins)
    const activeUsersResult = await this.db
      .select({
        userId: analyticsPageViews.userId,
        username: users.username,
        email: users.email,
        lastSeen: drizzleSql<Date>`MAX(${analyticsPageViews.createdAt})`
      })
      .from(analyticsPageViews)
      .innerJoin(users, eq(analyticsPageViews.userId, users.id))
      .where(drizzleSql`${analyticsPageViews.createdAt} >= ${thirtyMinutesAgo} AND ${analyticsPageViews.userId} IS NOT NULL`)
      .groupBy(analyticsPageViews.userId, users.username, users.email)
      .orderBy(drizzleSql`MAX(${analyticsPageViews.createdAt}) DESC`)
      .limit(50);
    
    const activeUsersList = activeUsersResult.map(row => ({
      id: row.userId!,
      username: row.username,
      email: row.email,
      lastSeen: row.lastSeen
    }));

    // Device breakdown
    const deviceResults = await this.db
      .select({
        deviceType: analyticsPageViews.deviceType,
        count: drizzleSql<number>`count(*)`
      })
      .from(analyticsPageViews)
      .groupBy(analyticsPageViews.deviceType);
    const deviceBreakdown: Record<string, number> = {};
    deviceResults.forEach(row => {
      deviceBreakdown[row.deviceType || "unknown"] = Number(row.count);
    });

    // Country breakdown
    const countryResults = await this.db
      .select({
        country: analyticsPageViews.country,
        countryCode: analyticsPageViews.countryCode,
        count: drizzleSql<number>`count(*)`
      })
      .from(analyticsPageViews)
      .groupBy(analyticsPageViews.country, analyticsPageViews.countryCode)
      .orderBy(drizzleSql`count(*) DESC`);
    const countryBreakdown = countryResults.map(row => ({
      country: row.country || "Unknown",
      countryCode: row.countryCode || "XX",
      count: Number(row.count)
    }));

    // Source breakdown (use COALESCE to prefer source over referrer)
    const sourceResults = await this.db
      .select({
        source: drizzleSql<string>`COALESCE(${analyticsPageViews.source}, ${analyticsPageViews.referrer}, 'direct')`,
        count: drizzleSql<number>`count(*)`
      })
      .from(analyticsPageViews)
      .groupBy(drizzleSql`COALESCE(${analyticsPageViews.source}, ${analyticsPageViews.referrer}, 'direct')`);
    const sourceBreakdown: Record<string, number> = {};
    sourceResults.forEach(row => {
      sourceBreakdown[row.source || "direct"] = Number(row.count);
    });

    // Recent page views (last 10)
    const recentPageViews = await this.db
      .select()
      .from(analyticsPageViews)
      .orderBy(desc(analyticsPageViews.createdAt))
      .limit(10);

    return { activeUsers, totalPageViews, deviceBreakdown, countryBreakdown, sourceBreakdown, recentPageViews, activeUsersList };
  }

  // Stream Recordings
  async createStreamRecording(recording: InsertStreamRecording): Promise<StreamRecording> {
    const result = await this.db.insert(streamRecordings).values(recording).returning();
    return result[0];
  }

  async getStreamRecording(id: string): Promise<StreamRecording | undefined> {
    const result = await this.db.select().from(streamRecordings).where(eq(streamRecordings.id, id));
    return result[0];
  }

  async listUserRecordings(userId: string): Promise<StreamRecording[]> {
    return this.db.select().from(streamRecordings)
      .where(eq(streamRecordings.userId, userId))
      .orderBy(desc(streamRecordings.createdAt));
  }

  async listPublicRecordings(limit: number = 20): Promise<StreamRecording[]> {
    return this.db.select().from(streamRecordings)
      .where(eq(streamRecordings.isPublic, true))
      .orderBy(desc(streamRecordings.createdAt))
      .limit(limit);
  }

  async deleteStreamRecording(id: string, userId: string): Promise<boolean> {
    const result = await this.db.delete(streamRecordings)
      .where(and(eq(streamRecordings.id, id), eq(streamRecordings.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async incrementRecordingViews(id: string): Promise<void> {
    await this.db.update(streamRecordings)
      .set({ views: drizzleSql`${streamRecordings.views} + 1` })
      .where(eq(streamRecordings.id, id));
  }

  async updateRecordingVisibility(id: string, userId: string, isPublic: boolean): Promise<StreamRecording | null> {
    const result = await this.db.update(streamRecordings)
      .set({ isPublic })
      .where(and(eq(streamRecordings.id, id), eq(streamRecordings.userId, userId)))
      .returning();
    return result[0] || null;
  }

  async updateRecordingUrl(id: string, url: string): Promise<void> {
    await this.db.update(streamRecordings)
      .set({ url })
      .where(eq(streamRecordings.id, id));
  }

  // User Vehicles (My Garage)
  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    // If this is set as primary, unset other primary vehicles first
    if (vehicle.isPrimary) {
      await this.db.update(vehicles)
        .set({ isPrimary: false })
        .where(eq(vehicles.userId, vehicle.userId));
    }
    const result = await this.db.insert(vehicles).values(vehicle).returning();
    return result[0];
  }

  async getVehicle(id: string, userId?: string): Promise<Vehicle | undefined> {
    if (userId) {
      const result = await this.db.select().from(vehicles)
        .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)));
      return result[0];
    }
    const result = await this.db.select().from(vehicles).where(eq(vehicles.id, id));
    return result[0];
  }

  async getUserVehicles(userId: string): Promise<Vehicle[]> {
    return this.db.select().from(vehicles)
      .where(eq(vehicles.userId, userId))
      .orderBy(desc(vehicles.isPrimary), desc(vehicles.createdAt));
  }

  async updateVehicle(id: string, userId: string, updates: Partial<InsertVehicle>): Promise<Vehicle | null> {
    // If setting as primary, unset other primary vehicles first
    if (updates.isPrimary) {
      await this.db.update(vehicles)
        .set({ isPrimary: false })
        .where(eq(vehicles.userId, userId));
    }
    const result = await this.db.update(vehicles)
      .set(updates)
      .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)))
      .returning();
    return result[0] || null;
  }

  async deleteVehicle(id: string, userId: string): Promise<boolean> {
    const result = await this.db.delete(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async setPrimaryVehicle(id: string, userId: string): Promise<Vehicle | null> {
    // First unset all primary vehicles for this user
    await this.db.update(vehicles)
      .set({ isPrimary: false })
      .where(eq(vehicles.userId, userId));
    
    // Then set the selected one as primary
    const result = await this.db.update(vehicles)
      .set({ isPrimary: true })
      .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId)))
      .returning();
    return result[0] || null;
  }

  async getPrimaryVehicle(userId: string): Promise<Vehicle | undefined> {
    const result = await this.db.select().from(vehicles)
      .where(and(eq(vehicles.userId, userId), eq(vehicles.isPrimary, true)));
    return result[0];
  }

  // User Video Views (Watch History)
  async recordVideoView(userId: string, videoId: string, playbackPosition?: number): Promise<{ view: UserVideoView; isNewView: boolean }> {
    // Check if a view record already exists for this user and video
    const existing = await this.db
      .select()
      .from(userVideoViews)
      .where(and(
        eq(userVideoViews.userId, userId),
        eq(userVideoViews.videoId, videoId)
      ));
    
    if (existing.length > 0) {
      // Update existing record - NOT a new view
      const result = await this.db
        .update(userVideoViews)
        .set({
          viewedAt: new Date(),
          playbackPosition: playbackPosition ?? existing[0].playbackPosition,
        })
        .where(eq(userVideoViews.id, existing[0].id))
        .returning();
      return { view: result[0], isNewView: false };
    } else {
      // Create new record - this IS a new view
      const result = await this.db
        .insert(userVideoViews)
        .values({
          userId,
          videoId,
          playbackPosition: playbackPosition ?? 0,
        })
        .returning();
      return { view: result[0], isNewView: true };
    }
  }

  async getUserRecentViews(userId: string, limit: number = 20): Promise<(UserVideoView & { video?: Video })[]> {
    const views = await this.db
      .select()
      .from(userVideoViews)
      .where(eq(userVideoViews.userId, userId))
      .orderBy(desc(userVideoViews.viewedAt))
      .limit(limit);
    
    // Fetch associated videos
    const results: (UserVideoView & { video?: Video })[] = [];
    for (const view of views) {
      const videoResult = await this.db
        .select()
        .from(videos)
        .where(eq(videos.id, view.videoId));
      results.push({
        ...view,
        video: videoResult[0],
      });
    }
    return results;
  }

  async getVideoViewCount(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(userVideoViews)
      .where(eq(userVideoViews.videoId, videoId));
    return Number(result[0]?.count || 0);
  }

  // Video Popularity by Country
  async getPopularVideosByCountry(countryCode?: string, limit: number = 20): Promise<Video[]> {
    const conditions = [
      or(eq(videos.isDeleted, false), drizzleSql`${videos.isDeleted} IS NULL`)
    ];
    
    if (countryCode) {
      conditions.push(eq(videos.countryCode, countryCode));
    }
    
    return this.db
      .select()
      .from(videos)
      .where(and(...conditions))
      .orderBy(desc(videos.views))
      .limit(limit);
  }

  async searchVideosByPopularity(query?: string, countryCode?: string, limit: number = 20): Promise<Video[]> {
    const conditions = [
      or(eq(videos.isDeleted, false), drizzleSql`${videos.isDeleted} IS NULL`)
    ];
    
    if (query) {
      const searchPattern = `%${query}%`;
      conditions.push(
        or(
          ilike(videos.title, searchPattern),
          ilike(videos.description, searchPattern)
        )
      );
    }
    
    if (countryCode) {
      conditions.push(eq(videos.countryCode, countryCode));
    }
    
    return this.db
      .select()
      .from(videos)
      .where(and(...conditions))
      .orderBy(desc(videos.views))
      .limit(limit);
  }

  // User Presence
  async setUserOnline(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ isOnline: true, lastSeen: new Date() })
      .where(eq(users.id, userId));
  }

  async setUserOffline(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ isOnline: false, lastSeen: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastSeen: new Date() })
      .where(eq(users.id, userId));
  }

  async getAllUsersWithPresence(): Promise<User[]> {
    return this.db.select().from(users).orderBy(desc(users.lastSeen));
  }

  // Email Signup Log
  async logEmailSignup(data: InsertEmailSignupLog): Promise<EmailSignupLog> {
    const result = await this.db.insert(emailSignupLog).values(data).returning();
    return result[0];
  }

  async getEmailSignups(limit: number = 100): Promise<EmailSignupLog[]> {
    return this.db
      .select()
      .from(emailSignupLog)
      .orderBy(desc(emailSignupLog.createdAt))
      .limit(limit);
  }

  async getEmailSignupCount(): Promise<number> {
    const result = await this.db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(emailSignupLog);
    return result[0]?.count || 0;
  }

  async createTip(tipData: InsertTip): Promise<Tip> {
    const result = await this.db.insert(tips).values(tipData).returning();
    return result[0];
  }

  async updateTipStatus(stripeSessionId: string, status: string): Promise<void> {
    await this.db
      .update(tips)
      .set({ status })
      .where(eq(tips.stripeSessionId, stripeSessionId));
  }

  async getTipsReceived(userId: string): Promise<Tip[]> {
    return this.db
      .select()
      .from(tips)
      .where(and(eq(tips.recipientId, userId), eq(tips.status, 'completed')))
      .orderBy(desc(tips.createdAt));
  }

  async getTipsSent(userId: string): Promise<Tip[]> {
    return this.db
      .select()
      .from(tips)
      .where(eq(tips.senderId, userId))
      .orderBy(desc(tips.createdAt));
  }
}

// Initialize database storage with connection string from environment
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create a shared pool and db instance for direct database access
const sharedPool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(sharedPool);

export const storage = new DatabaseStorage(databaseUrl);
