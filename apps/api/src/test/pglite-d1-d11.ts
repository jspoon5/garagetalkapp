export const D1_D11_TEST_SQL = `
  CREATE TYPE hazard_class AS ENUM ('none','caution','restricted_demo_only');
  CREATE TYPE quest_submission_status AS ENUM ('submitted','in_review','accepted','changes_requested');
  CREATE TYPE lesson_kind AS ENUM ('video','text','quiz');

  CREATE TABLE IF NOT EXISTS qualified_views (
    id uuid PRIMARY KEY,
    media_type text NOT NULL,
    media_id uuid NOT NULL,
    viewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
    session_id text NOT NULL,
    heartbeat_count integer NOT NULL DEFAULT 0,
    valid boolean NOT NULL DEFAULT false,
    invalid_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS qualified_views_media_idx ON qualified_views(media_type, media_id);
  ALTER TABLE qualified_views ADD COLUMN IF NOT EXISTS creator_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE qualified_views ADD COLUMN IF NOT EXISTS view_date text NOT NULL DEFAULT '1970-01-01';
  ALTER TABLE qualified_views ADD COLUMN IF NOT EXISTS watch_seconds integer NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX IF NOT EXISTS qualified_views_user_asset_day_uidx
    ON qualified_views(viewer_id, media_id, view_date);

  CREATE TABLE schools (
    id uuid PRIMARY KEY,
    creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug text NOT NULL UNIQUE,
    branding jsonb DEFAULT '{}',
    membership_price_cents integer,
    stripe_product_id text,
    status text NOT NULL DEFAULT 'pending',
    qualification_review text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );

  CREATE TABLE courses (
    id uuid PRIMARY KEY,
    creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    cover_url text,
    status text NOT NULL DEFAULT 'draft',
    price_cents integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );

  CREATE TABLE modules (
    id uuid PRIMARY KEY,
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title text NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE quizzes (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    pass_score integer NOT NULL DEFAULT 80,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE lessons (
    id uuid PRIMARY KEY,
    module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    kind lesson_kind NOT NULL,
    title text NOT NULL,
    video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
    body_md text,
    quiz_id uuid REFERENCES quizzes(id) ON DELETE SET NULL,
    order_index integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE quiz_attempts (
    id uuid PRIMARY KEY,
    quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score integer NOT NULL,
    mastery boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE skill_paths (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE quests (
    id uuid PRIMARY KEY,
    creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL,
    hazard_class hazard_class NOT NULL DEFAULT 'none',
    tools jsonb DEFAULT '[]',
    parts jsonb DEFAULT '[]',
    safety_checkpoints jsonb DEFAULT '[]',
    steps jsonb DEFAULT '[]',
    evidence_requirements jsonb DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );

  CREATE TABLE path_nodes (
    id uuid PRIMARY KEY,
    path_id uuid NOT NULL REFERENCES skill_paths(id) ON DELETE CASCADE,
    course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
    quest_id uuid REFERENCES quests(id) ON DELETE SET NULL,
    order_index integer NOT NULL DEFAULT 0,
    required boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE enrollments (
    id uuid PRIMARY KEY,
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE lesson_progress (
    id uuid PRIMARY KEY,
    lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, lesson_id)
  );

  CREATE TABLE path_progress (
    id uuid PRIMARY KEY,
    path_id uuid NOT NULL REFERENCES skill_paths(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_node_ids uuid[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, path_id)
  );

  CREATE TABLE quest_submissions (
    id uuid PRIMARY KEY,
    quest_id uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    evidence_media text[] NOT NULL DEFAULT '{}',
    step_acks jsonb DEFAULT '{}',
    status quest_submission_status NOT NULL DEFAULT 'submitted',
    reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
    review_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE skill_badges (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path_id uuid REFERENCES skill_paths(id) ON DELETE SET NULL,
    quest_id uuid REFERENCES quests(id) ON DELETE SET NULL,
    earned_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'learning_event',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, path_id),
    UNIQUE(user_id, quest_id)
  );

  CREATE TABLE pit_crews (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    member_ids uuid[] NOT NULL DEFAULT '{}',
    streak_data jsonb DEFAULT '{}',
    weekly_challenge_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE crew_members (
    id uuid PRIMARY KEY,
    crew_id uuid NOT NULL REFERENCES pit_crews(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    daily_streak integer NOT NULL DEFAULT 0,
    last_learning_day text,
    timezone text NOT NULL DEFAULT 'UTC',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(crew_id, user_id)
  );

  CREATE TABLE watch_parties (
    id uuid PRIMARY KEY,
    crew_id uuid NOT NULL REFERENCES pit_crews(id) ON DELETE CASCADE,
    video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    scheduled_at timestamptz,
    sync_state jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE avatar_items (
    id uuid PRIMARY KEY,
    kind text NOT NULL,
    name text NOT NULL,
    unlock_rule text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE learning_events (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type text NOT NULL,
    source_id uuid,
    context text NOT NULL DEFAULT 'learning',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(context = 'learning')
  );

  CREATE TABLE avatar_unlocks (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES avatar_items(id) ON DELETE CASCADE,
    source_event_type text NOT NULL,
    source_event_id uuid NOT NULL REFERENCES learning_events(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, item_id)
  );

  CREATE TABLE course_purchases (
    id uuid PRIMARY KEY,
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL,
    status text NOT NULL DEFAULT 'paid',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, course_id)
  );

  CREATE TABLE school_memberships (
    id uuid PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, school_id)
  );

  CREATE TABLE approved_corpus (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    source_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    published boolean NOT NULL DEFAULT false,
    hazard_class hazard_class NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE public_badge_shares (
    id uuid PRIMARY KEY,
    badge_id uuid NOT NULL REFERENCES skill_badges(id) ON DELETE CASCADE,
    slug text NOT NULL UNIQUE,
    disclaimer text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE content_presence_rooms (
    id uuid PRIMARY KEY,
    content_type text NOT NULL,
    content_id uuid NOT NULL,
    room_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(content_type, content_id)
  );

  INSERT INTO skill_paths (id, slug, title, description) VALUES
    ('0198a000-0000-7000-8000-000000000d31','maintenance_basics','Maintenance Basics','Foundational owner maintenance path.'),
    ('0198a000-0000-7000-8000-000000000d32','brakes','Brakes','Brake inspection and service fundamentals.'),
    ('0198a000-0000-7000-8000-000000000d33','electrical_diagnostics','Electrical Diagnostics','Safe electrical diagnostic workflow.'),
    ('0198a000-0000-7000-8000-000000000d34','welding','Welding','Educational welding theory and demos.'),
    ('0198a000-0000-7000-8000-000000000d35','detailing','Detailing','Interior and exterior detailing skills.'),
    ('0198a000-0000-7000-8000-000000000d36','restoration','Restoration','Restoration planning and documentation.'),
    ('0198a000-0000-7000-8000-000000000d37','shop_management','Shop Management','Garage operations and customer workflow.');
`;
