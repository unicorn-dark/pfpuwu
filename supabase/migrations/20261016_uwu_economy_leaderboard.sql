-- UwU World MMO Economy, Leaderboard, Persistent Graffiti Wall & P2P Transfers Migration
-- Run this in your Supabase SQL Editor to enable persistent global leaderboards, win/loss records, 24h daily rewards, $UWU transfers, and persistent 48x32 Graffiti Wall state.

-- 1. PLAYER ECONOMY & LEADERBOARD TABLE
CREATE TABLE IF NOT EXISTS public.uwu_world_players (
    user_id TEXT PRIMARY KEY,
    x_username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT NOT NULL DEFAULT '/unicorn.png',
    chips BIGINT NOT NULL DEFAULT 2500 CHECK (chips >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    net_profit BIGINT NOT NULL DEFAULT 0,
    high_score BIGINT NOT NULL DEFAULT 0,
    last_daily_claim TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uwu_world_players_chips ON public.uwu_world_players (chips DESC);
CREATE INDEX IF NOT EXISTS idx_uwu_world_players_wins ON public.uwu_world_players (wins DESC);
CREATE INDEX IF NOT EXISTS idx_uwu_world_players_username ON public.uwu_world_players (LOWER(x_username));

ALTER TABLE public.uwu_world_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaderboard stats are publicly readable" ON public.uwu_world_players;
CREATE POLICY "Leaderboard stats are publicly readable"
    ON public.uwu_world_players FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Players can upsert world stats" ON public.uwu_world_players;
CREATE POLICY "Players can upsert world stats"
    ON public.uwu_world_players FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update world stats" ON public.uwu_world_players;
CREATE POLICY "Players can update world stats"
    ON public.uwu_world_players FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- 2. P2P $UWU CHIP TRANSFERS LOG TABLE
CREATE TABLE IF NOT EXISTS public.uwu_transfers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_username TEXT NOT NULL,
    recipient_username TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    note TEXT DEFAULT '' CHECK (char_length(note) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uwu_transfers_recipient ON public.uwu_transfers (LOWER(recipient_username), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uwu_transfers_created_at ON public.uwu_transfers (created_at DESC);

ALTER TABLE public.uwu_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Transfers are publicly readable" ON public.uwu_transfers;
CREATE POLICY "Transfers are publicly readable"
    ON public.uwu_transfers FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Players can insert transfers" ON public.uwu_transfers;
CREATE POLICY "Players can insert transfers"
    ON public.uwu_transfers FOR INSERT
    WITH CHECK (amount > 0);

-- 3. PERSISTENT 48x32 GRAFFITI WALL TABLE
CREATE TABLE IF NOT EXISTS public.uwu_graffiti_wall (
    room_id TEXT PRIMARY KEY DEFAULT 'main',
    data_url TEXT NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.uwu_graffiti_wall ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Graffiti wall is publicly readable" ON public.uwu_graffiti_wall;
CREATE POLICY "Graffiti wall is publicly readable"
    ON public.uwu_graffiti_wall FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Players can upsert graffiti wall" ON public.uwu_graffiti_wall;
CREATE POLICY "Players can upsert graffiti wall"
    ON public.uwu_graffiti_wall FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update graffiti wall" ON public.uwu_graffiti_wall;
CREATE POLICY "Players can update graffiti wall"
    ON public.uwu_graffiti_wall FOR UPDATE
    USING (true)
    WITH CHECK (true);
