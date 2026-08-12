import {
  boolean,
  id,
  index,
  integer,
  pgTable,
  softDelete,
  text,
  timestamps,
  uuid,
} from "./common.js";
import { users } from "./identity.js";
import { vehicles } from "./garage.js";

export const videos = pgTable(
  "videos",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    tags: text("tags").array().notNull().default([]),
    streamAssetId: text("stream_asset_id"),
    status: text("status").notNull().default("processing"),
    durationSeconds: integer("duration_seconds"),
    thumbUrl: text("thumb_url"),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("videos_owner_idx").on(t.ownerId), index("videos_category_idx").on(t.category)],
);

export const videoLikes = pgTable(
  "video_likes",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("video_likes_video_idx").on(t.videoId)],
);

export const videoComments = pgTable(
  "video_comments",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("video_comments_video_idx").on(t.videoId)],
);

export const podcastShows = pgTable("podcast_shows", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  coverUrl: text("cover_url"),
  ...timestamps,
  ...softDelete,
});

export const podcastEpisodes = pgTable(
  "podcast_episodes",
  {
    id: id(),
    showId: uuid("show_id")
      .notNull()
      .references(() => podcastShows.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    mediaAssetId: text("media_asset_id"),
    durationSeconds: integer("duration_seconds"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("podcast_episodes_show_idx").on(t.showId)],
);

export const podcastComments = pgTable("podcast_comments", {
  id: id(),
  episodeId: uuid("episode_id")
    .notNull()
    .references(() => podcastEpisodes.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  ...timestamps,
  ...softDelete,
});

export const discussionThreads = pgTable("discussion_threads", {
  id: id(),
  episodeId: uuid("episode_id").references(() => podcastEpisodes.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  ...timestamps,
  ...softDelete,
});

export const posts = pgTable(
  "posts",
  {
    id: id(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    media: text("media").array().notNull().default([]),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    visibility: text("visibility").notNull().default("public"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("posts_author_idx").on(t.authorId)],
);

export const postComments = pgTable("post_comments", {
  id: id(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  ...timestamps,
  ...softDelete,
});

export const reactions = pgTable(
  "reactions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    kind: text("kind").notNull(),
    ...timestamps,
  },
  (t) => [index("reactions_subject_idx").on(t.subjectType, t.subjectId)],
);

export const watchHistory = pgTable(
  "watch_history",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    positionSeconds: integer("position_seconds").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("watch_history_user_idx").on(t.userId)],
);

export const qualifiedViews = pgTable(
  "qualified_views",
  {
    id: id(),
    mediaType: text("media_type").notNull(),
    mediaId: uuid("media_id").notNull(),
    viewerId: uuid("viewer_id").references(() => users.id, { onDelete: "set null" }),
    sessionId: text("session_id").notNull(),
    heartbeatCount: integer("heartbeat_count").notNull().default(0),
    valid: boolean("valid").notNull().default(false),
    invalidReason: text("invalid_reason"),
    ...timestamps,
  },
  (t) => [index("qualified_views_media_idx").on(t.mediaType, t.mediaId)],
);
