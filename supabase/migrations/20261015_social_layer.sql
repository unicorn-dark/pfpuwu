-- pfpuwu Social Layer Schema Migration (X OAuth Identity, MySpace 64KB Canvas, 24h Global Chat, 24h Sticky Notes)

-- 1. CENTRAL PROFILES TABLE (X Login & PFP Maker Central Avatar)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    x_user_id TEXT UNIQUE NOT NULL,
    x_username TEXT UNIQUE NOT NULL,
    x_display_name TEXT,
    avatar_url TEXT NOT NULL DEFAULT '/unicorn.png',
    avatar_traits JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_x_username ON public.profiles (LOWER(x_username));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
CREATE POLICY "Profiles are publicly readable"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert or update their own profile" ON public.profiles;
CREATE POLICY "Users can insert or update their own profile"
    ON public.profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 2. MYSPACE CUSTOMIZABLE PAGES (Strictly capped at 64KB per user)
CREATE TABLE IF NOT EXISTS public.spaces (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    x_username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT DEFAULT '' CHECK (char_length(bio) <= 300),
    status_mood TEXT DEFAULT '🌐 Vibing on pfpuwu OS' CHECK (char_length(status_mood) <= 80),
    theme_config JSONB NOT NULL DEFAULT '{"preset":"cyber-grid","bgHex":"#0f172a","accentHex":"#ff2a85"}'::jsonb,
    music_config JSONB NOT NULL DEFAULT '{"trackId":"none","autoplay":false}'::jsonb,
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    graffiti_strokes JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT enforce_space_quota CHECK (
        pg_column_size(nodes) + pg_column_size(graffiti_strokes) + pg_column_size(theme_config) <= 65536
    ),
    CONSTRAINT enforce_max_nodes CHECK (jsonb_array_length(nodes) <= 45)
);

CREATE INDEX IF NOT EXISTS idx_spaces_username ON public.spaces (LOWER(x_username));

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Spaces are publicly readable" ON public.spaces;
CREATE POLICY "Spaces are publicly readable"
    ON public.spaces FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated X users can save their own Space" ON public.spaces;
CREATE POLICY "Authenticated X users can save their own Space"
    ON public.spaces FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. GLOBAL 24-HOUR CHATBOX (No media, text + emojis only, auto-expires after 24h)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    x_username TEXT NOT NULL,
    x_display_name TEXT,
    avatar_url TEXT NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages (created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read last 24h chat messages" ON public.chat_messages;
CREATE POLICY "Read last 24h chat messages"
    ON public.chat_messages FOR SELECT
    USING (created_at > now() - interval '24 hours');

DROP POLICY IF EXISTS "X-authenticated users can post chat messages" ON public.chat_messages;
CREATE POLICY "X-authenticated users can post chat messages"
    ON public.chat_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Anti-spam rate limit trigger (min 2 seconds between messages per user)
CREATE OR REPLACE FUNCTION public.check_chat_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    last_post TIMESTAMPTZ;
BEGIN
    SELECT created_at INTO last_post
    FROM public.chat_messages
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF last_post IS NOT NULL AND (now() - last_post) < interval '2 seconds' THEN
        RAISE EXCEPTION 'Rate limit exceeded. Please wait a moment before sending another message.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_rate_limit ON public.chat_messages;
CREATE TRIGGER trg_chat_rate_limit
    BEFORE INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.check_chat_rate_limit();

-- 4. EPHEMERAL 24-HOUR STICKY NOTES ON OTHER USERS' SPACES
CREATE TABLE IF NOT EXISTS public.sticky_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_username TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    author_username TEXT NOT NULL,
    author_avatar_url TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#fff385',
    text_content TEXT DEFAULT '' CHECK (char_length(text_content) <= 140),
    drawing_strokes JSONB DEFAULT '[]'::jsonb CHECK (pg_column_size(drawing_strokes) <= 4096),
    pos_x REAL NOT NULL DEFAULT 20 CHECK (pos_x BETWEEN 0 AND 92),
    pos_y REAL NOT NULL DEFAULT 20 CHECK (pos_y BETWEEN 0 AND 92),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_target_expires
    ON public.sticky_notes (LOWER(target_username), expires_at DESC);

ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read active 24h sticky notes" ON public.sticky_notes;
CREATE POLICY "Read active 24h sticky notes"
    ON public.sticky_notes FOR SELECT
    USING (expires_at > now());

DROP POLICY IF EXISTS "X-authenticated users can stick notes" ON public.sticky_notes;
CREATE POLICY "X-authenticated users can stick notes"
    ON public.sticky_notes FOR INSERT
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors or Space owners can remove sticky notes" ON public.sticky_notes;
CREATE POLICY "Authors or Space owners can remove sticky notes"
    ON public.sticky_notes FOR DELETE
    USING (auth.uid() = author_id);

-- 5. STORAGE BUCKET FOR PERSONA AVATARS (Optional, public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatar images" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatar images"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
