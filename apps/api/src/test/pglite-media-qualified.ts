export const MEDIA_QUALIFIED_TEST_SQL = `
  CREATE TABLE IF NOT EXISTS qualified_views (
    id uuid PRIMARY KEY,
    media_type text NOT NULL,
    media_id uuid NOT NULL,
    creator_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    viewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
    session_id text NOT NULL,
    view_date text NOT NULL,
    heartbeat_count integer NOT NULL DEFAULT 0,
    watch_seconds integer NOT NULL DEFAULT 0,
    valid boolean NOT NULL DEFAULT false,
    invalid_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS qualified_views_media_idx ON qualified_views(media_type, media_id);
`;
