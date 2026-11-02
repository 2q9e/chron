-- Owner-scoped, manually authored study decks with versioned FSRS state.
BEGIN;

CREATE TABLE study_decks (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name text NOT NULL CHECK (
    char_length(name) BETWEEN 1 AND 120 AND btrim(name) <> ''
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, id)
);

CREATE TABLE study_cards (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  deck_id uuid NOT NULL,
  front text NOT NULL CHECK (
    char_length(front) BETWEEN 1 AND 4000 AND btrim(front) <> ''
  ),
  back text NOT NULL CHECK (
    char_length(back) BETWEEN 1 AND 8000 AND btrim(back) <> ''
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  algorithm_version text NOT NULL CHECK (char_length(algorithm_version) BETWEEN 1 AND 100),
  algorithm_parameters jsonb NOT NULL CHECK (jsonb_typeof(algorithm_parameters) = 'object'),
  due_at timestamptz NOT NULL,
  stability double precision NOT NULL CHECK (stability >= 0),
  difficulty double precision NOT NULL CHECK (difficulty >= 0 AND difficulty <= 10),
  elapsed_days integer NOT NULL CHECK (elapsed_days >= 0),
  scheduled_days integer NOT NULL CHECK (scheduled_days >= 0),
  learning_steps integer NOT NULL CHECK (learning_steps >= 0),
  reps integer NOT NULL CHECK (reps >= 0),
  lapses integer NOT NULL CHECK (lapses >= 0),
  state smallint NOT NULL CHECK (state BETWEEN 0 AND 3),
  last_review timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, deck_id, id),
  FOREIGN KEY (user_id, deck_id)
    REFERENCES study_decks (user_id, id) ON DELETE CASCADE
);

CREATE INDEX study_cards_owner_due_idx
  ON study_cards (user_id, deck_id, due_at, id);

CREATE INDEX study_cards_owner_created_idx
  ON study_cards (user_id, deck_id, created_at DESC, id);

CREATE TABLE study_card_reviews (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  deck_id uuid NOT NULL,
  card_id uuid NOT NULL,
  operation_key text NOT NULL CHECK (operation_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  rating text NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  reviewed_at timestamptz NOT NULL,
  due_before timestamptz NOT NULL,
  due_after timestamptz NOT NULL,
  algorithm_version text NOT NULL CHECK (char_length(algorithm_version) BETWEEN 1 AND 100),
  state_before jsonb NOT NULL CHECK (jsonb_typeof(state_before) = 'object'),
  state_after jsonb NOT NULL CHECK (jsonb_typeof(state_after) = 'object'),
  review_log jsonb NOT NULL CHECK (jsonb_typeof(review_log) = 'object'),
  request_revision integer NOT NULL CHECK (request_revision > 0),
  card_revision integer NOT NULL CHECK (card_revision > 1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, card_id, operation_key),
  FOREIGN KEY (user_id, deck_id, card_id)
    REFERENCES study_cards (user_id, deck_id, id) ON DELETE CASCADE
);

CREATE INDEX study_card_reviews_owner_card_idx
  ON study_card_reviews (user_id, deck_id, card_id, reviewed_at DESC, id);

ALTER TABLE study_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_decks FORCE ROW LEVEL SECURITY;
CREATE POLICY study_decks_owner_policy ON study_decks
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

ALTER TABLE study_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY study_cards_owner_policy ON study_cards
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

ALTER TABLE study_card_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_card_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY study_card_reviews_owner_policy ON study_card_reviews
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

COMMIT;
