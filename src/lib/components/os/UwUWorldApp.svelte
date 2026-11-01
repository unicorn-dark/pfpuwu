<!-- src/lib/components/os/UwUWorldApp.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        userProfile,
        authLoading,
        loginWithX,
        showAuthModal,
        authModalReason,
        type UserProfile
    } from "$lib/stores/auth";
    import { openChatDrawer } from "$lib/stores/os";
    import {
        gridToScreen,
        screenToGrid,
        calculateDepth,
        gridDistance,
        getIsoDirection,
        TILE_WIDTH,
        TILE_HEIGHT,
        type IsoDirection
    } from "$lib/game/isometric/isoMath";
    import {
        MAP_SIZE,
        WORLD_TILES,
        WORLD_OBJECTS,
        COLLISION_MAP,
        ANIMATED_TILE_COORDS,
        FOREST_TILES,
        FOREST_OBJECTS,
        FOREST_COLLISION_MAP,
        FOREST_ANIMATED_TILE_COORDS,
        StaticFloorCache,
        drawRichIsometricTile,
        resolveMoveWithSliding,
        getCurrentZone,
        type WorldObject,
        type WorldZone
    } from "$lib/game/isometric/worldMap";
    import { findPath, type Point } from "$lib/game/isometric/pathfinding";
    import { preloadIsoAssets, drawIsoObjectSprite } from "$lib/game/isometric/isoAssetLoader";
    import {
        renderPlayerAvatar,
        getTransparentDealerDataUrl,
        type PlayerAvatarState,
        type DanceMoveType
    } from "$lib/game/isometric/avatarSprite";
    import { WorldNetworkManager } from "$lib/game/network/worldNetwork";
    import { ProximityVoiceManager } from "$lib/game/audio/proximityVoice";
    import {
        RetroSynthesizer,
        DiceDuelManager,
        RouletteGameManager,
        ROULETTE_SECTORS,
        BETTABLE_ROULETTE_SECTORS,
        DJ_TRACKS,
        RETRO_PALETTE_16,
        CAMPFIRE_TRIVIA_BANK,
        CAMPFIRE_ICEBREAKER_BANK,
        KOI_POND_SPECIMENS,
        type KoiSpecimen,
        type MusicGenre,
        type DiceSeat,
        type PlayerScore,
        type DiceGamePhase,
        type RouletteSector
    } from "$lib/game/activities/miniGames";
    import {
        DAILY_REWARD_AMOUNT,
        getDailyRewardStatus,
        loadOrInitPlayerStats,
        syncPlayerStatsToSupabase,
        upsertPlayerInLocalLeaderboardCache,
        fetchLeaderboard,
        executeUwuTransfer,
        loadSavedGraffitiWall,
        saveGraffitiWallState,
        type PlayerEconomyStats
    } from "$lib/game/economy/worldEconomy";

    let canvasElement: HTMLCanvasElement | null = $state(null);
    let containerElement: HTMLDivElement | null = $state(null);

    // Activity, Floor Cache & Sound Managers
    let networkManager = $state<WorldNetworkManager | null>(null);
    let voiceManager: ProximityVoiceManager | null = null;
    const synth = new RetroSynthesizer();
    const diceManager = new DiceDuelManager();
    const rouletteManager = new RouletteGameManager();
    const floorCache = new StaticFloorCache();
    const forestFloorCache = new StaticFloorCache();

    // Active World Zone ('casino' | 'forest')
    let currentZone = $state<WorldZone>("casino");

    // Svelte 5 Reactivity Version Counters
    let diceTick = $state(0);
    let rouletteTick = $state(0);

    // Local Player State — Spawn on the wide-open Central VIP Crosswalk (15.5, 16.5)
    let activeSessionUserId = $state("");
    let isLoggingInWithX = $state(false);
    let myId = $state("");
    let myUsername = $state("");
    let myX = $state(15.5);
    let myY = $state(16.5);
    let myDir = $state<IsoDirection>("NW");
    let isWalking = $state(false);
    let isDancing = $state(false);
    let currentDanceIndex = $state(0);
    let isSpeaking = $state(false);
    let walkAnimTick = $state(0);
    let speechBubble = $state<{ text: string; expiresAt: number } | undefined>(undefined);
    let currentEmote = $state<{ icon: string; expiresAt: number } | undefined>(undefined);
    let hasVaultCrown = $state(false);
    let hasHighRollerCrown = $state(false);

    // Economy, Balances, Wins/Losses & 24h Daily Reward State
    let chips = $state(2500);
    let myWins = $state(0);
    let myLosses = $state(0);
    let myNetProfit = $state(0);
    let myHighScore = $state(0);
    let lastDailyClaimIso = $state<string | null>(null);
    let dailyStatus = $state({ canClaim: true, remainingMs: 0, formattedRemaining: "Ready!" });
    let dailyClockInterval: number | null = null;

    let selectedWager = $state(100);
    const WAGER_OPTIONS = [50, 100, 250, 500];

    // Leaderboard & P2P Transfer Modal State
    let showLeaderboardModal = $state(false);
    let leaderboardSortBy = $state<"chips" | "wins" | "profit">("chips");
    let leaderboardRows = $state<PlayerEconomyStats[]>([]);
    let isLoadingLeaderboard = $state(false);

    let showTransferModal = $state(false);
    let transferRecipient = $state("");
    let transferAmount = $state(100);
    let transferNote = $state("");
    let transferError = $state("");
    let isSendingTransfer = $state(false);

    // Transparent Unicorn House Dealer Avatar Data URL
    let dealerAvatarSrc = $state("/traits/body/classic.png");

    // Camera & Viewport
    let cameraX = $state(0);
    let cameraY = $state(0);
    let canvasWidth = $state(860);
    let canvasHeight = $state(580);
    let resizeObserver: ResizeObserver | null = null;

    // Navigation & Waypoints
    let activeWaypoints: Point[] = [];
    let pendingInteractionTarget: string | null = null;
    let waypointStuckFrames = 0;

    // UI & Status
    let onlineCount = $state(1);
    let currentZoneName = $state("🎲 Casino Lounge");
    let chatInput = $state("");
    let chatInputEl: HTMLInputElement | null = $state(null);
    let isChatFocused = $state(false);
    let recentChatLog = $state<Array<{ user: string; text: string; ts: number }>>([]);
    let isMusicPlaying = $state(true);
    let currentTrackId = $state(5); // Start on Ibiza Terrace Deep Organ Groove
    const DJ_GENRE_FILTERS: Array<MusicGenre | "All"> = [
        "All",
        "Lo-Fi",
        "Synthwave",
        "House",
        "Techno",
        "DnB",
        "Chiptune",
        "Classical",
        "Ambient"
    ];
    let selectedGenreFilter = $state<MusicGenre | "All">("All");
    let roomHype = $state(42);
    let isMuted = $state(false);
    let hasMicPermission = $state(false);
    let statusNotice = $state("");
    let noticeTimeout: number | null = null;

    // Modals & Overlays
    let showGuideModal = $state(false);
    let showGraffitiModal = $state(false);
    let showDJModal = $state(false);
    let showArcadeModal = $state(false);
    let showTravelMenu = $state(false);

    // Persistent Offscreen Graffiti Canvas (48x32)
    let persistentGraffitiCanvas: HTMLCanvasElement | null = null;
    let persistentGraffitiCtx: CanvasRenderingContext2D | null = null;
    let defaultGraffitiDataUrl = "";
    let isGraffitiReady = false;
    let graffitiCanvas: HTMLCanvasElement | null = $state(null);
    let graffitiCtx: CanvasRenderingContext2D | null = null;
    let selectedGraffitiColor = $state("#00ffff");
    let graffitiBrushSize = $state(1);
    let isGraffitiPainting = false;
    let graffitiSaveTimeout: number | null = null;

    // Active Proximity Game Station (Strictly ONE station active at a time)
    let activeStation = $state<
        | "none"
        | "dice"
        | "roulette"
        | "blackjack"
        | "slots"
        | "crash"
        | "mines"
        | "campfire"
        | "picnic"
        | "fishing"
        | "fireflies"
    >("none");
    let isSeatedAtDiceTable = $state(false);
    let myDiceSeatIndex = $state(-1);
    let amIReady = $state(false);
    let activeDiceWager = $state(100);

    // Reactive Svelte 5 Mirrors for Craps Dice Duel
    let dicePhaseState = $state<DiceGamePhase>("idle");
    let diceRoundState = $state(0);
    let diceScoresState = $state<PlayerScore[]>([]);
    let diceWinnerIdState = $state<string | null>(null);
    let diceWinnerNameState = $state<string | null>(null);
    let diceSeatsState = $state<DiceSeat[]>([...diceManager.seats]);
    let isDiceShaking = $state(false);
    let rollingAnimDice = $state<[number, number, number, number]>([6, 6, 5, 5]);

    // Reactive Svelte 5 Mirrors for Meme Roulette
    let activeRouletteBet = $state<string>("pepe");
    let lockedRouletteBetId = $state<string | null>(null);
    let lockedRouletteWager = $state(0);
    let rouletteSpinningState = $state(false);
    let rouletteCountdownState = $state(12);
    let rouletteHistoryState = $state<RouletteSector[]>([]);
    let rouletteAngleState = $state(0);
    let rouletteLastWinner = $state<RouletteSector | null>(null);

    // --- CYBER BLACKJACK 21 STATE ---
    interface PlayingCard {
        rank: string;
        suit: string;
        value: number;
    }
    let bjPhase = $state<"betting" | "player" | "dealer" | "done">("betting");
    let bjPlayerHand = $state<PlayingCard[]>([]);
    let bjDealerHand = $state<PlayingCard[]>([]);
    let bjMessage = $state("Place your wager and deal!");
    let bjCurrentBet = $state(100);

    // --- GOLDEN UWU SLOTS STATE ---
    const SLOT_REEL_STRIP = [
        "💀", "💀", "💀", "💀", "💀", "💀", "💀",
        "🍒", "🍒", "🍒", "🍒", "🍒",
        "🐸", "🐸", "🐸", "🐸",
        "🚀", "🚀", "🚀",
        "💎",
        "🦄"
    ];
    let slotReels = $state<[string, string, string]>(["🍒", "🐸", "🚀"]);
    let isSlotSpinning = $state(false);
    let slotMessage = $state("Pull the lever to spin!");

    // --- ROCKET CRASH MULTIPLIER STATE ---
    let crashPhase = $state<"idle" | "flying" | "crashed" | "cashed_out">("idle");
    let crashMultiplier = $state(1.0);
    let crashTargetPoint = 1.0;
    let crashBetAmount = $state(100);
    let crashMessage = $state("Cash out before the rocket explodes!");
    let crashTimerId: number | null = null;
    let crashHistory = $state<number[]>([1.42, 2.85, 1.0, 4.12, 1.18]);
    let crashLastAudioMs = 0;

    // --- CYBER MINES 5x5 STATE ---
    let minesBombCount = $state<5 | 8 | 12>(5);
    let minesPhase = $state<"idle" | "playing" | "cashed_out" | "exploded">("idle");
    let minesBetAmount = $state(100);
    let minesBombLocations = $state<number[]>([]);
    let minesRevealed = $state<Array<"hidden" | "gem" | "bomb">>(Array(25).fill("hidden"));
    let minesSafeClicks = $state(0);
    let minesMessage = $state("Uncover glowing gems and cash out anytime!");

    // --- 90s RETRO ARCADE CENTER STATE (5 Playable Games: Free Play + 100 $UWU Token Challenge) ---
    type ArcadeGameId = "mines" | "brick" | "snake" | "coin" | "whack";
    let activeArcadeTab = $state<ArcadeGameId>("brick");
    let arcadePlayMode = $state<"free" | "token">("free");
    const ARCADE_TOKEN_COST = 100;
    const ARCADE_TOKEN_PAYOUT = 175; // 1.75x skill challenge reward
    let arcadeBestScores = $state<Record<ArcadeGameId, number>>({
        mines: 0,
        brick: 0,
        snake: 0,
        coin: 0,
        whack: 0
    });

    // Arcade Game 2: Neon Brick Breaker (Arkanoid)
    interface ArcadeBrick {
        x: number;
        y: number;
        w: number;
        h: number;
        color: string;
        pts: number;
        alive: boolean;
    }
    let brickPhase = $state<"idle" | "playing" | "won" | "lost">("idle");
    let brickScore = $state(0);
    let brickLives = $state(3);
    let brickPaddleX = $state(128);
    let brickBall = $state({ x: 160, y: 190, vx: 3.1, vy: -3.3 });
    let brickList = $state<ArcadeBrick[]>([]);
    let brickTimerId: number | null = null;
    const BRICK_TARGET_SCORE = 450;

    // Arcade Game 3: Cyber Snake 1998
    let snakePhase = $state<"idle" | "playing" | "won" | "lost">("idle");
    let snakeScore = $state(0);
    let snakeBody = $state<Array<{ x: number; y: number }>>([
        { x: 8, y: 6 },
        { x: 7, y: 6 },
        { x: 6, y: 6 }
    ]);
    let snakeDir = $state<{ x: number; y: number }>({ x: 1, y: 0 });
    let snakeNextDir = { x: 1, y: 0 };
    let snakeFood = $state<{ x: number; y: number; kind: "orb" | "unicorn" }>({ x: 12, y: 6, kind: "orb" });
    let snakeTimerId: number | null = null;
    const SNAKE_TARGET_SCORE = 300;

    // Arcade Game 4: Cyber Coin Rush (25s Basket Catcher)
    interface FallingArcadeItem {
        id: number;
        x: number;
        y: number;
        vy: number;
        icon: string;
        pts: number;
        isBomb: boolean;
    }
    let coinPhase = $state<"idle" | "playing" | "done">("idle");
    let coinScore = $state(0);
    let coinTimeLeft = $state(25);
    let coinBasketX = $state(135);
    let coinItems = $state<FallingArcadeItem[]>([]);
    let coinTimerId: number | null = null;
    let coinCountdownId: number | null = null;
    const COIN_TARGET_SCORE = 320;

    // Arcade Game 5: Whack-A-Glitch (20s 3x3 Cyber Terminal Reflex)
    interface GlitchCell {
        kind: "empty" | "bug" | "golden" | "bomb";
        expiresAt: number;
    }
    let whackPhase = $state<"idle" | "playing" | "done">("idle");
    let whackScore = $state(0);
    let whackTimeLeft = $state(20);
    let whackGrid = $state<GlitchCell[]>(
        Array.from({ length: 9 }, () => ({ kind: "empty", expiresAt: 0 }))
    );
    let whackTimerId: number | null = null;
    let whackCountdownId: number | null = null;
    const WHACK_TARGET_SCORE = 350;

    // --- WHISPERING WOODS SOCIAL ACTIVITIES (NON-GAMBLING) ---
    // 1. Campfire Story & Trivia Circle
    let campfireMode = $state<"trivia" | "icebreaker">("trivia");
    let campfireQuestionIndex = $state(0);
    let campfireRevealed = $state(false);
    let campfireVotes = $state<Record<number, string[]>>({});
    let myCampfireVote = $state<number | null>(null);
    let campfireCustomStory = $state("");
    let campfireStories = $state<Array<{ user: string; text: string }>>([
        { user: "UnicornGuide", text: "Welcome to the Whispering Woods! Gather by the warmth of the fire 🔥" }
    ]);

    // 2. Woodland Tea & Berry Picnic
    const PICNIC_TREATS = [
        { id: "matcha", icon: "🍵", name: "Forest Matcha Tea", vibe: "+15 Cozy Vibes" },
        { id: "dango", icon: "🍡", name: "Hanami Sweet Dango", vibe: "+20 Sweet Vibes" },
        { id: "pie", icon: "🥧", name: "Wild Berry Tart", vibe: "+25 Warm Vibes" },
        { id: "bento", icon: "🍱", name: "Woodland Picnic Bento", vibe: "+30 Friendly Vibes" }
    ];
    let picnicComboCount = $state(0);
    let picnicRecentFeed = $state<string[]>(["🧺 Share tea & treats with friends around the grove!"]);

    // 3. Peaceful Koi Pond Catch & Release
    let fishingState = $state<"idle" | "waiting" | "bite" | "caught">("idle");
    let fishingHookTimer: number | null = null;
    let caughtKoi = $state<KoiSpecimen | null>(null);
    let koiCollection = $state<string[]>([]);

    // 4. Firefly Meadow & Wishing Shrine
    let fireflyJarCount = $state(0);
    let fireflyCommunityGoal = $state(12);
    let fireflyWishes = $state<Array<{ user: string; wish: string }>>([
        { user: "SakuraSpirit", wish: "May all frens find cozy vibes in UwU World ✨" }
    ]);
    let fireflyWishInput = $state("");

    let hoveredTile = $state<{ x: number; y: number } | null>(null);

    interface Particle {
        x: number;
        y: number;
        vx: number;
        vy: number;
        color: string;
        size: number;
        life: number;
        maxLife: number;
    }
    let particles: Particle[] = [];

    const keysPressed: Record<string, boolean> = {};
    let isJoystickActive = $state(false);
    let joystickOrigin = { x: 0, y: 0 };
    let joystickOffset = $state({ x: 0, y: 0 });

    let animationFrameId: number;
    let lastFrameTime = performance.now();

    const DANCE_MOVES: Array<{ id: DanceMoveType; label: string; icon: string }> = [
        { id: "disco", label: "Disco Hop", icon: "🕺" },
        { id: "spin", label: "Salsa Spin", icon: "💃" },
        { id: "robot", label: "The Robot", icon: "🤖" },
        { id: "wave", label: "Body Wave", icon: "🌊" },
        { id: "windmill", label: "Windmill", icon: "🌀" },
        { id: "headbang", label: "Headbang", icon: "🤘" }
    ];

    const DICE_PIP_ICONS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const DICE_DOT_PATTERNS: Record<number, number[]> = {
        1: [4],
        2: [0, 8],
        3: [0, 4, 8],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8]
    };

    function syncDiceReactiveState() {
        dicePhaseState = diceManager.phase;
        diceRoundState = diceManager.currentRound;
        diceScoresState = Array.from(diceManager.scores.values()).map((s) => ({
            ...s,
            currentDice: [...s.currentDice] as [number, number],
            roundRolls: [...s.roundRolls]
        }));
        diceWinnerIdState = diceManager.winnerId;
        diceWinnerNameState = diceManager.winnerName;
        diceSeatsState = diceManager.seats.map((s) => ({ ...s }));
        const idx = diceManager.getSeatedPlayerSeat(myId);
        myDiceSeatIndex = idx;
        isSeatedAtDiceTable = idx !== -1;
        amIReady = idx !== -1 ? diceManager.seats[idx].isReady : false;
    }

    function triggerDiceShakeAnim() {
        isDiceShaking = true;
        let ticks = 0;
        const animTimer = window.setInterval(() => {
            ticks++;
            rollingAnimDice = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            if (ticks >= 7) {
                clearInterval(animTimer);
                isDiceShaking = false;
                syncDiceReactiveState();
            }
        }, 70);
    }

    function syncRouletteReactiveState() {
        rouletteSpinningState = rouletteManager.isSpinning;
        rouletteCountdownState = rouletteManager.countdownSeconds;
        rouletteHistoryState = [...rouletteManager.history];
        rouletteAngleState = rouletteManager.currentAngle;
        if (rouletteManager.winningSector) {
            rouletteLastWinner = rouletteManager.winningSector;
        }
    }

    const filteredDJTracks = $derived(
        selectedGenreFilter === "All"
            ? DJ_TRACKS
            : DJ_TRACKS.filter((t) => t.genre === selectedGenreFilter)
    );

    function showToast(msg: string, duration = 4500) {
        statusNotice = msg;
        if (noticeTimeout) clearTimeout(noticeTimeout);
        noticeTimeout = window.setTimeout(() => {
            statusNotice = "";
        }, duration);
    }

    function buildMyEconomySnapshot(): PlayerEconomyStats {
        return {
            user_id: myId,
            x_username: myUsername.replace(/^@/, "").toLowerCase(),
            display_name: $userProfile?.x_display_name || myUsername,
            avatar_url: $userProfile?.avatar_url || "/unicorn.png",
            chips,
            wins: myWins,
            losses: myLosses,
            net_profit: myNetProfit,
            high_score: myHighScore,
            last_daily_claim: lastDailyClaimIso,
            updated_at: new Date().toISOString(),
            isOnline: true
        };
    }

    function recordGameOutcome(chipDelta: number, outcome: "win" | "loss" | "neutral", scoreEarned = 0) {
        chips = Math.max(0, Math.round(chips + chipDelta));
        myNetProfit = Math.round(myNetProfit + chipDelta);
        if (outcome === "win") {
            myWins++;
        } else if (outcome === "loss") {
            myLosses++;
        }
        const bestCandidate = Math.max(scoreEarned, chipDelta > 0 ? chipDelta : 0);
        if (bestCandidate > myHighScore) {
            myHighScore = Math.round(bestCandidate);
        }
        const snap = buildMyEconomySnapshot();
        syncPlayerStatsToSupabase(snap);
        networkManager?.broadcastStats(snap);
    }

    function refreshDailyRewardStatus() {
        dailyStatus = getDailyRewardStatus(lastDailyClaimIso);
        const url = getTransparentDealerDataUrl();
        if (url) dealerAvatarSrc = url;
    }

    function claimDailyReward() {
        refreshDailyRewardStatus();
        if (!dailyStatus.canClaim) {
            showToast(`⏳ Daily Reward (+1,000 $UWU) resets in ${dailyStatus.formattedRemaining}!`, 4000);
            return;
        }
        synth.playWinFanfare();
        triggerConfettiCelebration();
        lastDailyClaimIso = new Date().toISOString();
        chips += DAILY_REWARD_AMOUNT;
        refreshDailyRewardStatus();

        const snap = buildMyEconomySnapshot();
        syncPlayerStatsToSupabase(snap);
        networkManager?.broadcastStats(snap);
        showToast(`🎁 Claimed Daily Reward: +${DAILY_REWARD_AMOUNT.toLocaleString()} $UWU Chips!`, 5000);
    }

    async function openLeaderboard() {
        showLeaderboardModal = true;
        isLoadingLeaderboard = true;
        const snap = buildMyEconomySnapshot();
        const peers = networkManager?.getOnlinePeerEconomyStats() || [];
        leaderboardRows = await fetchLeaderboard(snap, peers);
        isLoadingLeaderboard = false;
    }

    const sortedLeaderboard = $derived.by(() => {
        const copy = [...leaderboardRows];
        if (leaderboardSortBy === "wins") {
            copy.sort((a, b) => b.wins - a.wins || b.chips - a.chips);
        } else if (leaderboardSortBy === "profit") {
            copy.sort((a, b) => b.net_profit - a.net_profit || b.chips - a.chips);
        } else {
            copy.sort((a, b) => b.chips - a.chips || b.wins - a.wins);
        }
        return copy;
    });

    function openSendUwuModal(prefillUsername = "") {
        transferRecipient = prefillUsername ? prefillUsername.replace(/^@/, "") : "";
        transferAmount = 100;
        transferNote = "";
        transferError = "";
        showTransferModal = true;
    }

    async function handleSendUwuSubmit() {
        if (isSendingTransfer) return;
        transferError = "";
        isSendingTransfer = true;

        const snap = buildMyEconomySnapshot();
        const res = await executeUwuTransfer(snap, transferRecipient, transferAmount, transferNote);
        isSendingTransfer = false;

        if (!res.ok || !res.record) {
            transferError = res.error || "Failed to send $UWU.";
            return;
        }

        chips = res.newBalance;
        const updatedSnap = buildMyEconomySnapshot();
        syncPlayerStatsToSupabase(updatedSnap);
        networkManager?.broadcastStats(updatedSnap);
        networkManager?.broadcastUwuTransfer(res.record);

        synth.playWinFanfare();
        showTransferModal = false;
        showToast(
            `💸 Sent ${res.record.amount.toLocaleString()} $UWU to @${res.record.recipient_username}${res.record.note ? ` ("${res.record.note}")` : ""}!`,
            5500
        );

        if (showLeaderboardModal) {
            openLeaderboard();
        }
    }

    async function handleWorldXLogin() {
        isLoggingInWithX = true;
        const res = await loginWithX();
        isLoggingInWithX = false;
        if (!res.ok) {
            openGlobalXAuthModal();
        }
    }

    function openGlobalXAuthModal() {
        authModalReason.set(
            "Sign in with 𝕏 to enter UwU World MMO, save your $UWU balance, and paint on the Global Graffiti Wall."
        );
        showAuthModal.set(true);
    }

    function stopAuthenticatedWorldSession() {
        activeSessionUserId = "";
        myId = "";
        myUsername = "";
        voiceManager?.destroy();
        voiceManager = null;
        networkManager?.destroy();
        networkManager = null;
    }

    function startAuthenticatedWorldSession(profile: UserProfile) {
        if (!profile?.id || !profile?.x_username) return;
        if (activeSessionUserId === profile.id && networkManager) return;

        // Clean up any previous session
        voiceManager?.destroy();
        networkManager?.destroy();

        activeSessionUserId = profile.id;
        myId = profile.id;
        myUsername = profile.x_username.replace(/^@/, "");
        const avatarUrl = profile.avatar_url || "/unicorn.png";

        // Load persistent Graffiti Wall from Supabase (source of truth)
        loadSavedGraffitiWall().then((savedDataUrl) => {
            if (savedDataUrl) {
                applyGraffitiDataUrl(savedDataUrl);
            }
        });

        loadOrInitPlayerStats(myId, myUsername, avatarUrl, profile.x_display_name).then((loaded) => {
            chips = loaded.chips;
            myWins = loaded.wins;
            myLosses = loaded.losses;
            myNetProfit = loaded.net_profit;
            myHighScore = loaded.high_score;
            lastDailyClaimIso = loaded.last_daily_claim;
            refreshDailyRewardStatus();
            networkManager?.broadcastStats(loaded);
        });

        const initialAvatar: PlayerAvatarState = {
            id: myId,
            username: myUsername,
            avatarUrl,
            x: myX,
            y: myY,
            dir: myDir,
            isWalking: false,
            isDancing: false,
            danceMove: DANCE_MOVES[currentDanceIndex].id,
            isSpeaking: false,
            walkAnimTick: 0,
            chips,
            wins: myWins,
            losses: myLosses,
            zone: currentZone
        };

        networkManager = new WorldNetworkManager(myId, initialAvatar);
        networkManager.onOnlineCountChanged = (count) => {
            onlineCount = count;
        };
        networkManager.onPeerJoined = (peerId, isNewArrival) => {
            voiceManager?.connectToPeer(peerId, true);
            if (isNewArrival) {
                broadcastAuthoritativeGraffitiIfReady();
            }
        };
        networkManager.onGraffitiSyncRequested = () => {
            broadcastAuthoritativeGraffitiIfReady();
        };
        networkManager.onPeerLeft = (peerId) => {
            voiceManager?.removePeer(peerId);
        };
        networkManager.onChatReceived = (_senderId, senderName, text) => {
            recentChatLog = [...recentChatLog.slice(-14), { user: senderName, text, ts: Date.now() }];
        };
        networkManager.onStatsUpdated = (peerStats) => {
            upsertPlayerInLocalLeaderboardCache(peerStats);
            if (showLeaderboardModal) {
                const idx = leaderboardRows.findIndex(
                    (r) => r.x_username.toLowerCase() === peerStats.x_username.toLowerCase()
                );
                if (idx !== -1) {
                    leaderboardRows[idx] = { ...peerStats, isOnline: true };
                } else {
                    leaderboardRows = [...leaderboardRows, { ...peerStats, isOnline: true }];
                }
            }
        };
        networkManager.onUwuTransferReceived = (rec) => {
            const myClean = myUsername.replace(/^@/, "").toLowerCase();
            if (rec.recipient_username.toLowerCase() === myClean) {
                chips += rec.amount;
                const snap = buildMyEconomySnapshot();
                syncPlayerStatsToSupabase(snap);
                networkManager?.broadcastStats(snap);
                triggerConfettiCelebration();
                synth.playWinFanfare();
                showToast(
                    `💸 You received +${rec.amount.toLocaleString()} $UWU from @${rec.sender_username}${rec.note ? `: "${rec.note}"` : ""}!`,
                    7000
                );
            } else {
                showToast(
                    `💸 @${rec.sender_username} tipped @${rec.recipient_username} +${rec.amount.toLocaleString()} $UWU!`,
                    4500
                );
            }
        };
        networkManager.onForestEventReceived = (payload) => {
            if (!payload) return;
            if (payload.kind === "campfire_vote") {
                const votes = { ...campfireVotes };
                const arr = votes[payload.optionIdx] ? [...votes[payload.optionIdx]] : [];
                if (!arr.includes(payload.user)) arr.push(payload.user);
                votes[payload.optionIdx] = arr;
                campfireVotes = votes;
            } else if (payload.kind === "campfire_next") {
                campfireQuestionIndex = payload.questionIndex;
                campfireRevealed = false;
                campfireVotes = {};
                myCampfireVote = null;
            } else if (payload.kind === "campfire_story") {
                campfireStories = [...campfireStories.slice(-8), { user: payload.user, text: payload.text }];
                showToast(`🔥 @${payload.user} shared a campfire story!`, 4000);
            } else if (payload.kind === "picnic_treat") {
                picnicComboCount++;
                picnicRecentFeed = [
                    `${payload.icon} @${payload.user} shared ${payload.name}!`,
                    ...picnicRecentFeed.slice(0, 4)
                ];
                showToast(`${payload.icon} @${payload.user} shared ${payload.name} at the Picnic!`, 3500);
            } else if (payload.kind === "koi_caught") {
                showToast(`🐟 @${payload.user} caught & admired a ${payload.koiName} at the Koi Pond!`, 4000);
            } else if (payload.kind === "firefly_wish") {
                fireflyJarCount = Math.min(fireflyCommunityGoal, fireflyJarCount + 1);
                fireflyWishes = [{ user: payload.user, wish: payload.wish }, ...fireflyWishes.slice(0, 6)];
                showToast(`✨ @${payload.user} released a Firefly Wish at the Shrine!`, 4500);
            }
        };
        networkManager.onDJTrackChanged = (trackId, djUser) => {
            currentTrackId = trackId;
            if (isMusicPlaying) synth.playTrack(trackId);
            const tr = DJ_TRACKS.find((t) => t.id === trackId);
            showToast(`🪩 DJ @${djUser} dropped [${tr?.genre || "Club"}] ${tr?.title || ""}!`, 4500);
        };
        networkManager.onGraffitiPixel = (x, y, color, brush = 1) => {
            paintGraffitiPixelLocal(x, y, color, brush, false);
        };
        networkManager.onGraffitiSnapshot = (dataUrl) => {
            applyGraffitiDataUrl(dataUrl);
        };
        networkManager.onDiceSeatsUpdate = (seats) => {
            diceManager.seats = seats;
            diceTick++;
            syncDiceReactiveState();
        };
        networkManager.onDiceRollRound = (round, scores) => {
            synth.playDiceRollSfx();
            scores.forEach((s) => diceManager.scores.set(s.id, s));
            diceManager.currentRound = round;
            diceManager.lastRollTimestamp = performance.now();
            diceTick++;
            syncDiceReactiveState();
            triggerDiceShakeAnim();
        };
        networkManager.onDiceTournamentWon = (winner) => {
            diceTick++;
            syncDiceReactiveState();
            if (winner.id === myId) {
                triggerConfettiCelebration();
                synth.playWinFanfare();
                hasHighRollerCrown = true;
                const payout = Math.round(activeDiceWager * 1.8);
                recordGameOutcome(payout, "win", payout - activeDiceWager);
                showToast(`👑 YOU WON THE DICE DUEL! Payout: +${payout} $UWU (1.8x)!`, 7500);
            } else if (diceManager.scores.has(myId)) {
                recordGameOutcome(0, "loss", 0);
                showToast(`🎲 ${winner.username} won the Dice Duel (${winner.totalSum} pts)!`, 5500);
            }
        };
        networkManager.onRouletteSpinResult = (winner) => {
            if (!rouletteManager.isSpinning) {
                const targetIdx = ROULETTE_SECTORS.findIndex((s) => s.id === winner.id);
                rouletteManager.spin(targetIdx !== -1 ? targetIdx : undefined);
                syncRouletteReactiveState();
            }
        };
        networkManager.onCasinoJackpot = (user, game, amount) => {
            showToast(`🎰 HIGH ROLLER ALERT: @${user} won +${amount} $UWU on ${game}!`, 5500);
        };
        networkManager.onWebRTCSignal = (fromUserId, payload) => {
            voiceManager?.handleSignalingMessage(fromUserId, payload);
        };

        networkManager.init();

        voiceManager = new ProximityVoiceManager(myId);
        voiceManager.onLocalSpeakingChange = (speaking) => {
            isSpeaking = speaking;
            networkManager?.broadcastPosition(
                myX,
                myY,
                myDir,
                isWalking,
                isDancing,
                isSpeaking,
                DANCE_MOVES[currentDanceIndex].id,
                true,
                currentZone
            );
        };
        voiceManager.onSignalingMessage = (toUserId, payload) => {
            networkManager?.sendWebRTCSignal(toUserId, payload);
        };
    }

    $effect(() => {
        const profile = $userProfile;
        const loading = $authLoading;
        if (loading) return;
        if (profile && profile.id && profile.x_username) {
            if (activeSessionUserId !== profile.id) {
                startAuthenticatedWorldSession(profile);
            }
        } else if (activeSessionUserId !== "" || networkManager !== null) {
            stopAuthenticatedWorldSession();
        }
    });

    onMount(() => {
        floorCache.build("casino");
        forestFloorCache.build("forest");
        preloadIsoAssets(() => {
            floorCache.build("casino");
            forestFloorCache.build("forest");
        });
        initPersistentGraffitiCanvas();
        dealerAvatarSrc = getTransparentDealerDataUrl();

        // Load persistent Graffiti Wall from Supabase / localStorage so it NEVER resets on join!
        loadSavedGraffitiWall().then((savedDataUrl) => {
            if (savedDataUrl) {
                applyGraffitiDataUrl(savedDataUrl);
            }
        });

        diceManager.onStateChanged = () => {
            diceTick++;
            syncDiceReactiveState();
        };
        rouletteManager.onStateChanged = () => {
            rouletteTick++;
            syncRouletteReactiveState();
        };

        dailyClockInterval = window.setInterval(() => {
            refreshDailyRewardStatus();
        }, 15000);

        updateCanvasDimensions();
        const initCam = gridToScreen(myX, myY, 0, 0, 0, canvasWidth, canvasHeight);
        cameraX = initCam.x - canvasWidth / 2;
        cameraY = initCam.y - canvasHeight / 2;

        if (typeof ResizeObserver !== "undefined" && containerElement) {
            resizeObserver = new ResizeObserver(() => updateCanvasDimensions());
            resizeObserver.observe(containerElement);
        }
        window.addEventListener("resize", updateCanvasDimensions);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        lastFrameTime = performance.now();
        animationFrameId = requestAnimationFrame(gameLoop);

        // Local Dice & Roulette Manager Callbacks
        diceManager.onRoundRoll = (round, scores) => {
            synth.playDiceRollSfx();
            diceTick++;
            syncDiceReactiveState();
            triggerDiceShakeAnim();
            networkManager?.broadcastDiceRollRound(round, scores);
        };
        diceManager.onTournamentWon = (winner) => {
            diceTick++;
            syncDiceReactiveState();
            networkManager?.broadcastDiceTournamentWon(winner);
            if (winner.id === myId) {
                triggerConfettiCelebration();
                synth.playWinFanfare();
                hasHighRollerCrown = true;
                const payout = Math.round(activeDiceWager * 1.8);
                recordGameOutcome(payout, "win", payout - activeDiceWager);
                showToast(`👑 YOU BEAT THE HOUSE! Won +${payout} $UWU (1.8x) with ${winner.totalSum} pts!`, 7500);
            } else {
                if (diceManager.scores.has(myId)) {
                    recordGameOutcome(0, "loss", 0);
                }
                showToast(`🎲 ${winner.username} won the Dice Duel (${winner.totalSum} pts)!`, 5500);
            }
        };

        rouletteManager.onSpinStarted = () => {
            synth.playChipSfx();
            rouletteTick++;
            syncRouletteReactiveState();
        };

        rouletteManager.onSpinFinished = (winner) => {
            rouletteTick++;
            rouletteLastWinner = winner;
            syncRouletteReactiveState();
            networkManager?.broadcastRouletteSpin(winner);

            if (lockedRouletteBetId && lockedRouletteWager > 0) {
                const betId = lockedRouletteBetId;
                const wagerAmt = lockedRouletteWager;
                lockedRouletteBetId = null;
                lockedRouletteWager = 0;

                if (winner.id === betId && winner.multiplier > 0) {
                    const winAmount = wagerAmt * winner.multiplier;
                    recordGameOutcome(winAmount, "win", winAmount - wagerAmt);
                    triggerConfettiCelebration();
                    synth.playWinFanfare();
                    hasHighRollerCrown = true;
                    networkManager?.broadcastCasinoJackpot(myUsername, "Meme Roulette", winAmount);
                    showToast(
                        `🎉 ROULETTE HIT! Landed on ${winner.icon} ${winner.name} (${winner.multiplier}x)! Won +${winAmount} $UWU!`,
                        7500
                    );
                } else {
                    recordGameOutcome(0, "loss", 0);
                    showToast(
                        `🎡 Landed on ${winner.icon} ${winner.name} (${winner.multiplier}x).`,
                        5000
                    );
                }
            } else {
                showToast(`🎡 Roulette landed on ${winner.icon} ${winner.name} (${winner.multiplier}x)!`, 3500);
            }
        };
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("resize", updateCanvasDimensions);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            cancelAnimationFrame(animationFrameId);
        }
        resizeObserver?.disconnect();
        if (noticeTimeout) clearTimeout(noticeTimeout);
        if (dailyClockInterval) clearInterval(dailyClockInterval);
        if (crashTimerId) clearInterval(crashTimerId);
        if (graffitiSaveTimeout) clearTimeout(graffitiSaveTimeout);
        if (fishingHookTimer) clearTimeout(fishingHookTimer);
        stopAllArcadeTimers();
        synth.stop();
        diceManager.destroy();
        rouletteManager.destroy();
        voiceManager?.destroy();
        networkManager?.destroy();
    });

    function updateCanvasDimensions() {
        if (!containerElement || !canvasElement) return;
        const rect = containerElement.getBoundingClientRect();
        canvasWidth = Math.max(320, Math.floor(rect.width));
        canvasHeight = Math.max(280, Math.floor(rect.height));

        const dpr = window.devicePixelRatio || 1;
        canvasElement.style.width = `${canvasWidth}px`;
        canvasElement.style.height = `${canvasHeight}px`;
        canvasElement.width = Math.round(canvasWidth * dpr);
        canvasElement.height = Math.round(canvasHeight * dpr);
    }

    async function ensureVoiceInitialized() {
        if (!voiceManager) return;
        voiceManager.unlockAudio();
        if (!hasMicPermission) {
            hasMicPermission = await voiceManager.init();
        }
    }

    function isTypingInTextInput(e?: KeyboardEvent): boolean {
        if (isChatFocused || showTransferModal) return true;
        const checkEl = (el: EventTarget | Element | null): boolean => {
            if (!el || !(el instanceof HTMLElement)) return false;
            const tag = el.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
            if (el.isContentEditable) return true;
            return false;
        };
        return checkEl(e?.target || null) || checkEl(typeof document !== "undefined" ? document.activeElement : null);
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (!$userProfile) return;
        if (isTypingInTextInput(e)) {
            for (const k of Object.keys(keysPressed)) keysPressed[k] = false;
            return;
        }

        // If 90s Retro Arcade Center Modal is open, route arrow/WASD keys to the active arcade mini-game!
        if (showArcadeModal) {
            const code = e.code;
            const key = e.key.toLowerCase();
            if (activeArcadeTab === "brick") {
                if (code === "ArrowLeft" || code === "KeyA" || key === "a") {
                    e.preventDefault();
                    brickPaddleX = Math.max(8, brickPaddleX - 24);
                } else if (code === "ArrowRight" || code === "KeyD" || key === "d") {
                    e.preventDefault();
                    brickPaddleX = Math.min(248, brickPaddleX + 24);
                }
            } else if (activeArcadeTab === "snake") {
                if (code === "ArrowUp" || code === "KeyW" || key === "w") {
                    e.preventDefault();
                    setSnakeDirection(0, -1);
                } else if (code === "ArrowDown" || code === "KeyS" || key === "s") {
                    e.preventDefault();
                    setSnakeDirection(0, 1);
                } else if (code === "ArrowLeft" || code === "KeyA" || key === "a") {
                    e.preventDefault();
                    setSnakeDirection(-1, 0);
                } else if (code === "ArrowRight" || code === "KeyD" || key === "d") {
                    e.preventDefault();
                    setSnakeDirection(1, 0);
                }
            } else if (activeArcadeTab === "coin") {
                if (code === "ArrowLeft" || code === "KeyA" || key === "a") {
                    e.preventDefault();
                    coinBasketX = Math.max(8, coinBasketX - 24);
                } else if (code === "ArrowRight" || code === "KeyD" || key === "d") {
                    e.preventDefault();
                    coinBasketX = Math.min(256, coinBasketX + 24);
                }
            }
            return;
        }

        voiceManager?.unlockAudio();

        if (e.code === "Space" && !e.repeat) {
            e.preventDefault();
            ensureVoiceInitialized().then(() => voiceManager?.startTransmitting());
            return;
        }

        if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].includes(e.code)) {
            e.preventDefault();
            const idx = parseInt(e.code.replace("Digit", "")) - 1;
            setDanceByIndex(idx);
            return;
        }

        if (e.key === "e" || e.key === "E") {
            e.preventDefault();
            handleInteraction();
            return;
        }

        const code = e.code;
        const key = e.key.toLowerCase();
        keysPressed[code] = true;
        keysPressed[key] = true;

        if (
            ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code) ||
            ["w", "a", "s", "d"].includes(key)
        ) {
            e.preventDefault();
            activeWaypoints = [];
            pendingInteractionTarget = null;
        }
    }

    function handleKeyUp(e: KeyboardEvent) {
        if (isTypingInTextInput(e)) {
            for (const k of Object.keys(keysPressed)) keysPressed[k] = false;
            return;
        }
        if (e.code === "Space") {
            voiceManager?.stopTransmitting();
            return;
        }
        keysPressed[e.code] = false;
        keysPressed[e.key.toLowerCase()] = false;
    }

    function cycleDanceMove() {
        currentDanceIndex = (currentDanceIndex + 1) % DANCE_MOVES.length;
        setDanceByIndex(currentDanceIndex);
    }

    function setDanceByIndex(idx: number) {
        currentDanceIndex = idx;
        const move = DANCE_MOVES[idx];
        isDancing = true;
        roomHype = Math.min(100, roomHype + 8);
        showToast(`✨ Dance Move: ${move.icon} ${move.label} (Keys 1-6)`, 2500);

        networkManager?.broadcastPosition(
            myX,
            myY,
            myDir,
            isWalking,
            isDancing,
            isSpeaking,
            move.id,
            true,
            currentZone
        );
    }

    function triggerEmote(emote: string) {
        synth.playChipSfx();
        currentEmote = { icon: emote, expiresAt: Date.now() + 5000 };
        networkManager?.broadcastEmote(emote);
    }

    function switchWorldZone(targetZone: WorldZone, spawnX: number, spawnY: number, notice?: string) {
        currentZone = targetZone;
        const resolved = resolveMoveWithSliding(spawnX, spawnY, 0, 0, 0.22, targetZone);
        myX = resolved.x;
        myY = resolved.y;
        activeWaypoints = [];
        pendingInteractionTarget = null;
        activeStation = "none";

        const cam = gridToScreen(myX, myY, 0, 0, 0, canvasWidth, canvasHeight);
        cameraX = cam.x - canvasWidth / 2;
        cameraY = cam.y - canvasHeight / 2;

        if (targetZone === "forest") {
            currentTrackId = 11; // Whispering Woods Lullaby (Ambient)
            if (isMusicPlaying) synth.playTrack(11);
            showToast(notice || "🌲 Entered the Whispering Woods — Calm Acoustic Social Sanctuary!", 4500);
        } else {
            if (currentTrackId >= 11) currentTrackId = 3;
            if (isMusicPlaying) synth.playTrack(currentTrackId);
            showToast(notice || "🎲 Returned to the High Roller Casino Lounge!", 4000);
        }

        networkManager?.broadcastPosition(
            myX,
            myY,
            myDir,
            false,
            isDancing,
            isSpeaking,
            DANCE_MOVES[currentDanceIndex].id,
            true,
            currentZone
        );
    }

    function teleportTo(gx: number, gy: number, zoneTitle: string, targetZone: WorldZone = "casino") {
        showGuideModal = false;
        showTravelMenu = false;
        if (currentZone !== targetZone) {
            switchWorldZone(targetZone, gx, gy, `⚡ Teleported to ${zoneTitle}!`);
            return;
        }
        const resolved = resolveMoveWithSliding(gx, gy, 0, 0, 0.22, currentZone);
        myX = resolved.x;
        myY = resolved.y;
        activeWaypoints = [];
        pendingInteractionTarget = null;
        showToast(`⚡ Teleported to ${zoneTitle}!`, 3000);
        networkManager?.broadcastPosition(
            myX,
            myY,
            myDir,
            false,
            isDancing,
            isSpeaking,
            DANCE_MOVES[currentDanceIndex].id,
            true,
            currentZone
        );
    }

    function handleInteraction() {
        if (currentZone === "casino") {
            if (gridDistance(myX, myY, 16.0, 2.5) <= 3.2) {
                showDJModal = true;
                return;
            }
            if (gridDistance(myX, myY, 27.5, 12.5) <= 3.5) {
                openArcadeModal("brick");
                return;
            }
            if (gridDistance(myX, myY, 27.5, 15.5) <= 3.5) {
                openGraffitiModal();
                return;
            }
            if (activeStation === "dice") {
                startInstantSoloDiceDuel();
                return;
            }
            if (activeStation === "roulette") {
                spinRouletteWithBet();
                return;
            }
            if (activeStation === "blackjack") {
                if (bjPhase === "betting" || bjPhase === "done") dealBlackjackHand();
                return;
            }
            if (activeStation === "slots") {
                spinSlotMachine();
                return;
            }
            if (activeStation === "crash") {
                if (crashPhase === "flying") cashOutRocketCrash();
                else startRocketCrash();
                return;
            }
            if (activeStation === "mines") {
                if (minesPhase === "playing" && minesSafeClicks > 0) cashOutCyberMines();
                else if (minesPhase !== "playing") startCyberMines();
                return;
            }
        } else {
            if (activeStation === "fishing") {
                castFishingLine();
                return;
            }
            if (activeStation === "fireflies") {
                catchFirefly();
                return;
            }
        }
    }

    function ensureEnoughChips(wager: number): boolean {
        if (chips >= wager) return true;
        refreshDailyRewardStatus();
        if (dailyStatus.canClaim) {
            showToast(`🪙 Low on $UWU! Click "🎁 Daily +1,000" in the top bar to claim your daily reward!`, 4500);
        } else {
            showToast(`🪙 Insufficient $UWU (Need ${wager} $UWU). Wait for your Daily Reward or ask a friend!`, 4500);
        }
        return false;
    }

    // --- 1. STREAMLINED DICE DUEL ACTIONS ---
    function syncLocalPlayerIntoDiceRoster() {
        const allPlayers = [
            {
                id: myId,
                username: myUsername,
                avatarUrl: $userProfile?.avatar_url || "/unicorn.png",
                x: myX,
                y: myY
            },
            ...(networkManager?.getRemotePlayers() || [])
        ];
        diceManager.updateOccupants(allPlayers);
        diceTick++;
        syncDiceReactiveState();
    }

    function sitAtDiceSeat(seatIndex: number) {
        const seat = diceManager.seats[seatIndex];
        if (!seat) return;
        if (gridDistance(myX, myY, seat.coord.x, seat.coord.y) <= 4.5) {
            myX = seat.coord.x;
            myY = seat.coord.y;
            activeWaypoints = [];
            syncLocalPlayerIntoDiceRoster();
            synth.playChipSfx();
            showToast(`🎲 Seated at ${seat.label}!`, 2500);
        } else {
            activeWaypoints = findPath(myX, myY, seat.coord.x, seat.coord.y, COLLISION_MAP, MAP_SIZE);
            waypointStuckFrames = 0;
        }
    }

    function startInstantSoloDiceDuel() {
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") return;
        if (!ensureEnoughChips(selectedWager)) return;

        // Snap player onto the nearest open seat around the Craps table if not already seated
        if (!diceManager.isPlayerSeated(myId)) {
            const firstOpen = diceManager.seats.find((s) => !s.occupant);
            if (firstOpen) {
                myX = firstOpen.coord.x;
                myY = firstOpen.coord.y;
                activeWaypoints = [];
            }
        }
        syncLocalPlayerIntoDiceRoster();

        activeDiceWager = selectedWager;
        recordGameOutcome(-activeDiceWager, "neutral", 0);
        synth.playDiceRollSfx();

        diceManager.startSoloDuelVsHouse({
            id: myId,
            username: myUsername,
            avatarUrl: $userProfile?.avatar_url || "/unicorn.png"
        });
        diceTick++;
        syncDiceReactiveState();
        triggerDiceShakeAnim();
    }

    function toggleDicePvPReady() {
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") return;
        syncLocalPlayerIntoDiceRoster();
        if (!amIReady) {
            if (!ensureEnoughChips(selectedWager)) return;
            activeDiceWager = selectedWager;
            recordGameOutcome(-activeDiceWager, "neutral", 0);
            synth.playChipSfx();
        }
        amIReady = diceManager.toggleReady(myId);
        diceTick++;
        syncDiceReactiveState();
        networkManager?.broadcastDiceSeats(diceManager.seats);
    }

    // --- 2. MEME ROULETTE ACTIONS ---
    function selectRouletteSector(betId: string, fromCanvasTile = false) {
        activeRouletteBet = betId;
        synth.playChipSfx();
        if (fromCanvasTile) {
            // Only walk toward the Roulette pit if the player is currently outside the Roulette station radius
            if (gridDistance(myX, myY, 19.5, 14.0) > 2.3) {
                activeWaypoints = findPath(myX, myY, 19.5, 14.2, COLLISION_MAP, MAP_SIZE);
                waypointStuckFrames = 0;
            } else {
                activeWaypoints = [];
            }
        }
    }

    function spinRouletteWithBet() {
        if (rouletteManager.isSpinning) return;
        if (!ensureEnoughChips(selectedWager)) return;
        if (!activeRouletteBet) activeRouletteBet = "pepe";

        lockedRouletteBetId = activeRouletteBet;
        lockedRouletteWager = selectedWager;
        recordGameOutcome(-lockedRouletteWager, "neutral", 0);

        rouletteManager.spin();
        rouletteTick++;
        syncRouletteReactiveState();
    }

    // --- 3. CYBER BLACKJACK 21 ENGINE (House Edge: 6:5 Blackjack = 2.2x, Dealer wins ties on 17) ---
    const CARD_SUITS = ["♠", "♥", "♦", "♣"];
    const CARD_RANKS = [
        { r: "A", v: 11 },
        { r: "2", v: 2 },
        { r: "3", v: 3 },
        { r: "4", v: 4 },
        { r: "5", v: 5 },
        { r: "6", v: 6 },
        { r: "7", v: 7 },
        { r: "8", v: 8 },
        { r: "9", v: 9 },
        { r: "10", v: 10 },
        { r: "J", v: 10 },
        { r: "Q", v: 10 },
        { r: "K", v: 10 }
    ];

    function drawRandomCard(): PlayingCard {
        const suit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
        const rankObj = CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)];
        return { rank: rankObj.r, suit, value: rankObj.v };
    }

    function calculateHandTotal(hand: PlayingCard[]): number {
        let sum = 0;
        let aces = 0;
        for (const c of hand) {
            sum += c.value;
            if (c.rank === "A") aces++;
        }
        while (sum > 21 && aces > 0) {
            sum -= 10;
            aces--;
        }
        return sum;
    }

    function dealBlackjackHand() {
        if (!ensureEnoughChips(selectedWager)) return;
        dealerAvatarSrc = getTransparentDealerDataUrl();
        bjCurrentBet = selectedWager;
        recordGameOutcome(-bjCurrentBet, "neutral", 0);
        synth.playCardSfx();

        bjPlayerHand = [drawRandomCard(), drawRandomCard()];
        bjDealerHand = [drawRandomCard(), drawRandomCard()];
        bjPhase = "player";

        const pTotal = calculateHandTotal(bjPlayerHand);
        if (pTotal === 21) {
            finishBlackjackHand(true);
        } else {
            bjMessage = `Your total is ${pTotal}. Hit, Stand, or Double Down!`;
        }
    }

    function blackjackHit() {
        if (bjPhase !== "player") return;
        synth.playCardSfx();
        bjPlayerHand = [...bjPlayerHand, drawRandomCard()];
        const total = calculateHandTotal(bjPlayerHand);
        if (total > 21) {
            bjPhase = "done";
            recordGameOutcome(0, "loss", 0);
            bjMessage = `💥 BUST (${total})! Unicorn House Dealer wins.`;
        } else if (total === 21) {
            blackjackStand();
        } else {
            bjMessage = `Your total is ${total}. Hit or Stand?`;
        }
    }

    function blackjackDoubleDown() {
        if (bjPhase !== "player" || bjPlayerHand.length !== 2) return;
        if (chips >= bjCurrentBet) {
            recordGameOutcome(-bjCurrentBet, "neutral", 0);
            bjCurrentBet *= 2;
        }
        synth.playCardSfx();
        bjPlayerHand = [...bjPlayerHand, drawRandomCard()];
        const total = calculateHandTotal(bjPlayerHand);
        if (total > 21) {
            bjPhase = "done";
            recordGameOutcome(0, "loss", 0);
            bjMessage = `💥 BUST on Double Down (${total})!`;
        } else {
            blackjackStand();
        }
    }

    function blackjackStand() {
        if (bjPhase !== "player") return;
        bjPhase = "dealer";
        while (calculateHandTotal(bjDealerHand) < 17) {
            bjDealerHand = [...bjDealerHand, drawRandomCard()];
        }
        finishBlackjackHand(false);
    }

    function finishBlackjackHand(isNaturalBlackjack: boolean) {
        bjPhase = "done";
        const pTotal = calculateHandTotal(bjPlayerHand);
        const dTotal = calculateHandTotal(bjDealerHand);

        if (isNaturalBlackjack && dTotal !== 21) {
            const win = Math.round(bjCurrentBet * 2.2); // 6:5 Vegas Blackjack payout
            recordGameOutcome(win, "win", win - bjCurrentBet);
            synth.playWinFanfare();
            triggerConfettiCelebration();
            hasHighRollerCrown = true;
            bjMessage = `🃏 BLACKJACK 21! You won +${win} $UWU (2.2x)!`;
            networkManager?.broadcastCasinoJackpot(myUsername, "Cyber Blackjack", win);
        } else if (dTotal > 21 || pTotal > dTotal) {
            const win = Math.round(bjCurrentBet * 1.9); // 5% House commission
            recordGameOutcome(win, "win", win - bjCurrentBet);
            synth.playWinFanfare();
            bjMessage = `🏆 YOU WIN! (${pTotal} vs Dealer ${dTotal}) — Payout: +${win} $UWU!`;
        } else if (pTotal === dTotal && pTotal >= 19) {
            recordGameOutcome(bjCurrentBet, "neutral", 0);
            synth.playChipSfx();
            bjMessage = `🤝 PUSH (${pTotal} vs ${dTotal}) — Your ${bjCurrentBet} $UWU bet is returned.`;
        } else {
            recordGameOutcome(0, "loss", 0);
            bjMessage = `House Dealer wins (${dTotal} vs your ${pTotal}). Deal again!`;
        }
    }

    // --- 4. GOLDEN UWU SLOTS ENGINE (Weighted Reel Strip with ~9% House Edge) ---
    function drawWeightedSlotSymbol(): string {
        return SLOT_REEL_STRIP[Math.floor(Math.random() * SLOT_REEL_STRIP.length)];
    }

    function spinSlotMachine() {
        if (isSlotSpinning) return;
        if (!ensureEnoughChips(selectedWager)) return;
        const bet = selectedWager;
        recordGameOutcome(-bet, "neutral", 0);
        isSlotSpinning = true;
        slotMessage = "🎰 Spinning the Golden UwU Reels...";

        let ticks = 0;
        const maxTicks = 12;
        const interval = window.setInterval(() => {
            ticks++;
            synth.playSlotTickSfx(320 + ticks * 25);
            slotReels = [drawWeightedSlotSymbol(), drawWeightedSlotSymbol(), drawWeightedSlotSymbol()];

            if (ticks >= maxTicks) {
                clearInterval(interval);
                isSlotSpinning = false;
                const [r1, r2, r3] = slotReels;

                if (r1 !== "💀" && r1 === r2 && r2 === r3) {
                    const multMap: Record<string, number> = { "🍒": 4, "🐸": 8, "🚀": 15, "💎": 30, "🦄": 60 };
                    const mult = multMap[r1] || 5;
                    const win = bet * mult;
                    recordGameOutcome(win, "win", win - bet);
                    synth.playWinFanfare();
                    triggerConfettiCelebration();
                    hasHighRollerCrown = true;
                    slotMessage = `🎉 TRIPLE ${r1} JACKPOT! Won +${win} $UWU (${mult}x)!`;
                    networkManager?.broadcastCasinoJackpot(myUsername, "Golden UwU Slots", win);
                } else if (r1 !== "💀" && r1 === r2) {
                    // Only first 2 reels matching non-skull pays 1.6x (keeps overall RTP ~91%)
                    const win = Math.round(bet * 1.6);
                    recordGameOutcome(win, "win", win - bet);
                    synth.playChipSfx();
                    slotMessage = `✨ Front Pair [${r1} ${r2}]! Payout: +${win} $UWU (1.6x)!`;
                } else {
                    recordGameOutcome(0, "loss", 0);
                    slotMessage = `No payline match [${r1} ${r2} ${r3}]. House takes ${bet} $UWU!`;
                }
            }
        }, 85);
    }

    // --- 5. NEW GAME: ROCKET CRASH (8% House Edge Pareto Crash Curve) ---
    function generateCrashPoint(): number {
        const r = Math.random();
        // 8% chance of immediate 1.00x launchpad explosion (House Edge!)
        if (r < 0.08) return 1.0;
        const raw = 0.92 / (1 - Math.random());
        return Math.min(50.0, Math.max(1.01, Math.floor(raw * 100) / 100));
    }

    function startRocketCrash() {
        if (crashPhase === "flying") return;
        if (!ensureEnoughChips(selectedWager)) return;

        crashBetAmount = selectedWager;
        recordGameOutcome(-crashBetAmount, "neutral", 0);
        crashTargetPoint = generateCrashPoint();
        crashMultiplier = 1.0;
        crashPhase = "flying";
        crashMessage = "🚀 ROCKET CLIMBING! Cash out before it explodes!";
        crashLastAudioMs = performance.now();
        synth.playCrashClimbSfx(1.0);

        if (crashTimerId) clearInterval(crashTimerId);
        const startTs = performance.now();

        crashTimerId = window.setInterval(() => {
            const nowMs = performance.now();
            const elapsedSec = (nowMs - startTs) / 1000;
            const nextMult = Math.floor(Math.pow(1.085, elapsedSec * 10) * 100) / 100;

            if (nextMult >= crashTargetPoint) {
                if (crashTimerId) clearInterval(crashTimerId);
                crashTimerId = null;
                crashMultiplier = crashTargetPoint;
                crashPhase = "crashed";
                crashHistory = [crashTargetPoint, ...crashHistory.slice(0, 5)];
                synth.playCrashExplosionSfx();
                recordGameOutcome(0, "loss", 0);
                crashMessage = `💥 EXPLODED at ${crashTargetPoint.toFixed(2)}x!`;
            } else {
                crashMultiplier = nextMult;
                // Dramatic accelerating Shepard-tone synth riser as multiplier climbs
                const pulseIntervalMs = Math.max(85, 310 - Math.min(220, (nextMult - 1) * 42));
                if (nowMs - crashLastAudioMs >= pulseIntervalMs) {
                    crashLastAudioMs = nowMs;
                    synth.playCrashClimbSfx(nextMult);
                }
            }
        }, 50);
    }

    function cashOutRocketCrash() {
        if (crashPhase !== "flying") return;
        if (crashTimerId) {
            clearInterval(crashTimerId);
            crashTimerId = null;
        }
        crashPhase = "cashed_out";
        const win = Math.round(crashBetAmount * crashMultiplier);
        crashHistory = [crashTargetPoint, ...crashHistory.slice(0, 5)];
        recordGameOutcome(win, "win", win - crashBetAmount);
        synth.playWinFanfare();
        if (crashMultiplier >= 2.5) triggerConfettiCelebration();
        crashMessage = `💰 CASHED OUT at ${crashMultiplier.toFixed(2)}x! Won +${win} $UWU! (Crashed at ${crashTargetPoint.toFixed(2)}x)`;
    }

    // --- 6. BALANCED CYBER MINES 5x5 (Strict 10% House Edge Hypergeometric Multiplier) ---
    function computeMinesMultiplier(bombs: number, safePicks: number): number {
        if (safePicks <= 0) return 1.0;
        let survivalProb = 1.0;
        for (let i = 0; i < safePicks; i++) {
            survivalProb *= (25 - bombs - i) / (25 - i);
        }
        // Strict 10% House Edge (90% RTP) at every pick count
        const rawMult = 0.9 / Math.max(0.0001, survivalProb);
        return Math.min(250, Math.max(1.08, Math.floor(rawMult * 100) / 100));
    }

    const minesCurrentMultiplier = $derived(computeMinesMultiplier(minesBombCount, minesSafeClicks));
    const minesNextMultiplier = $derived(
        minesSafeClicks < 25 - minesBombCount
            ? computeMinesMultiplier(minesBombCount, minesSafeClicks + 1)
            : minesCurrentMultiplier
    );

    function startCyberMines() {
        if (minesPhase === "playing") return;
        if (!ensureEnoughChips(selectedWager)) return;

        minesBetAmount = selectedWager;
        recordGameOutcome(-minesBetAmount, "neutral", 0);
        synth.playChipSfx();

        // Generate unique random bomb positions on the 25-tile grid
        const indices = Array.from({ length: 25 }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        minesBombLocations = indices.slice(0, minesBombCount);
        minesRevealed = Array(25).fill("hidden");
        minesSafeClicks = 0;
        minesPhase = "playing";
        minesMessage = `💎 Uncover gems! Next safe pick pays ${computeMinesMultiplier(minesBombCount, 1).toFixed(2)}x (${minesBombCount} Mines hidden).`;
    }

    function clickMinesTile(idx: number) {
        if (minesPhase !== "playing") return;
        if (minesRevealed[idx] !== "hidden") return;

        const nextGrid = [...minesRevealed];
        if (minesBombLocations.includes(idx)) {
            // Hit a Cyber Mine — House wins the wager, reveal all bombs
            for (let i = 0; i < 25; i++) {
                if (minesBombLocations.includes(i)) nextGrid[i] = "bomb";
            }
            minesRevealed = nextGrid;
            minesPhase = "exploded";
            synth.playDiceRollSfx();
            recordGameOutcome(0, "loss", 0);
            minesMessage = `💥 BOOM! Hit a Cyber Mine on tile #${idx + 1}. House takes ${minesBetAmount} $UWU!`;
        } else {
            nextGrid[idx] = "gem";
            minesRevealed = nextGrid;
            minesSafeClicks++;
            synth.playSlotTickSfx(460 + minesSafeClicks * 45);
            const curMult = computeMinesMultiplier(minesBombCount, minesSafeClicks);
            const maxSafe = 25 - minesBombCount;
            if (minesSafeClicks >= maxSafe) {
                cashOutCyberMines();
            } else {
                const nxtMult = computeMinesMultiplier(minesBombCount, minesSafeClicks + 1);
                minesMessage = `💎 ${minesSafeClicks} Gem${minesSafeClicks > 1 ? "s" : ""} found (${curMult.toFixed(2)}x)! Cash out +${Math.round(minesBetAmount * curMult)} $UWU or risk for ${nxtMult.toFixed(2)}x!`;
            }
        }
    }

    function cashOutCyberMines() {
        if (minesPhase !== "playing" || minesSafeClicks <= 0) return;
        const mult = computeMinesMultiplier(minesBombCount, minesSafeClicks);
        const payout = Math.round(minesBetAmount * mult);
        const nextGrid = [...minesRevealed];
        for (let i = 0; i < 25; i++) {
            if (minesBombLocations.includes(i) && nextGrid[i] === "hidden") {
                nextGrid[i] = "bomb";
            }
        }
        minesRevealed = nextGrid;
        minesPhase = "cashed_out";
        recordGameOutcome(payout, "win", payout - minesBetAmount);
        if ( payout - minesBetAmount > arcadeBestScores.mines ) {
            arcadeBestScores = { ...arcadeBestScores, mines: payout - minesBetAmount };
        }
        synth.playWinFanfare();
        if (mult >= 2.2) {
            triggerConfettiCelebration();
            hasHighRollerCrown = true;
            networkManager?.broadcastCasinoJackpot(myUsername, "Cyber Mines", payout);
        }
        minesMessage = `💰 CASHED OUT at ${mult.toFixed(2)}x! Won +${payout} $UWU (${minesSafeClicks} Gems)!`;
    }

    // --- 7. MULTI-GAME 90s RETRO ARCADE CENTER ENGINE (5 PLAYABLE GAMES) ---
    function stopAllArcadeTimers() {
        if (brickTimerId) {
            clearInterval(brickTimerId);
            brickTimerId = null;
        }
        if (snakeTimerId) {
            clearInterval(snakeTimerId);
            snakeTimerId = null;
        }
        if (coinTimerId) {
            clearInterval(coinTimerId);
            coinTimerId = null;
        }
        if (coinCountdownId) {
            clearInterval(coinCountdownId);
            coinCountdownId = null;
        }
        if (whackTimerId) {
            clearInterval(whackTimerId);
            whackTimerId = null;
        }
        if (whackCountdownId) {
            clearInterval(whackCountdownId);
            whackCountdownId = null;
        }
    }

    function openArcadeModal(defaultTab: ArcadeGameId = "brick") {
        stopAllArcadeTimers();
        activeArcadeTab = defaultTab;
        showArcadeModal = true;
    }

    function closeArcadeModal() {
        stopAllArcadeTimers();
        showArcadeModal = false;
    }

    function selectArcadeTab(tab: ArcadeGameId) {
        stopAllArcadeTimers();
        activeArcadeTab = tab;
        synth.playChipSfx();
    }

    function payArcadeEntryIfTokenMode(): boolean {
        if (arcadePlayMode === "free") return true;
        if (!ensureEnoughChips(ARCADE_TOKEN_COST)) return false;
        recordGameOutcome(-ARCADE_TOKEN_COST, "neutral", 0);
        return true;
    }

    function settleArcadeGameResult(gameId: ArcadeGameId, finalScore: number, targetScore: number, gameLabel: string) {
        if (finalScore > arcadeBestScores[gameId]) {
            arcadeBestScores = { ...arcadeBestScores, [gameId]: finalScore };
        }
        if (arcadePlayMode === "token") {
            if (finalScore >= targetScore) {
                recordGameOutcome(ARCADE_TOKEN_PAYOUT, "win", finalScore);
                synth.playWinFanfare();
                triggerConfettiCelebration();
                showToast(
                    `🕹️ ${gameLabel} TARGET BEAT (${finalScore} >= ${targetScore})! Won +${ARCADE_TOKEN_PAYOUT} $UWU (1.75x)!`,
                    6000
                );
            } else {
                recordGameOutcome(0, "loss", finalScore);
                showToast(
                    `🕹️ ${gameLabel} Score: ${finalScore}/${targetScore}. Needed ${targetScore} pts to win the 175 $UWU token prize!`,
                    4500
                );
            }
        } else {
            if (finalScore >= targetScore) {
                synth.playWinFanfare();
                showToast(`🕹️ High Score on ${gameLabel}: ${finalScore} pts!`, 3500);
            }
        }
    }

    // Arcade Game 2: Neon Brick Breaker (Arkanoid)
    function startBrickBreaker() {
        stopAllArcadeTimers();
        if (!payArcadeEntryIfTokenMode()) return;
        synth.playChipSfx();

        const rowColors = ["#ff0055", "#ff7700", "#ffd700", "#00ff88", "#00ffff"];
        const rowPts = [30, 25, 20, 15, 10];
        const bricks: ArcadeBrick[] = [];
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 7; c++) {
                bricks.push({
                    x: 12 + c * 43,
                    y: 20 + r * 16,
                    w: 39,
                    h: 11,
                    color: rowColors[r],
                    pts: rowPts[r],
                    alive: true
                });
            }
        }
        brickList = bricks;
        brickScore = 0;
        brickLives = 3;
        brickPaddleX = 128;
        brickBall = { x: 160, y: 185, vx: 2.9 * (Math.random() > 0.5 ? 1 : -1), vy: -3.2 };
        brickPhase = "playing";

        brickTimerId = window.setInterval(() => {
            if (brickPhase !== "playing") return;
            let bx = brickBall.x + brickBall.vx;
            let by = brickBall.y + brickBall.vy;
            let vx = brickBall.vx;
            let vy = brickBall.vy;

            if (bx <= 7 || bx >= 313) {
                vx = -vx;
                bx = Math.max(7, Math.min(313, bx));
            }
            if (by <= 8) {
                vy = Math.abs(vy);
                by = 8;
            }

            // Paddle collision (y = 204..214, width = 64)
            if (vy > 0 && by >= 198 && by <= 212 && bx >= brickPaddleX - 4 && bx <= brickPaddleX + 68) {
                const hitOffset = (bx - (brickPaddleX + 32)) / 32; // -1..1
                vx = hitOffset * 4.1;
                vy = -Math.max(2.9, Math.abs(vy));
                by = 197;
                synth.playSlotTickSfx(360);
            }

            // Brick collision
            let hitBrick = false;
            const updated = brickList.map((b) => {
                if (!b.alive || hitBrick) return b;
                if (bx >= b.x - 4 && bx <= b.x + b.w + 4 && by >= b.y - 4 && by <= b.y + b.h + 4) {
                    hitBrick = true;
                    vy = -vy;
                    brickScore += b.pts;
                    synth.playSlotTickSfx(520 + b.pts * 6);
                    return { ...b, alive: false };
                }
                return b;
            });
            if (hitBrick) brickList = updated;

            if (brickList.every((b) => !b.alive)) {
                brickPhase = "won";
                brickScore += brickLives * 50;
                stopAllArcadeTimers();
                settleArcadeGameResult("brick", brickScore, BRICK_TARGET_SCORE, "Neon Brick Breaker");
                return;
            }

            if (by > 226) {
                brickLives--;
                synth.playDiceRollSfx();
                if (brickLives <= 0) {
                    brickPhase = "lost";
                    stopAllArcadeTimers();
                    settleArcadeGameResult("brick", brickScore, BRICK_TARGET_SCORE, "Neon Brick Breaker");
                    return;
                } else {
                    bx = brickPaddleX + 32;
                    by = 190;
                    vx = 2.9 * (Math.random() > 0.5 ? 1 : -1);
                    vy = -3.2;
                }
            }

            brickBall = { x: bx, y: by, vx, vy };
        }, 25);
    }

    function handleBrickPointerMove(e: MouseEvent | TouchEvent) {
        const el = e.currentTarget as HTMLElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const relX = ((clientX - rect.left) / rect.width) * 320;
        brickPaddleX = Math.max(8, Math.min(248, relX - 32));
    }

    // Arcade Game 3: Cyber Snake 1998
    function spawnSnakeFood(currentBody: Array<{ x: number; y: number }>) {
        for (let attempt = 0; attempt < 50; attempt++) {
            const fx = Math.floor(Math.random() * 16);
            const fy = Math.floor(Math.random() * 12);
            if (!currentBody.some((seg) => seg.x === fx && seg.y === fy)) {
                snakeFood = { x: fx, y: fy, kind: Math.random() < 0.25 ? "unicorn" : "orb" };
                return;
            }
        }
    }

    function setSnakeDirection(dx: number, dy: number) {
        if (snakeDir.x === -dx && snakeDir.y === -dy) return;
        snakeNextDir = { x: dx, y: dy };
    }

    function startCyberSnake() {
        stopAllArcadeTimers();
        if (!payArcadeEntryIfTokenMode()) return;
        synth.playChipSfx();

        const initBody = [
            { x: 7, y: 6 },
            { x: 6, y: 6 },
            { x: 5, y: 6 }
        ];
        snakeBody = initBody;
        snakeDir = { x: 1, y: 0 };
        snakeNextDir = { x: 1, y: 0 };
        snakeScore = 0;
        spawnSnakeFood(initBody);
        snakePhase = "playing";

        snakeTimerId = window.setInterval(() => {
            if (snakePhase !== "playing") return;
            snakeDir = snakeNextDir;
            const head = snakeBody[0];
            const nx = head.x + snakeDir.x;
            const ny = head.y + snakeDir.y;

            if (nx < 0 || nx >= 16 || ny < 0 || ny >= 12 || snakeBody.some((s) => s.x === nx && s.y === ny)) {
                snakePhase = snakeScore >= SNAKE_TARGET_SCORE ? "won" : "lost";
                synth.playDiceRollSfx();
                stopAllArcadeTimers();
                settleArcadeGameResult("snake", snakeScore, SNAKE_TARGET_SCORE, "Cyber Snake 1998");
                return;
            }

            const nextBody = [{ x: nx, y: ny }, ...snakeBody];
            if (nx === snakeFood.x && ny === snakeFood.y) {
                const pts = snakeFood.kind === "unicorn" ? 75 : 30;
                snakeScore += pts;
                synth.playSlotTickSfx(snakeFood.kind === "unicorn" ? 760 : 520);
                spawnSnakeFood(nextBody);
            } else {
                nextBody.pop();
            }
            snakeBody = nextBody;
        }, 125);
    }

    // Arcade Game 4: Cyber Coin Rush (25s Falling Catcher)
    function startCoinRush() {
        stopAllArcadeTimers();
        if (!payArcadeEntryIfTokenMode()) return;
        synth.playChipSfx();

        coinScore = 0;
        coinTimeLeft = 25;
        coinBasketX = 132;
        coinItems = [];
        coinPhase = "playing";
        let nextItemId = 1;

        coinTimerId = window.setInterval(() => {
            if (coinPhase !== "playing") return;
            if (Math.random() < 0.16) {
                const roll = Math.random();
                let icon = "🪙";
                let pts = 20;
                let isBomb = false;
                if (roll < 0.25) {
                    icon = "💣";
                    pts = -50;
                    isBomb = true;
                } else if (roll < 0.42) {
                    icon = "💎";
                    pts = 45;
                } else if (roll < 0.52) {
                    icon = "🦄";
                    pts = 75;
                }
                coinItems = [
                    ...coinItems,
                    {
                        id: nextItemId++,
                        x: 16 + Math.random() * 288,
                        y: -10,
                        vy: 2.3 + Math.random() * 1.8,
                        icon,
                        pts,
                        isBomb
                    }
                ];
            }

            const remaining: FallingArcadeItem[] = [];
            for (const item of coinItems) {
                const ny = item.y + item.vy;
                if (ny >= 186 && ny <= 214 && Math.abs(item.x - (coinBasketX + 28)) <= 32) {
                    coinScore = Math.max(0, coinScore + item.pts);
                    if (item.isBomb) synth.playDiceRollSfx();
                    else synth.playSlotTickSfx(540);
                } else if (ny < 224) {
                    remaining.push({ ...item, y: ny });
                }
            }
            coinItems = remaining;
        }, 30);

        coinCountdownId = window.setInterval(() => {
            if (coinPhase !== "playing") return;
            coinTimeLeft--;
            if (coinTimeLeft <= 0) {
                coinPhase = "done";
                stopAllArcadeTimers();
                settleArcadeGameResult("coin", coinScore, COIN_TARGET_SCORE, "Cyber Coin Rush");
            }
        }, 1000);
    }

    function handleCoinPointerMove(e: MouseEvent | TouchEvent) {
        const el = e.currentTarget as HTMLElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const relX = ((clientX - rect.left) / rect.width) * 320;
        coinBasketX = Math.max(8, Math.min(256, relX - 28));
    }

    // Arcade Game 5: Whack-A-Glitch (20s 3x3 Cyber Terminal Reflex)
    function startWhackAGlitch() {
        stopAllArcadeTimers();
        if (!payArcadeEntryIfTokenMode()) return;
        synth.playChipSfx();

        whackScore = 0;
        whackTimeLeft = 20;
        whackGrid = Array.from({ length: 9 }, () => ({ kind: "empty", expiresAt: 0 }));
        whackPhase = "playing";

        whackTimerId = window.setInterval(() => {
            if (whackPhase !== "playing") return;
            const now = Date.now();
            const next = whackGrid.map((cell) => (cell.expiresAt > 0 && now > cell.expiresAt ? { kind: "empty" as const, expiresAt: 0 } : cell));
            const emptyIndices = next.map((c, idx) => (c.kind === "empty" ? idx : -1)).filter((idx) => idx !== -1);
            if (emptyIndices.length > 0 && Math.random() < 0.68) {
                const pickIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
                const r = Math.random();
                const kind: GlitchCell["kind"] = r < 0.22 ? "bomb" : r < 0.42 ? "golden" : "bug";
                next[pickIdx] = { kind, expiresAt: now + 950 };
            }
            whackGrid = next;
        }, 280);

        whackCountdownId = window.setInterval(() => {
            if (whackPhase !== "playing") return;
            whackTimeLeft--;
            if (whackTimeLeft <= 0) {
                whackPhase = "done";
                stopAllArcadeTimers();
                settleArcadeGameResult("whack", whackScore, WHACK_TARGET_SCORE, "Whack-A-Glitch");
            }
        }, 1000);
    }

    function whackCell(idx: number) {
        if (whackPhase !== "playing") return;
        const cell = whackGrid[idx];
        if (!cell || cell.kind === "empty") return;

        const next = [...whackGrid];
        next[idx] = { kind: "empty", expiresAt: 0 };
        whackGrid = next;

        if (cell.kind === "bomb") {
            whackScore = Math.max(0, whackScore - 45);
            synth.playDiceRollSfx();
        } else if (cell.kind === "golden") {
            whackScore += 65;
            synth.playSlotTickSfx(780);
        } else {
            whackScore += 30;
            synth.playSlotTickSfx(520);
        }
    }

    // --- WHISPERING WOODS SOCIAL ACTIVITIES (NON-GAMBLING) ---
    function voteCampfireOption(optionIdx: number) {
        myCampfireVote = optionIdx;
        campfireRevealed = true;
        synth.playNatureChimeSfx();
        const votes = { ...campfireVotes };
        const arr = votes[optionIdx] ? [...votes[optionIdx]] : [];
        if (!arr.includes(myUsername)) arr.push(myUsername);
        votes[optionIdx] = arr;
        campfireVotes = votes;
        networkManager?.broadcastForestEvent({
            kind: "campfire_vote",
            user: myUsername,
            optionIdx
        });
    }

    function nextCampfirePrompt() {
        synth.playNatureChimeSfx();
        const bankLen =
            campfireMode === "trivia" ? CAMPFIRE_TRIVIA_BANK.length : CAMPFIRE_ICEBREAKER_BANK.length;
        campfireQuestionIndex = (campfireQuestionIndex + 1) % bankLen;
        campfireRevealed = false;
        campfireVotes = {};
        myCampfireVote = null;
        networkManager?.broadcastForestEvent({
            kind: "campfire_next",
            questionIndex: campfireQuestionIndex
        });
    }

    function postCampfireStory() {
        const text = campfireCustomStory.trim();
        if (!text) return;
        campfireCustomStory = "";
        synth.playNatureChimeSfx();
        campfireStories = [...campfireStories.slice(-8), { user: myUsername, text }];
        speechBubble = { text: `🔥 ${text}`, expiresAt: Date.now() + 6500 };
        networkManager?.broadcastChat(`🔥 ${text}`);
        networkManager?.broadcastForestEvent({
            kind: "campfire_story",
            user: myUsername,
            text
        });
    }

    function sharePicnicTreat(treat: (typeof PICNIC_TREATS)[number]) {
        synth.playNatureChimeSfx();
        picnicComboCount++;
        picnicRecentFeed = [`${treat.icon} You shared ${treat.name} (${treat.vibe})!`, ...picnicRecentFeed.slice(0, 4)];
        triggerEmote(treat.icon);
        networkManager?.broadcastForestEvent({
            kind: "picnic_treat",
            user: myUsername,
            icon: treat.icon,
            name: treat.name
        });
    }

    function castFishingLine() {
        if (fishingState === "waiting") return;
        if (fishingState === "bite") {
            // Reel in the Koi!
            if (fishingHookTimer) clearTimeout(fishingHookTimer);
            const specimen = KOI_POND_SPECIMENS[Math.floor(Math.random() * KOI_POND_SPECIMENS.length)];
            caughtKoi = specimen;
            fishingState = "caught";
            if (!koiCollection.includes(specimen.id)) {
                koiCollection = [...koiCollection, specimen.id];
            }
            synth.playNatureChimeSfx();
            triggerEmote(specimen.icon);
            showToast(`🐟 Caught & admired a ${specimen.rarity} ${specimen.name}!`, 4500);
            networkManager?.broadcastForestEvent({
                kind: "koi_caught",
                user: myUsername,
                koiName: `${specimen.icon} ${specimen.name}`
            });
            return;
        }

        // Start casting
        caughtKoi = null;
        fishingState = "waiting";
        synth.playNatureChimeSfx();
        if (fishingHookTimer) clearTimeout(fishingHookTimer);
        fishingHookTimer = window.setTimeout(() => {
            fishingState = "bite";
            synth.playNatureChimeSfx();
            fishingHookTimer = window.setTimeout(() => {
                if (fishingState === "bite") {
                    fishingState = "idle";
                    showToast("🐟 The Koi swam away gently! Cast your line again.", 3000);
                }
            }, 3500);
        }, 1800 + Math.random() * 1800);
    }

    function catchFirefly() {
        synth.playNatureChimeSfx();
        fireflyJarCount = Math.min(fireflyCommunityGoal, fireflyJarCount + 1);
        triggerEmote("✨");
        for (let i = 0; i < 16; i++) {
            particles.push({
                x: myX + (Math.random() - 0.5) * 3,
                y: myY + (Math.random() - 0.5) * 3,
                vx: (Math.random() - 0.5) * 0.08,
                vy: (Math.random() - 0.5) * 0.08,
                color: "#ccff66",
                size: 4,
                life: 0,
                maxLife: 55
            });
        }
    }

    function releaseFireflyWish() {
        const wish = fireflyWishInput.trim() || "Wishing peace & cozy vibes to everyone in UwU World ✨";
        fireflyWishInput = "";
        synth.playNatureChimeSfx();
        triggerConfettiCelebration();
        fireflyJarCount = Math.min(fireflyCommunityGoal, fireflyJarCount + 1);
        fireflyWishes = [{ user: myUsername, wish }, ...fireflyWishes.slice(0, 6)];
        speechBubble = { text: `🏮 ${wish}`, expiresAt: Date.now() + 6500 };
        networkManager?.broadcastForestEvent({
            kind: "firefly_wish",
            user: myUsername,
            wish
        });
    }

    // --- POINTER & PATHFINDING NAVIGATION ---
    function handleCanvasPointerMove(e: MouseEvent) {
        if (!canvasElement) return;
        const rect = canvasElement.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const grid = screenToGrid(screenX, screenY, cameraX, cameraY, canvasWidth, canvasHeight);
        const gx = Math.floor(grid.x);
        const gy = Math.floor(grid.y);
        if (gx >= 0 && gx < MAP_SIZE && gy >= 0 && gy < MAP_SIZE) {
            hoveredTile = { x: gx, y: gy };
        } else {
            hoveredTile = null;
        }
    }

    function handleCanvasPointerLeave() {
        hoveredTile = null;
    }

    function handleCanvasPointerDown(e: MouseEvent | TouchEvent) {
        if (!$userProfile) return;
        if (!canvasElement || e.target !== canvasElement) return;

        showTravelMenu = false;
        voiceManager?.unlockAudio();

        if (isChatFocused || document.activeElement === chatInputEl) {
            chatInputEl?.blur();
            isChatFocused = false;
        }

        const rect = canvasElement.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        const gridPos = screenToGrid(screenX, screenY, cameraX, cameraY, canvasWidth, canvasHeight);
        const gx = Math.floor(gridPos.x);
        const gy = Math.floor(gridPos.y);

        if (currentZone === "casino") {
            // 1. Direct click on Roulette Betting Mats
            const clickedSector = BETTABLE_ROULETTE_SECTORS.find((s) => s.tile.x === gx && s.tile.y === gy);
            if (clickedSector) {
                selectRouletteSector(clickedSector.id, true);
                return;
            }

            // 2. Direct click on Dice Seats
            const clickedSeatIdx = diceManager.seats.findIndex((s) => s.tile.x === gx && s.tile.y === gy);
            if (clickedSeatIdx !== -1) {
                sitAtDiceSeat(clickedSeatIdx);
                return;
            }

            // 3. Direct click on interactive 3D world objects
            pendingInteractionTarget = null;
            if (gx >= 26 && gx <= 28 && gy === 15) {
                if (gridDistance(myX, myY, 27.5, 15.5) <= 3.5) {
                    openGraffitiModal();
                    return;
                }
                pendingInteractionTarget = "graffiti";
            } else if (gx >= 26 && gx <= 28 && gy === 12) {
                if (gridDistance(myX, myY, 27.5, 12.5) <= 3.8) {
                    openArcadeModal("brick");
                    return;
                }
                pendingInteractionTarget = "arcade";
            } else if ((gx === 27 || gx === 28) && gy === 19) {
                pendingInteractionTarget = "mines";
            } else if ((gx === 15 || gx === 16) && gy === 2) {
                if (gridDistance(myX, myY, 16.0, 2.5) <= 3.5) {
                    showDJModal = true;
                    return;
                }
                pendingInteractionTarget = "dj";
            }
        } else {
            pendingInteractionTarget = null;
        }

        const activeCollision = currentZone === "forest" ? FOREST_COLLISION_MAP : COLLISION_MAP;
        activeWaypoints = findPath(myX, myY, gridPos.x, gridPos.y, activeCollision, MAP_SIZE);
        waypointStuckFrames = 0;
    }

    // Mobile Virtual Joystick
    function handleJoystickStart(e: TouchEvent) {
        e.stopPropagation();
        const touch = e.touches[0];
        isJoystickActive = true;
        joystickOrigin = { x: touch.clientX, y: touch.clientY };
        joystickOffset = { x: 0, y: 0 };
        activeWaypoints = [];
    }

    function handleJoystickMove(e: TouchEvent) {
        e.stopPropagation();
        if (!isJoystickActive) return;
        const touch = e.touches[0];
        const dx = touch.clientX - joystickOrigin.x;
        const dy = touch.clientY - joystickOrigin.y;
        const maxDist = 45;
        const dist = Math.hypot(dx, dy);

        if (dist > maxDist) {
            joystickOffset = {
                x: (dx / dist) * maxDist,
                y: (dy / dist) * maxDist
            };
        } else {
            joystickOffset = { x: dx, y: dy };
        }
    }

    function handleJoystickEnd(e: TouchEvent) {
        e.stopPropagation();
        isJoystickActive = false;
        joystickOffset = { x: 0, y: 0 };
    }

    // --- PERSISTENT LIVE GRAFFITI ENGINE (Never resets on join!) ---
    function initPersistentGraffitiCanvas() {
        if (typeof document === "undefined") return;
        persistentGraffitiCanvas = document.createElement("canvas");
        persistentGraffitiCanvas.width = 48;
        persistentGraffitiCanvas.height = 32;
        persistentGraffitiCtx = persistentGraffitiCanvas.getContext("2d");
        if (!persistentGraffitiCtx) return;

        const g = persistentGraffitiCtx;
        g.fillStyle = "#090418";
        g.fillRect(0, 0, 48, 32);

        g.fillStyle = "#ff007f";
        g.fillRect(0, 22, 48, 2);
        g.fillStyle = "#00ffff";
        for (let x = 2; x < 46; x += 6) {
            g.fillRect(x, 24, 2, 8);
        }
        g.fillStyle = "#ffcc00";
        g.fillRect(18, 6, 12, 10);
        g.fillStyle = "#ff00aa";
        g.fillRect(16, 10, 16, 4);
        g.fillStyle = "#00ff88";
        g.fillRect(6, 8, 6, 6);
        g.fillRect(36, 8, 6, 6);

        // Record fallback template data URL so it is NEVER broadcasted or saved over user artwork
        defaultGraffitiDataUrl = persistentGraffitiCanvas.toDataURL("image/png");
        isGraffitiReady = false;
    }

    function applyGraffitiDataUrl(dataUrl: string) {
        if (!dataUrl || typeof window === "undefined") return;
        // Ignore the untouched default procedural template so a newly joined peer can never reset the wall
        if (defaultGraffitiDataUrl && dataUrl === defaultGraffitiDataUrl) return;
        const img = new Image();
        img.onload = () => {
            if (persistentGraffitiCtx) {
                persistentGraffitiCtx.clearRect(0, 0, 48, 32);
                persistentGraffitiCtx.drawImage(img, 0, 0, 48, 32);
            }
            if (graffitiCtx && graffitiCanvas) {
                graffitiCtx.imageSmoothingEnabled = false;
                graffitiCtx.drawImage(img, 0, 0, graffitiCanvas.width, graffitiCanvas.height);
            }
            isGraffitiReady = true;
        };
        img.src = dataUrl;
    }

    function broadcastAuthoritativeGraffitiIfReady() {
        if (!isGraffitiReady || !persistentGraffitiCanvas) return;
        const dataUrl = persistentGraffitiCanvas.toDataURL("image/png");
        if (!dataUrl || (defaultGraffitiDataUrl && dataUrl === defaultGraffitiDataUrl)) return;
        networkManager?.broadcastGraffitiSnapshot(dataUrl);
    }

    function schedulePersistGraffiti() {
        if (!$userProfile || !myUsername) return;
        if (graffitiSaveTimeout) clearTimeout(graffitiSaveTimeout);
        graffitiSaveTimeout = window.setTimeout(() => {
            if (!persistentGraffitiCanvas || !isGraffitiReady) return;
            const dataUrl = persistentGraffitiCanvas.toDataURL("image/png");
            if (!dataUrl || (defaultGraffitiDataUrl && dataUrl === defaultGraffitiDataUrl)) return;
            saveGraffitiWallState(dataUrl, myUsername);
            networkManager?.broadcastGraffitiSnapshot(dataUrl);
        }, 450);
    }

    function openGraffitiModal() {
        if (!$userProfile) return;
        showGraffitiModal = true;
        setTimeout(() => {
            if (!graffitiCanvas || !persistentGraffitiCanvas) return;
            graffitiCtx = graffitiCanvas.getContext("2d");
            if (!graffitiCtx) return;
            graffitiCtx.imageSmoothingEnabled = false;
            graffitiCtx.drawImage(persistentGraffitiCanvas, 0, 0, 384, 256);
        }, 30);
    }

    function clearGraffitiCanvas() {
        if (!$userProfile) return;
        if (persistentGraffitiCtx) {
            persistentGraffitiCtx.fillStyle = "#090418";
            persistentGraffitiCtx.fillRect(0, 0, 48, 32);
        }
        if (graffitiCtx) {
            graffitiCtx.fillStyle = "#090418";
            graffitiCtx.fillRect(0, 0, 384, 256);
        }
        isGraffitiReady = true;
        schedulePersistGraffiti();
    }

    function handleGraffitiPointerDown(e: MouseEvent | TouchEvent) {
        if (!$userProfile) return;
        isGraffitiPainting = true;
        paintAtPointer(e);
    }

    function handleGraffitiPointerMove(e: MouseEvent | TouchEvent) {
        if (!isGraffitiPainting) return;
        paintAtPointer(e);
    }

    function handleGraffitiPointerUp() {
        if (isGraffitiPainting) {
            isGraffitiPainting = false;
            schedulePersistGraffiti();
        }
    }

    function paintAtPointer(e: MouseEvent | TouchEvent) {
        if (!graffitiCanvas || !$userProfile) return;
        const rect = graffitiCanvas.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

        const x = Math.floor(((clientX - rect.left) / rect.width) * 48);
        const y = Math.floor(((clientY - rect.top) / rect.height) * 32);

        if (x >= 0 && x < 48 && y >= 0 && y < 32) {
            paintGraffitiPixelLocal(x, y, selectedGraffitiColor, graffitiBrushSize, true);
            networkManager?.broadcastGraffitiPixel(x, y, selectedGraffitiColor, graffitiBrushSize);
        }
    }

    function paintGraffitiPixelLocal(x: number, y: number, color: string, brush = 1, persist = false) {
        if (persistentGraffitiCtx) {
            persistentGraffitiCtx.fillStyle = color;
            persistentGraffitiCtx.fillRect(x, y, brush, brush);
        }
        if (graffitiCanvas && graffitiCtx) {
            const cellW = graffitiCanvas.width / 48;
            const cellH = graffitiCanvas.height / 32;
            graffitiCtx.fillStyle = color;
            graffitiCtx.fillRect(x * cellW, y * cellH, cellW * brush, cellH * brush);
        }
        isGraffitiReady = true;
        if (persist) {
            schedulePersistGraffiti();
        }
    }

    function triggerConfettiCelebration() {
        for (let i = 0; i < 85; i++) {
            particles.push({
                x: myX + (Math.random() - 0.5) * 5,
                y: myY + (Math.random() - 0.5) * 5,
                vx: (Math.random() - 0.5) * 0.16,
                vy: (Math.random() - 0.5) * 0.16,
                color: ["#ff00ff", "#00ffff", "#ffff00", "#00ff88", "#ff3366", "#ffffff", "#ffd700"][
                    Math.floor(Math.random() * 7)
                ],
                size: 4 + Math.random() * 4,
                life: 0,
                maxLife: 65 + Math.random() * 40
            });
        }
    }

    function sendChatMessage() {
        if (!chatInput.trim()) return;
        const text = chatInput.trim();
        chatInput = "";

        speechBubble = { text, expiresAt: Date.now() + 6500 };
        recentChatLog = [...recentChatLog.slice(-14), { user: myUsername, text, ts: Date.now() }];
        networkManager?.broadcastChat(text);
    }

    // --- 60 FPS PHYSICS & RENDER LOOP ---
    function gameLoop(now: number) {
        const deltaSec = Math.min(0.1, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        updatePhysics(deltaSec);
        renderScene(now);

        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function updatePhysics(deltaSec: number) {
        if (!$userProfile) return;
        let moveX = 0;
        let moveY = 0;
        const speed = 4.8;

        if (!isTypingInTextInput() && !showArcadeModal && !showGraffitiModal && !showDJModal && !showGuideModal && !showLeaderboardModal) {
            if (keysPressed["KeyW"] || keysPressed["ArrowUp"] || keysPressed["w"]) {
                moveX -= 1;
                moveY -= 1;
            }
            if (keysPressed["KeyS"] || keysPressed["ArrowDown"] || keysPressed["s"]) {
                moveX += 1;
                moveY += 1;
            }
            if (keysPressed["KeyA"] || keysPressed["ArrowLeft"] || keysPressed["a"]) {
                moveX -= 1;
                moveY += 1;
            }
            if (keysPressed["KeyD"] || keysPressed["ArrowRight"] || keysPressed["d"]) {
                moveX += 1;
                moveY -= 1;
            }
            if (moveX !== 0 || moveY !== 0) {
                activeWaypoints = [];
            }
        }

        if (isJoystickActive && (Math.abs(joystickOffset.x) > 4 || Math.abs(joystickOffset.y) > 4)) {
            const jx = joystickOffset.x / 45;
            const jy = joystickOffset.y / 45;
            moveX = (jx + jy) * 0.95;
            moveY = (jy - jx) * 0.95;
            activeWaypoints = [];
        }

        if (activeWaypoints.length > 0 && moveX === 0 && moveY === 0) {
            const nextPt = activeWaypoints[0];
            const dx = nextPt.x - myX;
            const dy = nextPt.y - myY;
            const dist = Math.hypot(dx, dy);

            if (dist <= 0.22 || (activeWaypoints.length === 1 && dist <= 0.36 && waypointStuckFrames > 2)) {
                activeWaypoints.shift();
                waypointStuckFrames = 0;
                if (activeWaypoints.length === 0 && pendingInteractionTarget) {
                    if (pendingInteractionTarget === "graffiti") openGraffitiModal();
                    else if (pendingInteractionTarget === "arcade") openArcadeModal("brick");
                    else if (pendingInteractionTarget === "dj") showDJModal = true;
                    pendingInteractionTarget = null;
                }
            } else {
                moveX = dx / dist;
                moveY = dy / dist;
            }
        }

        const len = Math.hypot(moveX, moveY);
        if (len > 0.04) {
            const stepX = (moveX / len) * speed * deltaSec;
            const stepY = (moveY / len) * speed * deltaSec;

            const res = resolveMoveWithSliding(myX, myY, stepX, stepY, 0.22, currentZone);
            myX = res.x;
            myY = res.y;

            if (!res.moved) {
                waypointStuckFrames++;
                if (waypointStuckFrames > 4) {
                    if (activeWaypoints.length > 1) activeWaypoints.shift();
                    else activeWaypoints = [];
                    waypointStuckFrames = 0;
                }
            } else {
                waypointStuckFrames = 0;
            }

            myDir = getIsoDirection(stepX, stepY, myDir);
            isWalking = true;
            isDancing = false;
            walkAnimTick += deltaSec * 6.5;
        } else {
            const safeRes = resolveMoveWithSliding(myX, myY, 0, 0, 0.22, currentZone);
            myX = safeRes.x;
            myY = safeRes.y;
            isWalking = false;
            if (isDancing) {
                walkAnimTick += deltaSec * 5.8;
            }
        }

        // Seamless East/West Portal Edge Walking Transition between Casino & Whispering Woods
        if (currentZone === "casino" && myX >= 30.2 && myY >= 13.8 && myY <= 18.0) {
            switchWorldZone("forest", 2.4, 16.0);
            return;
        } else if (currentZone === "forest" && myX <= 1.6 && myY >= 13.8 && myY <= 18.0) {
            switchWorldZone("casino", 29.4, 16.0);
            return;
        }

        const playerScreen = gridToScreen(myX, myY, 0, 0, 0, canvasWidth, canvasHeight);
        cameraX += (playerScreen.x - canvasWidth / 2 - cameraX) * 0.14;
        cameraY += (playerScreen.y - canvasHeight / 2 - cameraY) * 0.14;

        networkManager?.broadcastPosition(
            myX,
            myY,
            myDir,
            isWalking,
            isDancing,
            isSpeaking,
            DANCE_MOVES[currentDanceIndex].id,
            false,
            currentZone
        );

        networkManager?.tickInterpolation(deltaSec);

        if (voiceManager && networkManager) {
            voiceManager.updateSpatialVolumes({ x: myX, y: myY }, networkManager.getRemotePositions(currentZone));
        }

        if (currentZone === "casino") {
            const allPlayers = [
                {
                    id: myId,
                    username: myUsername,
                    avatarUrl: $userProfile?.avatar_url || "/unicorn.png",
                    x: myX,
                    y: myY
                },
                ...(networkManager?.getRemotePlayers("casino") || [])
            ];

            diceManager.updateOccupants(allPlayers);

            // Well-Separated Casino Station Proximity Detection
            const stationCandidates: Array<{ id: typeof activeStation; dist: number; maxRadius: number }> = [
                { id: "dice", dist: gridDistance(myX, myY, 11.5, 13.5), maxRadius: 2.35 },
                { id: "roulette", dist: gridDistance(myX, myY, 19.5, 14.0), maxRadius: 2.5 },
                { id: "blackjack", dist: gridDistance(myX, myY, 11.5, 19.5), maxRadius: 2.35 },
                { id: "slots", dist: gridDistance(myX, myY, 21.0, 19.5), maxRadius: 2.25 },
                { id: "crash", dist: gridDistance(myX, myY, 15.5, 12.5), maxRadius: 2.2 },
                { id: "mines", dist: gridDistance(myX, myY, 27.5, 19.5), maxRadius: 2.35 }
            ];

            let closestStation: typeof activeStation = "none";
            let bestDist = Infinity;
            for (const cand of stationCandidates) {
                if (cand.dist <= cand.maxRadius && cand.dist < bestDist) {
                    bestDist = cand.dist;
                    closestStation = cand.id;
                }
            }
            activeStation = closestStation;

            myDiceSeatIndex = diceManager.getSeatedPlayerSeat(myId);
            isSeatedAtDiceTable = myDiceSeatIndex !== -1;
            if (isSeatedAtDiceTable) {
                amIReady = diceManager.seats[myDiceSeatIndex].isReady;
            }
            if (rouletteManager.isSpinning) {
                rouletteAngleState = rouletteManager.currentAngle;
                rouletteSpinningState = true;
            }
        } else {
            // Whispering Woods Social Station Proximity Detection
            const forestCandidates: Array<{ id: typeof activeStation; dist: number; maxRadius: number }> = [
                { id: "campfire", dist: gridDistance(myX, myY, 16.0, 16.0), maxRadius: 3.4 },
                {
                    id: "picnic",
                    dist: Math.min(gridDistance(myX, myY, 10.0, 9.0), gridDistance(myX, myY, 23.0, 10.0)),
                    maxRadius: 2.9
                },
                { id: "fishing", dist: gridDistance(myX, myY, 11.0, 22.0), maxRadius: 3.2 },
                { id: "fireflies", dist: gridDistance(myX, myY, 22.0, 23.0), maxRadius: 3.2 }
            ];

            let closestStation: typeof activeStation = "none";
            let bestDist = Infinity;
            for (const cand of forestCandidates) {
                if (cand.dist <= cand.maxRadius && cand.dist < bestDist) {
                    bestDist = cand.dist;
                    closestStation = cand.id;
                }
            }
            activeStation = closestStation;
        }

        const zone = getCurrentZone(myX, myY, currentZone);
        currentZoneName = zone
            ? zone.name
            : currentZone === "forest"
              ? "🌲 Whispering Woods Sanctuary"
              : "🎲 High Roller Casino Lounge";

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life++;
            if (p.life >= p.maxLife) particles.splice(i, 1);
        }
    }

    const renderEntities: Array<{ depth: number; type: "obj" | "remote" | "local"; payload: any }> = [];

    function renderScene(timeMs: number) {
        if (!canvasElement) return;
        const ctx = canvasElement.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        if (currentZone === "forest") {
            grad.addColorStop(0, "#061814");
            grad.addColorStop(0.5, "#0c2922");
            grad.addColorStop(1, "#14382c");
        } else {
            grad.addColorStop(0, "#050510");
            grad.addColorStop(0.5, "#0d061c");
            grad.addColorStop(1, "#18092c");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const activeFloor = currentZone === "forest" ? forestFloorCache : floorCache;
        if (activeFloor.canvas) {
            const mapOriginScreenX = canvasWidth / 2 - cameraX;
            const mapOriginScreenY = canvasHeight / 2 - cameraY;
            const drawX = Math.round(mapOriginScreenX - activeFloor.originX);
            const drawY = Math.round(mapOriginScreenY - activeFloor.originY);
            ctx.drawImage(activeFloor.canvas, drawX, drawY);
        }

        const animCoords = currentZone === "forest" ? FOREST_ANIMATED_TILE_COORDS : ANIMATED_TILE_COORDS;
        for (let i = 0; i < animCoords.length; i++) {
            const t = animCoords[i];
            const screen = gridToScreen(t.x + 0.5, t.y + 0.5, 0, cameraX, cameraY, canvasWidth, canvasHeight);
            if (
                screen.x < -TILE_WIDTH ||
                screen.x > canvasWidth + TILE_WIDTH ||
                screen.y < -TILE_HEIGHT ||
                screen.y > canvasHeight + TILE_HEIGHT
            ) {
                continue;
            }
            drawRichIsometricTile(ctx, screen.x, screen.y, t.type, t.x, t.y, timeMs);
        }

        const activeCollision = currentZone === "forest" ? FOREST_COLLISION_MAP : COLLISION_MAP;

        if (hoveredTile) {
            const hx = hoveredTile.x;
            const hy = hoveredTile.y;
            const sc = gridToScreen(hx + 0.5, hy + 0.5, 0, cameraX, cameraY, canvasWidth, canvasHeight);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(sc.x, sc.y - TILE_HEIGHT / 2);
            ctx.lineTo(sc.x + TILE_WIDTH / 2, sc.y);
            ctx.lineTo(sc.x, sc.y + TILE_HEIGHT / 2);
            ctx.lineTo(sc.x - TILE_WIDTH / 2, sc.y);
            ctx.closePath();

            const isSolid = activeCollision[hy]?.[hx];
            ctx.strokeStyle = isSolid ? "rgba(255, 180, 0, 0.85)" : "rgba(0, 255, 255, 0.9)";
            ctx.fillStyle = isSolid ? "rgba(255, 180, 0, 0.14)" : "rgba(0, 255, 255, 0.18)";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        if (currentZone === "casino") {
            if (activeRouletteBet) {
                const sec = BETTABLE_ROULETTE_SECTORS.find((s) => s.id === activeRouletteBet);
                if (sec) {
                    const sc = gridToScreen(sec.tile.x + 0.5, sec.tile.y + 0.5, 0, cameraX, cameraY, canvasWidth, canvasHeight);
                    ctx.save();
                    const pulse = Math.sin(timeMs / 180) * 2;
                    ctx.strokeStyle = "#ffd700";
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.ellipse(sc.x, sc.y, 17 + pulse, 8.5 + pulse / 2, 0, 0, Math.PI * 2);
                    ctx.stroke();

                    for (let c = 0; c < 4; c++) {
                        ctx.fillStyle = c % 2 === 0 ? "#ffd700" : "#ff0055";
                        ctx.beginPath();
                        ctx.ellipse(sc.x, sc.y - 3 - c * 3.5, 10, 5, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = "#ffffff";
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                    ctx.restore();
                }
            }

            for (let i = 0; i < diceManager.seats.length; i++) {
                const seat = diceManager.seats[i];
                if (seat.occupant) {
                    const sc = gridToScreen(seat.coord.x, seat.coord.y, 0, cameraX, cameraY, canvasWidth, canvasHeight);
                    ctx.save();
                    ctx.strokeStyle = seat.isReady || diceManager.phase !== "idle" ? "#00ff88" : "#ffff00";
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.ellipse(sc.x, sc.y, 18, 9, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // 3. Collect & Depth-Sort 3D World Objects, Standing Transparent Unicorn House Dealers & Players
        renderEntities.length = 0;

        const objectsList = currentZone === "forest" ? FOREST_OBJECTS : WORLD_OBJECTS;
        for (let i = 0; i < objectsList.length; i++) {
            const obj = objectsList[i];
            renderEntities.push({
                depth: calculateDepth(obj.x, obj.y, obj.z || 0, obj.depthOffset || 0),
                type: "obj",
                payload: obj
            });
        }

        if (currentZone === "casino") {
            // Standing 100% Transparent Unicorn House Dealer at Craps Table (NEVER occupies P1-P4 seats!)
            renderEntities.push({
                depth: calculateDepth(10.6, 12.4, 0, 40),
                type: "remote",
                payload: {
                    id: "craps_house_dealer",
                    username: "🦄 Craps Dealer",
                    avatarUrl: "dealer_unicorn",
                    isHouseDealer: true,
                    x: 10.6,
                    y: 12.4,
                    dir: "SE",
                    isWalking: false,
                    isDancing: diceManager.phase !== "idle",
                    danceMove: "disco",
                    isSpeaking: false,
                    walkAnimTick: timeMs / 250
                }
            });

            // Standing 100% Transparent Unicorn House Dealer at Blackjack 21 Table
            renderEntities.push({
                depth: calculateDepth(10.6, 18.6, 0, 40),
                type: "remote",
                payload: {
                    id: "blackjack_house_dealer",
                    username: "🦄 House Dealer",
                    avatarUrl: "dealer_unicorn",
                    isHouseDealer: true,
                    x: 10.6,
                    y: 18.6,
                    dir: "SE",
                    isWalking: false,
                    isDancing: bjPhase === "dealer",
                    danceMove: "wave",
                    isSpeaking: false,
                    walkAnimTick: timeMs / 250
                }
            });
        }

        const remotes = networkManager?.getRemotePlayers(currentZone) || [];
        for (let i = 0; i < remotes.length; i++) {
            const p = remotes[i];
            renderEntities.push({
                depth: calculateDepth(p.x, p.y, 0, 50),
                type: "remote",
                payload: p
            });
        }

        renderEntities.push({
            depth: calculateDepth(myX, myY, 0, 50),
            type: "local",
            payload: null
        });

        renderEntities.sort((a, b) => a.depth - b.depth);

        for (let i = 0; i < renderEntities.length; i++) {
            const ent = renderEntities[i];
            if (ent.type === "obj") {
                drawRichWorldObject(ctx, ent.payload, timeMs);
            } else if (ent.type === "remote") {
                renderPlayerAvatar(ctx, ent.payload, cameraX, cameraY, canvasWidth, canvasHeight, false);
            } else {
                renderPlayerAvatar(
                    ctx,
                    {
                        id: myId,
                        username: myUsername,
                        avatarUrl: $userProfile?.avatar_url || "/unicorn.png",
                        x: myX,
                        y: myY,
                        dir: myDir,
                        isWalking,
                        isDancing,
                        danceMove: DANCE_MOVES[currentDanceIndex].id,
                        isSpeaking,
                        walkAnimTick,
                        speechBubble,
                        currentEmote,
                        hasVaultCrown,
                        hasHighRollerCrown
                    },
                    cameraX,
                    cameraY,
                    canvasWidth,
                    canvasHeight,
                    true
                );
            }
        }

        if (activeWaypoints.length > 0) {
            ctx.save();
            ctx.strokeStyle = "rgba(0, 255, 255, 0.65)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const startSc = gridToScreen(myX, myY, 0, cameraX, cameraY, canvasWidth, canvasHeight);
            ctx.moveTo(startSc.x, startSc.y);
            for (const pt of activeWaypoints) {
                const sc = gridToScreen(pt.x, pt.y, 0, cameraX, cameraY, canvasWidth, canvasHeight);
                ctx.lineTo(sc.x, sc.y);
            }
            ctx.stroke();

            const lastPt = activeWaypoints[activeWaypoints.length - 1];
            const destSc = gridToScreen(lastPt.x, lastPt.y, 0, cameraX, cameraY, canvasWidth, canvasHeight);
            ctx.fillStyle = "#00ffff";
            ctx.beginPath();
            ctx.ellipse(destSc.x, destSc.y, 8, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const sc = gridToScreen(p.x, p.y, 0.5, cameraX, cameraY, canvasWidth, canvasHeight);
            ctx.fillStyle = p.color;
            ctx.fillRect(sc.x, sc.y, p.size, p.size);
        }

        renderProximityPill(ctx);

        if (hoveredTile) {
            renderHoverTooltip(ctx, hoveredTile.x, hoveredTile.y);
        }

        ctx.restore();
    }

    function drawIsoPrism(
        ctx: CanvasRenderingContext2D,
        rx: number,
        ry: number,
        h: number,
        topColor: string,
        leftColor: string,
        rightColor: string,
        strokeColor = "rgba(255,215,0,0.5)"
    ) {
        ctx.fillStyle = leftColor;
        ctx.beginPath();
        ctx.moveTo(-rx, -h);
        ctx.lineTo(0, ry - h);
        ctx.lineTo(0, ry);
        ctx.lineTo(-rx, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = rightColor;
        ctx.beginPath();
        ctx.moveTo(rx, -h);
        ctx.lineTo(0, ry - h);
        ctx.lineTo(0, ry);
        ctx.lineTo(rx, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.moveTo(0, -ry - h);
        ctx.lineTo(rx, -h);
        ctx.lineTo(0, ry - h);
        ctx.lineTo(-rx, -h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function drawRichWorldObject(ctx: CanvasRenderingContext2D, obj: WorldObject, timeMs: number) {
        const screen = gridToScreen(obj.x, obj.y, 0, cameraX, cameraY, canvasWidth, canvasHeight);
        const sx = Math.round(screen.x);
        const sy = Math.round(screen.y);

        if (sx < -220 || sx > canvasWidth + 220 || sy < -220 || sy > canvasHeight + 220) {
            return;
        }

        ctx.save();
        ctx.translate(sx, sy);

        if (obj.type === "banner_sign") {
            const accent = obj.badgeColor || "#ffd700";
            const pillarSpan = 96;
            const archHeight = 76;

            [-pillarSpan, pillarSpan].forEach((px) => {
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                ctx.beginPath();
                ctx.ellipse(px, 2, 10, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = "#181828";
                ctx.fillRect(px - 5, -archHeight, 5, archHeight);
                ctx.fillStyle = "#0e0e1a";
                ctx.fillRect(px, -archHeight, 5, archHeight);

                ctx.fillStyle = accent;
                ctx.fillRect(px - 1, -archHeight + 6, 2, archHeight - 10);
            });

            const bw = pillarSpan * 2 + 20;
            const bh = 38;
            const by = -archHeight - 18;

            ctx.fillStyle = "#1e1e36";
            ctx.beginPath();
            ctx.moveTo(-bw / 2, by);
            ctx.lineTo(-bw / 2 + 8, by - 6);
            ctx.lineTo(bw / 2 + 8, by - 6);
            ctx.lineTo(bw / 2, by);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#121222";
            ctx.beginPath();
            ctx.moveTo(bw / 2, by);
            ctx.lineTo(bw / 2 + 8, by - 6);
            ctx.lineTo(bw / 2 + 8, by + bh - 6);
            ctx.lineTo(bw / 2, by + bh);
            ctx.closePath();
            ctx.fill();

            const faceGrad = ctx.createLinearGradient(0, by, 0, by + bh);
            faceGrad.addColorStop(0, "#0b0b1a");
            faceGrad.addColorStop(0.5, "#16122e");
            faceGrad.addColorStop(1, "#080814");
            ctx.fillStyle = faceGrad;
            ctx.fillRect(-bw / 2, by, bw, bh);

            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(-bw / 2, by, bw, bh);

            const step = Math.floor(timeMs / 180);
            for (let i = 0; i < 10; i++) {
                const lx = -bw / 2 + 10 + (i * (bw - 20)) / 9;
                const on = (i + step) % 2 === 0;
                ctx.fillStyle = on ? accent : "#33334d";
                ctx.beginPath();
                ctx.arc(lx, by + 2, 2, 0, Math.PI * 2);
                ctx.arc(lx, by + bh - 2, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.font = 'bold 12px "MS Sans Serif", Tahoma, sans-serif';
            ctx.fillStyle = accent;
            ctx.textAlign = "center";
            ctx.fillText(obj.title || "", 0, by + 16);

            ctx.font = "bold 9px monospace";
            ctx.fillStyle = "#e0f7ff";
            ctx.fillText(obj.subtitle || "", 0, by + 29);
        } else if (obj.type === "dice_table") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 34, 17, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "table_decorated", 0, 0, 68, 12)) {
                drawIsoPrism(ctx, 31, 15.5, 20, "#5c2410", "#421808", "#2e1005", "#ffd700");
            }

            // Emerald Craps Felt Top Overlay + Animated Dice
            ctx.fillStyle = "rgba(8, 102, 56, 0.85)";
            ctx.beginPath();
            ctx.moveTo(0, -11 - 21);
            ctx.lineTo(22, -21);
            ctx.lineTo(0, 11 - 21);
            ctx.lineTo(-22, -21);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            const isRolling =
                diceManager.phase.startsWith("round") && performance.now() - diceManager.lastRollTimestamp < 900;
            const bounce = isRolling ? Math.abs(Math.sin(timeMs / 45)) * 10 : 0;
            const d1 = isRolling ? (Math.floor(timeMs / 60) % 6) + 1 : diceManager.tableDice[0];
            const d2 = isRolling ? ((Math.floor(timeMs / 60) + 3) % 6) + 1 : diceManager.tableDice[1];

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-10, -26 - bounce, 8, 8);
            ctx.strokeStyle = "#aa0000";
            ctx.strokeRect(-10, -26 - bounce, 8, 8);
            ctx.fillStyle = "#cc0000";
            ctx.font = "bold 7px monospace";
            ctx.textAlign = "center";
            ctx.fillText(String(d1), -6, -20 - bounce);

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(2, -26 - bounce * 0.8, 8, 8);
            ctx.strokeRect(2, -26 - bounce * 0.8, 8, 8);
            ctx.fillStyle = "#cc0000";
            ctx.fillText(String(d2), 6, -20 - bounce * 0.8);
        } else if (obj.type === "roulette_wheel") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 34, 17, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "table_round_chairs", 0, 0, 68, 12)) {
                drawIsoPrism(ctx, 30, 15, 19, "#3d1c0a", "#2b1206", "#1f0c04", "#ffd700");
            }

            ctx.save();
            ctx.translate(0, -22);
            ctx.scale(1, 0.5);
            ctx.rotate(rouletteManager.currentAngle);

            const sectors = ROULETTE_SECTORS.length;
            for (let i = 0; i < sectors; i++) {
                ctx.fillStyle = ROULETTE_SECTORS[i].color;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, 22, (i * Math.PI * 2) / sectors, ((i + 1) * Math.PI * 2) / sectors);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = "#111111";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();

            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, -22, 22, 11, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Golden Pointer Needle at Top of Wheel
            ctx.fillStyle = "#ffff00";
            ctx.beginPath();
            ctx.moveTo(0, -31);
            ctx.lineTo(-4, -37);
            ctx.lineTo(4, -37);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#ffd700";
            ctx.beginPath();
            ctx.ellipse(0, -23, 5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "blackjack_table") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 34, 17, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "table_round_chairs", 0, 0, 68, 12)) {
                drawIsoPrism(ctx, 30, 15, 19, "#0d3b66", "#2a160c", "#1c0e07", "#00ffff");
            }

            ctx.fillStyle = "rgba(13, 59, 102, 0.85)";
            ctx.beginPath();
            ctx.ellipse(0, -22, 20, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 215, 0, 0.9)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-9, -25, 6, 8);
            ctx.fillRect(2, -25, 6, 8);

            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#ffd700";
            ctx.textAlign = "center";
            ctx.fillText("21", 0, -29);
        } else if (obj.type === "slot_machine") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 20, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "slot_machine", 0, 0, 42, 8)) {
                drawIsoPrism(ctx, 16, 8, 42, "#ffd700", "#2a1442", "#1a0b2e", "#ffd700");
            }

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-10, -32, 20, 11);
            ctx.strokeStyle = "#ff00aa";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-10, -32, 20, 11);

            ctx.font = "8px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🍒🐸🚀", 0, -24);

            const flash = Math.floor(timeMs / 200) % 2 === 0;
            ctx.fillStyle = flash ? "#ff0055" : "#ffff00";
            ctx.beginPath();
            ctx.arc(0, -45, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(15, -22);
            ctx.lineTo(20, -34);
            ctx.stroke();
            ctx.fillStyle = "#ff0033";
            ctx.beginPath();
            ctx.arc(20, -35, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "crash_rocket") {
            // 3D Isometric Rocket Crash Launchpad Terminal
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 28, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "table_round", 0, 0, 56, 10)) {
                drawIsoPrism(ctx, 26, 13, 22, "#1a103c", "#110a28", "#0a0518", "#ff0055");
            }
            const rocketLift = crashPhase === "flying" ? Math.min(28, (crashMultiplier - 1) * 10) : 0;
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(crashPhase === "crashed" ? "💥" : "🚀", 0, -28 - rocketLift);
            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#00ff88";
            ctx.fillText("CRASH", 0, -12);
        } else if (obj.type === "graffiti_wall") {
            [-28, 28].forEach((px) => {
                ctx.fillStyle = "#1c222b";
                ctx.fillRect(px - 3, -52, 6, 56);
            });

            ctx.save();
            ctx.transform(1, 0.42, 0, 1, 0, -36);

            ctx.fillStyle = "#181c26";
            ctx.fillRect(-48 + 5, -30 - 4, 96, 60);

            ctx.fillStyle = "#090418";
            ctx.fillRect(-48, -30, 96, 60);
            ctx.strokeStyle = "#ff00aa";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(-48, -30, 96, 60);

            if (persistentGraffitiCanvas) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(persistentGraffitiCanvas, -45, -27, 90, 54);
            }

            ctx.fillStyle = "#00ffff";
            ctx.fillRect(-44, -33, 88, 2);

            ctx.restore();

            ctx.font = "bold 9px monospace";
            ctx.fillStyle = "#00ffff";
            ctx.textAlign = "center";
            ctx.fillText("🎨 LIVE GRAFFITI WALL [CLICK / E]", 0, -78);
        } else if (obj.type === "fountain") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(0, 6, 52, 26, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "fountain_round", 0, 0, 108, 22)) {
                ctx.fillStyle = "#5c6470";
                ctx.beginPath();
                ctx.ellipse(0, 0, 42, 21, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Animated sparkling water arcs rising from the 3D stone fountain
            const spray = Math.sin(timeMs / 150) * 5;
            ctx.strokeStyle = "rgba(180, 245, 255, 0.85)";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(0, -34);
            ctx.quadraticCurveTo(-20, -54 + spray, -28, -12);
            ctx.moveTo(0, -34);
            ctx.quadraticCurveTo(20, -54 + spray, 28, -12);
            ctx.moveTo(0, -34);
            ctx.quadraticCurveTo(0, -60 - spray, 0, -18);
            ctx.stroke();
        } else if (obj.type === "dj_booth") {
            drawIsoPrism(ctx, 44, 20, 26, "#18182c", "#101020", "#0a0a16", "#00ffff");
            drawIsoObjectSprite(ctx, "radio_deck", 0, -20, 28, 4);

            ctx.fillStyle = "#222233";
            ctx.beginPath();
            ctx.ellipse(-18, -26, 9, 5, 0, 0, Math.PI * 2);
            ctx.ellipse(18, -26, 9, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ff00ff";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            for (let b = -5; b <= 5; b++) {
                const bh = 4 + Math.abs(Math.sin(timeMs / 120 + b)) * 12;
                ctx.fillStyle = b % 2 === 0 ? "#00ffff" : "#ff00aa";
                ctx.fillRect(b * 6 - 2, -6 - bh, 4, bh);
            }
        } else if (obj.type === "club_speaker") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 14, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            drawIsoObjectSprite(ctx, "speaker_club", 0, 0, 24, 6);
        } else if (obj.type === "street_lamp") {
            const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 38);
            glow.addColorStop(0, "rgba(255, 235, 160, 0.34)");
            glow.addColorStop(1, "rgba(255, 235, 160, 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.ellipse(0, 0, 38, 19, 0, 0, Math.PI * 2);
            ctx.fill();

            const lampKey = currentZone === "forest" ? "lantern_street" : "lightpost_double";
            const lampW = currentZone === "forest" ? 16 : 32;
            if (!drawIsoObjectSprite(ctx, lampKey, 0, 0, lampW, 5)) {
                ctx.fillStyle = "#222222";
                ctx.fillRect(-2, -44, 4, 44);
            }

            // Warm top lantern halo
            const halo = ctx.createRadialGradient(0, -48, 2, 0, -48, 16);
            halo.addColorStop(0, "rgba(255, 245, 180, 0.7)");
            halo.addColorStop(1, "rgba(255, 220, 120, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, -48, 16, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "palm_tree") {
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 22, 11, 0, 0, Math.PI * 2);
            ctx.fill();

            const palmKey = Math.floor(obj.x + obj.y) % 2 === 0 ? "tree_palm" : "tree_palm_bend";
            if (!drawIsoObjectSprite(ctx, palmKey, 0, 0, 58, 7)) {
                ctx.fillStyle = "#5c3c1e";
                ctx.fillRect(-4, -38, 8, 38);
            }
        } else if (obj.type === "pine_tree") {
            ctx.fillStyle = "rgba(0,0,0,0.38)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 22, 11, 0, 0, Math.PI * 2);
            ctx.fill();

            const pineVariants = ["tree_pine_tall", "tree_pine_round", "tree_pine_default"];
            const pineKey = pineVariants[Math.abs(Math.floor(obj.x * 3 + obj.y * 5)) % pineVariants.length];
            const targetW = pineKey === "tree_pine_round" ? 44 : 36;
            if (!drawIsoObjectSprite(ctx, pineKey, 0, 0, targetW, 6)) {
                ctx.fillStyle = "#4a2c14";
                ctx.fillRect(-4, -22, 8, 22);
            }
        } else if (obj.type === "sakura_tree") {
            ctx.fillStyle = "rgba(0,0,0,0.38)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            const sakuraVariants = ["tree_sakura_1", "tree_sakura_2", "tree_sakura_3"];
            const sakuraKey = sakuraVariants[Math.abs(Math.floor(obj.x * 7 + obj.y * 3)) % sakuraVariants.length];
            if (!drawIsoObjectSprite(ctx, sakuraKey, 0, 0, 52, 7)) {
                drawIsoObjectSprite(ctx, "tree_oak", 0, 0, 52, 7);
            }

            // Gentle drifting cherry-blossom petals around 3D Sakura trees
            const pPhase = timeMs / 650 + obj.x * 2.1;
            ctx.fillStyle = "rgba(255, 182, 210, 0.88)";
            ctx.beginPath();
            ctx.arc(Math.sin(pPhase) * 16, -24 + ((timeMs / 45 + obj.y * 10) % 24), 2, 0, Math.PI * 2);
            ctx.arc(Math.cos(pPhase * 0.8) * 14, -32 + ((timeMs / 55 + obj.x * 12) % 26), 1.8, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "campfire_pit") {
            const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 62);
            glow.addColorStop(0, "rgba(255, 150, 45, 0.5)");
            glow.addColorStop(0.6, "rgba(255, 95, 15, 0.18)");
            glow.addColorStop(1, "rgba(255, 100, 0, 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.ellipse(0, 0, 62, 31, 0, 0, Math.PI * 2);
            ctx.fill();

            // Render 3D Kenney stone ring + stacked campfire logs
            drawIsoObjectSprite(ctx, "campfire_stones", 0, 0, 44, 9);
            drawIsoObjectSprite(ctx, "campfire_logs", 0, -2, 28, 7);

            const flicker = Math.sin(timeMs / 90) * 4;
            ctx.fillStyle = "rgba(255, 85, 0, 0.9)";
            ctx.beginPath();
            ctx.moveTo(0, -30 + flicker);
            ctx.lineTo(11, -5);
            ctx.lineTo(-11, -5);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "rgba(255, 215, 40, 0.95)";
            ctx.beginPath();
            ctx.moveTo(0, -21 - flicker * 0.6);
            ctx.lineTo(6, -6);
            ctx.lineTo(-6, -6);
            ctx.closePath();
            ctx.fill();
        } else if (obj.type === "log_bench") {
            ctx.fillStyle = "rgba(0,0,0,0.32)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 20, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            const isNE = (obj.x < 16 && obj.y < 16) || (obj.x > 16 && obj.y > 16);
            if (!drawIsoObjectSprite(ctx, isNE ? "log_seat_nw" : "log_seat_ne", 0, 0, 42, 8)) {
                drawIsoPrism(ctx, 20, 9, 10, "#754724", "#593418", "#3d220e", "#a66c38");
            }
        } else if (obj.type === "picnic_table") {
            // Cozy woven picnic rug underneath + 3D cloth table + treats
            drawIsoObjectSprite(ctx, "rug_rectangle", 0, 6, 78, 16, 0.92);
            if (!drawIsoObjectSprite(ctx, "table_cloth", 0, 0, 52, 10)) {
                drawIsoPrism(ctx, 30, 15, 16, "#d32f2f", "#5c3818", "#3e240e", "#ffffff");
            }
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🍵🍡🧺", 0, -24);
        } else if (obj.type === "koi_dock") {
            if (!drawIsoObjectSprite(ctx, "bridge_wood", 0, 4, 72, 16)) {
                drawIsoPrism(ctx, 28, 14, 10, "#8c5828", "#69401a", "#4d2d10", "#b87a40");
            }
            ctx.font = "14px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🎣🐟", 0, -24);
        } else if (obj.type === "firefly_shrine") {
            const pulse = 0.55 + Math.sin(timeMs / 220) * 0.35;
            const aura = ctx.createRadialGradient(0, -16, 4, 0, -16, 46);
            aura.addColorStop(0, `rgba(190, 255, 110, ${0.42 * pulse})`);
            aura.addColorStop(1, "rgba(0, 255, 140, 0)");
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.ellipse(0, 0, 44, 22, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "statue_obelisk", 0, 0, 36, 8)) {
                drawIsoPrism(ctx, 22, 11, 32, "#788496", "#586270", "#3e4652", "#ccff66");
            }

            // Orbiting bioluminescent fireflies around the 3D stone shrine
            for (let f = 0; f < 4; f++) {
                const ang = timeMs / 420 + (f * Math.PI) / 2;
                const fx = Math.cos(ang) * 20;
                const fy = -24 + Math.sin(ang * 1.5) * 10;
                ctx.fillStyle = "#ccff66";
                ctx.beginPath();
                ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.font = "13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🏮✨", 0, -54);
        } else if (obj.type === "sofa") {
            ctx.fillStyle = "rgba(0,0,0,0.38)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 26, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            const sofaKey = obj.id.endsWith("3") ? "sofa_long_ne" : obj.x > 5.5 ? "sofa_vip_se" : "sofa_vip_ne";
            if (!drawIsoObjectSprite(ctx, sofaKey, 0, 0, 54, 10)) {
                drawIsoPrism(ctx, 22, 11, 16, "#8a1540", "#5c0d2a", "#3d081b", "#ffd700");
            }
        } else if (obj.type === "bar_counter") {
            ctx.fillStyle = "rgba(0,0,0,0.38)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "bar_counter", 0, 0, 42, 9)) {
                drawIsoPrism(ctx, 22, 11, 16, "#00d2ff", "#5c0d2a", "#3d081b", "#ffd700");
            }
            drawIsoObjectSprite(ctx, "stool_bar", 18, 6, 18, 5);
        } else if (obj.type === "vip_pillar") {
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 16, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "pillar_ornate", 0, 0, 26, 6)) {
                drawIsoPrism(ctx, 10, 5, 38, "#ffd700", "#282238", "#181424", "#ffd700");
            }
        } else if (obj.type === "bush") {
            const bushKey = Math.floor(obj.x + obj.y) % 2 === 0 ? "bush_detailed" : "bush_large";
            drawIsoObjectSprite(ctx, bushKey, 0, 0, 26, 5);
        } else if (obj.type === "rock") {
            const rockKey = Math.floor(obj.x * 2 + obj.y) % 2 === 0 ? "rock_large" : "stone_moss";
            drawIsoObjectSprite(ctx, rockKey, 0, 0, 36, 6);
        } else if (obj.type === "camp_tent") {
            ctx.fillStyle = "rgba(0,0,0,0.38)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 28, 14, 0, 0, Math.PI * 2);
            ctx.fill();
            drawIsoObjectSprite(ctx, "tent_open", 0, 0, 62, 11);
        } else if (obj.type === "canoe_prop") {
            const bob = Math.sin(timeMs / 360) * 1.5;
            drawIsoObjectSprite(ctx, "canoe", 0, bob, 48, 8);
        } else if (obj.type === "arcade_cabinet") {
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "arcade_machine", 0, 0, 48, 9)) {
                drawIsoPrism(ctx, 20, 10, 44, "#240b4c", "#160732", "#0d0420", "#00ffff");
            }

            // Glowing CRT Arcade Screen & Marquee Badge
            const pulse = Math.floor(timeMs / 240) % 2 === 0;
            ctx.fillStyle = "#08061a";
            ctx.fillRect(-12, -36, 24, 14);
            ctx.strokeStyle = pulse ? "#00ffff" : "#ff00aa";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-12, -36, 24, 14);

            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(obj.id.endsWith("1") ? "🧱🐍" : "🪙🔨", 0, -26);

            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#00ff88";
            ctx.fillText("🕹️ ARCADE [CLICK/E]", 0, -52);
        } else if (obj.type === "mines_table") {
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 30, 15, 0, 0, Math.PI * 2);
            ctx.fill();

            if (!drawIsoObjectSprite(ctx, "table_round", 0, 0, 62, 11)) {
                drawIsoPrism(ctx, 28, 14, 20, "#142238", "#0c1524", "#080d18", "#00ff88");
            }

            // Holographic 5x5 Cyber Mines Grid on Table Top
            ctx.fillStyle = "rgba(6, 24, 38, 0.9)";
            ctx.beginPath();
            ctx.ellipse(0, -21, 18, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#00ff88";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = "14px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(minesPhase === "exploded" ? "💥" : "💣💎", 0, -25);

            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#00ff88";
            ctx.fillText("CYBER MINES 5x5", 0, -40);
        }

        ctx.restore();
    }

    function renderProximityPill(ctx: CanvasRenderingContext2D) {
        let promptText = "";
        if (currentZone === "casino") {
            if (activeStation === "dice") {
                promptText = "🎲 Craps Table [Press E to Roll]";
            } else if (activeStation === "roulette") {
                promptText = "🎡 Meme Roulette [Press E to Spin]";
            } else if (activeStation === "blackjack") {
                promptText = "🃏 Blackjack 21 [Press E to Deal]";
            } else if (activeStation === "slots") {
                promptText = "🎰 Golden Slots [Press E to Spin]";
            } else if (activeStation === "crash") {
                promptText = "🚀 Rocket Crash [Press E]";
            } else if (activeStation === "mines") {
                promptText = "💣 Cyber Mines [Press E]";
            } else if (gridDistance(myX, myY, 27.5, 12.5) <= 3.5) {
                promptText = "🕹️ Retro Arcade [Press E / Click]";
            } else if (gridDistance(myX, myY, 16.0, 2.5) <= 3.2) {
                promptText = "🪩 DJ Booth [Press E / Click]";
            } else if (gridDistance(myX, myY, 27.5, 15.5) <= 3.2) {
                promptText = "🎨 Graffiti Wall [Press E / Click]";
            } else if (myX >= 28.0 && myY >= 13.5 && myY <= 18.5) {
                promptText = "🌲 Walk East → Whispering Woods";
            }
        } else {
            if (activeStation === "campfire") {
                promptText = "🔥 Campfire Circle";
            } else if (activeStation === "picnic") {
                promptText = "🧺 Woodland Picnic";
            } else if (activeStation === "fishing") {
                promptText = "🎣 Koi Pond [Press E to Cast]";
            } else if (activeStation === "fireflies") {
                promptText = "✨ Firefly Shrine [Press E]";
            } else if (myX <= 4.0 && myY >= 13.5 && myY <= 18.5) {
                promptText = "🎲 Walk West → Casino Lounge";
            }
        }

        if (promptText) {
            ctx.save();
            ctx.font = 'bold 11px "MS Sans Serif", Tahoma, Arial, sans-serif';
            const metrics = ctx.measureText(promptText);
            const pw = metrics.width + 24;
            const ph = 24;
            const px = canvasWidth / 2 - pw / 2;
            const py = canvasHeight - 36;

            ctx.fillStyle = "rgba(0, 12, 85, 0.9)";
            ctx.fillRect(px, py, pw, ph);
            ctx.strokeStyle = "#00ffff";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px, py, pw, ph);

            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(promptText, canvasWidth / 2, py + ph / 2);
            ctx.restore();
        }
    }

    function renderHoverTooltip(ctx: CanvasRenderingContext2D, hx: number, hy: number) {
        let hoverLabel = "";
        if (currentZone === "casino") {
            if (hx === 10 && hy === 13) hoverLabel = "🎲 Seat P1";
            else if (hx === 12 && hy === 13) hoverLabel = "🎲 Seat P2";
            else if (hx === 11 && hy === 12) hoverLabel = "🎲 Seat P3";
            else if (hx === 11 && hy === 14) hoverLabel = "🎲 Seat P4";
            else if (hx === 11 && hy === 13) hoverLabel = "🎲 Craps Table";
            else if (hx === 19 && hy === 12) hoverLabel = "🎡 Meme Roulette";
            else if (hx === 11 && hy === 19) hoverLabel = "🃏 Blackjack 21";
            else if ((hx === 20 || hx === 21) && hy === 19) hoverLabel = "🎰 Golden Slots";
            else if (hx === 15 && hy === 12) hoverLabel = "🚀 Rocket Crash";
            else if (hx >= 26 && hx <= 28 && hy === 12) hoverLabel = "🕹️ Retro Arcade";
            else if ((hx === 27 || hx === 28) && hy === 19) hoverLabel = "💣 Cyber Mines";
            else if (hx >= 18 && hx <= 20 && (hy === 14 || hy === 15)) {
                const sec = BETTABLE_ROULETTE_SECTORS.find((s) => s.tile.x === hx && s.tile.y === hy);
                if (sec) hoverLabel = `${sec.icon} ${sec.name} (${sec.multiplier}x)`;
            } else if ((hx === 15 || hx === 16) && hy === 2) hoverLabel = "🪩 DJ Booth";
            else if ((hx === 27 || hx === 28) && hy === 15) hoverLabel = "🎨 Graffiti Wall";
            else if (hx >= 30 && hy >= 14 && hy <= 17) hoverLabel = "🌲 Whispering Woods";
        } else {
            if (hx >= 14 && hx <= 17 && hy >= 14 && hy <= 17) hoverLabel = "🔥 Campfire Circle";
            else if (
                (hx >= 9 && hx <= 11 && hy >= 8 && hy <= 10) ||
                (hx >= 22 && hx <= 24 && hy >= 9 && hy <= 11)
            )
                hoverLabel = "🧺 Woodland Picnic";
            else if (hx >= 9 && hx <= 13 && hy >= 20 && hy <= 25) hoverLabel = "🎣 Koi Pond";
            else if (hx >= 21 && hx <= 23 && hy >= 21 && hy <= 24) hoverLabel = "✨ Firefly Shrine";
            else if (hx <= 1 && hy >= 14 && hy <= 17) hoverLabel = "🎲 Casino Lounge";
        }

        if (hoverLabel) {
            const sc = gridToScreen(hx + 0.5, hy + 0.5, 0, cameraX, cameraY, canvasWidth, canvasHeight);
            ctx.save();
            ctx.font = 'bold 11px "MS Sans Serif", Tahoma, sans-serif';
            const tw = ctx.measureText(hoverLabel).width + 16;
            const tx = sc.x - tw / 2;
            const ty = sc.y - 28;
            ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
            ctx.fillRect(tx, ty, tw, 20);
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 1;
            ctx.strokeRect(tx, ty, tw, 20);
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(hoverLabel, sc.x, ty + 10);
            ctx.restore();
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mmo-container" bind:this={containerElement}>
    <!-- Sleek Single-Row Top HUD Bar -->
    <div class="mmo-toolbar">
        <div class="toolbar-left">
            <span class="room-pill">
                {currentZoneName}
                <span class="online-inline">🟢 {onlineCount}</span>
            </span>

            <span class="chips-pill" title="Record: {myWins}W - {myLosses}L">
                🪙 {chips.toLocaleString()} $UWU
            </span>

            <button
                class="win98-btn daily-reward-btn"
                class:daily-ready={dailyStatus.canClaim}
                onclick={claimDailyReward}
                title="Claim 1,000 $UWU Daily Reward"
            >
                {dailyStatus.canClaim ? "🎁 +1,000" : `⏳ ${dailyStatus.formattedRemaining}`}
            </button>
        </div>

        <div class="toolbar-right">
            <!-- Compact Map Teleport Dropdown -->
            <div class="travel-dropdown-wrap">
                <button
                    class="win98-btn map-menu-btn"
                    class:active-wager={showTravelMenu}
                    onclick={(e) => {
                        e.stopPropagation();
                        showTravelMenu = !showTravelMenu;
                    }}
                >
                    🗺️ Map ▾
                </button>
                {#if showTravelMenu}
                    <div class="travel-popover win98-window" onclick={(e) => e.stopPropagation()}>
                        <button class="travel-item" onclick={() => teleportTo(15.5, 16.5, "Casino Floor", "casino")}>
                            🎲 Casino Floor
                        </button>
                        <button class="travel-item" onclick={() => teleportTo(16.0, 6.5, "Club DJ Stage", "casino")}>
                            🪩 Club DJ Stage
                        </button>
                        <button class="travel-item" onclick={() => teleportTo(27.5, 13.8, "Retro Arcade", "casino")}>
                            🕹️ Retro Arcade
                        </button>
                        <button class="travel-item" onclick={() => teleportTo(27.5, 18.2, "Cyber Mines", "casino")}>
                            💣 Cyber Mines
                        </button>
                        <button class="travel-item" onclick={() => teleportTo(25.5, 15.5, "Graffiti Wall", "casino")}>
                            🎨 Graffiti Wall
                        </button>
                        <button class="travel-item" onclick={() => teleportTo(16.0, 23.5, "Grand Plaza", "casino")}>
                            ⛲ Grand Plaza
                        </button>
                        <button class="travel-item woods-item" onclick={() => teleportTo(16.0, 16.0, "Whispering Woods", "forest")}>
                            🌲 Whispering Woods
                        </button>
                    </div>
                {/if}
            </div>

            <button class="win98-btn arcade-open-btn" onclick={() => openArcadeModal("brick")}>
                🕹️ Arcade
            </button>

            <button class="win98-btn dj-open-btn" onclick={() => (showDJModal = true)} title="Open DJ Turntable Deck">
                🪩 DJ
            </button>

            <button class="win98-btn leaderboard-btn" onclick={openLeaderboard}>
                🏆 Ranks
            </button>

            <button class="win98-btn send-uwu-btn" onclick={() => openSendUwuModal("")}>
                💸 Tip
            </button>

            <button class="win98-btn guide-btn" onclick={() => openChatDrawer()} title="Global Chat">
                💬 Chat
            </button>

            <button class="win98-btn icon-only-btn" onclick={() => (showGuideModal = true)} title="World Guide">
                📖
            </button>

            <button
                class="win98-btn icon-only-btn"
                title={isMusicPlaying ? "Mute Music" : "Play Music"}
                onclick={() => {
                    isMusicPlaying = !isMusicPlaying;
                    synth.setMute(!isMusicPlaying);
                    if (isMusicPlaying) synth.playTrack(currentTrackId);
                }}
            >
                {isMusicPlaying ? "🔊" : "🔇"}
            </button>

            <button
                class="win98-btn icon-only-btn"
                title="Toggle Microphone"
                onclick={async () => {
                    await ensureVoiceInitialized();
                    if (voiceManager) {
                        isMuted = voiceManager.toggleUserMute();
                    }
                }}
            >
                {isMuted ? "🔇" : "🎙️"}
            </button>
        </div>
    </div>

    <!-- Central Game Canvas -->
    <div class="canvas-wrapper" role="application" aria-label="Isometric World View">
        <canvas
            bind:this={canvasElement}
            onmousedown={handleCanvasPointerDown}
            ontouchstart={handleCanvasPointerDown}
            onmousemove={handleCanvasPointerMove}
            onmouseleave={handleCanvasPointerLeave}
        ></canvas>

        {#if statusNotice}
            <div class="status-notice">
                {statusNotice}
            </div>
        {/if}

        <!-- 1. CRAPS / DICE DUEL HUD (Visual 3D Dice Arena) -->
        {#if activeStation === "dice"}
            {@const isDiceRolling = dicePhaseState !== "idle" && dicePhaseState !== "finished"}
            {@const myScore = diceScoresState.find((s) => s.id === myId)}
            {@const oppScore = diceScoresState.find((s) => s.id !== myId) || diceScoresState[1]}
            {@const pDie1 = isDiceShaking ? rollingAnimDice[0] : myScore?.currentDice?.[0] || 6}
            {@const pDie2 = isDiceShaking ? rollingAnimDice[1] : myScore?.currentDice?.[1] || 6}
            {@const dDie1 = isDiceShaking ? rollingAnimDice[2] : oppScore?.currentDice?.[0] || 5}
            {@const dDie2 = isDiceShaking ? rollingAnimDice[3] : oppScore?.currentDice?.[1] || 5}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🎲 Craps Dice Duel</span>
                    <span class="hud-payout-tag">1.8x Payout</span>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={isDiceRolling}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <!-- Round Progress Steps -->
                    <div class="round-steps-row">
                        <span class="r-pill" class:active={diceRoundState >= 1}>Round 1</span>
                        <span class="r-pill" class:active={diceRoundState >= 2}>Round 2</span>
                        <span class="r-pill" class:active={diceRoundState >= 3}>Round 3</span>
                        <span class="r-pill" class:active={dicePhaseState === "finished"}>👑 Winner</span>
                    </div>

                    <!-- Large Visual 3D Dice Duel Arena -->
                    <div class="dice-arena-box">
                        <!-- Player Side -->
                        <div
                            class="dice-fighter-card"
                            class:winner-glow={dicePhaseState === "finished" && diceWinnerIdState === myId}
                        >
                            <div class="fighter-header">
                                <span class="fighter-name">🧑 YOU</span>
                                <span class="fighter-sum">{myScore ? myScore.totalSum : 0}</span>
                            </div>
                            <div class="dice-pair-row">
                                {#each [pDie1, pDie2] as dieVal}
                                    <div class="visual-die-3d player-die" class:shaking={isDiceShaking}>
                                        {#each Array(9) as _, cellIdx}
                                            <span
                                                class="die-pip"
                                                class:pip-on={(DICE_DOT_PATTERNS[dieVal] || []).includes(cellIdx)}
                                            ></span>
                                        {/each}
                                    </div>
                                {/each}
                            </div>
                            <div class="fighter-rounds">
                                {#if myScore && myScore.roundRolls.length > 0}
                                    {#each [0, 1, 2] as rIdx}
                                        <span class="mini-r-chip" class:filled={myScore.roundRolls[rIdx] !== undefined}>
                                            R{rIdx + 1}: {myScore.roundRolls[rIdx] ?? "–"}
                                        </span>
                                    {/each}
                                {:else}
                                    <span class="mini-r-chip">Ready to roll</span>
                                {/if}
                            </div>
                        </div>

                        <div class="dice-vs-divider">VS</div>

                        <!-- House Dealer / Opponent Side -->
                        <div
                            class="dice-fighter-card dealer-card"
                            class:winner-glow={dicePhaseState === "finished" && diceWinnerIdState !== null && diceWinnerIdState !== myId}
                        >
                            <div class="fighter-header">
                                <span class="fighter-name">{oppScore ? oppScore.username : "🦄 Dealer"}</span>
                                <span class="fighter-sum">{oppScore ? oppScore.totalSum : 0}</span>
                            </div>
                            <div class="dice-pair-row">
                                {#each [dDie1, dDie2] as dieVal}
                                    <div class="visual-die-3d dealer-die" class:shaking={isDiceShaking}>
                                        {#each Array(9) as _, cellIdx}
                                            <span
                                                class="die-pip"
                                                class:pip-on={(DICE_DOT_PATTERNS[dieVal] || []).includes(cellIdx)}
                                            ></span>
                                        {/each}
                                    </div>
                                {/each}
                            </div>
                            <div class="fighter-rounds">
                                {#if oppScore && oppScore.roundRolls.length > 0}
                                    {#each [0, 1, 2] as rIdx}
                                        <span class="mini-r-chip" class:filled={oppScore.roundRolls[rIdx] !== undefined}>
                                            R{rIdx + 1}: {oppScore.roundRolls[rIdx] ?? "–"}
                                        </span>
                                    {/each}
                                {:else}
                                    <span class="mini-r-chip">House Dealer</span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    {#if dicePhaseState === "finished"}
                        <div class="dice-result-banner" class:win={diceWinnerIdState === myId}>
                            {#if diceWinnerIdState === myId}
                                👑 YOU WIN +{Math.round(activeDiceWager * 1.8)} $UWU! ({myScore?.totalSum} vs {oppScore?.totalSum})
                            {:else}
                                🎲 {diceWinnerNameState} Wins ({oppScore?.totalSum} vs {myScore?.totalSum})
                            {/if}
                        </div>
                    {/if}

                    <!-- 4 Player Seats for PvP Mode -->
                    <div class="dice-seats-row">
                        {#each diceSeatsState as seat, sIdx}
                            <button
                                class="seat-badge"
                                class:occupied={seat.occupant !== null}
                                class:ready={seat.isReady}
                                onclick={() => sitAtDiceSeat(sIdx)}
                            >
                                <span class="seat-title">{seat.label}</span>
                                {#if seat.occupant}
                                    <span class="seat-user">@{seat.occupant.username}</span>
                                {:else}
                                    <span class="seat-empty">Sit</span>
                                {/if}
                            </button>
                        {/each}
                    </div>

                    <div class="hud-actions-col">
                        <button
                            class="win98-btn primary-start-btn"
                            disabled={isDiceRolling}
                            onclick={startInstantSoloDiceDuel}
                        >
                            {#if isDiceRolling}
                                🎲 Rolling Round {Math.max(1, diceRoundState)} / 3...
                            {:else if dicePhaseState === "finished"}
                                🎲 Roll Again ({selectedWager} $UWU)
                            {:else}
                                🎲 Roll Dice Duel ({selectedWager} $UWU)
                            {/if}
                        </button>
                        {#if isSeatedAtDiceTable && diceSeatsState.filter((s) => s.occupant !== null).length >= 2 && !isDiceRolling}
                            <button class="win98-btn bot-test-btn" onclick={toggleDicePvPReady}>
                                {amIReady ? "✕ Cancel PvP" : `⚔️ PvP Duel (${selectedWager} $UWU)`}
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <!-- 2. MEME ROULETTE HUD -->
        {#if activeStation === "roulette"}
            {@const selectedSectorObj = BETTABLE_ROULETTE_SECTORS.find((s) => s.id === activeRouletteBet)}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🎡 Meme Roulette</span>
                    <span class="hud-payout-tag">
                        {rouletteSpinningState ? "🌀 Spinning..." : `⏱️ ${rouletteCountdownState}s`}
                    </span>
                </div>
                <div class="hud-body">
                    <!-- Visual Spinning Wheel Header -->
                    <div class="roulette-wheel-banner">
                        <div class="wheel-disc-wrap">
                            <div
                                class="wheel-disc"
                                style="transform: rotate({(rouletteAngleState * 180) / Math.PI}deg)"
                            >
                                🎡
                            </div>
                        </div>
                        <div class="wheel-info-col">
                            <div class="wheel-result-line">
                                {#if rouletteSpinningState}
                                    <span class="spinning-badge">🌀 Wheel in motion...</span>
                                {:else if rouletteLastWinner}
                                    <span>
                                        Landed: <strong>{rouletteLastWinner.icon} {rouletteLastWinner.name}</strong>
                                        ({rouletteLastWinner.multiplier}x)
                                    </span>
                                {:else}
                                    <span>Pick an emoji below & spin!</span>
                                {/if}
                            </div>
                            {#if rouletteHistoryState.length > 0}
                                <div class="wheel-history-row">
                                    <span>History:</span>
                                    {#each rouletteHistoryState.slice(0, 6) as h}
                                        <span class="hist-pip" title="{h.name} ({h.multiplier}x)">{h.icon}</span>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>

                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={rouletteSpinningState}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <div class="roulette-grid">
                        {#each BETTABLE_ROULETTE_SECTORS as sector}
                            <button
                                type="button"
                                class="win98-btn meme-tile-btn"
                                class:active-bet={activeRouletteBet === sector.id}
                                onclick={() => selectRouletteSector(sector.id, false)}
                            >
                                <span class="meme-icon">{sector.icon}</span>
                                <span class="meme-title">{sector.name}</span>
                                <span class="meme-multiplier" style="color: {sector.color}">
                                    {sector.multiplier}x
                                </span>
                            </button>
                        {/each}
                    </div>

                    <button
                        class="win98-btn primary-start-btn"
                        disabled={rouletteSpinningState}
                        onclick={spinRouletteWithBet}
                    >
                        {rouletteSpinningState
                            ? "🎡 SPINNING..."
                            : `🎰 SPIN ON ${selectedSectorObj?.icon || "🐸"} ${selectedSectorObj?.name || "Pepe"} (${selectedWager} $UWU)`}
                    </button>
                </div>
            </div>
        {/if}

        <!-- 3. CYBER BLACKJACK 21 HUD -->
        {#if activeStation === "blackjack"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🃏 Blackjack 21</span>
                    <span class="hud-payout-tag">2.2x Natural</span>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={bjPhase === "player"}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    {#if bjPlayerHand.length > 0}
                        <div class="bj-table-box">
                            <div class="bj-hand-row">
                                <span class="bj-label">
                                    🦄 Dealer ({bjPhase === "player" ? "?" : calculateHandTotal(bjDealerHand)}):
                                </span>
                                <div class="bj-cards">
                                    {#each bjDealerHand as card, idx}
                                        <span class="playing-card" class:red-suit={card.suit === "♥" || card.suit === "♦"}>
                                            {bjPhase === "player" && idx === 1 ? "🂠" : `${card.rank}${card.suit}`}
                                        </span>
                                    {/each}
                                </div>
                            </div>

                            <div class="bj-hand-row">
                                <span class="bj-label">🧑 You ({calculateHandTotal(bjPlayerHand)}):</span>
                                <div class="bj-cards">
                                    {#each bjPlayerHand as card}
                                        <span class="playing-card" class:red-suit={card.suit === "♥" || card.suit === "♦"}>
                                            {card.rank}{card.suit}
                                        </span>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    {/if}

                    <div class="bj-status-msg">{bjMessage}</div>

                    <div class="bj-actions-row">
                        {#if bjPhase === "betting" || bjPhase === "done"}
                            <button class="win98-btn primary-start-btn" onclick={dealBlackjackHand}>
                                🃏 DEAL HAND ({selectedWager} $UWU)
                            </button>
                        {:else}
                            <button class="win98-btn bj-btn" onclick={blackjackHit}>👆 HIT</button>
                            <button class="win98-btn bj-btn" onclick={blackjackStand}>✋ STAND</button>
                            {#if bjPlayerHand.length === 2}
                                <button class="win98-btn bj-btn" onclick={blackjackDoubleDown}>⚡ 2x DOUBLE</button>
                            {/if}
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <!-- 4. GOLDEN UWU SLOTS HUD -->
        {#if activeStation === "slots"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🎰 Golden UwU Slots</span>
                    <span class="hud-payout-tag">Up to 60x</span>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <span>Bet:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={isSlotSpinning}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <div class="slot-reels-display">
                        {#each slotReels as sym}
                            <div class="slot-reel-cell" class:spinning={isSlotSpinning}>{sym}</div>
                        {/each}
                    </div>

                    <div class="slot-paytable-strip">
                        <span>🍒 4x</span>
                        <span>🐸 8x</span>
                        <span>🚀 15x</span>
                        <span>💎 30x</span>
                        <span>🦄 60x</span>
                    </div>

                    <div class="bj-status-msg">{slotMessage}</div>

                    <button
                        class="win98-btn primary-start-btn"
                        disabled={isSlotSpinning}
                        onclick={spinSlotMachine}
                    >
                        {isSlotSpinning ? "🎰 SPINNING..." : `🎰 PULL LEVER (${selectedWager} $UWU)`}
                    </button>
                </div>
            </div>
        {/if}

        <!-- 5. ROCKET CRASH HUD (Animated LSD Trip Space Trajectory & Explosion) -->
        {#if activeStation === "crash"}
            {@const crashProgress = Math.min(1, Math.log10(Math.max(1, crashMultiplier)) / Math.log10(12))}
            {@const lsdIntensity = crashPhase === "flying" ? Math.min(1, (crashMultiplier - 1) / 3.5) : 0}
            {@const lsdHue = crashPhase === "flying" ? Math.round((crashMultiplier - 1) * 185) % 360 : 0}
            {@const rocketX = 12 + crashProgress * 74}
            {@const rocketY = 82 - Math.pow(crashProgress, 0.85) * 66}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🚀 Rocket Crash</span>
                    <div class="crash-history-pills">
                        {#each crashHistory.slice(0, 4) as ch}
                            <span class="ch-tag" class:high={ch >= 2.0}>{ch.toFixed(2)}x</span>
                        {/each}
                    </div>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={crashPhase === "flying"}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <!-- Animated LSD Trip Rocket Trajectory Stage -->
                    <div
                        class="crash-lsd-stage"
                        class:flying={crashPhase === "flying"}
                        class:tripping={crashPhase === "flying" && crashMultiplier >= 1.35}
                        class:crashed={crashPhase === "crashed"}
                        style="
                            --lsd-hue: {lsdHue}deg;
                            --lsd-sat: {(1 + lsdIntensity * 2.6).toFixed(2)};
                            --shake-px: {crashPhase === 'flying' ? Math.min(5, Math.max(0, (crashMultiplier - 1.5) * 1.4)).toFixed(1) : 0}px;
                        "
                    >
                        <div class="lsd-kaleidoscope-bg"></div>

                        <!-- Glowing Trajectory Curve SVG -->
                        <svg class="crash-trajectory-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {#if crashPhase !== "idle"}
                                <path
                                    d="M 12 82 Q {12 + (rocketX - 12) * 0.55} 82, {rocketX} {rocketY}"
                                    fill="none"
                                    stroke={crashPhase === "crashed" ? "#ff1744" : "#00ffcc"}
                                    stroke-width="2.8"
                                    stroke-linecap="round"
                                />
                            {/if}
                        </svg>

                        <!-- Flying Rocket or Explosion Shockwave -->
                        {#if crashPhase === "crashed"}
                            <div class="crash-explosion-node" style="left: {rocketX}%; top: {rocketY}%;">
                                <span class="explosion-ring"></span>
                                <span class="explosion-emoji">💥</span>
                            </div>
                        {:else}
                            <div
                                class="crash-rocket-node"
                                class:boosting={crashPhase === "flying"}
                                style="left: {rocketX}%; top: {rocketY}%;"
                            >
                                {#if crashPhase === "flying"}
                                    <span class="rocket-flame">🔥</span>
                                {/if}
                                <span class="rocket-emoji">🚀</span>
                            </div>
                        {/if}

                        <!-- Center Multiplier Overlay -->
                        <div class="crash-hud-readout">
                            <span
                                class="crash-mult"
                                style="transform: scale({(1 + lsdIntensity * 0.28).toFixed(2)})"
                            >
                                {crashMultiplier.toFixed(2)}x
                            </span>
                            <span class="crash-sub">
                                {#if crashPhase === "flying"}
                                    +{Math.round(crashBetAmount * crashMultiplier)} $UWU
                                {:else if crashPhase === "crashed"}
                                    💥 EXPLODED!
                                {:else if crashPhase === "cashed_out"}
                                    💰 CASHED OUT!
                                {:else}
                                    READY FOR LAUNCH
                                {/if}
                            </span>
                        </div>
                    </div>

                    {#if crashPhase === "flying"}
                        <button class="win98-btn cashout-btn" onclick={cashOutRocketCrash}>
                            💰 CASH OUT (+{Math.round(crashBetAmount * crashMultiplier)} $UWU)
                        </button>
                    {:else}
                        <button class="win98-btn primary-start-btn" onclick={startRocketCrash}>
                            🚀 LAUNCH ROCKET ({selectedWager} $UWU)
                        </button>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- 5B. CYBER MINES 5x5 HUD -->
        {#if activeStation === "mines"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">💣 Cyber Mines</span>
                    <button class="win98-btn" style="padding:1px 6px; font-size:10px;" onclick={() => openArcadeModal("mines")}>
                        🕹️ Arcade View
                    </button>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <span>Bet:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={minesPhase === "playing"}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                        <span style="margin-left:auto;">💣</span>
                        {#each [5, 8, 12] as bCount}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={minesBombCount === bCount}
                                disabled={minesPhase === "playing"}
                                onclick={() => (minesBombCount = bCount as 5 | 8 | 12)}
                            >
                                {bCount}
                            </button>
                        {/each}
                    </div>

                    <div class="roulette-status-bar">
                        <span>Now: <strong>{minesCurrentMultiplier.toFixed(2)}x</strong></span>
                        <span>Next: <strong style="color:#007a3d;">{minesNextMultiplier.toFixed(2)}x</strong></span>
                        <span>💎 <strong>{minesSafeClicks}/{25 - minesBombCount}</strong></span>
                    </div>

                    <div class="mines-grid-5x5">
                        {#each minesRevealed as tileState, idx}
                            <button
                                class="win98-btn mines-cell-btn"
                                class:revealed-gem={tileState === "gem"}
                                class:revealed-bomb={tileState === "bomb"}
                                disabled={minesPhase !== "playing" || tileState !== "hidden"}
                                onclick={() => clickMinesTile(idx)}
                            >
                                {#if tileState === "gem"}
                                    💎
                                {:else if tileState === "bomb"}
                                    💣
                                {:else}
                                    ·
                                {/if}
                            </button>
                        {/each}
                    </div>

                    {#if minesPhase === "playing"}
                        <button
                            class="win98-btn cashout-btn"
                            disabled={minesSafeClicks === 0}
                            onclick={cashOutCyberMines}
                        >
                            {minesSafeClicks > 0
                                ? `💰 CASH OUT +${Math.round(minesBetAmount * minesCurrentMultiplier)} $UWU (${minesCurrentMultiplier.toFixed(2)}x)`
                                : "💎 Pick a tile to Cash Out"}
                        </button>
                    {:else}
                        <button class="win98-btn primary-start-btn" onclick={startCyberMines}>
                            💣 START MINES ({selectedWager} $UWU)
                        </button>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- 6. WHISPERING WOODS: CAMPFIRE STORY & TRIVIA CIRCLE HUD -->
        {#if activeStation === "campfire"}
            {@const currentTrivia = CAMPFIRE_TRIVIA_BANK[campfireQuestionIndex % CAMPFIRE_TRIVIA_BANK.length]}
            {@const currentIcebreaker = CAMPFIRE_ICEBREAKER_BANK[campfireQuestionIndex % CAMPFIRE_ICEBREAKER_BANK.length]}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🔥 Campfire Circle</span>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <button
                            class="win98-btn wager-btn"
                            class:active-wager={campfireMode === "trivia"}
                            onclick={() => {
                                campfireMode = "trivia";
                                campfireRevealed = false;
                            }}
                        >
                            🧠 Trivia
                        </button>
                        <button
                            class="win98-btn wager-btn"
                            class:active-wager={campfireMode === "icebreaker"}
                            onclick={() => {
                                campfireMode = "icebreaker";
                                campfireRevealed = false;
                            }}
                        >
                            💬 Icebreakers
                        </button>
                        <button class="win98-btn wager-btn" style="margin-left:auto" onclick={nextCampfirePrompt}>
                            ⏭️ Next
                        </button>
                    </div>

                    {#if campfireMode === "trivia"}
                        <div class="hud-instructions">
                            <strong>{currentTrivia.question}</strong>
                        </div>
                        <div class="hud-actions-col">
                            {#each currentTrivia.options as opt, oIdx}
                                {@const voters = campfireVotes[oIdx] || []}
                                <button
                                    class="win98-btn"
                                    class:active-wager={myCampfireVote === oIdx}
                                    onclick={() => voteCampfireOption(oIdx)}
                                >
                                    {campfireRevealed && oIdx === currentTrivia.correctIndex ? "✅ " : ""}{opt}
                                    {#if voters.length > 0}
                                        <small>({voters.join(", ")})</small>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <div class="hud-instructions">
                            <strong>{currentIcebreaker.prompt}</strong>
                        </div>
                        <div class="hud-actions-col">
                            {#each [currentIcebreaker.optionA, currentIcebreaker.optionB] as opt, oIdx}
                                {@const voters = campfireVotes[oIdx] || []}
                                <button
                                    class="win98-btn"
                                    class:active-wager={myCampfireVote === oIdx}
                                    onclick={() => voteCampfireOption(oIdx)}
                                >
                                    {opt}
                                    {#if voters.length > 0}
                                        <small>({voters.join(", ")})</small>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}

                    <div class="scores-table" style="background:#101c16; padding:5px; border:1px solid #2e7d32;">
                        {#each campfireStories.slice(-3) as st}
                            <div class="player-score-row" style="color:#e8f5e9;">
                                <span>🔥 <strong>@{st.user}:</strong> {st.text}</span>
                            </div>
                        {/each}
                    </div>

                    <div class="bj-actions-row">
                        <input
                            type="text"
                            class="win98-input"
                            style="flex:1; padding:4px 6px; font-size:11px;"
                            placeholder="Share a campfire story..."
                            bind:value={campfireCustomStory}
                            maxlength="90"
                        />
                        <button class="win98-btn primary-start-btn" onclick={postCampfireStory}>Post</button>
                    </div>
                </div>
            </div>
        {/if}

        <!-- 7. WHISPERING WOODS: WOODLAND PICNIC HUD -->
        {#if activeStation === "picnic"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🧺 Woodland Picnic</span>
                    <span class="hud-payout-tag">Shared: {picnicComboCount}</span>
                </div>
                <div class="hud-body">
                    <div class="roulette-grid" style="grid-template-columns: repeat(2, 1fr);">
                        {#each PICNIC_TREATS as treat}
                            <button class="win98-btn meme-tile-btn" onclick={() => sharePicnicTreat(treat)}>
                                <span class="meme-icon">{treat.icon}</span>
                                <span class="meme-title">{treat.name}</span>
                                <span class="meme-multiplier" style="color:#1b5e20;">{treat.vibe}</span>
                            </button>
                        {/each}
                    </div>

                    <div class="scores-table" style="background:#1b2e22; padding:5px; border:1px solid #66bb6a;">
                        {#each picnicRecentFeed.slice(0, 3) as item}
                            <div class="player-score-row" style="color:#ffffff;">
                                <span>{item}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}

        <!-- 8. WHISPERING WOODS: KOI POND HUD -->
        {#if activeStation === "fishing"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🎣 Koi Pond</span>
                    <span class="hud-payout-tag">{koiCollection.length}/{KOI_POND_SPECIMENS.length} Discovered</span>
                </div>
                <div class="hud-body">
                    {#if caughtKoi}
                        <div class="bj-dealer-banner" style="background: linear-gradient(90deg, #0a2e36, #144952);">
                            <span style="font-size:28px;">{caughtKoi.icon}</span>
                            <div class="bj-dealer-info">
                                <strong>{caughtKoi.name} ({caughtKoi.rarity})</strong>
                                <span>{caughtKoi.description}</span>
                            </div>
                        </div>
                    {/if}

                    <button
                        class="win98-btn"
                        class:cashout-btn={fishingState === "bite"}
                        class:primary-start-btn={fishingState !== "bite"}
                        disabled={fishingState === "waiting"}
                        onclick={castFishingLine}
                    >
                        {#if fishingState === "waiting"}
                            🌊 Watching the float...
                        {:else if fishingState === "bite"}
                            🐟 SPLASH! REEL IN NOW!
                        {:else}
                            🎣 Cast Bamboo Line
                        {/if}
                    </button>
                </div>
            </div>
        {/if}

        <!-- 9. WHISPERING WOODS: FIREFLY SHRINE HUD -->
        {#if activeStation === "fireflies"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">✨ Firefly Shrine</span>
                    <span class="hud-payout-tag">✨ {fireflyJarCount}/{fireflyCommunityGoal}</span>
                </div>
                <div class="hud-body">
                    <div class="scores-table" style="background:#14241b; padding:5px; border:1px solid #ccff66;">
                        {#each fireflyWishes.slice(0, 3) as w}
                            <div class="player-score-row" style="color:#f0fff0;">
                                <span>🏮 <strong>@{w.user}:</strong> {w.wish}</span>
                            </div>
                        {/each}
                    </div>

                    <div class="bj-actions-row">
                        <input
                            type="text"
                            class="win98-input"
                            style="flex:1; padding:4px 6px; font-size:11px;"
                            placeholder="Write a lantern wish..."
                            bind:value={fireflyWishInput}
                            maxlength="90"
                        />
                        <button class="win98-btn primary-start-btn" onclick={releaseFireflyWish}>
                            🏮 Release
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        <!-- Mobile Touch Virtual Joystick -->
        <div
            class="touch-joystick-zone"
            ontouchstart={handleJoystickStart}
            ontouchmove={handleJoystickMove}
            ontouchend={handleJoystickEnd}
            ontouchcancel={handleJoystickEnd}
            role="region"
            aria-label="Touch Joystick"
        >
            <div class="joystick-base">
                <div
                    class="joystick-knob"
                    style="transform: translate({joystickOffset.x}px, {joystickOffset.y}px)"
                ></div>
            </div>
        </div>

        <!-- Push-To-Talk Button -->
        <button
            class="mobile-ptt-btn"
            class:active={isSpeaking}
            onmousedown={(e) => {
                e.stopPropagation();
                ensureVoiceInitialized().then(() => voiceManager?.startTransmitting());
            }}
            onmouseup={(e) => {
                e.stopPropagation();
                voiceManager?.stopTransmitting();
            }}
            ontouchstart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                ensureVoiceInitialized().then(() => voiceManager?.startTransmitting());
            }}
            ontouchend={(e) => {
                e.stopPropagation();
                e.preventDefault();
                voiceManager?.stopTransmitting();
            }}
            title="Hold to speak (Push-To-Talk)"
        >
            <span class="ptt-icon">🎙️</span>
            <span class="ptt-label">{isSpeaking ? "LIVE MIC" : "HOLD TALK"}</span>
        </button>
    </div>

    <!-- Bottom Action & Chat Bar -->
    <div class="mmo-action-bar">
        <button class="win98-btn dance-cycle-btn" onclick={cycleDanceMove} title="Tap to cycle 6 dance moves">
            {DANCE_MOVES[currentDanceIndex].icon} {DANCE_MOVES[currentDanceIndex].label}
        </button>

        <div class="quick-emotes">
            <button class="win98-btn emote-btn" onclick={() => triggerEmote("✨")}>✨</button>
            <button class="win98-btn emote-btn" onclick={() => triggerEmote("💎")}>💎</button>
            <button class="win98-btn emote-btn" onclick={() => triggerEmote("❤️")}>❤️</button>
            <button class="win98-btn emote-btn" onclick={() => triggerEmote("👑")}>👑</button>
            <button class="win98-btn emote-btn" onclick={() => triggerEmote("🔥")}>🔥</button>
        </div>

        <form
            class="chat-form"
            onsubmit={(e) => {
                e.preventDefault();
                sendChatMessage();
            }}
        >
            <input
                bind:this={chatInputEl}
                type="text"
                class="win98-input chat-input"
                placeholder="Say something nearby... (Enter to send)"
                bind:value={chatInput}
                onfocus={() => (isChatFocused = true)}
                onblur={() => (isChatFocused = false)}
                maxlength="120"
            />
            <button type="submit" class="win98-btn send-btn">Send</button>
        </form>

        <div class="desktop-ptt-hint">
            <span>[WASD / Click: Move] [E: Interact] [Space: Mic]</span>
        </div>
    </div>

    <!-- Modal A: 🏆 GLOBAL & ROOM LEADERBOARD -->
    {#if showLeaderboardModal}
        <div class="modal-overlay" onclick={() => (showLeaderboardModal = false)}>
            <div class="win98-window leaderboard-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🏆 UwU World High Rollers — Leaderboard & Stats</span>
                    <button class="win98-close" onclick={() => (showLeaderboardModal = false)}>X</button>
                </div>
                <div class="win98-body">
                    <div class="my-stats-banner">
                        <div class="stat-box">
                            <span class="stat-label">Your Balance</span>
                            <span class="stat-val gold">🪙 {chips.toLocaleString()} $UWU</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-label">Win / Loss Record</span>
                            <span class="stat-val">{myWins}W – {myLosses}L ({myWins + myLosses > 0 ? Math.round((myWins / (myWins + myLosses)) * 100) : 0}%)</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-label">Net Profit</span>
                            <span class="stat-val" class:pos={myNetProfit >= 0} class:neg={myNetProfit < 0}>
                                {myNetProfit >= 0 ? `+${myNetProfit.toLocaleString()}` : myNetProfit.toLocaleString()} $UWU
                            </span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-label">Best Single Win</span>
                            <span class="stat-val">🔥 {myHighScore.toLocaleString()} $UWU</span>
                        </div>
                    </div>

                    <div class="lb-toolbar">
                        <div class="lb-tabs">
                            <button
                                class="win98-btn"
                                class:active-wager={leaderboardSortBy === "chips"}
                                onclick={() => (leaderboardSortBy = "chips")}
                            >
                                🪙 Richest ($UWU)
                            </button>
                            <button
                                class="win98-btn"
                                class:active-wager={leaderboardSortBy === "wins"}
                                onclick={() => (leaderboardSortBy = "wins")}
                            >
                                🏆 Most Wins
                            </button>
                            <button
                                class="win98-btn"
                                class:active-wager={leaderboardSortBy === "profit"}
                                onclick={() => (leaderboardSortBy = "profit")}
                            >
                                📈 Net Profit
                            </button>
                        </div>

                        <button class="win98-btn" onclick={openLeaderboard}>
                            🔄 Refresh
                        </button>
                    </div>

                    <div class="lb-table-wrap">
                        {#if isLoadingLeaderboard}
                            <div class="lb-empty">Loading leaderboard stats...</div>
                        {:else}
                            <table class="lb-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Player</th>
                                        <th>Balance ($UWU)</th>
                                        <th>Wins / Losses</th>
                                        <th>Win %</th>
                                        <th>Net Profit</th>
                                        <th>Tip</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each sortedLeaderboard as row, idx}
                                        {@const totalGames = row.wins + row.losses}
                                        {@const winPct = totalGames > 0 ? Math.round((row.wins / totalGames) * 100) : 0}
                                        {@const isMe = row.x_username.toLowerCase() === myUsername.replace(/^@/, "").toLowerCase()}
                                        <tr class:is-me={isMe}>
                                            <td class="rank-col">
                                                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                                            </td>
                                            <td class="user-col">
                                                <span class="online-dot" class:on={row.isOnline}></span>
                                                <strong>@{row.x_username}</strong>
                                                {#if isMe}<span class="you-tag">(You)</span>{/if}
                                            </td>
                                            <td class="chips-col">🪙 {row.chips.toLocaleString()}</td>
                                            <td><span class="w-txt">{row.wins}W</span> – <span class="l-txt">{row.losses}L</span></td>
                                            <td>{winPct}%</td>
                                            <td class:pos={row.net_profit >= 0} class:neg={row.net_profit < 0}>
                                                {row.net_profit >= 0 ? `+${row.net_profit.toLocaleString()}` : row.net_profit.toLocaleString()}
                                            </td>
                                            <td>
                                                {#if !isMe}
                                                    <button
                                                        class="win98-btn tip-mini-btn"
                                                        onclick={() => {
                                                            showLeaderboardModal = false;
                                                            openSendUwuModal(row.x_username);
                                                        }}
                                                    >
                                                        💸 Send
                                                    </button>
                                                {:else}
                                                    <span>—</span>
                                                {/if}
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal B: 💸 SEND $UWU TO PLAYERS -->
    {#if showTransferModal}
        <div class="modal-overlay" onclick={() => (showTransferModal = false)}>
            <div class="win98-window transfer-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">💸 Send $UWU Chips to a Player</span>
                    <button class="win98-close" onclick={() => (showTransferModal = false)}>X</button>
                </div>
                <div class="win98-body transfer-body">
                    <div class="transfer-balance-row">
                        Your Available Balance: <strong>🪙 {chips.toLocaleString()} $UWU</strong>
                    </div>

                    {#if (networkManager?.getRemotePlayers() || []).length > 0}
                        <div class="quick-recipients">
                            <span class="field-label">Online in Room (Click to select):</span>
                            <div class="recipient-pills">
                                {#each networkManager?.getRemotePlayers() || [] as peer}
                                    <button
                                        type="button"
                                        class="win98-btn"
                                        class:active-wager={transferRecipient.toLowerCase() === peer.username.replace(/^@/, "").toLowerCase()}
                                        onclick={() => (transferRecipient = peer.username.replace(/^@/, ""))}
                                    >
                                        🟢 @{peer.username.replace(/^@/, "")}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <label class="field-col">
                        <span class="field-label">Recipient X Username (@handle):</span>
                        <input
                            type="text"
                            class="win98-input transfer-input"
                            placeholder="e.g. satoshi"
                            bind:value={transferRecipient}
                        />
                    </label>

                    <div class="field-col">
                        <span class="field-label">Amount ($UWU):</span>
                        <div class="preset-amounts">
                            {#each [50, 100, 250, 500, 1000] as amt}
                                <button
                                    type="button"
                                    class="win98-btn"
                                    class:active-wager={transferAmount === amt}
                                    onclick={() => (transferAmount = amt)}
                                >
                                    {amt}
                                </button>
                            {/each}
                        </div>
                        <input
                            type="number"
                            min="1"
                            max={chips}
                            class="win98-input transfer-input"
                            bind:value={transferAmount}
                        />
                    </div>

                    <label class="field-col">
                        <span class="field-label">Message / Note (Optional):</span>
                        <input
                            type="text"
                            class="win98-input transfer-input"
                            placeholder="GG at the Craps table!"
                            maxlength="80"
                            bind:value={transferNote}
                        />
                    </label>

                    {#if transferError}
                        <div class="transfer-error">⚠️ {transferError}</div>
                    {/if}

                    <div class="transfer-actions">
                        <button class="win98-btn" onclick={() => (showTransferModal = false)}>Cancel</button>
                        <button
                            class="win98-btn primary-start-btn"
                            disabled={isSendingTransfer}
                            onclick={handleSendUwuSubmit}
                        >
                            {isSendingTransfer ? "Sending..." : `💸 Send ${Number(transferAmount || 0).toLocaleString()} $UWU`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 1: World Directory -->
    {#if showGuideModal}
        <div class="modal-overlay" onclick={() => (showGuideModal = false)}>
            <div class="win98-window guide-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">📖 World Map & Directory</span>
                    <button class="win98-close" onclick={() => (showGuideModal = false)}>X</button>
                </div>
                <div class="win98-body guide-body">
                    <div class="guide-grid">
                        <div class="guide-card">
                            <div class="guide-card-title">🎲 Craps Dice Duel</div>
                            <p>3-round dice showdown vs the Unicorn Dealer or PvP players.</p>
                            <button class="win98-btn" onclick={() => teleportTo(11.5, 14.5, "Craps Table", "casino")}>Teleport</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🎡 Meme Roulette</div>
                            <p>Pick your favorite meme sector and spin the wheel.</p>
                            <button class="win98-btn" onclick={() => teleportTo(19.5, 14.5, "Meme Roulette", "casino")}>Teleport</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🃏 Blackjack 21</div>
                            <p>Hit, Stand, or Double Down against the House Dealer.</p>
                            <button class="win98-btn" onclick={() => teleportTo(11.5, 20.5, "Blackjack 21", "casino")}>Teleport</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🎰 Golden UwU Slots</div>
                            <p>Pull the lever for 3-of-a-kind jackpots up to 60x.</p>
                            <button class="win98-btn" onclick={() => teleportTo(20.5, 20.5, "Golden Slots", "casino")}>Teleport</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🚀 Rocket Crash</div>
                            <p>Ride the rocket trajectory and cash out before it explodes.</p>
                            <button class="win98-btn" onclick={() => teleportTo(15.5, 13.8, "Rocket Crash", "casino")}>Teleport</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">💣 Cyber Mines</div>
                            <p>Uncover glowing gems across the 5×5 grid and cash out anytime.</p>
                            <button class="win98-btn" onclick={() => teleportTo(27.5, 18.2, "Cyber Mines", "casino")}>Teleport</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🕹️ Retro Arcade</div>
                            <p>Brick Breaker, Cyber Snake, Coin Rush, Whack-A-Glitch & Mines.</p>
                            <button class="win98-btn" onclick={() => { showGuideModal = false; openArcadeModal("brick"); }}>Open Arcade</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🌲 Whispering Woods</div>
                            <p>Lush forest hangout with Campfire Trivia, Picnic, Koi Pond & Fireflies.</p>
                            <button class="win98-btn" onclick={() => teleportTo(16.0, 16.0, "Whispering Woods", "forest")}>Teleport</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 2: 🕹️ RETRO ARCADE CENTER -->
    {#if showArcadeModal}
        <div class="modal-overlay" onclick={closeArcadeModal}>
            <div class="win98-window arcade-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🕹️ Retro Arcade</span>
                    <button class="win98-close" onclick={closeArcadeModal}>X</button>
                </div>
                <div class="win98-body arcade-body">
                    <!-- Top Arcade Game Selector Tabs -->
                    <div class="arcade-tabs-bar">
                        <button
                            class="win98-btn arcade-tab-btn"
                            class:active-wager={activeArcadeTab === "brick"}
                            onclick={() => selectArcadeTab("brick")}
                        >
                            🧱 Brick Breaker
                        </button>
                        <button
                            class="win98-btn arcade-tab-btn"
                            class:active-wager={activeArcadeTab === "snake"}
                            onclick={() => selectArcadeTab("snake")}
                        >
                            🐍 Snake 98
                        </button>
                        <button
                            class="win98-btn arcade-tab-btn"
                            class:active-wager={activeArcadeTab === "coin"}
                            onclick={() => selectArcadeTab("coin")}
                        >
                            🪙 Coin Rush
                        </button>
                        <button
                            class="win98-btn arcade-tab-btn"
                            class:active-wager={activeArcadeTab === "whack"}
                            onclick={() => selectArcadeTab("whack")}
                        >
                            🔨 Whack-A-Glitch
                        </button>
                        <button
                            class="win98-btn arcade-tab-btn"
                            class:active-wager={activeArcadeTab === "mines"}
                            onclick={() => selectArcadeTab("mines")}
                        >
                            💣 Cyber Mines
                        </button>
                    </div>

                    {#if activeArcadeTab !== "mines"}
                        <div class="arcade-mode-banner">
                            <div class="arcade-mode-left">
                                <button
                                    class="win98-btn wager-btn"
                                    class:active-wager={arcadePlayMode === "free"}
                                    onclick={() => (arcadePlayMode = "free")}
                                >
                                    🕹️ Free Play
                                </button>
                                <button
                                    class="win98-btn wager-btn"
                                    class:active-wager={arcadePlayMode === "token"}
                                    onclick={() => (arcadePlayMode = "token")}
                                >
                                    🪙 100 $UWU Token (Win 175 $UWU)
                                </button>
                            </div>
                            <span class="arcade-balance-pill">🪙 {chips.toLocaleString()} $UWU</span>
                        </div>
                    {/if}

                    <!-- TAB 1: NEON BRICK BREAKER -->
                    {#if activeArcadeTab === "brick"}
                        <div class="arcade-cabinet-panel">
                            <div class="roulette-status-bar">
                                <span>🧱 Score: <strong>{brickScore}</strong> / {BRICK_TARGET_SCORE}</span>
                                <span>{"❤️".repeat(brickLives)}</span>
                                <span>🏆 Best: <strong>{arcadeBestScores.brick}</strong></span>
                            </div>

                            <div
                                class="arcade-crt-stage"
                                onmousemove={handleBrickPointerMove}
                                ontouchmove={handleBrickPointerMove}
                            >
                                {#each brickList as b}
                                    {#if b.alive}
                                        <div
                                            class="arcade-brick"
                                            style="left:{b.x}px; top:{b.y}px; width:{b.w}px; height:{b.h}px; background:{b.color};"
                                        ></div>
                                    {/if}
                                {/each}

                                <div
                                    class="arcade-ball"
                                    style="left:{brickBall.x - 5}px; top:{brickBall.y - 5}px;"
                                ></div>

                                <div
                                    class="arcade-paddle"
                                    style="left:{brickPaddleX}px; top:204px; width:64px;"
                                ></div>

                                {#if brickPhase !== "playing"}
                                    <div class="arcade-crt-overlay">
                                        <div class="crt-title">
                                            {brickPhase === "won"
                                                ? `🏆 CLEARED! (${brickScore} PTS)`
                                                : brickPhase === "lost"
                                                  ? `💥 GAME OVER (${brickScore} PTS)`
                                                  : "🧱 NEON BRICK BREAKER"}
                                        </div>
                                        <p class="crt-sub">
                                            Move mouse or press <strong>[A / D / ◀ / ▶]</strong>
                                        </p>
                                    </div>
                                {/if}
                            </div>

                            <div class="arcade-controls-row">
                                <button class="win98-btn" onclick={() => (brickPaddleX = Math.max(8, brickPaddleX - 28))}>◀</button>
                                <button class="win98-btn primary-start-btn" style="flex:1;" onclick={startBrickBreaker}>
                                    {brickPhase === "playing"
                                        ? "🔄 Restart"
                                        : arcadePlayMode === "token"
                                          ? "🪙 Launch (100 $UWU)"
                                          : "🕹️ Start Game"}
                                </button>
                                <button class="win98-btn" onclick={() => (brickPaddleX = Math.min(248, brickPaddleX + 28))}>▶</button>
                            </div>
                        </div>

                    <!-- TAB 2: CYBER SNAKE 1998 -->
                    {:else if activeArcadeTab === "snake"}
                        <div class="arcade-cabinet-panel">
                            <div class="roulette-status-bar">
                                <span>🐍 Score: <strong>{snakeScore}</strong> / {SNAKE_TARGET_SCORE}</span>
                                <span>Length: <strong>{snakeBody.length}</strong></span>
                                <span>🏆 Best: <strong>{arcadeBestScores.snake}</strong></span>
                            </div>

                            <div class="arcade-crt-stage snake-stage">
                                <div
                                    class="snake-food-cell"
                                    style="left:{snakeFood.x * 20}px; top:{snakeFood.y * 18.5}px;"
                                >
                                    {snakeFood.kind === "unicorn" ? "🦄" : "💎"}
                                </div>

                                {#each snakeBody as seg, idx}
                                    <div
                                        class="snake-segment"
                                        class:snake-head={idx === 0}
                                        style="left:{seg.x * 20}px; top:{seg.y * 18.5}px;"
                                    ></div>
                                {/each}

                                {#if snakePhase !== "playing"}
                                    <div class="arcade-crt-overlay">
                                        <div class="crt-title">
                                            {snakePhase === "won"
                                                ? `🏆 YOU WIN! (${snakeScore} PTS)`
                                                : snakePhase === "lost"
                                                  ? `💥 CRASHED! (${snakeScore} PTS)`
                                                  : "🐍 CYBER SNAKE 98"}
                                        </div>
                                        <p class="crt-sub">
                                            Use <strong>[WASD / Arrows]</strong> to collect 💎 & 🦄
                                        </p>
                                    </div>
                                {/if}
                            </div>

                            <div class="arcade-controls-row">
                                <div class="snake-dpad">
                                    <button class="win98-btn" onclick={() => setSnakeDirection(-1, 0)}>◀</button>
                                    <button class="win98-btn" onclick={() => setSnakeDirection(0, -1)}>▲</button>
                                    <button class="win98-btn" onclick={() => setSnakeDirection(0, 1)}>▼</button>
                                    <button class="win98-btn" onclick={() => setSnakeDirection(1, 0)}>▶</button>
                                </div>
                                <button class="win98-btn primary-start-btn" style="flex:1;" onclick={startCyberSnake}>
                                    {snakePhase === "playing"
                                        ? "🔄 Restart"
                                        : arcadePlayMode === "token"
                                          ? "🪙 Start (100 $UWU)"
                                          : "🕹️ Start Game"}
                                </button>
                            </div>
                        </div>

                    <!-- TAB 3: CYBER COIN RUSH -->
                    {:else if activeArcadeTab === "coin"}
                        <div class="arcade-cabinet-panel">
                            <div class="roulette-status-bar">
                                <span>🪙 Score: <strong>{coinScore}</strong> / {COIN_TARGET_SCORE}</span>
                                <span>⏱️ <strong>{coinTimeLeft}s</strong></span>
                                <span>🏆 Best: <strong>{arcadeBestScores.coin}</strong></span>
                            </div>

                            <div
                                class="arcade-crt-stage"
                                onmousemove={handleCoinPointerMove}
                                ontouchmove={handleCoinPointerMove}
                            >
                                {#each coinItems as item (item.id)}
                                    <div
                                        class="falling-coin-item"
                                        style="left:{item.x - 10}px; top:{item.y}px;"
                                    >
                                        {item.icon}
                                    </div>
                                {/each}

                                <div
                                    class="arcade-paddle coin-basket"
                                    style="left:{coinBasketX}px; top:196px; width:56px;"
                                >
                                    🧺 CATCH
                                </div>

                                {#if coinPhase !== "playing"}
                                    <div class="arcade-crt-overlay">
                                        <div class="crt-title">
                                            {coinPhase === "done"
                                                ? `⏱️ SCORE: ${coinScore} PTS`
                                                : "🪙 CYBER COIN RUSH"}
                                        </div>
                                        <p class="crt-sub">
                                            Catch 🪙 💎 🦄 — Dodge 💣!
                                        </p>
                                    </div>
                                {/if}
                            </div>

                            <div class="arcade-controls-row">
                                <button class="win98-btn" onclick={() => (coinBasketX = Math.max(8, coinBasketX - 28))}>◀</button>
                                <button class="win98-btn primary-start-btn" style="flex:1;" onclick={startCoinRush}>
                                    {coinPhase === "playing"
                                        ? "🔄 Restart"
                                        : arcadePlayMode === "token"
                                          ? "🪙 Start (100 $UWU)"
                                          : "🕹️ Start Game"}
                                </button>
                                <button class="win98-btn" onclick={() => (coinBasketX = Math.min(256, coinBasketX + 28))}>▶</button>
                            </div>
                        </div>

                    <!-- TAB 4: WHACK-A-GLITCH -->
                    {:else if activeArcadeTab === "whack"}
                        <div class="arcade-cabinet-panel">
                            <div class="roulette-status-bar">
                                <span>🔨 Score: <strong>{whackScore}</strong> / {WHACK_TARGET_SCORE}</span>
                                <span>⏱️ <strong>{whackTimeLeft}s</strong></span>
                                <span>🏆 Best: <strong>{arcadeBestScores.whack}</strong></span>
                            </div>

                            <div class="whack-grid-3x3">
                                {#each whackGrid as cell, idx}
                                    <button
                                        class="win98-btn whack-hole-btn"
                                        class:active-bug={cell.kind === "bug"}
                                        class:active-golden={cell.kind === "golden"}
                                        class:active-bomb={cell.kind === "bomb"}
                                        disabled={whackPhase !== "playing"}
                                        onclick={() => whackCell(idx)}
                                    >
                                        {#if cell.kind === "bug"}
                                            <span class="whack-sprite">👾</span>
                                            <small>+30</small>
                                        {:else if cell.kind === "golden"}
                                            <span class="whack-sprite">🦄</span>
                                            <small>+65</small>
                                        {:else if cell.kind === "bomb"}
                                            <span class="whack-sprite">💣</span>
                                            <small>-45</small>
                                        {:else}
                                            <span class="whack-empty">🕳️</span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>

                            <button class="win98-btn primary-start-btn" onclick={startWhackAGlitch}>
                                {whackPhase === "playing"
                                    ? "🔄 Restart"
                                    : arcadePlayMode === "token"
                                      ? "🪙 Start (100 $UWU)"
                                      : "🕹️ Start Game"}
                            </button>
                        </div>

                    <!-- TAB 5: CYBER MINES -->
                    {:else if activeArcadeTab === "mines"}
                        <div class="arcade-cabinet-panel">
                            <div class="wager-selector">
                                <span>Wager:</span>
                                {#each WAGER_OPTIONS as w}
                                    <button
                                        class="win98-btn wager-btn"
                                        class:active-wager={selectedWager === w}
                                        disabled={minesPhase === "playing"}
                                        onclick={() => (selectedWager = w)}
                                    >
                                        {w}
                                    </button>
                                {/each}
                                <span style="margin-left:auto;">💣</span>
                                {#each [5, 8, 12] as bCount}
                                    <button
                                        class="win98-btn wager-btn"
                                        class:active-wager={minesBombCount === bCount}
                                        disabled={minesPhase === "playing"}
                                        onclick={() => (minesBombCount = bCount as 5 | 8 | 12)}
                                    >
                                        {bCount}
                                    </button>
                                {/each}
                            </div>

                            <div class="roulette-status-bar">
                                <span>Multiplier: <strong>{minesCurrentMultiplier.toFixed(2)}x</strong></span>
                                <span>Next: <strong style="color:#007a3d;">{minesNextMultiplier.toFixed(2)}x</strong></span>
                                <span>🪙 <strong>{chips.toLocaleString()}</strong></span>
                            </div>

                            <div class="mines-grid-5x5 arcade-mines-grid">
                                {#each minesRevealed as tileState, idx}
                                    <button
                                        class="win98-btn mines-cell-btn"
                                        class:revealed-gem={tileState === "gem"}
                                        class:revealed-bomb={tileState === "bomb"}
                                        disabled={minesPhase !== "playing" || tileState !== "hidden"}
                                        onclick={() => clickMinesTile(idx)}
                                    >
                                        {#if tileState === "gem"}
                                            💎
                                        {:else if tileState === "bomb"}
                                            💣
                                        {:else}
                                            ·
                                        {/if}
                                    </button>
                                {/each}
                            </div>

                            {#if minesPhase === "playing"}
                                <button
                                    class="win98-btn cashout-btn"
                                    disabled={minesSafeClicks === 0}
                                    onclick={cashOutCyberMines}
                                >
                                    {minesSafeClicks > 0
                                        ? `💰 CASH OUT +${Math.round(minesBetAmount * minesCurrentMultiplier)} $UWU (${minesCurrentMultiplier.toFixed(2)}x)`
                                        : "💎 Pick a tile to Cash Out"}
                                </button>
                            {:else}
                                <button class="win98-btn primary-start-btn" onclick={startCyberMines}>
                                    💣 START MINES ({selectedWager} $UWU)
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 3: Live Pixel Graffiti Billboard -->
    {#if showGraffitiModal}
        <div class="modal-overlay" onclick={() => (showGraffitiModal = false)}>
            <div class="win98-window graffiti-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🎨 Graffiti Wall</span>
                    <button class="win98-close" onclick={() => (showGraffitiModal = false)}>X</button>
                </div>
                <div class="win98-body">
                    <div class="graffiti-toolbar">
                        <div class="palette-bar">
                            {#each RETRO_PALETTE_16 as color}
                                <button
                                    class="color-swatch"
                                    class:selected={selectedGraffitiColor === color}
                                    style="background-color: {color}"
                                    onclick={() => (selectedGraffitiColor = color)}
                                    aria-label="Select color {color}"
                                ></button>
                            {/each}
                        </div>

                        <div class="brush-size-row">
                            <button
                                class="win98-btn tool-btn"
                                class:active-tool={graffitiBrushSize === 1}
                                onclick={() => (graffitiBrushSize = 1)}
                            >1px</button>
                            <button
                                class="win98-btn tool-btn"
                                class:active-tool={graffitiBrushSize === 2}
                                onclick={() => (graffitiBrushSize = 2)}
                            >2px</button>
                            <button class="win98-btn tool-btn" onclick={clearGraffitiCanvas}>Clear</button>
                        </div>
                    </div>

                    <div class="canvas-paint-wrapper">
                        <canvas
                            bind:this={graffitiCanvas}
                            width="384"
                            height="256"
                            class="graffiti-interactive-canvas"
                            onmousedown={handleGraffitiPointerDown}
                            onmousemove={handleGraffitiPointerMove}
                            onmouseup={handleGraffitiPointerUp}
                            ontouchstart={handleGraffitiPointerDown}
                            ontouchmove={handleGraffitiPointerMove}
                            ontouchend={handleGraffitiPointerUp}
                        ></canvas>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 4: 🪩 CYBERPUNK DUAL-TURNTABLE & SPECTRUM EQ DJ BOOTH -->
    {#if showDJModal}
        {@const activeDJTrack = DJ_TRACKS.find((t) => t.id === currentTrackId) || DJ_TRACKS[0]}
        <div class="modal-overlay" onclick={() => (showDJModal = false)}>
            <div class="win98-window dj-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🪩 Club Neon DJ Deck</span>
                    <button class="win98-close" onclick={() => (showDJModal = false)}>X</button>
                </div>
                <div class="win98-body dj-body">
                    <!-- Top Dual-Turntable & Live EQ Visualizer Deck -->
                    <div class="dj-turntable-deck">
                        <div class="vinyl-platter" class:spinning={isMusicPlaying}>
                            <div class="vinyl-grooves">
                                <span class="vinyl-center">💿</span>
                            </div>
                        </div>

                        <div class="dj-center-mixer">
                            <div class="dj-now-playing-tag">
                                {isMusicPlaying ? "🟢 ON AIR — NOW SPINNING" : "⏸️ DECK PAUSED"}
                            </div>
                            <div class="dj-active-title">{activeDJTrack.title}</div>
                            <div class="dj-active-meta">
                                <span class="dj-artist-name">{activeDJTrack.artist}</span>
                                <span>•</span>
                                <span class="dj-vibe-tag">{activeDJTrack.vibe}</span>
                                <span>•</span>
                                <span class="dj-bpm-badge">{activeDJTrack.bpm} BPM</span>
                            </div>

                            <!-- Animated 12-Bar Spectrum Visualizer -->
                            <div class="dj-eq-bars" class:paused={!isMusicPlaying}>
                                {#each Array(12) as _, bIdx}
                                    <span class="eq-bar" style="animation-delay: {(bIdx * 0.08).toFixed(2)}s"></span>
                                {/each}
                            </div>

                            <div class="dj-transport-row">
                                <button
                                    class="win98-btn dj-play-toggle"
                                    onclick={() => {
                                        isMusicPlaying = !isMusicPlaying;
                                        synth.setMute(!isMusicPlaying);
                                        if (isMusicPlaying) synth.playTrack(currentTrackId);
                                    }}
                                >
                                    {isMusicPlaying ? "⏸️ Pause Deck" : "▶️ Play Deck"}
                                </button>
                            </div>
                        </div>

                        <div class="vinyl-platter" class:spinning={isMusicPlaying}>
                            <div class="vinyl-grooves">
                                <span class="vinyl-center">🎛️</span>
                            </div>
                        </div>
                    </div>

                    <!-- Genre Filter Pills -->
                    <div class="genre-tabs">
                        {#each DJ_GENRE_FILTERS as g}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedGenreFilter === g}
                                onclick={() => (selectedGenreFilter = g)}
                            >
                                {g}
                            </button>
                        {/each}
                    </div>

                    <!-- Crate Tracklist -->
                    <div class="dj-track-list">
                        {#each filteredDJTracks as track}
                            <button
                                class="win98-btn track-select-btn"
                                class:active-track={currentTrackId === track.id}
                                onclick={() => {
                                    currentTrackId = track.id;
                                    isMusicPlaying = true;
                                    synth.setMute(false);
                                    synth.playTrack(track.id);
                                    networkManager?.broadcastDJTrack(track.id, myUsername);
                                }}
                            >
                                <div class="track-left">
                                    <span class="genre-pill genre-{track.genre.toLowerCase().replace(/[^a-z]/g, '')}">
                                        {track.genre}
                                    </span>
                                    <div class="track-text-col">
                                        <span class="track-title-str">{track.title}</span>
                                        <span class="track-sub-str">{track.artist} — {track.vibe}</span>
                                    </div>
                                </div>
                                <div class="track-right">
                                    <span class="track-bpm">{track.bpm} BPM</span>
                                    <span class="track-play-ico">{currentTrackId === track.id && isMusicPlaying ? "🔊" : "▶️"}</span>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Full-Game 𝕏 Authentication Gate Overlay (Prevents anon joins, DB spam & graffiti resets) -->
    {#if !$userProfile}
        <div class="world-auth-gate-overlay" onclick={(e) => e.stopPropagation()}>
            <div class="world-auth-gate-card win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🔐 UwU World MMO — 𝕏 Login Required</span>
                </div>
                <div class="world-auth-gate-body">
                    <div class="gate-badge">✨ VERIFIED PLAYERS ONLY</div>
                    <div class="gate-hero-icon">🦄</div>
                    <h2 class="gate-title">Enter UwU World</h2>

                    {#if $authLoading}
                        <p class="gate-desc">⏳ Restoring your 𝕏 session...</p>
                    {:else}
                        <p class="gate-desc">
                            Connect your 𝕏 account to join the live isometric Casino Lounge & Whispering Woods, track your <strong>$UWU</strong> chips on the Leaderboard, and paint on the persistent Graffiti Wall.
                        </p>

                        <div class="gate-feature-pills">
                            <span class="gate-pill">🪙 2,500 Starting $UWU</span>
                            <span class="gate-pill">🎨 Global Graffiti</span>
                            <span class="gate-pill">🏆 Leaderboard</span>
                            <span class="gate-pill">🌲 Whispering Woods</span>
                        </div>

                        <div class="gate-actions">
                            <button
                                type="button"
                                class="win98-btn gate-x-login-btn"
                                onclick={handleWorldXLogin}
                                disabled={isLoggingInWithX}
                            >
                                <span class="gate-x-logo">𝕏</span>
                                <span>{isLoggingInWithX ? "Connecting to 𝕏..." : "Sign In with 𝕏 to Play"}</span>
                            </button>

                            <button
                                type="button"
                                class="win98-btn gate-secondary-btn"
                                onclick={openGlobalXAuthModal}
                            >
                                🔐 Auth Options / Dev Login
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .mmo-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background-color: #c0c0c0;
        overflow: hidden;
        user-select: none;
        font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
    }

    .world-auth-gate-overlay {
        position: absolute;
        inset: 0;
        z-index: 250;
        background: radial-gradient(circle at 50% 35%, rgba(16, 10, 44, 0.84), rgba(5, 3, 18, 0.94));
        backdrop-filter: blur(7px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }

    .world-auth-gate-card {
        width: 100%;
        max-width: 410px;
        box-shadow:
            0 16px 48px rgba(0, 0, 0, 0.85),
            0 0 24px rgba(0, 229, 255, 0.22);
    }

    .world-auth-gate-body {
        background: linear-gradient(180deg, #100926 0%, #080417 100%);
        color: #f0f4ff;
        padding: 20px 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        border: 2px inset #2b1d52;
    }

    .gate-badge {
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 0.8px;
        color: #00e5ff;
        background: rgba(0, 229, 255, 0.12);
        border: 1px solid rgba(0, 229, 255, 0.4);
        padding: 3px 10px;
        border-radius: 999px;
    }

    .gate-hero-icon {
        font-size: 42px;
        line-height: 1;
        filter: drop-shadow(0 0 12px rgba(255, 0, 170, 0.55));
    }

    .gate-title {
        margin: 0;
        font-size: 18px;
        font-weight: bold;
        color: #ffffff;
        text-shadow: 0 0 10px rgba(0, 229, 255, 0.45);
    }

    .gate-desc {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        color: #b8c7e0;
    }

    .gate-desc strong {
        color: #ffd700;
    }

    .gate-feature-pills {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
        margin: 4px 0;
    }

    .gate-pill {
        font-size: 10px;
        font-weight: bold;
        color: #e2e8f0;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.18);
        padding: 3px 8px;
        border-radius: 4px;
    }

    .gate-actions {
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 8px;
        margin-top: 6px;
    }

    .gate-x-login-btn {
        width: 100%;
        padding: 9px 14px;
        background: #000000;
        color: #ffffff;
        font-size: 13px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid #00e5ff;
        box-shadow: 0 0 14px rgba(0, 229, 255, 0.35);
    }

    .gate-x-login-btn:hover:not(:disabled) {
        background: #111827;
        box-shadow: 0 0 18px rgba(0, 229, 255, 0.6);
    }

    .gate-x-logo {
        font-size: 16px;
        line-height: 1;
    }

    .gate-secondary-btn {
        width: 100%;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: bold;
        background: rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.22);
    }

    .mmo-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: linear-gradient(90deg, #000080, #1034a6);
        color: #ffffff;
        font-size: 11px;
        font-weight: bold;
        flex-shrink: 0;
        border-bottom: 2px solid #808080;
        gap: 6px;
        flex-wrap: wrap;
    }

    .toolbar-left,
    .toolbar-right,
    .quick-travel-bar {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .quick-travel-bar {
        background: rgba(0, 0, 0, 0.32);
        padding: 2px 6px;
        border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .qt-label {
        font-size: 11px;
        color: #ffff00;
    }

    .qt-btn {
        padding: 2px 6px;
        font-size: 10px;
    }

    .room-pill,
    .online-pill,
    .chips-pill {
        background: rgba(0, 0, 0, 0.45);
        padding: 2px 7px;
        border-radius: 2px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    .chips-pill {
        color: #ffd700;
        border-color: rgba(255, 215, 0, 0.5);
    }

    .wl-badge {
        color: #a0e8ff;
        font-size: 10px;
    }

    .daily-reward-btn {
        padding: 2px 7px;
        font-size: 10px;
        font-weight: bold;
        background: #d4d0c8;
        color: #333333;
    }

    .daily-reward-btn.daily-ready {
        background: #007a3d;
        color: #ffff80;
        box-shadow: 0 0 6px rgba(0, 255, 136, 0.7);
    }

    .leaderboard-btn {
        background: #ffd700;
        color: #000000;
        font-weight: bold;
        padding: 2px 7px;
    }

    .send-uwu-btn {
        background: #004d40;
        color: #ffffff;
        font-weight: bold;
        padding: 2px 7px;
    }

    .guide-btn {
        padding: 2px 7px;
        font-weight: bold;
    }

    .canvas-wrapper {
        position: relative;
        flex: 1;
        width: 100%;
        height: 100%;
        background: #050510;
        overflow: hidden;
        cursor: pointer;
    }

    canvas {
        display: block;
    }

    .status-notice {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: #000080;
        color: #ffff00;
        border: 2px solid #00ffff;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 3px 3px 0px #000000;
        pointer-events: none;
        z-index: 15;
        white-space: nowrap;
    }

    /* Interactive Game HUD Overlay */
    .game-hud {
        position: absolute;
        top: 10px;
        left: 10px;
        width: 355px;
        max-width: calc(100vw - 24px);
        z-index: 10;
        box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.85);
    }

    .hud-body {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: #000000;
    }

    .hud-instructions {
        background: #ffffe1;
        border: 1px solid #808080;
        padding: 5px 7px;
        font-size: 11px;
        line-height: 1.35;
        color: #111111;
    }

    .bj-dealer-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(90deg, #1b0c30, #0d2b4e);
        border: 1px solid #ffd700;
        padding: 4px 8px;
        color: #ffffff;
    }

    .bj-dealer-sprite {
        width: 44px;
        height: 44px;
        object-fit: contain;
        image-rendering: pixelated;
        background: transparent !important;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
        flex-shrink: 0;
    }

    .bj-dealer-info {
        display: flex;
        flex-direction: column;
        font-size: 10px;
        line-height: 1.3;
    }

    .bj-dealer-info strong {
        color: #ffd700;
        font-size: 11px;
    }

    .wager-selector {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: bold;
    }

    .wager-btn {
        padding: 2px 7px;
        font-size: 11px;
    }

    .wager-btn.active-wager {
        background: #000080;
        color: #ffff00;
        font-weight: bold;
    }

    .round-steps-row {
        display: flex;
        justify-content: space-between;
        gap: 4px;
        margin-bottom: 5px;
    }

    .r-pill {
        flex: 1;
        text-align: center;
        background: #222842;
        color: #8892b0;
        font-size: 10px;
        padding: 2px 0;
        border: 1px solid #444c6e;
    }

    .r-pill.active {
        background: #007a3d;
        color: #ffff80;
        font-weight: bold;
        border-color: #00ff88;
    }

    .dice-seats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
    }

    .seat-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #d4d0c8;
        border: 1px solid #808080;
        padding: 4px 2px;
        font-size: 10px;
        cursor: pointer;
        font-family: inherit;
    }

    .seat-badge.occupied {
        background: #fff8e1;
        border-color: #ff9900;
    }

    .seat-badge.ready {
        background: #c8e6c9;
        border-color: #008000;
    }

    .seat-title {
        font-weight: bold;
        color: #000080;
    }

    .seat-user {
        font-size: 9px;
        max-width: 70px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .seat-status {
        font-size: 9px;
        font-weight: bold;
    }

    .seat-empty {
        font-size: 9px;
        color: #555555;
    }

    .dice-tournament-banner {
        background: #101426;
        color: #ffffff;
        padding: 6px;
        border: 1px solid #00ffff;
        font-size: 11px;
    }

    .tournament-winner {
        font-weight: bold;
        color: #ffd700;
        text-align: center;
        margin-top: 4px;
    }

    .scores-table {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .player-score-row {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        padding: 3px 5px;
        background: rgba(255, 255, 255, 0.08);
    }

    .player-score-row.is-winner {
        background: rgba(255, 215, 0, 0.28);
        color: #ffff00;
        font-weight: bold;
    }

    .hud-actions-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .bot-test-btn {
        background: #004d40;
        color: #ffffff;
        font-weight: bold;
    }

    .primary-start-btn {
        background: #008000;
        color: #ffffff;
        font-weight: bold;
        padding: 6px;
    }

    .cashout-btn {
        background: #ffd700;
        color: #000000;
        font-weight: bold;
        padding: 7px;
        font-size: 12px;
    }

    /* Roulette Grid */
    .roulette-status-bar {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        background: #e0e0e0;
        padding: 3px 6px;
        border: 1px inset #ffffff;
    }

    .roulette-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
    }

    .meme-tile-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 4px;
        font-size: 10px;
    }

    .meme-tile-btn.active-bet {
        background: #fff9c4;
        outline: 2px solid #ff9900;
    }

    .meme-icon {
        font-size: 15px;
    }

    .meme-title {
        font-size: 9px;
        max-width: 85px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .meme-multiplier {
        font-weight: bold;
    }

    /* Blackjack, Slots, Crash & Mines HUD */
    .bj-table-box {
        background: #094a28;
        color: #ffffff;
        padding: 6px;
        border: 2px inset #808080;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .bj-hand-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
    }

    .bj-cards {
        display: flex;
        gap: 4px;
    }

    .playing-card {
        background: #ffffff;
        color: #000000;
        padding: 2px 5px;
        border-radius: 2px;
        font-weight: bold;
        font-size: 11px;
        border: 1px solid #000000;
    }

    .playing-card.red-suit {
        color: #d50000;
    }

    .bj-status-msg {
        font-size: 11px;
        font-weight: bold;
        text-align: center;
        padding: 3px;
        background: #eaeaea;
        border: 1px inset #ffffff;
    }

    .bj-actions-row {
        display: flex;
        gap: 5px;
    }

    .bj-btn {
        flex: 1;
        font-weight: bold;
    }

    .slot-reels-display {
        display: flex;
        justify-content: center;
        gap: 8px;
        background: #140a24;
        padding: 8px;
        border: 2px inset #ffd700;
    }

    .slot-reel-cell {
        width: 52px;
        height: 46px;
        background: #ffffff;
        border: 2px solid #ffd700;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
    }

    .slot-reel-cell.spinning {
        filter: blur(1px);
        transform: scale(0.96);
    }

    .crash-display {
        background: #0d1326;
        color: #00ff88;
        border: 2px inset #808080;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .crash-display.crashed {
        color: #ff3355;
    }

    .crash-mult {
        font-size: 24px;
        font-weight: bold;
        font-family: monospace;
    }

    .crash-sub {
        font-size: 10px;
        color: #d0d8e8;
    }

    .mines-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 3px;
        background: #141c2b;
        padding: 5px;
        border: 2px inset #808080;
    }

    .mines-cell {
        height: 30px;
        font-weight: bold;
        font-size: 13px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .mines-cell.revealed {
        background: #e0f2f1;
    }

    /* Leaderboard Modal */
    .leaderboard-window {
        width: 640px;
        max-width: 96vw;
    }

    .my-stats-banner {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        background: #10182c;
        color: #ffffff;
        padding: 8px;
        border: 2px inset #808080;
        margin-bottom: 8px;
    }

    .stat-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .stat-label {
        font-size: 9px;
        color: #b0c4de;
        text-transform: uppercase;
    }

    .stat-val {
        font-size: 12px;
        font-weight: bold;
        margin-top: 2px;
    }

    .stat-val.gold {
        color: #ffd700;
    }

    .pos {
        color: #00aa44;
        font-weight: bold;
    }

    .my-stats-banner .pos {
        color: #00ff88;
    }

    .neg {
        color: #cc0033;
        font-weight: bold;
    }

    .my-stats-banner .neg {
        color: #ff6680;
    }

    .lb-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    }

    .lb-tabs {
        display: flex;
        gap: 4px;
    }

    .lb-table-wrap {
        max-height: 280px;
        overflow-y: auto;
        background: #ffffff;
        border: 2px inset #808080;
    }

    .lb-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
    }

    .lb-table th {
        background: #dfdfdf;
        border-bottom: 1px solid #808080;
        padding: 5px 6px;
        text-align: left;
        position: sticky;
        top: 0;
    }

    .lb-table td {
        padding: 5px 6px;
        border-bottom: 1px solid #eeeeee;
    }

    .lb-table tr.is-me {
        background: #fff9c4;
    }

    .online-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #999999;
        margin-right: 4px;
    }

    .online-dot.on {
        background: #00cc44;
    }

    .you-tag {
        font-size: 9px;
        color: #000080;
        font-weight: bold;
        margin-left: 3px;
    }

    .chips-col {
        font-weight: bold;
        color: #004d40;
    }

    .w-txt {
        color: #007a3d;
        font-weight: bold;
    }

    .l-txt {
        color: #b71c1c;
    }

    .tip-mini-btn {
        padding: 1px 6px;
        font-size: 10px;
        background: #e8f5e9;
    }

    .lb-empty {
        padding: 20px;
        text-align: center;
        color: #555555;
        font-size: 12px;
    }

    /* Send $UWU Transfer Modal */
    .transfer-window {
        width: 380px;
        max-width: 94vw;
    }

    .transfer-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .transfer-balance-row {
        background: #10182c;
        color: #ffd700;
        padding: 6px 8px;
        font-size: 12px;
        border: 1px inset #808080;
        text-align: center;
    }

    .quick-recipients,
    .field-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .field-label {
        font-size: 11px;
        font-weight: bold;
    }

    .recipient-pills,
    .preset-amounts {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .transfer-input {
        padding: 5px 7px;
        font-size: 12px;
    }

    .transfer-error {
        background: #ffebee;
        color: #b71c1c;
        border: 1px solid #b71c1c;
        padding: 4px 6px;
        font-size: 11px;
        font-weight: bold;
    }

    .transfer-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 4px;
    }

    /* Guide & Arcade Modals */
    .guide-window {
        width: 580px;
        max-width: 94vw;
    }

    .guide-intro {
        font-size: 12px;
        margin: 0 0 8px 0;
        line-height: 1.4;
    }

    .guide-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .guide-card {
        background: #dfdfdf;
        border: 1px solid #808080;
        padding: 7px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 5px;
        font-size: 11px;
    }

    .guide-card p {
        margin: 0;
        color: #222222;
        line-height: 1.3;
    }

    .guide-card-title {
        font-weight: bold;
        color: #000080;
        font-size: 12px;
    }

    .arcade-window {
        width: 400px;
        max-width: 94vw;
    }

    .arcade-hud-top {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-bottom: 6px;
    }

    .arcade-screen {
        position: relative;
        width: 100%;
        height: 230px;
        background: linear-gradient(180deg, #050518 0%, #1a0933 100%);
        border: 2px inset #808080;
        overflow: hidden;
        cursor: ew-resize;
    }

    .arcade-falling-item {
        position: absolute;
        font-size: 20px;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    .arcade-catcher {
        position: absolute;
        bottom: 8px;
        font-size: 26px;
        transform: translateX(-50%);
        pointer-events: none;
    }

    .arcade-controls-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 6px;
        font-size: 11px;
        gap: 8px;
    }

    /* Mobile Virtual Joystick & PTT */
    .touch-joystick-zone {
        position: absolute;
        bottom: 14px;
        left: 14px;
        width: 90px;
        height: 90px;
        z-index: 5;
        touch-action: none;
    }

    .joystick-base {
        width: 82px;
        height: 82px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.4);
        border: 2px solid rgba(255, 255, 255, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .joystick-knob {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #008080;
        border: 2px solid #00ffff;
        pointer-events: none;
    }

    .mobile-ptt-btn {
        position: absolute;
        bottom: 14px;
        right: 14px;
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: #000080;
        border: 2px solid #c0c0c0;
        color: #ffffff;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 6;
    }

    .mobile-ptt-btn.active {
        background: #008000;
        border-color: #00ff00;
    }

    .ptt-icon {
        font-size: 22px;
    }

    .ptt-label {
        font-size: 8px;
        font-weight: bold;
    }

    /* Bottom Action Bar */
    .mmo-action-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 8px;
        background: #c0c0c0;
        border-top: 2px solid #ffffff;
        flex-shrink: 0;
    }

    .dance-cycle-btn {
        font-weight: bold;
        background: #000080;
        color: #ffffff;
        white-space: nowrap;
    }

    .quick-emotes {
        display: flex;
        gap: 3px;
    }

    .chat-form {
        display: flex;
        flex: 1;
        gap: 5px;
    }

    .chat-input {
        flex: 1;
        padding: 4px 6px;
        font-size: 12px;
    }

    .desktop-ptt-hint {
        font-size: 10px;
        color: #333333;
        white-space: nowrap;
    }

    /* Windows 98 Controls */
    .win98-btn {
        background: #c0c0c0;
        border: none;
        box-shadow: inset -1px -1px 0px #000000, inset 1px 1px 0px #ffffff, inset -2px -2px 0px #808080;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        font-family: inherit;
        color: #000000;
    }

    .win98-btn:active {
        box-shadow: inset 1px 1px 0px #000000, inset -1px -1px 0px #ffffff;
    }

    .win98-input {
        background: #ffffff;
        border: none;
        box-shadow: inset 1px 1px 0px #808080, inset -1px -1px 0px #ffffff, inset 2px 2px 0px #000000;
        outline: none;
        font-family: inherit;
    }

    .modal-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
    }

    .win98-window {
        background: #c0c0c0;
        border: 2px solid #ffffff;
        box-shadow: inset -1px -1px 0px #000000, inset 1px 1px 0px #dfdfdf, 3px 3px 10px rgba(0, 0, 0, 0.8);
    }

    .win98-title-bar {
        background: linear-gradient(90deg, #000080, #1084d0);
        color: #ffffff;
        padding: 3px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        font-size: 12px;
    }

    .win98-close {
        background: #c0c0c0;
        border: 1px solid #000000;
        font-weight: bold;
        cursor: pointer;
        padding: 0 5px;
    }

    .win98-body {
        padding: 10px;
        color: #000000;
    }

    /* Graffiti & DJ Modals */
    .graffiti-window {
        width: 420px;
        max-width: 94vw;
    }

    .graffiti-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .palette-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        max-width: 240px;
    }

    .color-swatch {
        width: 16px;
        height: 16px;
        border: 1px solid #000000;
        cursor: pointer;
    }

    .color-swatch.selected {
        outline: 2px solid #ffffff;
    }

    .brush-size-row {
        display: flex;
        gap: 4px;
    }

    .tool-btn.active-tool {
        background: #000080;
        color: #ffffff;
    }

    .canvas-paint-wrapper {
        display: flex;
        justify-content: center;
        background: #000000;
        border: 2px inset #808080;
    }

    .graffiti-interactive-canvas {
        width: 384px;
        height: 256px;
        image-rendering: pixelated;
        cursor: crosshair;
    }

    .graffiti-footer {
        margin-top: 6px;
        font-size: 11px;
        text-align: center;
    }

    .dj-window {
        width: 500px;
        max-width: 96vw;
    }

    .dj-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .dj-turntable-deck {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: linear-gradient(135deg, #0b0719 0%, #170b32 50%, #091d2b 100%);
        border: 2px inset #808080;
        padding: 10px 12px;
        color: #ffffff;
    }

    .vinyl-platter {
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background: radial-gradient(circle, #222 0%, #090909 55%, #2b2b2b 58%, #070707 100%);
        border: 2px solid #00ffff;
        box-shadow: 0 0 10px rgba(0, 255, 255, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .vinyl-platter.spinning {
        animation: spinVinyl 2.8s linear infinite;
    }

    @keyframes spinVinyl {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .vinyl-grooves {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 1px dashed rgba(255, 0, 170, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .vinyl-center {
        font-size: 20px;
    }

    .dj-center-mixer {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 4px;
        min-width: 0;
    }

    .dj-now-playing-tag {
        font-size: 9px;
        font-weight: bold;
        color: #00ff88;
        letter-spacing: 0.6px;
    }

    .dj-active-title {
        font-size: 13px;
        font-weight: bold;
        color: #ffffff;
        text-shadow: 0 0 6px #ff00aa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .dj-active-meta {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 4px;
        font-size: 10px;
        color: #b0e0e6;
    }

    .dj-artist-name {
        color: #ffd700;
        font-weight: bold;
    }

    .dj-bpm-badge {
        background: rgba(0, 255, 255, 0.16);
        border: 1px solid rgba(0, 255, 255, 0.45);
        padding: 0 4px;
        border-radius: 2px;
        color: #00ffff;
        font-family: monospace;
    }

    .dj-eq-bars {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 3px;
        height: 22px;
        margin: 2px 0;
    }

    .eq-bar {
        width: 6px;
        height: 18px;
        background: linear-gradient(180deg, #ff00aa 0%, #00ffff 55%, #00ff88 100%);
        transform-origin: bottom;
        animation: eqBounce 0.55s ease-in-out infinite alternate;
    }

    .dj-eq-bars.paused .eq-bar {
        animation: none;
        transform: scaleY(0.2);
        opacity: 0.45;
    }

    @keyframes eqBounce {
        0% {
            transform: scaleY(0.22);
        }
        50% {
            transform: scaleY(0.95);
        }
        100% {
            transform: scaleY(0.45);
        }
    }

    .dj-transport-row {
        margin-top: 2px;
    }

    .dj-play-toggle {
        font-size: 10px;
        font-weight: bold;
        padding: 2px 10px;
    }

    .genre-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .dj-track-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 250px;
        overflow-y: auto;
        background: #10121e;
        padding: 5px;
        border: 2px inset #808080;
    }

    .track-select-btn {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        font-weight: bold;
        background: #1c2033;
        color: #e8eaf6;
    }

    .track-left {
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
        min-width: 0;
    }

    .track-text-col {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .track-title-str {
        font-size: 11px;
        font-weight: bold;
        color: #ffffff;
    }

    .track-sub-str {
        font-size: 9px;
        font-weight: normal;
        color: #9fa8da;
    }

    .track-right {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .track-bpm {
        font-size: 10px;
        font-family: monospace;
        color: #ffd700;
    }

    .genre-pill {
        background: #000080;
        color: #ffff00;
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 2px;
        min-width: 58px;
        text-align: center;
        flex-shrink: 0;
    }

    .genre-pill.genre-lofi {
        background: #4a148c;
        color: #ffb74d;
    }
    .genre-pill.genre-synthwave {
        background: #880e4f;
        color: #00ffff;
    }
    .genre-pill.genre-house {
        background: #0d47a1;
        color: #ffff00;
    }
    .genre-pill.genre-techno {
        background: #1b5e20;
        color: #76ff03;
    }
    .genre-pill.genre-dnb {
        background: #b71c1c;
        color: #ffffff;
    }
    .genre-pill.genre-chiptune {
        background: #e65100;
        color: #fff59d;
    }
    .genre-pill.genre-classical {
        background: #3e2723;
        color: #ffd700;
    }
    .genre-pill.genre-ambient {
        background: #004d40;
        color: #a7ffeb;
    }

    .track-select-btn.active-track {
        background: linear-gradient(90deg, #004d40, #1a237e);
        color: #00ff88;
        outline: 1px solid #00ffff;
    }

    /* --- SLEEK TOP BAR DROPDOWN, 3D DICE, ROULETTE WHEEL & LSD CRASH STAGE --- */
    .online-inline {
        margin-left: 4px;
        padding-left: 5px;
        border-left: 1px solid rgba(255, 255, 255, 0.25);
        font-size: 10px;
        color: #80ffaa;
    }

    .travel-dropdown-wrap {
        position: relative;
    }

    .map-menu-btn {
        font-weight: bold;
        padding: 2px 7px;
        background: #d4d0c8;
    }

    .travel-popover {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        width: 165px;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 60;
    }

    .travel-item {
        background: #dfdfdf;
        border: 1px solid transparent;
        padding: 5px 8px;
        text-align: left;
        font-size: 11px;
        font-weight: bold;
        font-family: inherit;
        cursor: pointer;
        color: #000000;
    }

    .travel-item:hover {
        background: #000080;
        color: #ffff00;
    }

    .travel-item.woods-item {
        border-top: 1px solid #808080;
        color: #1b5e20;
    }

    .travel-item.woods-item:hover {
        background: #1b5e20;
        color: #ffffff;
    }

    .dj-open-btn {
        background: #311b92;
        color: #00ffff;
        font-weight: bold;
        padding: 2px 7px;
    }

    .icon-only-btn {
        padding: 2px 6px;
        font-size: 11px;
    }

    .hud-payout-tag {
        background: rgba(0, 0, 0, 0.45);
        color: #ffd700;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 2px;
        border: 1px solid rgba(255, 215, 0, 0.5);
    }

    /* 3D Visual Craps Dice Arena */
    .dice-arena-box {
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        gap: 6px;
        background: radial-gradient(circle at 50% 50%, #0d4228 0%, #062315 100%);
        border: 2px inset #808080;
        padding: 8px;
        color: #ffffff;
    }

    .dice-fighter-card {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 6px;
        border-radius: 3px;
    }

    .dice-fighter-card.winner-glow {
        border-color: #ffd700;
        box-shadow: inset 0 0 10px rgba(255, 215, 0, 0.45);
        background: rgba(255, 215, 0, 0.14);
    }

    .fighter-header {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        font-weight: bold;
    }

    .fighter-name {
        color: #e0f7fa;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 85px;
    }

    .fighter-sum {
        background: #000000;
        color: #ffd700;
        font-size: 13px;
        font-family: monospace;
        padding: 1px 6px;
        border: 1px solid #ffd700;
        border-radius: 2px;
    }

    .dice-pair-row {
        display: flex;
        gap: 8px;
        margin: 2px 0;
    }

    .visual-die-3d {
        width: 42px;
        height: 42px;
        background: linear-gradient(135deg, #ffffff 0%, #e6e9f0 100%);
        border: 2px solid #111111;
        border-radius: 6px;
        box-shadow:
            inset -2px -2px 0px #b0b8c8,
            inset 2px 2px 0px #ffffff,
            2px 3px 5px rgba(0, 0, 0, 0.65);
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);
        padding: 5px;
        place-items: center;
    }

    .visual-die-3d.dealer-die {
        background: linear-gradient(135deg, #fff8e1 0%, #ffe082 100%);
        border-color: #5d4037;
    }

    .visual-die-3d.shaking {
        animation: dieTumble 0.14s linear infinite;
    }

    @keyframes dieTumble {
        0% {
            transform: rotate(-10deg) scale(1.04);
        }
        50% {
            transform: rotate(10deg) translateY(-2px);
        }
        100% {
            transform: rotate(-6deg) scale(0.98);
        }
    }

    .die-pip {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: transparent;
    }

    .player-die .die-pip.pip-on {
        background: #111111;
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3);
    }

    .dealer-die .die-pip.pip-on {
        background: #b71c1c;
    }

    .fighter-rounds {
        display: flex;
        gap: 3px;
        flex-wrap: wrap;
        justify-content: center;
    }

    .mini-r-chip {
        font-size: 9px;
        padding: 1px 4px;
        background: rgba(255, 255, 255, 0.1);
        color: #b0bec5;
        border-radius: 2px;
    }

    .mini-r-chip.filled {
        background: rgba(0, 255, 136, 0.22);
        color: #ffffff;
        font-weight: bold;
    }

    .dice-vs-divider {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: bold;
        color: #ffd700;
        padding: 0 2px;
    }

    .dice-result-banner {
        background: #263238;
        color: #ffffff;
        font-weight: bold;
        font-size: 11px;
        text-align: center;
        padding: 5px;
        border: 1px solid #90a4ae;
    }

    .dice-result-banner.win {
        background: #004d40;
        color: #ffff00;
        border-color: #00ff88;
    }

    /* Meme Roulette Wheel Banner */
    .roulette-wheel-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(90deg, #140826, #0b2438);
        border: 2px inset #808080;
        padding: 6px 8px;
        color: #ffffff;
    }

    .wheel-disc-wrap {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: radial-gradient(circle, #ffd700 0%, #b71c1c 60%, #111 100%);
        border: 2px solid #ffd700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .wheel-disc {
        font-size: 22px;
        line-height: 1;
        transition: transform 0.08s linear;
    }

    .wheel-info-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 11px;
    }

    .spinning-badge {
        color: #00ffff;
        font-weight: bold;
    }

    .wheel-history-row {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: #b0bec5;
    }

    .hist-pip {
        font-size: 13px;
    }

    .slot-paytable-strip {
        display: flex;
        justify-content: space-around;
        background: #1a102c;
        color: #ffd700;
        font-size: 10px;
        font-weight: bold;
        padding: 3px 6px;
        border: 1px solid #4a148c;
    }

    /* Rocket Crash LSD Trip Stage */
    .crash-history-pills {
        display: flex;
        gap: 3px;
    }

    .ch-tag {
        font-size: 9px;
        padding: 1px 4px;
        background: rgba(183, 28, 28, 0.85);
        color: #ffffff;
        border-radius: 2px;
        font-family: monospace;
    }

    .ch-tag.high {
        background: rgba(0, 122, 61, 0.9);
        color: #ffff80;
    }

    .crash-lsd-stage {
        position: relative;
        width: 100%;
        height: 148px;
        background: radial-gradient(circle at 30% 70%, #12072b 0%, #05030d 100%);
        border: 2px inset #808080;
        overflow: hidden;
    }

    .crash-lsd-stage.tripping {
        filter: hue-rotate(var(--lsd-hue, 0deg)) saturate(var(--lsd-sat, 1.5));
        animation: lsdJitter 0.12s infinite alternate;
    }

    .crash-lsd-stage.crashed {
        background: radial-gradient(circle at 50% 50%, #6a001d 0%, #1a0006 100%);
        filter: none;
    }

    @keyframes lsdJitter {
        0% {
            transform: translate(calc(var(--shake-px, 0px) * -1), calc(var(--shake-px, 0px) * 0.5));
        }
        100% {
            transform: translate(var(--shake-px, 0px), calc(var(--shake-px, 0px) * -0.5));
        }
    }

    .lsd-kaleidoscope-bg {
        position: absolute;
        inset: -30%;
        background: conic-gradient(
            from 0deg,
            rgba(255, 0, 128, 0.18),
            rgba(0, 255, 255, 0.18),
            rgba(255, 235, 59, 0.18),
            rgba(118, 255, 3, 0.18),
            rgba(213, 0, 249, 0.18),
            rgba(255, 0, 128, 0.18)
        );
        opacity: 0.22;
        pointer-events: none;
    }

    .crash-lsd-stage.tripping .lsd-kaleidoscope-bg {
        opacity: 0.78;
        animation: spinKaleidoscope 2.2s linear infinite;
    }

    @keyframes spinKaleidoscope {
        from {
            transform: rotate(0deg) scale(1.1);
        }
        to {
            transform: rotate(360deg) scale(1.35);
        }
    }

    .crash-trajectory-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .crash-rocket-node {
        position: absolute;
        transform: translate(-50%, -50%) rotate(-32deg);
        display: flex;
        align-items: center;
        pointer-events: none;
        transition: left 0.05s linear, top 0.05s linear;
        z-index: 3;
    }

    .crash-rocket-node.boosting {
        filter: drop-shadow(0 0 8px #00ffff);
    }

    .rocket-emoji {
        font-size: 24px;
        line-height: 1;
    }

    .rocket-flame {
        font-size: 16px;
        margin-right: -4px;
        transform: rotate(180deg);
        animation: flamePulse 0.09s infinite alternate;
    }

    @keyframes flamePulse {
        from {
            transform: rotate(180deg) scale(0.85);
        }
        to {
            transform: rotate(180deg) scale(1.3);
        }
    }

    .crash-explosion-node {
        position: absolute;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 4;
    }

    .explosion-emoji {
        font-size: 38px;
        animation: boomPop 0.35s ease-out;
    }

    .explosion-ring {
        position: absolute;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        border: 3px solid #ffeb3b;
        box-shadow: 0 0 18px #ff1744;
        animation: shockwaveExpand 0.6s ease-out infinite;
    }

    @keyframes boomPop {
        0% {
            transform: scale(0.4);
        }
        60% {
            transform: scale(1.35);
        }
        100% {
            transform: scale(1);
        }
    }

    @keyframes shockwaveExpand {
        0% {
            transform: scale(0.4);
            opacity: 1;
        }
        100% {
            transform: scale(1.9);
            opacity: 0;
        }
    }

    .crash-hud-readout {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 2;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
    }

    .crash-lsd-stage .crash-mult {
        font-size: 28px;
        font-weight: bold;
        font-family: monospace;
        color: #00ff88;
        transition: transform 0.08s linear;
    }

    .crash-lsd-stage.crashed .crash-mult {
        color: #ff5252;
    }

    /* --- CYBER MINES 5x5 & 90s RETRO ARCADE CENTER STYLES --- */
    .arcade-open-btn {
        background: linear-gradient(90deg, #4a0e4e, #004d40);
        color: #00ffff;
        font-weight: bold;
    }

    .mines-grid-5x5 {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
        background: #0a0e1a;
        padding: 6px;
        border: 2px inset #808080;
    }

    .arcade-mines-grid {
        max-width: 310px;
        margin: 0 auto;
        width: 100%;
    }

    .mines-cell-btn {
        height: 36px;
        font-size: 15px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        background: #1a2436;
        color: #00ffff;
    }

    .mines-cell-btn.revealed-gem {
        background: #004d40;
        color: #00ff88;
        border-color: #00ff88;
    }

    .mines-cell-btn.revealed-bomb {
        background: #6a001d;
        color: #ffeb3b;
        border-color: #ff1744;
    }

    .arcade-window {
        width: 520px;
        max-width: 96vw;
    }

    .arcade-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .arcade-tabs-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding-bottom: 4px;
        border-bottom: 1px solid #808080;
    }

    .arcade-tab-btn {
        flex: 1 1 auto;
        font-size: 11px;
        padding: 5px 6px;
    }

    .arcade-mode-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        background: #111625;
        color: #e0f7fa;
        padding: 5px 8px;
        border: 2px inset #808080;
        font-size: 11px;
    }

    .arcade-mode-left {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
    }

    .arcade-balance-pill {
        background: #000000;
        color: #ffd700;
        padding: 2px 7px;
        border: 1px solid #ffd700;
        font-weight: bold;
    }

    .arcade-cabinet-panel {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    .arcade-crt-stage {
        position: relative;
        width: 320px;
        height: 222px;
        margin: 0 auto;
        background: radial-gradient(circle at 50% 35%, #160a2c 0%, #070410 100%);
        border: 3px inset #808080;
        overflow: hidden;
        touch-action: none;
        box-shadow: inset 0 0 18px rgba(0, 255, 255, 0.22);
    }

    .snake-stage {
        background-image:
            linear-gradient(rgba(0, 255, 255, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.07) 1px, transparent 1px);
        background-size: 20px 18.5px;
    }

    .arcade-brick {
        position: absolute;
        border: 1px solid rgba(255, 255, 255, 0.75);
        box-shadow: 0 0 5px rgba(255, 255, 255, 0.35);
    }

    .arcade-ball {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 0 8px #00ffff;
    }

    .arcade-paddle {
        position: absolute;
        height: 10px;
        background: linear-gradient(90deg, #00ffff, #ff00aa);
        border: 1px solid #ffffff;
        border-radius: 3px;
        box-shadow: 0 0 8px rgba(0, 255, 255, 0.7);
    }

    .coin-basket {
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: bold;
        color: #000000;
        background: linear-gradient(90deg, #ffd700, #00ff88);
    }

    .falling-coin-item {
        position: absolute;
        font-size: 18px;
        line-height: 1;
        pointer-events: none;
    }

    .snake-segment {
        position: absolute;
        width: 18px;
        height: 16.5px;
        background: #00e676;
        border: 1px solid #004d40;
        border-radius: 2px;
    }

    .snake-segment.snake-head {
        background: #00ffff;
        box-shadow: 0 0 6px #00ffff;
    }

    .snake-food-cell {
        position: absolute;
        width: 20px;
        height: 18.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    }

    .arcade-crt-overlay {
        position: absolute;
        inset: 0;
        background: rgba(6, 4, 18, 0.84);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 14px;
        text-align: center;
        color: #ffffff;
    }

    .crt-title {
        font-size: 15px;
        font-weight: bold;
        color: #00ffff;
        text-shadow: 0 0 8px #ff00aa;
        margin-bottom: 6px;
    }

    .crt-sub {
        font-size: 11px;
        line-height: 1.4;
        color: #e0f7fa;
        margin: 0;
    }

    .arcade-controls-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .snake-dpad {
        display: flex;
        gap: 3px;
    }

    .whack-grid-3x3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        max-width: 310px;
        width: 100%;
        margin: 0 auto;
        background: #090616;
        padding: 8px;
        border: 3px inset #808080;
    }

    .whack-hole-btn {
        height: 58px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        background: #1a162b;
        color: #ffffff;
        font-weight: bold;
    }

    .whack-hole-btn.active-bug {
        background: #004d40;
        color: #00ff88;
    }

    .whack-hole-btn.active-golden {
        background: #4a148c;
        color: #ffd700;
    }

    .whack-hole-btn.active-bomb {
        background: #6a001d;
        color: #ffeb3b;
    }

    .whack-sprite {
        font-size: 20px;
        line-height: 1;
    }

    .whack-empty {
        font-size: 16px;
        opacity: 0.45;
    }

    @media (max-width: 768px) {
        .desktop-ptt-hint {
            display: none;
        }
        .mmo-action-bar {
            flex-wrap: wrap;
            padding: 4px 6px;
            padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
            z-index: 25;
        }
        .guide-grid,
        .my-stats-banner {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
