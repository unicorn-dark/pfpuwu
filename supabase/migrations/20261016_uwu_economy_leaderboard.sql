-- UwU World MMO Economy, Leaderboard & P2P Transfers Migration
-- Run this in your Supabase SQL Editor to enable persistent global leaderboards, win/loss records, 24h daily rewards, and $UWU transfers.

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

-- 3. ATOMIC P2P TRANSFER RPC FUNCTION (Optional helper for atomic balance transfer)
CREATE OR REPLACE FUNCTION public.transfer_uwu_chips(
    p_sender_id TEXT,
    p_sender_username TEXT,
    p_recipient_username TEXT,
    p_amount BIGINT,
    p_note TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
    v_sender_chips BIGINT;
    v_clean_recipient TEXT := LOWER(REGEXP_REPLACE(TRIM(p_recipient_username), '^@', ''));
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Transfer amount must be positive.');
    END IF;

    SELECT chips INTO v_sender_chips
    FROM public.uwu_world_players
    WHERE user_id = p_sender_id
    FOR UPDATE;

    IF v_sender_chips IS NULL OR v_sender_chips < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Insufficient $UWU balance.');
    END IF;

    -- Deduct from sender
    UPDATE public.uwu_world_players
    SET chips = chips - p_amount,
        updated_at = now()
    WHERE user_id = p_sender_id;

    -- Credit recipient if already in uwu_world_players, otherwise create entry if in profiles
    UPDATE public.uwu_world_players
    SET chips = chips + p_amount,
        updated_at = now()
    WHERE LOWER(x_username) = v_clean_recipient;

    IF NOT FOUND THEN
        INSERT INTO public.uwu_world_players (user_id, x_username, chips, updated_at)
        VALUES ('user_' || v_clean_recipient, v_clean_recipient, 2500 + p_amount, now())
        ON CONFLICT (user_id) DO UPDATE
        SET chips = public.uwu_world_players.chips + p_amount,
            updated_at = now();
    END IF;

    INSERT INTO public.uwu_transfers (sender_id, sender_username, recipient_username, amount, note)
    VALUES (p_sender_id, p_sender_username, v_clean_recipient, p_amount, COALESCE(p_note, ''));

    RETURN jsonb_build_object('ok', true, 'new_balance', v_sender_chips - p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
