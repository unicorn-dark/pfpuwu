<!-- src/lib/components/os/MySpaceApp.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { supabase } from "$lib/supabaseClient";
    import { userProfile, requireXLogin } from "$lib/stores/auth";
    import { openWindow } from "$lib/stores/os";

    let { targetUsername = null }: { targetUsername?: string | null } = $props();

    // -------------------------------------------------------------------------
    // Types & Data Structures
    // -------------------------------------------------------------------------
    export interface SpaceArticle {
        id: string;
        title: string;
        slug: string;
        summary?: string;
        content: string;
        external_url?: string;
        external_source?: "substack" | "medium" | "mirror" | "x" | "custom";
        tags: string[];
        cover_image?: string;
        created_at: string;
        read_time_mins: number;
        reactions?: Record<string, number>;
    }

    export interface TopFriend {
        id: string;
        x_username: string;
        display_name: string;
        avatar_url: string;
        role_title: string;
    }

    export interface SpaceThemeConfig {
        preset: string;
        bgHex: string;
        accentHex: string;
        customBgUrl?: string;
        bgMode?: "cover" | "tile" | "center";
        overlayDarkness?: number; // 0 to 80%
    }

    interface SpaceNode {
        id: string;
        type: "sticker" | "marquee" | "figure";
        x: number;
        y: number;
        w: number;
        src?: string;
        text?: string;
        color?: string;
        bgColor?: string;
    }

    interface GraffitiStroke {
        color: string;
        size: number;
        points: [number, number][];
    }

    interface StickyNote {
        id: string;
        target_username: string;
        author_id: string;
        author_username: string;
        author_avatar_url: string;
        color: string;
        text_content: string;
        drawing_strokes: GraffitiStroke[];
        pos_x: number;
        pos_y: number;
        created_at: string;
        expires_at: string;
    }

    export interface SpaceDocument {
        user_id: string;
        x_username: string;
        display_name: string;
        avatar_url: string;
        bio: string;
        status_mood: string;
        hit_count: number;
        theme_config: SpaceThemeConfig;
        music_config: { trackId: string; autoplay?: boolean };
        nodes: SpaceNode[];
        writings: SpaceArticle[];
        top_friends: TopFriend[];
        graffiti_strokes: GraffitiStroke[];
        updated_at: string;
    }

    const MAX_QUOTA_BYTES = 65536;
    const TTL_24H_MS = 24 * 60 * 60 * 1000;
    const LOCAL_SPACES_KEY = "pfpuwu_spaces_v2";
    const LOCAL_STICKIES_KEY = "pfpuwu_stickies_24h_v2";

    // -------------------------------------------------------------------------
    // Presets & Constants
    // -------------------------------------------------------------------------
    const THEME_PRESETS = [
        {
            id: "win98-teal",
            name: "Win98 Teal",
            bgHex: "#008080",
            accentHex: "#ffff00",
            bgUrl: "",
            bgMode: "cover" as const
        },
        {
            id: "starfield",
            name: "🌌 Starfield",
            bgHex: "#030712",
            accentHex: "#60a5fa",
            bgUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&auto=format&fit=crop&q=60",
            bgMode: "cover" as const
        },
        {
            id: "matrix-cyber",
            name: "🟩 Matrix Code",
            bgHex: "#022c22",
            accentHex: "#4ade80",
            bgUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=60",
            bgMode: "cover" as const
        },
        {
            id: "vaporwave",
            name: "🌇 Sunset Grid",
            bgHex: "#3b0764",
            accentHex: "#f43f5e",
            bgUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=60",
            bgMode: "cover" as const
        },
        {
            id: "corkboard",
            name: "🪵 Corkboard",
            bgHex: "#451a03",
            accentHex: "#fbbf24",
            bgUrl: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&auto=format&fit=crop&q=60",
            bgMode: "tile" as const
        },
        {
            id: "gothic",
            name: "🖤 Vampire Emo",
            bgHex: "#18181b",
            accentHex: "#e11d48",
            bgUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=60",
            bgMode: "cover" as const
        }
    ];

    const CHIPTUNE_TRACKS = [
        { id: "none", name: "🔇 Mute", notes: [] },
        { id: "y2k-arp", name: "🎵 MIDI Synth 1", notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25] },
        { id: "arcade-8bit", name: "🕹️ 8-Bit Loop", notes: [440, 554.37, 659.25, 880, 659.25, 554.37] },
        { id: "chill-wave", name: "🌊 FM Chiptune", notes: [293.66, 369.99, 440, 587.33, 440, 369.99] }
    ];

    const DEFAULT_TOP_8: TopFriend[] = [
        { id: "f-1", x_username: "tom", display_name: "Tom (MySpace CEO)", avatar_url: "/unicorn.png", role_title: "My First Friend 🤝" },
        { id: "f-2", x_username: "cyber_nyx", display_name: "Nyx", avatar_url: "/traits/head/crown.png", role_title: "Tech Wizard 🧙‍♂️" },
        { id: "f-3", x_username: "sol_pixel", display_name: "PixelPFP", avatar_url: "/win-98.png", role_title: "Meme Co-founder 🦄" },
        { id: "f-4", x_username: "vitalik", display_name: "Vitalik", avatar_url: "/unicorn.png", role_title: "EVM Sensei 🧘" }
    ];

    const SEED_WRITINGS: SpaceArticle[] = [
        {
            id: "w-1",
            title: "Why Web 1.0 Personal Pages Were Peak Internet",
            slug: "why-web-1-was-peak",
            summary: "Before algorithm feeds flattened the internet into sterile gray rectangles, your profile was your digital home.",
            content: `# Why Web 1.0 Personal Pages Were Peak Internet

Remember when visiting a friend's website meant listening to their favorite MIDI song, dodging flying sparkly GIFs, and leaving a message in their guestbook?

## The Problem with Modern Socials
Modern platforms gave us infinite scroll, but took away our identity:
- Every profile looks identical
- Algorithms decide who sees your thoughts
- Zero creative customization

## Enter pfpuwu MySpace
With transparent avatars, 24h graffiti walls, and custom writings, we are bringing back the creative digital bedroom.

> "A personal website is not a resume. It is a playground."

### Roadmap for Creators
1. Claim your Space with 𝕏
2. Downscale and set your favorite wallpaper
3. Publish your thoughts & pin your Top 8 homies!`,
            tags: ["y2k", "web1", "philosophy"],
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
            read_time_mins: 2,
            reactions: { heart: 24, fire: 18, rocket: 9 }
        },
        {
            id: "w-2",
            title: "The Architecture of PFP Persona Traits",
            slug: "pfp-persona-architecture",
            external_url: "https://x.com",
            external_source: "x",
            summary: "A technical deep dive on rendering composite transparent avatars with HTML5 canvas and layered traits.",
            content: `Read the full breakdown on 𝕏 thread covering layered canvas caching, alpha channel transparency, and zero-bleed sprite composites.`,
            tags: ["tech", "graphics", "dev"],
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
            read_time_mins: 1,
            reactions: { heart: 12, fire: 15 }
        }
    ];

    const SEED_SPACES: Record<string, SpaceDocument> = {
        cyber_nyx: {
            user_id: "demo-1",
            x_username: "cyber_nyx",
            display_name: "Nyx",
            avatar_url: "/unicorn.png",
            bio: "Welcome to my digital bedroom. Leave a note on my wall or read my writings below! 💾✨",
            status_mood: "Building pfpuwu OS 🦄",
            hit_count: 4281,
            theme_config: {
                preset: "starfield",
                bgHex: "#030712",
                accentHex: "#60a5fa",
                customBgUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&auto=format&fit=crop&q=60",
                bgMode: "cover",
                overlayDarkness: 25
            },
            music_config: { trackId: "y2k-arp" },
            nodes: [
                {
                    id: "n-1",
                    type: "marquee",
                    x: 20,
                    y: 10,
                    w: 380,
                    text: "*** WELCOME TO @CYBER_NYX'S MYSPACE - STICK A NOTE OR EXPLORE MY WRITINGS ***",
                    color: "#00ffcc",
                    bgColor: "#000000"
                }
            ],
            writings: SEED_WRITINGS,
            top_friends: DEFAULT_TOP_8,
            graffiti_strokes: [],
            updated_at: new Date().toISOString()
        }
    };

    // -------------------------------------------------------------------------
    // Component State
    // -------------------------------------------------------------------------
    let viewedHandle = $state<string>("cyber_nyx");
    let spaceDoc = $state<SpaceDocument>(structuredClone(SEED_SPACES.cyber_nyx));
    let stickyNotes = $state<StickyNote[]>([]);
    let searchInput = $state("");
    let isUploadingBg = $state(false);

    // Active Tab in Space
    type SpaceTab = "wall" | "writings" | "top8" | "guestbook";
    let activeTab = $state<SpaceTab>("wall");

    // Drawer for Owner Controls
    let activeOwnerDrawer = $state<"none" | "theme" | "write" | "top8" | "stickers">("none");

    // Explore Spaces Modal
    let showExploreModal = $state(false);
    let exploreSearchFilter = $state("");

    // Reader Modal for Articles
    let activeReadingArticle = $state<SpaceArticle | null>(null);

    // Article Editor States
    let editorMode = $state<"write" | "link">("write");
    let editorTitle = $state("");
    let editorContent = $state("");
    let editorTags = $state("");
    let editorSummary = $state("");
    let editorExternalUrl = $state("");
    let editorExternalSource = $state<"substack" | "medium" | "mirror" | "x" | "custom">("substack");
    let showEditorPreview = $state(false);
    let editorTextarea: HTMLTextAreaElement | null = $state(null);

    // Sticky Note Creation Modal
    let showStickyModal = $state(false);
    let stickyText = $state("");
    let stickyColor = $state("#ffffaa");
    let stickyStrokes = $state<GraffitiStroke[]>([]);
    let stickyCanvas: HTMLCanvasElement | null = $state(null);
    let isDrawingSticky = false;
    let currentStickyPoints: [number, number][] = [];

    // Canvas Stage & Nodes Dragging
    let stageElement: HTMLDivElement | null = $state(null);
    let draggingItem = $state<{ kind: "node" | "sticky"; id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

    // Audio & Status
    let isPlayingMusic = $state(false);
    let audioCtx: AudioContext | null = null;
    let musicInterval: ReturnType<typeof setInterval> | null = null;
    let statusToast = $state("");
    let toastTimer: ReturnType<typeof setTimeout>;

    const isOwner = $derived(
        Boolean($userProfile && $userProfile.x_username.toLowerCase() === viewedHandle.toLowerCase())
    );

    function notify(msg: string) {
        statusToast = msg;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (statusToast = ""), 2600);
    }

    // -------------------------------------------------------------------------
    // Markdown Rendering & Formatting Helpers
    // -------------------------------------------------------------------------
    function renderMarkdown(md: string): string {
        if (!md) return "";
        let html = md
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="md-code-block"><code>${code.trim()}</code></pre>`);
        
        // Headings
        html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
        html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
        html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

        // Blockquotes
        html = html.replace(/^&gt; (.*$)/gim, "<blockquote>$1</blockquote>");

        // Bold, Italic, Strikethrough, Underline, Inline code
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
        html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

        // Horizontal rules
        html = html.replace(/^---$/gim, "<hr class='retro-hr' />");

        // Links: [text](url)
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Lists
        html = html.replace(/^[*-] (.*$)/gim, "<li>$1</li>");
        html = html.replace(/(<li>.*<\/li>)/gims, "<ul>$1</ul>");

        // Paragraphs
        html = html.split("\n\n").map(p => {
            if (/^<(h[1-3]|pre|blockquote|ul|hr)/.test(p.trim())) return p;
            return `<p>${p.replace(/\n/g, "<br />")}</p>`;
        }).join("\n");

        return html;
    }

    function insertFormatting(prefix: string, suffix: string = "") {
        if (!editorTextarea) return;
        const start = editorTextarea.selectionStart;
        const end = editorTextarea.selectionEnd;
        const selected = editorContent.slice(start, end);
        const replacement = `${prefix}${selected || "text"}${suffix}`;
        editorContent = editorContent.slice(0, start) + replacement + editorContent.slice(end);
        setTimeout(() => {
            if (editorTextarea) {
                editorTextarea.focus();
                editorTextarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4));
            }
        }, 10);
    }

    // -------------------------------------------------------------------------
    // Background Image Downscaling (First Principles Canvas Compression)
    // -------------------------------------------------------------------------
    async function downscaleImage(file: File, maxW = 1280, maxH = 800, quality = 0.78): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width;
                    let h = img.height;

                    if (w > maxW || h > maxH) {
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        reject(new Error("Canvas context creation failed"));
                        return;
                    }

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, w, h);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error("Failed to compress image"));
                        },
                        "image/jpeg",
                        quality
                    );
                };
                img.onerror = reject;
                img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function handleCustomBgUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        isUploadingBg = true;
        notify("Downscaling & uploading background...");

        try {
            // Downscale client-side to max 1280x800 JPEG
            const downscaledBlob = await downscaleImage(file, 1280, 800, 0.78);

            // Upload to Supabase Storage via our server upload endpoint
            const form = new FormData();
            form.append("file", downscaledBlob, "bg.jpg");
            form.append("bucket", "space-backgrounds");
            form.append("path", `${spaceDoc.user_id}/bg_${Date.now()}.jpg`);

            const res = await fetch("/api/storage/upload", {
                method: "POST",
                body: form
            });

            const data = await res.json();
            if (data.ok && data.publicUrl) {
                spaceDoc.theme_config.customBgUrl = data.publicUrl;
                notify("Custom background set & downscaled successfully! 🎨");
                await saveSpace();
            } else {
                // Fallback to local DataURL if server upload had issue
                const reader = new FileReader();
                reader.onload = async () => {
                    spaceDoc.theme_config.customBgUrl = reader.result as string;
                    notify("Background saved locally! 🎨");
                    await saveSpace();
                };
                reader.readAsDataURL(downscaledBlob);
            }
        } catch (err: any) {
            console.error("Bg upload error:", err);
            notify("Failed to process background image");
        } finally {
            isUploadingBg = false;
        }
    }

    // -------------------------------------------------------------------------
    // Space Loading & Saving
    // -------------------------------------------------------------------------
    function getAllLocalSpaces(): Record<string, SpaceDocument> {
        if (typeof window === "undefined") return SEED_SPACES;
        try {
            const raw = localStorage.getItem(LOCAL_SPACES_KEY);
            return raw ? { ...SEED_SPACES, ...JSON.parse(raw) } : { ...SEED_SPACES };
        } catch {
            return { ...SEED_SPACES };
        }
    }

    function saveLocalSpace(doc: SpaceDocument) {
        if (typeof window === "undefined") return;
        const all = getAllLocalSpaces();
        all[doc.x_username.toLowerCase()] = doc;
        localStorage.setItem(LOCAL_SPACES_KEY, JSON.stringify(all));
    }

    async function loadSpaceByHandle(rawHandle: string) {
        const clean = rawHandle.replace(/^@/, "").trim().toLowerCase();
        if (!clean) return;

        viewedHandle = clean;
        const allLocal = getAllLocalSpaces();

        // 1. Check local cache
        if (allLocal[clean]) {
            spaceDoc = structuredClone(allLocal[clean]);
        } else {
            // Generate a fresh template for user
            spaceDoc = {
                user_id: `user-${clean}`,
                x_username: clean,
                display_name: clean,
                avatar_url: "/unicorn.png",
                bio: `Welcome to @${clean}'s Win98 Space.`,
                status_mood: "Exploring the web 🌐",
                hit_count: Math.floor(Math.random() * 800) + 120,
                theme_config: { preset: "win98-teal", bgHex: "#008080", accentHex: "#ffff00", bgMode: "cover", overlayDarkness: 10 },
                music_config: { trackId: "none" },
                nodes: [],
                writings: [],
                top_friends: DEFAULT_TOP_8,
                graffiti_strokes: [],
                updated_at: new Date().toISOString()
            };
        }

        // 2. Fetch from Supabase
        try {
            const { data, error } = await supabase
                .from("spaces")
                .select("*")
                .eq("x_username", clean)
                .maybeSingle();

            if (!error && data) {
                spaceDoc = {
                    ...spaceDoc,
                    ...data,
                    writings: data.theme_config?.writings || spaceDoc.writings || [],
                    top_friends: data.theme_config?.top_friends || spaceDoc.top_friends || DEFAULT_TOP_8,
                    hit_count: (data.theme_config?.hit_count || spaceDoc.hit_count || 100) + 1
                };
                saveLocalSpace(spaceDoc);
            }
        } catch {}

        // Load 24h sticky notes for this space
        loadStickyNotes(clean);
    }

    async function saveSpace() {
        if (!isOwner) return;

        spaceDoc.updated_at = new Date().toISOString();
        spaceDoc.hit_count = (spaceDoc.hit_count || 0) + 1;

        // Pack writings & top_friends inside theme_config for storage compliance
        const packedThemeConfig = {
            ...spaceDoc.theme_config,
            writings: spaceDoc.writings.slice(0, 15),
            top_friends: spaceDoc.top_friends.slice(0, 8),
            hit_count: spaceDoc.hit_count
        };

        saveLocalSpace(spaceDoc);

        try {
            const { error } = await supabase.from("spaces").upsert(
                {
                    user_id: $userProfile!.id,
                    x_username: spaceDoc.x_username,
                    display_name: spaceDoc.display_name,
                    avatar_url: spaceDoc.avatar_url,
                    bio: spaceDoc.bio,
                    status_mood: spaceDoc.status_mood,
                    theme_config: packedThemeConfig,
                    music_config: spaceDoc.music_config,
                    nodes: spaceDoc.nodes.slice(0, 30),
                    graffiti_strokes: spaceDoc.graffiti_strokes.slice(0, 20),
                    updated_at: spaceDoc.updated_at
                },
                { onConflict: "user_id" }
            );

            if (error) {
                console.warn("Supabase save space warning:", error);
                notify("Space saved locally! 💾");
            } else {
                notify("Space saved successfully! 💾✨");
            }
        } catch {
            notify("Space saved to local storage! 💾");
        }
    }

    // -------------------------------------------------------------------------
    // Article Authoring & Publishing
    // -------------------------------------------------------------------------
    function publishArticle() {
        if (!editorTitle.trim()) {
            notify("Please enter an article title!");
            return;
        }

        const wordsCount = editorContent.trim().split(/\s+/).length;
        const readTime = Math.max(1, Math.ceil(wordsCount / 200));

        const newArticle: SpaceArticle = {
            id: `art-${Date.now()}`,
            title: editorTitle.trim(),
            slug: editorTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
            summary: editorSummary.trim() || editorContent.slice(0, 140).replace(/^[#*>-]+\s*/gm, "") + "...",
            content: editorContent.trim(),
            external_url: editorMode === "link" ? editorExternalUrl.trim() : undefined,
            external_source: editorMode === "link" ? editorExternalSource : undefined,
            tags: editorTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean),
            created_at: new Date().toISOString(),
            read_time_mins: readTime,
            reactions: { heart: 1, fire: 0, rocket: 0 }
        };

        spaceDoc.writings = [newArticle, ...spaceDoc.writings];
        saveSpace();

        // Reset editor
        editorTitle = "";
        editorContent = "";
        editorSummary = "";
        editorTags = "";
        editorExternalUrl = "";
        activeOwnerDrawer = "none";
        activeTab = "writings";
        notify("Article published to your Space! ✍️✨");
    }

    function deleteArticle(id: string) {
        if (!isOwner) return;
        spaceDoc.writings = spaceDoc.writings.filter(a => a.id !== id);
        saveSpace();
        notify("Article deleted");
    }

    function addReaction(article: SpaceArticle, type: string) {
        if (!article.reactions) article.reactions = {};
        article.reactions[type] = (article.reactions[type] || 0) + 1;
        spaceDoc.writings = [...spaceDoc.writings];
        saveLocalSpace(spaceDoc);
    }

    // -------------------------------------------------------------------------
    // Sticky Notes & 24h Wall Doodles
    // -------------------------------------------------------------------------
    function loadStickyNotes(handle: string) {
        try {
            const raw = localStorage.getItem(`${LOCAL_STICKIES_KEY}_${handle}`);
            if (raw) {
                const parsed = JSON.parse(raw) as StickyNote[];
                const cutoff = Date.now();
                stickyNotes = parsed.filter(n => new Date(n.expires_at).getTime() > cutoff);
            } else {
                stickyNotes = [];
            }
        } catch {
            stickyNotes = [];
        }
    }

    function saveStickyNotes(notes: StickyNote[], handle: string) {
        try {
            localStorage.setItem(`${LOCAL_STICKIES_KEY}_${handle}`, JSON.stringify(notes));
        } catch {}
    }

    async function postStickyNote() {
        if (!$userProfile) {
            requireXLogin("Sign in with 𝕏 to leave a note on this wall!");
            return;
        }

        if (!stickyText.trim() && stickyStrokes.length === 0) {
            notify("Write a message or draw something on the note!");
            return;
        }

        const newNote: StickyNote = {
            id: `sn-${Date.now()}`,
            target_username: viewedHandle,
            author_id: $userProfile.id,
            author_username: $userProfile.x_username,
            author_avatar_url: $userProfile.avatar_url || "/unicorn.png",
            color: stickyColor,
            text_content: stickyText.trim().slice(0, 180),
            drawing_strokes: stickyStrokes,
            pos_x: Math.floor(Math.random() * 55) + 20,
            pos_y: Math.floor(Math.random() * 45) + 20,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + TTL_24H_MS).toISOString()
        };

        stickyNotes = [newNote, ...stickyNotes];
        saveStickyNotes(stickyNotes, viewedHandle);

        showStickyModal = false;
        stickyText = "";
        stickyStrokes = [];
        notify("Your 24-hour note was pinned to the wall! 📌");
    }

    // -------------------------------------------------------------------------
    // Audio / Synthesizer
    // -------------------------------------------------------------------------
    function toggleMusic() {
        if (isPlayingMusic) {
            stopMusic();
            return;
        }
        const track = CHIPTUNE_TRACKS.find(t => t.id === spaceDoc.music_config.trackId);
        if (!track || track.notes.length === 0) {
            notify("Select a track in the Music menu first!");
            return;
        }
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) audioCtx = new AudioContextClass();
        if (audioCtx.state === "suspended") audioCtx.resume();

        isPlayingMusic = true;
        let idx = 0;
        musicInterval = setInterval(() => {
            if (!audioCtx || !isPlayingMusic) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "square";
            osc.frequency.setValueAtTime(track.notes[idx % track.notes.length], audioCtx.currentTime);
            gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.24);
            idx++;
        }, 260);
    }

    function stopMusic() {
        isPlayingMusic = false;
        if (musicInterval) {
            clearInterval(musicInterval);
            musicInterval = null;
        }
    }

    // -------------------------------------------------------------------------
    // Community Directory for Explore Modal
    // -------------------------------------------------------------------------
    const communitySpacesList = $derived.by(() => {
        const local = getAllLocalSpaces();
        const list = Object.values(local);
        if (!exploreSearchFilter.trim()) return list;
        const q = exploreSearchFilter.toLowerCase();
        return list.filter(
            s => s.x_username.toLowerCase().includes(q) || s.display_name.toLowerCase().includes(q) || s.bio.toLowerCase().includes(q)
        );
    });

    onMount(async () => {
        if (targetUsername) {
            await loadSpaceByHandle(targetUsername);
        } else if ($userProfile?.x_username) {
            await loadSpaceByHandle($userProfile.x_username);
        } else {
            await loadSpaceByHandle("cyber_nyx");
        }
    });

    onDestroy(() => {
        stopMusic();
        clearTimeout(toastTimer);
    });
</script>

<div class="win98-myspace-shell">
    <!-- =========================================================================
         1. TOP EXPLORER / ADDRESS BAR (No clutter, clean URL & Search)
         ========================================================================= -->
    <div class="space-top-toolbar">
        <div class="nav-control-group">
            {#if $userProfile}
                <button
                    type="button"
                    class="win98-btn {isOwner ? 'active-home' : ''}"
                    onclick={() => loadSpaceByHandle($userProfile!.x_username)}
                    title="Go to your Space"
                >
                    🏠 My Space
                </button>
            {:else}
                <button
                    type="button"
                    class="win98-btn primary pulse"
                    onclick={() => requireXLogin("Sign in with 𝕏 to claim your own space!")}
                >
                    𝕏 Claim Space
                </button>
            {/if}

            <button
                type="button"
                class="win98-btn explore-btn"
                onclick={() => (showExploreModal = true)}
                title="Search and discover other user spaces"
            >
                🌐 Explore Spaces
            </button>
        </div>

        <!-- Clean Browser Address Box -->
        <form
            class="space-address-bar"
            onsubmit={(e) => {
                e.preventDefault();
                if (searchInput.trim()) {
                    loadSpaceByHandle(searchInput);
                    searchInput = "";
                }
            }}
        >
            <span class="url-protocol">pfpuwu://space/@</span>
            <input
                type="text"
                class="win98-input space-url-input"
                placeholder={viewedHandle}
                bind:value={searchInput}
            />
            <button type="submit" class="win98-btn go-btn">Go 🚀</button>
        </form>

        <!-- Retro 8-bit Mini Player -->
        <div class="retro-audio-widget">
            <button
                type="button"
                class="win98-btn audio-btn {isPlayingMusic ? 'playing' : ''}"
                onclick={toggleMusic}
                title="Toggle MIDI / Chiptune track"
            >
                {isPlayingMusic ? "⏹ Mute" : "▶ Music"}
            </button>
            <span class="track-badge">
                {spaceDoc.music_config.trackId !== "none" ? "🎵 8-Bit" : "🔇"}
            </span>
        </div>
    </div>

    <!-- =========================================================================
         2. OWNER CONTROLS DRAWER (Expandable on demand)
         ========================================================================= -->
    {#if isOwner}
        <div class="owner-action-strip">
            <div class="strip-label">🛠️ Creator Studio:</div>
            <button
                type="button"
                class="win98-btn {activeOwnerDrawer === 'theme' ? 'active-drawer' : ''}"
                onclick={() => (activeOwnerDrawer = activeOwnerDrawer === "theme" ? "none" : "theme")}
            >
                🎨 Background & Design
            </button>
            <button
                type="button"
                class="win98-btn {activeOwnerDrawer === 'write' ? 'active-drawer' : ''}"
                onclick={() => {
                    activeOwnerDrawer = activeOwnerDrawer === "write" ? "none" : "write";
                    if (activeOwnerDrawer === "write") activeTab = "writings";
                }}
            >
                ✍️ Write / Link Article
            </button>
            <button
                type="button"
                class="win98-btn {activeOwnerDrawer === 'top8' ? 'active-drawer' : ''}"
                onclick={() => {
                    activeOwnerDrawer = activeOwnerDrawer === "top8" ? "none" : "top8";
                    if (activeOwnerDrawer === "top8") activeTab = "top8";
                }}
            >
                👥 Edit Top 8
            </button>
            <button type="button" class="win98-btn primary save-strip-btn" onclick={saveSpace}>
                💾 Save Space
            </button>
        </div>

        <!-- Expandable Drawers -->
        {#if activeOwnerDrawer === "theme"}
            <div class="expanded-drawer win98-inset">
                <div class="drawer-header">
                    <strong>🎨 Background & Style Settings</strong>
                    <button type="button" class="win98-btn-close" onclick={() => (activeOwnerDrawer = "none")}>✕</button>
                </div>
                <div class="drawer-grid">
                    <!-- Upload Custom Downscaled Background -->
                    <div class="drawer-panel">
                        <span class="panel-title">1. Upload Custom Background (Auto-Downscaled)</span>
                        <div class="upload-control-row">
                            <input
                                type="file"
                                accept="image/*"
                                id="bg-upload-input"
                                class="hidden-file-input"
                                onchange={handleCustomBgUpload}
                            />
                            <label for="bg-upload-input" class="win98-btn primary upload-label">
                                {isUploadingBg ? "⏳ Downscaling..." : "📁 Choose Image..."}
                            </label>
                            {#if spaceDoc.theme_config.customBgUrl}
                                <button
                                    type="button"
                                    class="win98-btn"
                                    onclick={() => {
                                        spaceDoc.theme_config.customBgUrl = "";
                                        saveSpace();
                                    }}
                                >
                                    Reset Bg
                                </button>
                            {/if}
                        </div>
                        <span class="help-text">Automatically optimized and downscaled to 1280px max for fast loading.</span>

                        <!-- Background Display Mode -->
                        <div class="mode-select-row">
                            <span class="field-label">Display Mode:</span>
                            <button
                                type="button"
                                class="win98-btn {spaceDoc.theme_config.bgMode === 'cover' ? 'primary' : ''}"
                                onclick={() => (spaceDoc.theme_config.bgMode = "cover")}
                            >
                                Fullscreen Wallpaper
                            </button>
                            <button
                                type="button"
                                class="win98-btn {spaceDoc.theme_config.bgMode === 'tile' ? 'primary' : ''}"
                                onclick={() => (spaceDoc.theme_config.bgMode = "tile")}
                            >
                                Tiled Pattern (90s)
                            </button>
                        </div>

                        <!-- Readability Overlay Darkness -->
                        <div class="darkness-slider-row">
                            <span class="field-label">Text Readability Overlay:</span>
                            <input
                                type="range"
                                min="0"
                                max="75"
                                bind:value={spaceDoc.theme_config.overlayDarkness}
                            />
                            <span>{spaceDoc.theme_config.overlayDarkness || 0}%</span>
                        </div>
                    </div>

                    <!-- Iconic Presets -->
                    <div class="drawer-panel">
                        <span class="panel-title">2. Or Pick a Retro Preset</span>
                        <div class="presets-row">
                            {#each THEME_PRESETS as preset}
                                <button
                                    type="button"
                                    class="win98-btn preset-pill {spaceDoc.theme_config.preset === preset.id ? 'active' : ''}"
                                    onclick={() => {
                                        spaceDoc.theme_config.preset = preset.id;
                                        spaceDoc.theme_config.bgHex = preset.bgHex;
                                        spaceDoc.theme_config.accentHex = preset.accentHex;
                                        if (preset.bgUrl) {
                                            spaceDoc.theme_config.customBgUrl = preset.bgUrl;
                                            spaceDoc.theme_config.bgMode = preset.bgMode;
                                        }
                                    }}
                                >
                                    {preset.name}
                                </button>
                            {/each}
                        </div>

                        <div class="status-editor-row">
                            <span class="field-label">My Status & Mood:</span>
                            <input
                                type="text"
                                class="win98-input"
                                placeholder="Status mood (e.g. Building memes 🦄)"
                                maxlength="60"
                                bind:value={spaceDoc.status_mood}
                            />
                        </div>
                    </div>
                </div>
            </div>
        {:else if activeOwnerDrawer === "write"}
            <!-- =========================================================================
                 WRITING SUITE & FORMATTING TOOLBAR
                 ========================================================================= -->
            <div class="expanded-drawer win98-inset">
                <div class="drawer-header">
                    <strong>✍️ Writing Studio & Blog Publisher</strong>
                    <div class="header-buttons">
                        <button
                            type="button"
                            class="win98-btn {editorMode === 'write' ? 'primary' : ''}"
                            onclick={() => (editorMode = "write")}
                        >
                            ✍️ Original Essay
                        </button>
                        <button
                            type="button"
                            class="win98-btn {editorMode === 'link' ? 'primary' : ''}"
                            onclick={() => (editorMode = "link")}
                        >
                            🔗 Link External Blog (Substack / Medium / Mirror / 𝕏)
                        </button>
                        <button type="button" class="win98-btn-close" onclick={() => (activeOwnerDrawer = "none")}>✕</button>
                    </div>
                </div>

                <div class="editor-workspace">
                    <div class="editor-inputs-row">
                        <input
                            type="text"
                            class="win98-input article-title-input"
                            placeholder="Article Title (e.g. Why Web 1.0 Was Peak)..."
                            maxlength="100"
                            bind:value={editorTitle}
                        />
                        <input
                            type="text"
                            class="win98-input article-tags-input"
                            placeholder="Tags (comma separated: crypto, y2k, memes)..."
                            bind:value={editorTags}
                        />
                    </div>

                    {#if editorMode === "link"}
                        <!-- External Blog Link Fields -->
                        <div class="external-link-config win98-inset">
                            <div class="ext-row">
                                <span class="field-label">External Platform:</span>
                                <select class="win98-input ext-select" bind:value={editorExternalSource}>
                                    <option value="substack">Substack ✉️</option>
                                    <option value="medium">Medium 📖</option>
                                    <option value="mirror">Mirror.xyz 🪞</option>
                                    <option value="x">𝕏 / Twitter Thread 🧵</option>
                                    <option value="custom">Personal Website 🌐</option>
                                </select>
                                <input
                                    type="url"
                                    class="win98-input flex-1"
                                    placeholder="Paste URL (https://substack.com/...)"
                                    bind:value={editorExternalUrl}
                                />
                            </div>
                            <textarea
                                class="win98-input ext-summary-input"
                                placeholder="Short synopsis / hook for your readers..."
                                maxlength="280"
                                bind:value={editorSummary}
                            ></textarea>
                        </div>
                    {:else}
                        <!-- Rich Writing Formatting Toolbar -->
                        <div class="formatting-toolbar">
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("**", "**")} title="Bold"><strong>B</strong></button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("*", "*")} title="Italic"><em>I</em></button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("<u>", "</u>")} title="Underline"><u>U</u></button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("~~", "~~")} title="Strikethrough"><del>S</del></button>
                            <span class="tool-sep">|</span>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("# ")} title="Header 1">H1</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("## ")} title="Header 2">H2</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("### ")} title="Header 3">H3</button>
                            <span class="tool-sep">|</span>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("> ")} title="Blockquote">“ Quote</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("```\n", "\n```")} title="Code Block">&lt;/&gt;</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("- ")} title="Bullet List">• List</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("1. ")} title="Numbered List">1. List</button>
                            <span class="tool-sep">|</span>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("[Link Title](", ")")} title="Insert Link">🔗 Link</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("![Image Alt](", ")")} title="Insert Image">🖼️ Img</button>
                            <button type="button" class="win98-btn tool-btn" onclick={() => insertFormatting("\n---\n")} title="Horizontal Line">---</button>
                            <span class="tool-sep">|</span>
                            <button
                                type="button"
                                class="win98-btn preview-toggle-btn {showEditorPreview ? 'primary' : ''}"
                                onclick={() => (showEditorPreview = !showEditorPreview)}
                            >
                                {showEditorPreview ? "✍️ Edit Mode" : "👁️ Live Preview"}
                            </button>
                        </div>

                        {#if showEditorPreview}
                            <div class="editor-live-preview win98-inset">
                                <h2>{editorTitle || "Untitled Draft"}</h2>
                                {@html renderMarkdown(editorContent)}
                            </div>
                        {:else}
                            <textarea
                                bind:this={editorTextarea}
                                class="win98-input article-body-textarea"
                                placeholder="Write your essay, story, tutorial or thoughts using markdown..."
                                bind:value={editorContent}
                            ></textarea>
                        {/if}
                    {/if}

                    <div class="editor-footer-row">
                        <span class="char-count">
                            {editorContent.split(/\s+/).filter(Boolean).length} words
                        </span>
                        <button type="button" class="win98-btn primary publish-btn" onclick={publishArticle}>
                            🚀 Publish Article
                        </button>
                    </div>
                </div>
            </div>
        {:else if activeOwnerDrawer === "top8"}
            <div class="expanded-drawer win98-inset">
                <div class="drawer-header">
                    <strong>👥 Edit Your Top 8 Homies</strong>
                    <button type="button" class="win98-btn-close" onclick={() => (activeOwnerDrawer = "none")}>✕</button>
                </div>
                <div class="top8-editor-grid">
                    {#each spaceDoc.top_friends as friend, i}
                        <div class="top8-edit-card win98-inset">
                            <span class="slot-num">#{i + 1}</span>
                            <input
                                type="text"
                                class="win98-input"
                                placeholder="@handle"
                                bind:value={friend.x_username}
                            />
                            <input
                                type="text"
                                class="win98-input"
                                placeholder="Custom Title (e.g. Bestie)"
                                bind:value={friend.role_title}
                            />
                        </div>
                    {/each}
                </div>
                <button type="button" class="win98-btn primary mt-2" onclick={saveSpace}>Save Top 8</button>
            </div>
        {/if}
    {/if}

    <!-- =========================================================================
         3. MAIN SPACE VIEWPORT (Custom Wallpaper + Overlay + Content)
         ========================================================================= -->
    <div
        class="space-viewport-container {spaceDoc.theme_config.bgMode === 'tile' ? 'is-tiled' : 'is-cover'}"
        style="
            background-color: {spaceDoc.theme_config.bgHex};
            {spaceDoc.theme_config.customBgUrl ? `background-image: url('${spaceDoc.theme_config.customBgUrl}');` : ''}
        "
    >
        <!-- Darkening Overlay to Guarantee Readability -->
        <div
            class="readability-scrim"
            style="background-color: rgba(0, 0, 0, {(spaceDoc.theme_config.overlayDarkness || 0) / 100});"
        ></div>

        <div class="space-content-wrap">
            <!-- -----------------------------------------------------------------
                 HERO PROFILE CARD (Win98 Identity Box)
                 ----------------------------------------------------------------- -->
            <div class="profile-hero-card win98-window">
                <div class="card-titlebar">
                    <span>@{spaceDoc.x_username}.exe</span>
                    <span class="online-indicator">🟢 Online</span>
                </div>
                <div class="card-body">
                    <div class="avatar-column">
                        <div class="hero-avatar-box">
                            <img
                                src={spaceDoc.avatar_url || "/unicorn.png"}
                                alt={spaceDoc.x_username}
                                class="hero-persona-img"
                                onerror={(e: any) => (e.currentTarget.src = "/unicorn.png")}
                            />
                        </div>
                        {#if isOwner}
                            <button
                                type="button"
                                class="win98-btn change-avatar-btn"
                                onclick={() => openWindow("pfp-app", "PFP Maker")}
                            >
                                🎨 Change Avatar
                            </button>
                        {/if}
                    </div>

                    <div class="details-column">
                        <div class="hero-name-row">
                            <h1 class="hero-display-name">{spaceDoc.display_name}</h1>
                            <span class="x-badge">𝕏 @{spaceDoc.x_username}</span>
                        </div>

                        <div class="mood-status-pill">
                            <span>Mood: <strong>{spaceDoc.status_mood || "Vibing 🦄"}</strong></span>
                        </div>

                        {#if spaceDoc.bio}
                            <p class="hero-bio">{spaceDoc.bio}</p>
                        {/if}

                        <div class="hero-metrics-row">
                            <!-- Nostalgic 7-Segment Hit Counter -->
                            <div class="hit-counter-box" title="Profile View Counter">
                                <span class="counter-label">VISITORS:</span>
                                <span class="seven-segment">
                                    {String(spaceDoc.hit_count || 100).padStart(6, "0")}
                                </span>
                            </div>

                            <div class="hero-buttons">
                                {#if !isOwner}
                                    <button
                                        type="button"
                                        class="win98-btn primary pulse"
                                        onclick={() => (showStickyModal = true)}
                                    >
                                        📌 Stick 24h Note
                                    </button>
                                {:else}
                                    <button
                                        type="button"
                                        class="win98-btn"
                                        onclick={() => (activeOwnerDrawer = "theme")}
                                    >
                                        🎨 Edit Space
                                    </button>
                                {/if}
                                <button
                                    type="button"
                                    class="win98-btn"
                                    onclick={() => {
                                        if (navigator.clipboard) {
                                            navigator.clipboard.writeText(window.location.href);
                                            notify("Space link copied to clipboard! 📋");
                                        }
                                    }}
                                >
                                    🔗 Share Space
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- -----------------------------------------------------------------
                 SECTION TABS (Wall Canvas, Writings, Top 8, Guestbook)
                 ----------------------------------------------------------------- -->
            <div class="space-tabs-bar">
                <button
                    type="button"
                    class="tab-btn {activeTab === 'wall' ? 'active' : ''}"
                    onclick={() => (activeTab = "wall")}
                >
                    🏠 Canvas & Wall
                </button>
                <button
                    type="button"
                    class="tab-btn {activeTab === 'writings' ? 'active' : ''}"
                    onclick={() => (activeTab = "writings")}
                >
                    ✍️ Writings & Articles ({spaceDoc.writings?.length || 0})
                </button>
                <button
                    type="button"
                    class="tab-btn {activeTab === 'top8' ? 'active' : ''}"
                    onclick={() => (activeTab = "top8")}
                >
                    👥 Top 8 Homies ({spaceDoc.top_friends?.length || 0})
                </button>
                <button
                    type="button"
                    class="tab-btn {activeTab === 'guestbook' ? 'active' : ''}"
                    onclick={() => (activeTab = "guestbook")}
                >
                    📌 24h Wall Notes ({stickyNotes.length})
                </button>
            </div>

            <!-- -----------------------------------------------------------------
                 TAB 1: CANVAS & 24H WALL
                 ----------------------------------------------------------------- -->
            {#if activeTab === "wall"}
                <div class="wall-tab-stage win98-inset" bind:this={stageElement}>
                    <!-- Marquee Node -->
                    {#each spaceDoc.nodes as node (node.id)}
                        {#if node.type === "marquee"}
                            <div class="wall-marquee-box">
                                <marquee behavior="scroll" direction="left">{node.text}</marquee>
                            </div>
                        {/if}
                    {/each}

                    <!-- Pinned 24-Hour Sticky Notes on Wall -->
                    {#if stickyNotes.length === 0}
                        <div class="empty-wall-hint">
                            <span>📌 No notes on this wall yet.</span>
                            <button
                                type="button"
                                class="win98-btn primary mt-2"
                                onclick={() => (showStickyModal = true)}
                            >
                                Leave the First 24h Note!
                            </button>
                        </div>
                    {:else}
                        <div class="sticky-notes-masonry">
                            {#each stickyNotes as note (note.id)}
                                <div
                                    class="wall-sticky-card"
                                    style="background-color: {note.color};"
                                >
                                    <div class="sticky-pin">📍</div>
                                    <div class="sticky-author-row">
                                        <button
                                            type="button"
                                            class="author-badge-btn"
                                            onclick={() => loadSpaceByHandle(note.author_username)}
                                        >
                                            <img src={note.author_avatar_url || "/unicorn.png"} alt="author" class="sticky-mini-avatar" />
                                            <span>@{note.author_username}</span>
                                        </button>
                                        <span class="expiry-pill">24h TTL</span>
                                    </div>
                                    <p class="sticky-content">{note.text_content}</p>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

            <!-- -----------------------------------------------------------------
                 TAB 2: WRITINGS & ARTICLES (The Brand New Platform)
                 ----------------------------------------------------------------- -->
            {:else if activeTab === "writings"}
                <div class="writings-tab-stage">
                    <div class="writings-header-row">
                        <div>
                            <h2>Articles & Logs</h2>
                            <p class="sub-text">Essays, tutorials, and linked blogs by @{spaceDoc.x_username}</p>
                        </div>
                        {#if isOwner}
                            <button
                                type="button"
                                class="win98-btn primary"
                                onclick={() => (activeOwnerDrawer = "write")}
                            >
                                ✍️ Write New Article
                            </button>
                        {/if}
                    </div>

                    {#if !spaceDoc.writings || spaceDoc.writings.length === 0}
                        <div class="empty-writings-box win98-inset">
                            <span>📝 No articles published yet.</span>
                            {#if isOwner}
                                <button
                                    type="button"
                                    class="win98-btn primary mt-2"
                                    onclick={() => (activeOwnerDrawer = "write")}
                                >
                                    Write your first essay or link a blog!
                                </button>
                            {/if}
                        </div>
                    {:else}
                        <div class="articles-grid">
                            {#each spaceDoc.writings as article (article.id)}
                                <div class="article-card win98-window">
                                    <div class="article-card-titlebar">
                                        <span>{article.title}</span>
                                        {#if article.external_source}
                                            <span class="source-tag {article.external_source}">
                                                {article.external_source.toUpperCase()}
                                            </span>
                                        {:else}
                                            <span class="source-tag internal">ESSAY</span>
                                        {/if}
                                    </div>

                                    <div class="article-card-body">
                                        <div class="article-meta-row">
                                            <span>📅 {new Date(article.created_at).toLocaleDateString()}</span>
                                            <span>⏱️ {article.read_time_mins} min read</span>
                                        </div>

                                        <p class="article-summary-text">{article.summary}</p>

                                        {#if article.tags && article.tags.length > 0}
                                            <div class="tags-row">
                                                {#each article.tags as tag}
                                                    <span class="tag-chip">#{tag}</span>
                                                {/each}
                                            </div>
                                        {/if}

                                        <div class="card-footer-row">
                                            <button
                                                type="button"
                                                class="win98-btn primary read-btn"
                                                onclick={() => (activeReadingArticle = article)}
                                            >
                                                📖 Read Article
                                            </button>

                                            {#if article.external_url}
                                                <a
                                                    href={article.external_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="win98-btn ext-btn"
                                                >
                                                    ↗ Open External
                                                </a>
                                            {/if}

                                            {#if isOwner}
                                                <button
                                                    type="button"
                                                    class="win98-btn delete-art-btn"
                                                    onclick={() => deleteArticle(article.id)}
                                                    title="Delete this article"
                                                >
                                                    🗑️
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

            <!-- -----------------------------------------------------------------
                 TAB 3: TOP 8 HOMIES GRID
                 ----------------------------------------------------------------- -->
            {:else if activeTab === "top8"}
                <div class="top8-tab-stage">
                    <div class="top8-header-row">
                        <div>
                            <h2>@{spaceDoc.x_username}'s Top 8 Homies</h2>
                            <p class="sub-text">The elite inner circle of this Space.</p>
                        </div>
                        {#if isOwner}
                            <button
                                type="button"
                                class="win98-btn"
                                onclick={() => (activeOwnerDrawer = "top8")}
                            >
                                ✏️ Edit Top 8
                            </button>
                        {/if}
                    </div>

                    <div class="top8-homies-grid">
                        {#each spaceDoc.top_friends as friend, i (friend.id || i)}
                            <button
                                type="button"
                                class="homie-card win98-window"
                                onclick={() => loadSpaceByHandle(friend.x_username)}
                                title="Visit @{friend.x_username}'s Space"
                            >
                                <div class="homie-titlebar">#{i + 1} @{friend.x_username}</div>
                                <div class="homie-body">
                                    <img
                                        src={friend.avatar_url || "/unicorn.png"}
                                        alt={friend.x_username}
                                        class="homie-avatar"
                                    />
                                    <strong class="homie-name">{friend.display_name || friend.x_username}</strong>
                                    <span class="homie-role-badge">{friend.role_title}</span>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>

            <!-- -----------------------------------------------------------------
                 TAB 4: GUESTBOOK / WALL NOTES
                 ----------------------------------------------------------------- -->
            {:else if activeTab === "guestbook"}
                <div class="guestbook-tab-stage">
                    <div class="writings-header-row">
                        <div>
                            <h2>Guestbook & Wall Notes</h2>
                            <p class="sub-text">Active messages pinned by visitors (24-hour lifetime)</p>
                        </div>
                        <button
                            type="button"
                            class="win98-btn primary"
                            onclick={() => (showStickyModal = true)}
                        >
                            📌 Sign Guestbook
                        </button>
                    </div>

                    {#if stickyNotes.length === 0}
                        <div class="empty-writings-box win98-inset">
                            <span>No active guestbook notes right now. Be the first to leave one!</span>
                        </div>
                    {:else}
                        <div class="guestbook-list">
                            {#each stickyNotes as note (note.id)}
                                <div class="guestbook-entry win98-inset" style="border-left: 4px solid {note.color};">
                                    <div class="gb-author-row">
                                        <button
                                            type="button"
                                            class="author-badge-btn"
                                            onclick={() => loadSpaceByHandle(note.author_username)}
                                        >
                                            <img src={note.author_avatar_url || "/unicorn.png"} alt="avatar" class="sticky-mini-avatar" />
                                            <strong>@{note.author_username}</strong>
                                        </button>
                                        <span class="timestamp-label">
                                            {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p class="gb-text">{note.text_content}</p>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- =========================================================================
     MODAL: "Article Reader.exe" (Full Blog Reader Window)
     ========================================================================= -->
{#if activeReadingArticle}
    <div class="modal-backdrop" onclick={() => (activeReadingArticle = null)}>
        <div class="reader-window win98-window" onclick={(e) => e.stopPropagation()}>
            <div class="window-titlebar">
                <span>📖 Article Reader - {activeReadingArticle.title}</span>
                <button type="button" class="win98-btn-close" onclick={() => (activeReadingArticle = null)}>✕</button>
            </div>

            <div class="reader-body win98-inset">
                <div class="article-reader-header">
                    <h1 class="reader-title">{activeReadingArticle.title}</h1>
                    <div class="reader-byline">
                        <img
                            src={spaceDoc.avatar_url || "/unicorn.png"}
                            alt={spaceDoc.x_username}
                            class="byline-avatar"
                        />
                        <div>
                            <strong>@{spaceDoc.x_username}</strong>
                            <span class="byline-date">
                                Published on {new Date(activeReadingArticle.created_at).toLocaleDateString()} • {activeReadingArticle.read_time_mins} min read
                            </span>
                        </div>
                    </div>
                </div>

                <div class="article-reader-markdown">
                    {@html renderMarkdown(activeReadingArticle.content)}
                </div>

                {#if activeReadingArticle.external_url}
                    <div class="external-callout win98-inset">
                        <span>This article was originally published on {activeReadingArticle.external_source?.toUpperCase() || "external platform"}.</span>
                        <a
                            href={activeReadingArticle.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="win98-btn primary mt-1"
                        >
                            Read Full Post on {activeReadingArticle.external_source?.toUpperCase()} ↗
                        </a>
                    </div>
                {/if}

                <!-- Reaction Bar -->
                <div class="reader-reactions-bar">
                    <span class="reactions-label">Reactions:</span>
                    <button
                        type="button"
                        class="win98-btn reaction-btn"
                        onclick={() => addReaction(activeReadingArticle!, "heart")}
                    >
                        ❤️ {activeReadingArticle.reactions?.heart || 0}
                    </button>
                    <button
                        type="button"
                        class="win98-btn reaction-btn"
                        onclick={() => addReaction(activeReadingArticle!, "fire")}
                    >
                        🔥 {activeReadingArticle.reactions?.fire || 0}
                    </button>
                    <button
                        type="button"
                        class="win98-btn reaction-btn"
                        onclick={() => addReaction(activeReadingArticle!, "rocket")}
                    >
                        🚀 {activeReadingArticle.reactions?.rocket || 0}
                    </button>

                    <button
                        type="button"
                        class="win98-btn ml-auto"
                        onclick={() => {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(`${window.location.origin}/space/${spaceDoc.x_username}?article=${activeReadingArticle!.slug}`);
                                notify("Article link copied! 📋");
                            }
                        }}
                    >
                        🔗 Share
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- =========================================================================
     MODAL: "Explore Spaces" (Discover & Search Community)
     ========================================================================= -->
{#if showExploreModal}
    <div class="modal-backdrop" onclick={() => (showExploreModal = false)}>
        <div class="explore-modal-window win98-window" onclick={(e) => e.stopPropagation()}>
            <div class="window-titlebar">
                <span>🌐 Community Spaces Directory</span>
                <button type="button" class="win98-btn-close" onclick={() => (showExploreModal = false)}>✕</button>
            </div>

            <div class="explore-body win98-inset">
                <div class="explore-search-bar">
                    <input
                        type="text"
                        class="win98-input flex-1"
                        placeholder="Search spaces by @handle, creator name, or keywords..."
                        bind:value={exploreSearchFilter}
                    />
                    <button type="button" class="win98-btn" onclick={() => (exploreSearchFilter = "")}>Clear</button>
                </div>

                <div class="community-spaces-grid">
                    {#each communitySpacesList as space (space.x_username)}
                        <div class="community-space-card win98-window">
                            <div class="comm-titlebar">@{space.x_username}</div>
                            <div class="comm-body">
                                <img
                                    src={space.avatar_url || "/unicorn.png"}
                                    alt={space.x_username}
                                    class="comm-avatar"
                                />
                                <div class="comm-details">
                                    <strong>{space.display_name || space.x_username}</strong>
                                    <span class="comm-mood">{space.status_mood || "Vibing 🦄"}</span>
                                    <span class="comm-hits">👁️ {space.hit_count || 100} hits • ✍️ {space.writings?.length || 0} writings</span>
                                </div>
                                <button
                                    type="button"
                                    class="win98-btn primary comm-visit-btn"
                                    onclick={() => {
                                        loadSpaceByHandle(space.x_username);
                                        showExploreModal = false;
                                    }}
                                >
                                    Visit Space 🚀
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- =========================================================================
     MODAL: "Stick 24h Note" (Leave Note / Doodle on Wall)
     ========================================================================= -->
{#if showStickyModal}
    <div class="modal-backdrop" onclick={() => (showStickyModal = false)}>
        <div class="sticky-create-window win98-window" onclick={(e) => e.stopPropagation()}>
            <div class="window-titlebar">
                <span>📌 Stick a 24-Hour Note on @{viewedHandle}'s Wall</span>
                <button type="button" class="win98-btn-close" onclick={() => (showStickyModal = false)}>✕</button>
            </div>

            <div class="sticky-create-body win98-inset">
                <div class="sticky-color-picker">
                    <span>Pin Color:</span>
                    {#each ["#ffffaa", "#ffb3ba", "#baffc9", "#bae1ff"] as c}
                        <button
                            type="button"
                            class="color-dot {stickyColor === c ? 'active' : ''}"
                            style="background-color: {c};"
                            onclick={() => (stickyColor = c)}
                        ></button>
                    {/each}
                </div>

                <textarea
                    class="win98-input sticky-textarea"
                    placeholder="Leave a message on this wall (auto-expires in 24 hours)..."
                    maxlength="180"
                    bind:value={stickyText}
                ></textarea>

                <div class="modal-buttons-row">
                    <button type="button" class="win98-btn" onclick={() => (showStickyModal = false)}>Cancel</button>
                    <button type="button" class="win98-btn primary" onclick={postStickyNote}>📌 Stick to Wall</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Toast Banner -->
{#if statusToast}
    <div class="win98-toast">{statusToast}</div>
{/if}

<style>
    .win98-myspace-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: #c0c0c0;
        overflow: hidden;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
        box-sizing: border-box;
    }

    /* -------------------------------------------------------------------------
       1. TOP TOOLBAR & ADDRESS BAR
       ------------------------------------------------------------------------- */
    .space-top-toolbar {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #c0c0c0;
        border-bottom: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 4px 6px;
        flex-shrink: 0;
        z-index: 50;
    }

    .nav-control-group {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
    }

    .space-address-bar {
        display: flex;
        align-items: center;
        flex: 1;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 1px 4px;
        gap: 4px;
        min-width: 140px;
    }

    .url-protocol {
        font-size: 11px;
        color: #808080;
        font-weight: bold;
    }

    .space-url-input {
        flex: 1;
        border: none !important;
        background: transparent !important;
        font-family: inherit;
        font-size: 11.5px;
        color: #000080;
        font-weight: bold;
        outline: none;
    }

    .go-btn {
        padding: 1px 6px;
        font-size: 10.5px;
    }

    .retro-audio-widget {
        display: flex;
        align-items: center;
        gap: 4px;
        background: #ffffe1;
        border: 1px solid #808080;
        padding: 2px 6px;
        flex-shrink: 0;
    }

    .audio-btn.playing {
        background: #000080 !important;
        color: #ffffff !important;
    }

    .track-badge {
        font-size: 10px;
        color: #000080;
        font-weight: bold;
    }

    /* -------------------------------------------------------------------------
       2. CREATOR ACTION STRIP & DRAWERS
       ------------------------------------------------------------------------- */
    .owner-action-strip {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #ffffcc;
        border-bottom: 1px solid #808080;
        padding: 4px 8px;
        flex-shrink: 0;
        font-size: 11px;
    }

    .strip-label {
        font-weight: bold;
        color: #800000;
    }

    .active-drawer {
        background: #000080 !important;
        color: #ffffff !important;
    }

    .save-strip-btn {
        margin-left: auto;
    }

    .expanded-drawer {
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 8px;
        max-height: 280px;
        overflow-y: auto;
        flex-shrink: 0;
    }

    .drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px dotted #808080;
        padding-bottom: 4px;
        margin-bottom: 8px;
        font-size: 11px;
        color: #000080;
    }

    .header-buttons {
        display: flex;
        gap: 4px;
        align-items: center;
    }

    .drawer-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    @media (max-width: 768px) {
        .drawer-grid {
            grid-template-columns: 1fr;
        }
    }

    .drawer-panel {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .panel-title {
        font-weight: bold;
        font-size: 11px;
        color: #000000;
    }

    .upload-control-row {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .hidden-file-input {
        display: none;
    }

    .upload-label {
        cursor: pointer;
        padding: 4px 10px;
        display: inline-block;
    }

    .help-text {
        font-size: 9.5px;
        color: #666666;
    }

    .mode-select-row, .darkness-slider-row, .status-editor-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
    }

    .field-label {
        font-weight: bold;
        min-width: 90px;
    }

    .presets-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .preset-pill.active {
        background: #000080 !important;
        color: #ffffff !important;
    }

    /* -------------------------------------------------------------------------
       WRITING STUDIO STYLES
       ------------------------------------------------------------------------- */
    .editor-workspace {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .editor-inputs-row {
        display: flex;
        gap: 6px;
    }

    .article-title-input {
        flex: 2;
        font-size: 12px;
        font-weight: bold;
    }

    .article-tags-input {
        flex: 1;
        font-size: 11px;
    }

    .formatting-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 3px;
        background: #c0c0c0;
        padding: 3px;
        border: 1px solid #808080;
    }

    .tool-btn {
        padding: 1px 6px;
        font-size: 11px;
        min-width: 24px;
    }

    .tool-sep {
        color: #808080;
        margin: 0 2px;
    }

    .preview-toggle-btn {
        margin-left: auto;
    }

    .article-body-textarea {
        width: 100%;
        height: 140px;
        font-family: "Courier New", monospace;
        font-size: 12px;
        box-sizing: border-box;
        resize: vertical;
    }

    .editor-live-preview {
        height: 140px;
        overflow-y: auto;
        background: #ffffff;
        padding: 8px;
    }

    .editor-footer-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
    }

    .external-link-config {
        background: #f9f9f9;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .ext-row {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .ext-summary-input {
        width: 100%;
        height: 48px;
        box-sizing: border-box;
    }

    /* -------------------------------------------------------------------------
       3. MAIN VIEWPORT & HERO PROFILE CARD
       ------------------------------------------------------------------------- */
    .space-viewport-container {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        position: relative;
        background-color: #008080;
        background-position: center;
    }

    .space-viewport-container.is-cover {
        background-size: cover;
        background-attachment: fixed;
    }

    .space-viewport-container.is-tiled {
        background-repeat: repeat;
        background-size: auto;
    }

    .readability-scrim {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1;
    }

    .space-content-wrap {
        position: relative;
        z-index: 2;
        max-width: 900px;
        margin: 0 auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    /* Hero Profile Box */
    .profile-hero-card {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.4);
    }

    .card-titlebar {
        background: #000080;
        color: #ffffff;
        padding: 3px 6px;
        font-size: 11.5px;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .online-indicator {
        font-size: 10px;
        color: #90ee90;
    }

    .card-body {
        padding: 10px;
        display: flex;
        gap: 14px;
    }

    @media (max-width: 600px) {
        .card-body {
            flex-direction: column;
            align-items: center;
        }
    }

    .avatar-column {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .hero-avatar-box {
        width: 104px;
        height: 104px;
        background: transparent;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .hero-persona-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .details-column {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .hero-name-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
    }

    .hero-display-name {
        margin: 0;
        font-size: 1.35rem;
        color: #000080;
    }

    .x-badge {
        font-size: 11px;
        color: #000000;
        background: #ffffff;
        border: 1px solid #808080;
        padding: 1px 4px;
        border-radius: 2px;
    }

    .mood-status-pill {
        background: #ffffe1;
        border: 1px solid #808000;
        padding: 2px 6px;
        font-size: 11px;
        color: #000000;
        display: inline-block;
    }

    .hero-bio {
        margin: 0;
        font-size: 11.5px;
        color: #000000;
        line-height: 1.3;
    }

    .hero-metrics-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: auto;
        padding-top: 6px;
        border-top: 1px dotted #808080;
    }

    /* 7-Segment Hit Counter */
    .hit-counter-box {
        display: flex;
        align-items: center;
        gap: 4px;
        background: #000000;
        padding: 2px 6px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
    }

    .counter-label {
        font-size: 9px;
        color: #aaaaaa;
        letter-spacing: 1px;
    }

    .seven-segment {
        font-family: "Courier New", Courier, monospace;
        font-size: 14px;
        color: #00ff00;
        font-weight: bold;
        letter-spacing: 2px;
    }

    .hero-buttons {
        display: flex;
        gap: 4px;
    }

    /* -------------------------------------------------------------------------
       4. SECTION TABS
       ------------------------------------------------------------------------- */
    .space-tabs-bar {
        display: flex;
        gap: 2px;
        border-bottom: 2px solid #808080;
        padding-left: 6px;
    }

    .tab-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        border-bottom: none;
        padding: 5px 12px;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        color: #000000;
        border-radius: 4px 4px 0 0;
    }

    .tab-btn.active {
        background: #ffffff;
        color: #000080;
        position: relative;
        top: 2px;
        border-bottom: 2px solid #ffffff;
        z-index: 10;
    }

    /* -------------------------------------------------------------------------
       TAB CONTENT STAGES
       ------------------------------------------------------------------------- */
    .wall-tab-stage, .writings-tab-stage, .top8-tab-stage, .guestbook-tab-stage {
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 14px;
        min-height: 280px;
    }

    .wall-marquee-box {
        background: #000000;
        color: #00ffcc;
        padding: 3px 6px;
        font-family: "Courier New", monospace;
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 12px;
    }

    .empty-wall-hint, .empty-writings-box {
        text-align: center;
        padding: 30px;
        color: #666666;
        font-size: 12px;
    }

    /* 24h Sticky Notes on Wall */
    .sticky-notes-masonry {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .wall-sticky-card {
        width: 170px;
        min-height: 110px;
        padding: 8px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        box-shadow: 2px 3px 6px rgba(0, 0, 0, 0.35);
        position: relative;
        transform: rotate(-1.5deg);
        display: flex;
        flex-direction: column;
    }

    .wall-sticky-card:nth-child(even) {
        transform: rotate(1.5deg);
    }

    .sticky-pin {
        position: absolute;
        top: -8px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 14px;
    }

    .sticky-author-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
        font-size: 10px;
    }

    .author-badge-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: none;
        padding: 0;
        font-family: inherit;
        font-size: 10px;
        font-weight: bold;
        color: #000080;
        cursor: pointer;
    }

    .sticky-mini-avatar {
        width: 16px;
        height: 16px;
        object-fit: contain;
    }

    .expiry-pill {
        font-size: 8.5px;
        background: rgba(0, 0, 0, 0.08);
        padding: 1px 3px;
        border-radius: 2px;
    }

    .sticky-content {
        margin: 0;
        font-size: 11px;
        color: #000000;
        word-break: break-word;
        flex: 1;
    }

    /* -------------------------------------------------------------------------
       WRITINGS LIST & CARDS
       ------------------------------------------------------------------------- */
    .writings-header-row, .top8-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px dotted #c0c0c0;
        padding-bottom: 8px;
        margin-bottom: 12px;
    }

    .writings-header-row h2, .top8-header-row h2 {
        margin: 0;
        font-size: 1.15rem;
        color: #000080;
    }

    .sub-text {
        margin: 2px 0 0 0;
        font-size: 10.5px;
        color: #666666;
    }

    .articles-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .article-card {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
    }

    .article-card-titlebar {
        background: #000080;
        color: #ffffff;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .source-tag {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 2px;
    }

    .source-tag.substack { background: #ff6719; color: #ffffff; }
    .source-tag.mirror { background: #007aff; color: #ffffff; }
    .source-tag.medium { background: #000000; color: #ffffff; }
    .source-tag.x { background: #000000; color: #ffffff; }
    .source-tag.internal { background: #008000; color: #ffffff; }

    .article-card-body {
        padding: 10px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .article-meta-row {
        display: flex;
        gap: 10px;
        font-size: 10px;
        color: #666666;
    }

    .article-summary-text {
        margin: 0;
        font-size: 11.5px;
        line-height: 1.4;
        color: #000000;
    }

    .tags-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .tag-chip {
        font-size: 9.5px;
        background: #eef2ff;
        color: #3730a3;
        padding: 1px 5px;
        border: 1px solid #c7d2fe;
    }

    .card-footer-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        padding-top: 6px;
        border-top: 1px dotted #e0e0e0;
    }

    .read-btn {
        font-size: 11px;
        padding: 3px 8px;
    }

    .ext-btn {
        font-size: 10px;
        text-decoration: none;
        color: #000000;
        padding: 2px 6px;
    }

    .delete-art-btn {
        margin-left: auto;
        padding: 2px 6px;
    }

    /* -------------------------------------------------------------------------
       TOP 8 HOMIES GRID
       ------------------------------------------------------------------------- */
    .top8-homies-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
    }

    @media (max-width: 600px) {
        .top8-homies-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .homie-card {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
        padding: 0;
        text-align: center;
        display: flex;
        flex-direction: column;
        font-family: inherit;
    }

    .homie-card:hover {
        border-color: #000080;
    }

    .homie-titlebar {
        background: #000080;
        color: #ffffff;
        font-size: 10px;
        font-weight: bold;
        padding: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .homie-body {
        padding: 6px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
    }

    .homie-avatar {
        width: 48px;
        height: 48px;
        object-fit: contain;
    }

    .homie-name {
        font-size: 11px;
        color: #000080;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
    }

    .homie-role-badge {
        font-size: 9px;
        color: #666666;
        background: #f0f0f0;
        padding: 1px 4px;
        border-radius: 2px;
    }

    /* -------------------------------------------------------------------------
       GUESTBOOK LIST
       ------------------------------------------------------------------------- */
    .guestbook-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .guestbook-entry {
        background: #fdfdfd;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .gb-author-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
    }

    .timestamp-label {
        font-size: 9.5px;
        color: #888888;
    }

    .gb-text {
        margin: 0;
        font-size: 11.5px;
        color: #000000;
    }

    /* -------------------------------------------------------------------------
       MODALS: READER & EXPLORE DIRECTORY
       ------------------------------------------------------------------------- */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10050;
        padding: 16px;
    }

    .reader-window {
        width: 100%;
        max-width: 680px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.5);
    }

    .window-titlebar {
        background: #000080;
        color: #ffffff;
        padding: 3px 6px;
        font-size: 11.5px;
        font-weight: bold;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .reader-body {
        background: #ffffff;
        padding: 16px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .article-reader-header {
        border-bottom: 2px solid #000080;
        padding-bottom: 8px;
    }

    .reader-title {
        margin: 0 0 6px 0;
        font-size: 1.4rem;
        color: #000080;
    }

    .reader-byline {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
    }

    .byline-avatar {
        width: 28px;
        height: 28px;
        object-fit: contain;
    }

    .byline-date {
        display: block;
        font-size: 9.5px;
        color: #666666;
    }

    .article-reader-markdown {
        font-size: 12.5px;
        line-height: 1.6;
        color: #111111;
    }

    .article-reader-markdown :global(h1) { font-size: 1.3rem; color: #000080; margin: 12px 0 6px 0; }
    .article-reader-markdown :global(h2) { font-size: 1.15rem; color: #000080; margin: 10px 0 4px 0; }
    .article-reader-markdown :global(h3) { font-size: 1rem; color: #000080; margin: 8px 0 4px 0; }
    .article-reader-markdown :global(blockquote) {
        border-left: 3px solid #000080;
        padding-left: 8px;
        margin: 8px 0;
        color: #555555;
        font-style: italic;
    }
    .article-reader-markdown :global(code) {
        background: #f0f0f0;
        padding: 1px 4px;
        font-family: monospace;
        font-size: 11px;
    }
    .article-reader-markdown :global(pre.md-code-block) {
        background: #000000;
        color: #00ff00;
        padding: 8px;
        overflow-x: auto;
        font-family: monospace;
        font-size: 11px;
    }

    .external-callout {
        background: #fffbe8;
        border: 1px solid #eab308;
        padding: 8px;
        font-size: 11px;
    }

    .reader-reactions-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        border-top: 1px dotted #808080;
        padding-top: 8px;
    }

    .reactions-label {
        font-size: 11px;
        font-weight: bold;
    }

    /* Explore Modal */
    .explore-modal-window {
        width: 100%;
        max-width: 620px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        background: #c0c0c0;
    }

    .explore-body {
        background: #ffffff;
        padding: 10px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .explore-search-bar {
        display: flex;
        gap: 4px;
    }

    .community-spaces-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 6px;
    }

    .community-space-card {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
    }

    .comm-titlebar {
        background: #000080;
        color: #ffffff;
        padding: 2px 6px;
        font-size: 10.5px;
        font-weight: bold;
    }

    .comm-body {
        padding: 6px;
        background: #ffffff;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .comm-avatar {
        width: 36px;
        height: 36px;
        object-fit: contain;
        flex-shrink: 0;
    }

    .comm-details {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .comm-mood {
        font-size: 10px;
        color: #666666;
    }

    .comm-hits {
        font-size: 9.5px;
        color: #888888;
    }

    .comm-visit-btn {
        flex-shrink: 0;
        padding: 3px 8px;
        font-size: 11px;
    }

    /* Sticky Creation Modal */
    .sticky-create-window {
        width: 320px;
        background: #c0c0c0;
    }

    .sticky-create-body {
        padding: 10px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .sticky-color-picker {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
    }

    .color-dot {
        width: 18px;
        height: 18px;
        border: 1px solid #808080;
        cursor: pointer;
    }

    .color-dot.active {
        border: 2px solid #000000;
        transform: scale(1.15);
    }

    .sticky-textarea {
        width: 100%;
        height: 80px;
        box-sizing: border-box;
        font-size: 11.5px;
        background: #ffffea;
    }

    .modal-buttons-row {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
    }

    .win98-btn-close {
        background: #c0c0c0;
        border: 1.5px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        font-family: inherit;
        font-size: 10px;
        font-weight: bold;
        cursor: pointer;
        padding: 0 4px;
    }

    .win98-toast {
        position: fixed;
        bottom: 42px;
        left: 50%;
        transform: translateX(-50%);
        background: #000080;
        color: #ffffff;
        border: 2px solid #ffffff;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: bold;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
        z-index: 10100;
    }

    .flex-1 { flex: 1; }
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .ml-auto { margin-left: auto; }
</style>
