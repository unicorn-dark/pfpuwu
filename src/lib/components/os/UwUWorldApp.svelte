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
    import { toCompactAvatarUrl } from "$lib/utils/avatar";
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
        MUSEUM_TILES,
        MUSEUM_OBJECTS,
        MUSEUM_COLLISION_MAP,
        MUSEUM_ANIMATED_TILE_COORDS,
        StaticFloorCache,
        drawRichIsometricTile,
        resolveMoveWithSliding,
        getCurrentZone,
        type WorldObject,
        type WorldZone
    } from "$lib/game/isometric/worldMap";
    import MuseumStudioModal from "./MuseumStudioModal.svelte";
    import {
        MUSEUM_GALLERY_FEE,
        MUSEUM_PEDESTAL_LOCATIONS,
        isMuseumCuratorAdmin,
        createEmptyMuseumState,
        loadMuseumState,
        saveArtworkToPersonalVault,
        exhibitArtworkOnSpot,
        submitArtworkToCuratorQueue,
        curatorApproveSubmissionToSpot,
        removeArtworkFromCuratorQueue,
        vacateMuseumSpot,
        deleteArtworkFromPersonalVault,
        toggleMuseumArtworkLike,
        mergeMuseumSnapshots,
        compactMuseumSnapshotForNetwork,
        loadLocalPersonalVault,
        getCachedPedestalArtworkCanvas,
        findPlayerActiveSpot,
        isValidArtworkItem,
        type ArtworkItem,
        type MuseumStateSnapshot
    } from "$lib/game/activities/museumArt";
    import { findPath, type Point } from "$lib/game/isometric/pathfinding";
    import { preloadIsoAssets, drawIsoObjectSprite } from "$lib/game/isometric/isoAssetLoader";
    import {
        renderPlayerAvatar,
        getCachedAvatarImage,
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
        loadActiveWishLanterns,
        saveNewWishLantern,
        toggleWishLanternGlow,
        formatLanternTimeRemaining,
        WISH_LANTERN_TTL_MS,
        loadArcadeLeaderboards,
        submitArcadeHighScore,
        mergeArcadeLeaderboardMaps,
        type PlayerEconomyStats,
        type WishLanternRecord,
        type LanternColor,
        type ArcadeScoreGameId,
        type ArcadeLeaderboardMap
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
    const museumFloorCache = new StaticFloorCache();

    // Active World Zone ('casino' | 'forest' | 'museum')
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
    let showMuseumModal = $state(false);
    let museumModalTab = $state<"inspect" | "studio" | "vault" | "queue">("inspect");
    let activeMuseumSpot = $state(1);
    let museumState = $state<MuseumStateSnapshot>(createEmptyMuseumState());

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
    let hasPendingReadyEscrow = $state(false);
    const settledDiceMatchIds = new Set<string>();

    // Reactive Svelte 5 Mirrors for Craps Dice Duel
    let dicePhaseState = $state<DiceGamePhase>("idle");
    let diceModeState = $state<"solo_dealer" | "pvp">("solo_dealer");
    let diceRoundState = $state(0);
    let diceTurnIndexState = $state(0);
    let diceActiveRollerIdState = $state<string | null>(null);
    let diceLastRollerIdState = $state<string | null>(null);
    let diceLastSummaryState = $state<string>(diceManager.lastRollSummary);
    let dicePotAmountState = $state(180);
    let diceScoresState = $state<PlayerScore[]>([]);
    let diceWinnerIdState = $state<string | null>(null);
    let diceWinnerIdsState = $state<string[]>([]);
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

    // --- 90s RETRO ARCADE CENTER STATE (Hardcore Base Difficulty + Persistent High Score Boards) ---
    type ArcadeGameId = "mines" | "brick" | "snake" | "coin" | "whack";
    let activeArcadeTab = $state<ArcadeGameId>("brick");
    let arcadePlayMode = $state<"free" | "token">("free");
    const ARCADE_TOKEN_COST = 100;
    const ARCADE_TOKEN_PAYOUT = 200; // 2.0x skill challenge reward for beating hardcore arcade targets
    let arcadeBestScores = $state<Record<ArcadeGameId, number>>({
        mines: 0,
        brick: 0,
        snake: 0,
        coin: 0,
        whack: 0
    });
    let arcadeLeaderboards = $state<ArcadeLeaderboardMap>({
        brick: [],
        snake: [],
        coin: [],
        whack: []
    });

    // Arcade Game 2: Neon Brick Breaker (Hardcore Arkanoid: 48px paddle, fast ball, armored top row)
    interface ArcadeBrick {
        x: number;
        y: number;
        w: number;
        h: number;
        color: string;
        pts: number;
        hp: number;
        alive: boolean;
    }
    let brickPhase = $state<"idle" | "playing" | "won" | "lost">("idle");
    let brickScore = $state(0);
    let brickLives = $state(3);
    let brickPaddleX = $state(136);
    const BRICK_PADDLE_WIDTH = 48;
    let brickBall = $state({ x: 160, y: 190, vx: 4.1, vy: -4.4 });
    let brickList = $state<ArcadeBrick[]>([]);
    let brickTimerId: number | null = null;
    const BRICK_TARGET_SCORE = 600;

    // Arcade Game 3: Cyber Snake 1998 (Fast 78ms tick + Glitch Firewall Obstacles)
    let snakePhase = $state<"idle" | "playing" | "won" | "lost">("idle");
    let snakeScore = $state(0);
    let snakeBody = $state<Array<{ x: number; y: number }>>([
        { x: 8, y: 6 },
        { x: 7, y: 6 },
        { x: 6, y: 6 }
    ]);
    let snakeHazards = $state<Array<{ x: number; y: number }>>([
        { x: 3, y: 2 },
        { x: 12, y: 2 },
        { x: 3, y: 9 },
        { x: 12, y: 9 },
        { x: 8, y: 3 },
        { x: 8, y: 9 }
    ]);
    let snakeDir = $state<{ x: number; y: number }>({ x: 1, y: 0 });
    let snakeNextDir = { x: 1, y: 0 };
    let snakeFood = $state<{ x: number; y: number; kind: "orb" | "unicorn" }>({ x: 12, y: 6, kind: "orb" });
    let snakeTimerId: number | null = null;
    const SNAKE_TARGET_SCORE = 450;

    // Arcade Game 4: Cyber Coin Rush (High-Speed 25s Rain Catcher)
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
    let coinBasketX = $state(137);
    const COIN_BASKET_WIDTH = 46;
    let coinItems = $state<FallingArcadeItem[]>([]);
    let coinTimerId: number | null = null;
    let coinCountdownId: number | null = null;
    const COIN_TARGET_SCORE = 500;

    // Arcade Game 5: Whack-A-Glitch (High-Speed 20s 3x3 Cyber Terminal Reflex)
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
    const WHACK_TARGET_SCORE = 480;

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

    // 4. Wild Firefly Hunting, Net Catcher Minigame & 24-Hour Sky Wish Lantern Sanctuary
    interface WildFirefly {
        id: number;
        anchorX: number;
        anchorY: number;
        x: number;
        y: number;
        phase: number;
        speed: number;
        color: string;
        respawnUntil: number;
    }
    let wildFireflies: WildFirefly[] = [
        { id: 1, anchorX: 20.9, anchorY: 22.1, x: 20.9, y: 22.1, phase: 0.2, speed: 1.3, color: "#ccff66", respawnUntil: 0 },
        { id: 2, anchorX: 23.1, anchorY: 22.1, x: 23.1, y: 22.1, phase: 1.8, speed: 1.5, color: "#ffd700", respawnUntil: 0 },
        { id: 3, anchorX: 21.0, anchorY: 23.9, x: 21.0, y: 23.9, phase: 3.4, speed: 1.4, color: "#00ffcc", respawnUntil: 0 },
        { id: 4, anchorX: 23.1, anchorY: 23.9, x: 23.1, y: 23.9, phase: 4.9, speed: 1.6, color: "#ccff66", respawnUntil: 0 }
    ];
    let activeWildFireflyId = $state<number | null>(null);
    let fireflyJarCount = $state(0);

    // Interactive Firefly Net Catcher Minigame State
    let showFireflyCatcherModal = $state(false);
    let catcherPhase = $state<"idle" | "playing" | "won" | "escaped">("idle");
    let catcherHits = $state(0);
    const CATCHER_REQUIRED_HITS = 3;
    let catcherTimeLeft = $state(10);
    let catcherNetPos = $state({ x: 160, y: 105 });
    let catcherSwingCooldownUntil = $state(0);
    let catcherSwingAnimUntil = $state(0);
    let catcherStatusMsg = $state("Move your net over the darting firefly and click / press SPACE to swing!");
    let catcherTarget = $state({
        x: 160,
        y: 95,
        vx: 4.2,
        vy: 3.1,
        isSweetSpot: false,
        nextBurstAt: 0
    });
    let catcherDecoys = $state<Array<{ id: number; x: number; y: number; vx: number; vy: number; icon: string }>>([]);
    let catcherTimerId: number | null = null;
    let catcherCountdownId: number | null = null;

    // 24-Hour Persistent Sky Wish Lanterns State
    let showLanternModal = $state(false);
    let wishLanterns = $state<WishLanternRecord[]>([]);
    let selectedLanternColor = $state<LanternColor>("gold");
    let fireflyWishInput = $state("");
    let isReleasingLantern = $state(false);
    const LANTERN_COLOR_OPTIONS: Array<{ id: LanternColor; label: string; hex: string; border: string }> = [
        { id: "gold", label: "🏮 Amber Gold", hex: "#ffd700", border: "#ff9900" },
        { id: "sakura", label: "🌸 Sakura Pink", hex: "#ff80bf", border: "#ff3399" },
        { id: "cyan", label: "💎 Moonlit Cyan", hex: "#00e5ff", border: "#0099cc" },
        { id: "emerald", label: "🌿 Forest Glow", hex: "#66ff99", border: "#00cc66" },
        { id: "violet", label: "🔮 Mystic Violet", hex: "#cc88ff", border: "#9933ff" }
    ];

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
        diceModeState = diceManager.mode;
        diceRoundState = diceManager.currentRound;
        diceTurnIndexState = diceManager.currentTurnIndex;
        diceActiveRollerIdState = diceManager.activeRollerId;
        diceLastRollerIdState = diceManager.lastRollerId;
        diceLastSummaryState = diceManager.lastRollSummary;
        dicePotAmountState = diceManager.potAmount || Math.round(selectedWager * 1.8);
        diceScoresState = Array.from(diceManager.scores.values()).map((s) => ({
            ...s,
            currentDice: [...s.currentDice] as [number, number],
            roundRolls: [...s.roundRolls],
            roundDicePairs: (s.roundDicePairs || []).map((pair) => [...pair] as [number, number])
        }));
        diceWinnerIdState = diceManager.winnerId;
        diceWinnerIdsState = [...diceManager.winnerIds];
        diceWinnerNameState = diceManager.winnerName;
        diceSeatsState = diceManager.seats.map((s) => ({ ...s }));
        const idx = diceManager.getSeatedPlayerSeat(myId);
        myDiceSeatIndex = idx;
        isSeatedAtDiceTable = idx !== -1;
        amIReady = idx !== -1 ? diceManager.seats[idx].isReady : false;
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") {
            hasPendingReadyEscrow = false;
        }
    }

    function settleFinishedDiceDuelIfNeeded() {
        if (diceManager.phase !== "finished" || !diceManager.matchId) return;
        if (settledDiceMatchIds.has(diceManager.matchId)) return;
        settledDiceMatchIds.add(diceManager.matchId);
        hasPendingReadyEscrow = false;

        const amInMatch = diceManager.scores.has(myId);
        if (!amInMatch) return;

        const winnerIds = diceManager.winnerIds.length > 0
            ? diceManager.winnerIds
            : diceManager.winnerId
            ? [diceManager.winnerId]
            : [];

        if (winnerIds.includes(myId)) {
            triggerConfettiCelebration();
            synth.playWinFanfare();
            hasHighRollerCrown = true;
            const pot = diceManager.potAmount || Math.round(activeDiceWager * 1.8);
            const share = Math.round(pot / Math.max(1, winnerIds.length));
            recordGameOutcome(share, "win", share - activeDiceWager);
            if (winnerIds.length > 1) {
                showToast(`🤝 TIE WINNER! You split the pot for +${share} $UWU!`, 7000);
            } else {
                showToast(`👑 YOU WON THE DICE DUEL! Payout: +${share} $UWU!`, 7500);
            }
        } else {
            recordGameOutcome(0, "loss", 0);
            showToast(
                `🎲 ${diceManager.winnerName || "Opponent"} won the Dice Duel (${diceManager.scores.get(diceManager.winnerId || "")?.totalSum || 0} pts)!`,
                5500
            );
        }
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
            avatar_url: toCompactAvatarUrl($userProfile?.avatar_url, $userProfile?.avatar_traits),
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

    async function handleWorldXLogin(flow: "oauth1" | "authorize" | "force" | "oauth2" = "oauth1") {
        isLoggingInWithX = true;
        const res = await loginWithX(flow);
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

    let hasLoadedInitialWorldData = false;

    function ensureInitialWorldDataLoaded(username = "") {
        if (hasLoadedInitialWorldData) {
            if (username) {
                const personalVault = loadLocalPersonalVault(username);
                if (Object.keys(personalVault).length > 0) {
                    museumState = mergeMuseumSnapshots(museumState, {
                        spots: {},
                        pendingQueue: [],
                        artworksById: personalVault
                    });
                }
            }
            return;
        }
        hasLoadedInitialWorldData = true;

        loadSavedGraffitiWall().then((savedDataUrl) => {
            if (savedDataUrl) {
                applyGraffitiDataUrl(savedDataUrl);
            }
        });
        loadActiveWishLanterns().then((lanterns) => {
            wishLanterns = lanterns;
        });
        loadMuseumState(username).then((mState) => {
            museumState = mState;
        });
        loadArcadeLeaderboards().then((boards) => {
            arcadeLeaderboards = boards;
            const myClean = (username || myUsername).replace(/^@/, "").toLowerCase();
            if (myClean) {
                for (const gKey of ["brick", "snake", "coin", "whack"] as const) {
                    const mine = boards[gKey]?.find((e) => e.username.toLowerCase() === myClean);
                    if (mine && mine.score > arcadeBestScores[gKey]) {
                        arcadeBestScores = { ...arcadeBestScores, [gKey]: mine.score };
                    }
                }
            }
        });
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
        const avatarUrl = toCompactAvatarUrl(profile.avatar_url, profile.avatar_traits);

        ensureInitialWorldDataLoaded(myUsername);
        try {
            const savedJar = localStorage.getItem(`pfpuwu_firefly_jar_${myUsername.toLowerCase()}`);
            if (savedJar !== null) {
                fireflyJarCount = Math.max(0, parseInt(savedJar, 10) || 0);
            }
        } catch {}

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
                if (payload.lantern) {
                    const exists = wishLanterns.some((l) => l.id === payload.lantern.id);
                    if (!exists) {
                        wishLanterns = [payload.lantern, ...wishLanterns].slice(0, 50);
                    }
                }
                showToast(`🏮 @${payload.user} released a 24h Sky Wish Lantern at the Shrine!`, 4500);
            } else if (payload.kind === "lantern_glow") {
                if (payload.lanternId && payload.user) {
                    const u = String(payload.user).replace(/^@/, "").toLowerCase();
                    wishLanterns = wishLanterns.map((l) => {
                        if (l.id !== payload.lanternId) return l;
                        const has = l.likes.includes(u);
                        return {
                            ...l,
                            likes: has ? l.likes.filter((x) => x !== u) : [...l.likes, u]
                        };
                    });
                }
            } else if (payload.kind === "arcade_highscore") {
                if (payload.gameId && payload.entry) {
                    const gId = payload.gameId as ArcadeScoreGameId;
                    arcadeLeaderboards = mergeArcadeLeaderboardMaps(arcadeLeaderboards, {
                        [gId]: [payload.entry]
                    });
                    if (payload.isRecord) {
                        showToast(
                            `🕹️ NEW ARCADE #1 RECORD: @${payload.entry.username} scored ${payload.entry.score} PTS on ${payload.gameLabel || gId}!`,
                            5500
                        );
                    }
                }
            }
        };
        networkManager.onMuseumEventReceived = (payload) => {
            if (!payload) return;
            if (payload.snapshot) {
                museumState = mergeMuseumSnapshots(museumState, payload.snapshot);
            }
            if (payload.kind === "exhibit_published" && payload.user) {
                showToast(
                    `🏛️ @${payload.user} exhibited "${payload.title || "Artwork"}" on Spot #${payload.spotNumber}!`,
                    5000
                );
            } else if (payload.kind === "curator_approved" && payload.user) {
                showToast(
                    `👑 Curator @0xsha3 exhibited @${payload.user}'s "${payload.title || "Artwork"}" on Spot #${payload.spotNumber}!`,
                    5500
                );
            } else if (payload.kind === "queue_submitted" && payload.user) {
                showToast(
                    `⏳ @${payload.user} submitted "${payload.title || "Artwork"}" to the Museum Curator Queue!`,
                    4500
                );
            } else if (payload.kind === "exhibit_applauded" && payload.user) {
                showToast(
                    `❤️ @${payload.user} applauded "${payload.title || "an artwork"}" in the Museum!`,
                    3500
                );
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
        networkManager.onDiceStateSync = (snapshot) => {
            const { isNewRoll, justFinished } = diceManager.applySnapshot(snapshot);
            diceTick++;
            syncDiceReactiveState();
            if (isNewRoll) {
                synth.playDiceRollSfx();
                triggerDiceShakeAnim();
            }
            if (justFinished) {
                settleFinishedDiceDuelIfNeeded();
            }
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
            diceManager.phase = "finished";
            diceManager.winnerId = winner.id;
            diceManager.winnerName = winner.username;
            diceManager.winnerIds = [winner.id];
            diceTick++;
            syncDiceReactiveState();
            settleFinishedDiceDuelIfNeeded();
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
        museumFloorCache.build("museum");
        preloadIsoAssets(() => {
            floorCache.build("casino");
            forestFloorCache.build("forest");
            museumFloorCache.build("museum");
        });
        initPersistentGraffitiCanvas();
        dealerAvatarSrc = getTransparentDealerDataUrl();

        // Load persistent world state once on mount (deduplicated with startAuthenticatedWorldSession)
        ensureInitialWorldDataLoaded(myUsername);

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
            networkManager?.broadcastDiceState(diceManager.getSnapshot());
            networkManager?.broadcastDiceRollRound(round, scores);
        };
        diceManager.onTournamentWon = (winner) => {
            diceTick++;
            syncDiceReactiveState();
            networkManager?.broadcastDiceState(diceManager.getSnapshot());
            networkManager?.broadcastDiceTournamentWon(winner);
            settleFinishedDiceDuelIfNeeded();
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
        stopFireflyCatcherTimers();
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

        // If Firefly Net Catcher Modal is open, route arrow/WASD keys to aim the net and Space/Enter to swing!
        if (showFireflyCatcherModal) {
            const code = e.code;
            const key = e.key.toLowerCase();
            if (code === "ArrowLeft" || code === "KeyA" || key === "a") {
                e.preventDefault();
                catcherNetPos = { ...catcherNetPos, x: Math.max(24, catcherNetPos.x - 22) };
            } else if (code === "ArrowRight" || code === "KeyD" || key === "d") {
                e.preventDefault();
                catcherNetPos = { ...catcherNetPos, x: Math.min(296, catcherNetPos.x + 22) };
            } else if (code === "ArrowUp" || code === "KeyW" || key === "w") {
                e.preventDefault();
                catcherNetPos = { ...catcherNetPos, y: Math.max(24, catcherNetPos.y - 22) };
            } else if (code === "ArrowDown" || code === "KeyS" || key === "s") {
                e.preventDefault();
                catcherNetPos = { ...catcherNetPos, y: Math.min(186, catcherNetPos.y + 22) };
            } else if (code === "Space" || code === "Enter" || key === "e") {
                e.preventDefault();
                if (catcherPhase === "playing") swingFireflyNet();
                else startFireflyCatcherGame();
            }
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
                    brickPaddleX = Math.min(320 - BRICK_PADDLE_WIDTH - 8, brickPaddleX + 24);
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
                    coinBasketX = Math.min(320 - COIN_BASKET_WIDTH - 8, coinBasketX + 24);
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
        } else if (targetZone === "museum") {
            currentTrackId = 9; // Nocturne in Cyber Minor (Classical Gallery Vibe)
            if (isMusicPlaying) synth.playTrack(9);
            loadMuseumState(myUsername).then((mState) => {
                museumState = mState;
            });
            showToast(
                notice ||
                    "🏛️ Entered the UwU Grand Art Museum — Click any of the 25 Pedestals to Inspect or Exhibit 2D & 3D Art!",
                5000
            );
        } else {
            if (currentTrackId >= 9) currentTrackId = 3;
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
        } else if (currentZone === "museum") {
            const nearestPed = getNearestMuseumPedestal(myX, myY, 3.3);
            if (nearestPed) {
                openMuseumSpotInspector(nearestPed.spotNumber, "inspect");
                return;
            }
            openMuseumSpotInspector(activeMuseumSpot || 1, "studio");
            return;
        } else {
            if (activeStation === "fishing") {
                castFishingLine();
                return;
            }
            if (activeStation === "fireflies") {
                if (fireflyJarCount > 0) {
                    openLanternSanctuary();
                } else {
                    openFireflyCatcher(1);
                }
                return;
            }
        }
    }

    function getNearestMuseumPedestal(px: number, py: number, maxDist = 2.8) {
        let best: (typeof MUSEUM_PEDESTAL_LOCATIONS)[number] | null = null;
        let bestDist = Infinity;
        for (const ped of MUSEUM_PEDESTAL_LOCATIONS) {
            const d = gridDistance(px, py, ped.x, ped.y);
            if (d <= maxDist && d < bestDist) {
                bestDist = d;
                best = ped;
            }
        }
        return best;
    }

    function openMuseumSpotInspector(
        spotNumber: number,
        tab: "inspect" | "studio" | "vault" | "queue" = "inspect"
    ) {
        activeMuseumSpot = spotNumber;
        museumModalTab = tab;
        showMuseumModal = true;
        synth.playNatureChimeSfx();
        loadMuseumState(myUsername).then((mState) => {
            museumState = mState;
        });
    }

    async function handleSaveArtworkToVault(artwork: ArtworkItem) {
        if (!myUsername) return;
        const res = await saveArtworkToPersonalVault(artwork, museumState);
        museumState = res.snapshot;
        synth.playNatureChimeSfx();
        showToast(`💾 Saved "${artwork.title}" to your permanent Personal Art Vault!`, 4000);
    }

    async function handleExhibitArtworkOnSpot(artwork: ArtworkItem, spotNumber: number) {
        if (!myUsername) return;
        const isCurator = isMuseumCuratorAdmin(myUsername);
        const currentMySpot = findPlayerActiveSpot(myUsername, museumState);
        const needsFee = !isCurator && currentMySpot === null;

        if (needsFee && !ensureEnoughChips(MUSEUM_GALLERY_FEE)) {
            return;
        }

        const res = await exhibitArtworkOnSpot(artwork, spotNumber, myUsername, museumState);
        if (!res.ok) {
            showToast(`⚠️ ${res.error || "Could not exhibit on this spot."}`, 4500);
            return;
        }

        if (res.chargedFee) {
            recordGameOutcome(-MUSEUM_GALLERY_FEE, "neutral", 0);
        }

        museumState = res.snapshot;
        synth.playWinFanfare();
        triggerConfettiCelebration();
        networkManager?.broadcastMuseumEvent({
            kind: "exhibit_published",
            user: myUsername,
            spotNumber,
            title: artwork.title,
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
        showToast(
            `🏛️ "${artwork.title}" is now exhibited on Museum Pedestal Spot #${spotNumber}!`,
            5500
        );
    }

    async function handleSubmitArtworkToQueue(artwork: ArtworkItem) {
        if (!myUsername) return;
        museumState = await submitArtworkToCuratorQueue(artwork, museumState);
        synth.playNatureChimeSfx();
        networkManager?.broadcastMuseumEvent({
            kind: "queue_submitted",
            user: myUsername,
            title: artwork.title,
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
        showToast(
            `⏳ Submitted "${artwork.title}" to the Undecided Queue for Curator @0xsha3!`,
            5000
        );
    }

    async function handleCuratorApproveToSpot(artworkId: string, spotNumber: number) {
        if (!myUsername) return;
        const res = await curatorApproveSubmissionToSpot(
            artworkId,
            spotNumber,
            myUsername,
            museumState
        );
        if (!res.ok) {
            showToast(`⚠️ ${res.error || "Could not approve submission."}`, 4500);
            return;
        }
        museumState = res.snapshot;
        const approvedArt = museumState.spots[spotNumber];
        synth.playWinFanfare();
        triggerConfettiCelebration();
        networkManager?.broadcastMuseumEvent({
            kind: "curator_approved",
            user: approvedArt?.artistUsername || myUsername,
            spotNumber,
            title: approvedArt?.title || "Artwork",
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
        showToast(
            `👑 Approved & placed "${approvedArt?.title || "Artwork"}" onto Spot #${spotNumber}!`,
            5000
        );
    }

    async function handleRemoveFromCuratorQueue(artworkId: string) {
        if (!myUsername) return;
        museumState = await removeArtworkFromCuratorQueue(artworkId, myUsername, museumState);
        networkManager?.broadcastMuseumEvent({
            kind: "queue_updated",
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
    }

    async function handleVacateMuseumSpot(spotNumber: number) {
        if (!myUsername) return;
        museumState = await vacateMuseumSpot(spotNumber, myUsername, museumState);
        synth.playChipSfx();
        networkManager?.broadcastMuseumEvent({
            kind: "spot_vacated",
            spotNumber,
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
        showToast(
            `📦 Vacated Spot #${spotNumber} — Artwork remains safely in its creator's Personal Art Vault!`,
            4500
        );
    }

    async function handleDeleteArtworkFromVault(artworkId: string) {
        if (!myUsername) return;
        museumState = await deleteArtworkFromPersonalVault(artworkId, myUsername, museumState);
        synth.playChipSfx();
        networkManager?.broadcastMuseumEvent({
            kind: "vault_updated",
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
    }

    async function handleToggleMuseumLike(artworkId: string) {
        if (!myUsername) return;
        const res = await toggleMuseumArtworkLike(artworkId, myUsername, museumState);
        museumState = res.snapshot;
        synth.playNatureChimeSfx();
        const art = museumState.artworksById[artworkId];
        networkManager?.broadcastMuseumEvent({
            kind: "exhibit_applauded",
            user: myUsername,
            title: art?.title,
            snapshot: compactMuseumSnapshotForNetwork(museumState)
        });
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

    // --- 1. TURN-BASED 3-ROUND DICE DUEL ACTIONS (2-4 Player Party PvP & Solo vs House) ---
    function syncLocalPlayerIntoDiceRoster() {
        const myCompactAvatar = toCompactAvatarUrl(
            $userProfile?.avatar_url,
            $userProfile?.avatar_traits
        );
        const allPlayers = [
            {
                id: myId,
                username: myUsername,
                avatarUrl: myCompactAvatar,
                x: myX,
                y: myY
            },
            ...(networkManager?.getRemotePlayers() || [])
        ];
        diceManager.updateOccupants(allPlayers, myId);
        diceTick++;
        syncDiceReactiveState();
    }

    function sitAtDiceSeat(seatIndex: number) {
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") return;
        const seat = diceManager.seats[seatIndex];
        if (!seat) return;

        // Clicking your own seat toggles Ready!
        if (seat.occupant?.id === myId) {
            toggleDicePvPReady();
            return;
        }
        if (seat.occupant && seat.occupant.id !== myId) {
            showToast(`🎲 ${seat.label} is taken by @${seat.occupant.username}!`, 2200);
            return;
        }

        myX = seat.coord.x;
        myY = seat.coord.y;
        activeWaypoints = [];
        diceManager.assignPlayerToSeat(
            {
                id: myId,
                username: myUsername,
                avatarUrl: toCompactAvatarUrl($userProfile?.avatar_url, $userProfile?.avatar_traits)
            },
            seatIndex,
            selectedWager
        );
        synth.playChipSfx();
        diceTick++;
        syncDiceReactiveState();
        networkManager?.broadcastDiceState(diceManager.getSnapshot());
        networkManager?.broadcastDiceSeats(diceManager.seats);
        showToast(`🎲 Seated at ${seat.label}! Click "Ready Up" when your party is set.`, 2500);
    }

    function startInstantSoloDiceDuel() {
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") return;
        if (!hasPendingReadyEscrow) {
            if (!ensureEnoughChips(selectedWager)) return;
            activeDiceWager = selectedWager;
            recordGameOutcome(-activeDiceWager, "neutral", 0);
        }
        hasPendingReadyEscrow = false;

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
        synth.playChipSfx();

        diceManager.startSoloDuelVsHouse(
            {
                id: myId,
                username: myUsername,
                avatarUrl: toCompactAvatarUrl($userProfile?.avatar_url, $userProfile?.avatar_traits)
            },
            activeDiceWager
        );
        diceTick++;
        syncDiceReactiveState();
        // Roll Round 1 immediately on click so the first click throws Round 1 dice right away!
        diceManager.rollForCurrentTurn(myId);
    }

    function toggleDicePvPReady() {
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") return;
        const myCompactAvatar = toCompactAvatarUrl(
            $userProfile?.avatar_url,
            $userProfile?.avatar_traits
        );

        // Auto-seat player onto first available seat if not seated yet
        if (!diceManager.isPlayerSeated(myId)) {
            const firstOpenIdx = diceManager.seats.findIndex((s) => !s.occupant);
            if (firstOpenIdx === -1) {
                showToast("⚠️ All 4 Party Seats at the Craps Table are currently full!", 3000);
                return;
            }
            const targetSeat = diceManager.seats[firstOpenIdx];
            myX = targetSeat.coord.x;
            myY = targetSeat.coord.y;
            activeWaypoints = [];
            diceManager.assignPlayerToSeat(
                {
                    id: myId,
                    username: myUsername,
                    avatarUrl: myCompactAvatar
                },
                firstOpenIdx,
                selectedWager
            );
        }

        if (!amIReady) {
            if (!ensureEnoughChips(selectedWager)) return;
            activeDiceWager = selectedWager;
            recordGameOutcome(-activeDiceWager, "neutral", 0);
            hasPendingReadyEscrow = true;
            synth.playChipSfx();
        } else if (hasPendingReadyEscrow) {
            // Refund wager escrow if unreadying before the duel starts
            recordGameOutcome(activeDiceWager, "neutral", 0);
            hasPendingReadyEscrow = false;
            synth.playChipSfx();
        }

        amIReady = diceManager.toggleReady(
            myId,
            {
                username: myUsername,
                avatarUrl: myCompactAvatar
            },
            activeDiceWager
        );
        diceTick++;
        syncDiceReactiveState();
        networkManager?.broadcastDiceState(diceManager.getSnapshot());
        networkManager?.broadcastDiceSeats(diceManager.seats);
    }

    function startManualPvPDuel() {
        if (diceManager.phase !== "idle" && diceManager.phase !== "finished") return;
        if (!diceManager.canManualStartPvP()) return;
        const started = diceManager.startPvPDuel(activeDiceWager);
        if (started) {
            synth.playChipSfx();
            diceTick++;
            syncDiceReactiveState();
            networkManager?.broadcastDiceState(diceManager.getSnapshot());
        }
    }

    function rollMyDiceTurn(forceAfk = false) {
        const targetRollerId = forceAfk ? diceManager.activeRollerId || myId : myId;
        const ok = diceManager.rollForCurrentTurn(targetRollerId, forceAfk);
        if (ok) {
            diceTick++;
            syncDiceReactiveState();
            networkManager?.broadcastDiceState(diceManager.getSnapshot());
        }
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
        loadArcadeLeaderboards().then((boards) => {
            arcadeLeaderboards = boards;
        });
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

    async function settleArcadeGameResult(
        gameId: ArcadeGameId,
        finalScore: number,
        targetScore: number,
        gameLabel: string
    ) {
        if (finalScore > arcadeBestScores[gameId]) {
            arcadeBestScores = { ...arcadeBestScores, [gameId]: finalScore };
        }
        if (arcadePlayMode === "token") {
            if (finalScore >= targetScore) {
                recordGameOutcome(ARCADE_TOKEN_PAYOUT, "win", finalScore);
                synth.playWinFanfare();
                triggerConfettiCelebration();
                showToast(
                    `🕹️ ${gameLabel} TARGET BEAT (${finalScore} >= ${targetScore})! Won +${ARCADE_TOKEN_PAYOUT} $UWU (2.0x)!`,
                    6000
                );
            } else {
                recordGameOutcome(0, "loss", finalScore);
                showToast(
                    `🕹️ ${gameLabel} Score: ${finalScore}/${targetScore}. Needed ${targetScore} pts to win the ${ARCADE_TOKEN_PAYOUT} $UWU prize!`,
                    4500
                );
            }
        } else {
            if (finalScore >= targetScore) {
                synth.playWinFanfare();
                showToast(`🕹️ High Score on ${gameLabel}: ${finalScore} pts!`, 3500);
            }
        }

        // Persist to Global Arcade Leaderboard if score > 0
        if (finalScore > 0 && gameId !== "mines" && myUsername) {
            const entry = {
                user_id: myId || myUsername,
                username: myUsername.replace(/^@/, "").toLowerCase(),
                score: Math.round(finalScore),
                updated_at: new Date().toISOString()
            };
            const res = await submitArcadeHighScore(gameId as ArcadeScoreGameId, entry);
            arcadeLeaderboards = res.leaderboards;
            if (res.isNewPersonalBest) {
                networkManager?.broadcastForestEvent({
                    kind: "arcade_highscore",
                    gameId,
                    gameLabel,
                    entry,
                    isRecord: res.isNewGlobalRecord
                });
                if (res.isNewGlobalRecord) {
                    triggerConfettiCelebration();
                    showToast(
                        `👑 NEW #1 ALL-TIME RECORD on ${gameLabel}: ${finalScore} PTS!`,
                        5500
                    );
                }
            }
        }
    }

    // Arcade Game 2: Neon Brick Breaker (Hardcore Arkanoid: 48px paddle, fast ball, armored top row)
    function startBrickBreaker() {
        stopAllArcadeTimers();
        if (!payArcadeEntryIfTokenMode()) return;
        synth.playChipSfx();

        const rowColors = ["#ff0055", "#ff7700", "#ffd700", "#00ff88", "#00ffff"];
        const rowPts = [40, 30, 25, 20, 15];
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
                    hp: r === 0 ? 2 : 1, // Top crimson row is armored (requires 2 hits)
                    alive: true
                });
            }
        }
        brickList = bricks;
        brickScore = 0;
        brickLives = 3;
        brickPaddleX = 136;
        brickBall = { x: 160, y: 185, vx: 3.9 * (Math.random() > 0.5 ? 1 : -1), vy: -4.2 };
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

            // Paddle collision (y = 204..214, width = BRICK_PADDLE_WIDTH = 48)
            const halfPaddle = BRICK_PADDLE_WIDTH / 2;
            if (
                vy > 0 &&
                by >= 198 &&
                by <= 212 &&
                bx >= brickPaddleX - 4 &&
                bx <= brickPaddleX + BRICK_PADDLE_WIDTH + 4
            ) {
                const hitOffset = (bx - (brickPaddleX + halfPaddle)) / halfPaddle; // -1..1
                vx = hitOffset * 4.9;
                vy = -Math.max(4.0, Math.min(5.8, Math.abs(vy) * 1.02));
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
                    if (b.hp > 1) {
                        brickScore += 15;
                        synth.playSlotTickSfx(440);
                        return { ...b, hp: b.hp - 1, color: "#ff66aa" };
                    }
                    brickScore += b.pts;
                    synth.playSlotTickSfx(520 + b.pts * 6);
                    return { ...b, hp: 0, alive: false };
                }
                return b;
            });
            if (hitBrick) brickList = updated;

            if (brickList.every((b) => !b.alive)) {
                brickPhase = "won";
                brickScore += brickLives * 60;
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
                    bx = brickPaddleX + halfPaddle;
                    by = 190;
                    vx = 3.9 * (Math.random() > 0.5 ? 1 : -1);
                    vy = -4.2;
                }
            }

            brickBall = { x: bx, y: by, vx, vy };
        }, 20);
    }

    function handleBrickPointerMove(e: MouseEvent | TouchEvent) {
        const el = e.currentTarget as HTMLElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const relX = ((clientX - rect.left) / rect.width) * 320;
        brickPaddleX = Math.max(8, Math.min(320 - BRICK_PADDLE_WIDTH - 8, relX - BRICK_PADDLE_WIDTH / 2));
    }

    // Arcade Game 3: Cyber Snake 1998 (Fast 78ms tick + Glitch Firewall Obstacles)
    function spawnSnakeFood(currentBody: Array<{ x: number; y: number }>) {
        for (let attempt = 0; attempt < 60; attempt++) {
            const fx = Math.floor(Math.random() * 16);
            const fy = Math.floor(Math.random() * 12);
            const onBody = currentBody.some((seg) => seg.x === fx && seg.y === fy);
            const onHazard = snakeHazards.some((h) => h.x === fx && h.y === fy);
            if (!onBody && !onHazard) {
                snakeFood = { x: fx, y: fy, kind: Math.random() < 0.28 ? "unicorn" : "orb" };
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

            const hitHazard = snakeHazards.some((h) => h.x === nx && h.y === ny);
            if (
                nx < 0 ||
                nx >= 16 ||
                ny < 0 ||
                ny >= 12 ||
                hitHazard ||
                snakeBody.some((s) => s.x === nx && s.y === ny)
            ) {
                snakePhase = snakeScore >= SNAKE_TARGET_SCORE ? "won" : "lost";
                synth.playDiceRollSfx();
                stopAllArcadeTimers();
                settleArcadeGameResult("snake", snakeScore, SNAKE_TARGET_SCORE, "Cyber Snake 1998");
                return;
            }

            const nextBody = [{ x: nx, y: ny }, ...snakeBody];
            if (nx === snakeFood.x && ny === snakeFood.y) {
                const pts = snakeFood.kind === "unicorn" ? 80 : 35;
                snakeScore += pts;
                synth.playSlotTickSfx(snakeFood.kind === "unicorn" ? 760 : 520);
                spawnSnakeFood(nextBody);
            } else {
                nextBody.pop();
            }
            snakeBody = nextBody;
        }, 78);
    }

    // Arcade Game 4: Cyber Coin Rush (Fast-Paced 25s Falling Catcher)
    function startCoinRush() {
        stopAllArcadeTimers();
        if (!payArcadeEntryIfTokenMode()) return;
        synth.playChipSfx();

        coinScore = 0;
        coinTimeLeft = 25;
        coinBasketX = 137;
        coinItems = [];
        coinPhase = "playing";
        let nextItemId = 1;

        coinTimerId = window.setInterval(() => {
            if (coinPhase !== "playing") return;
            if (Math.random() < 0.25) {
                const roll = Math.random();
                let icon = "🪙";
                let pts = 25;
                let isBomb = false;
                if (roll < 0.30) {
                    icon = "💣";
                    pts = -65;
                    isBomb = true;
                } else if (roll < 0.42) {
                    icon = "💀";
                    pts = -95;
                    isBomb = true;
                } else if (roll < 0.64) {
                    icon = "💎";
                    pts = 50;
                } else if (roll < 0.74) {
                    icon = "🦄";
                    pts = 85;
                }
                coinItems = [
                    ...coinItems,
                    {
                        id: nextItemId++,
                        x: 16 + Math.random() * 288,
                        y: -12,
                        vy: 4.5 + Math.random() * 3.1,
                        icon,
                        pts,
                        isBomb
                    }
                ];
            }

            const halfBasket = COIN_BASKET_WIDTH / 2;
            const remaining: FallingArcadeItem[] = [];
            for (const item of coinItems) {
                const ny = item.y + item.vy;
                if (
                    ny >= 184 &&
                    ny <= 214 &&
                    Math.abs(item.x - (coinBasketX + halfBasket)) <= halfBasket + 4
                ) {
                    coinScore = Math.max(0, coinScore + item.pts);
                    if (item.isBomb) synth.playDiceRollSfx();
                    else synth.playSlotTickSfx(540);
                } else if (ny < 226) {
                    remaining.push({ ...item, y: ny });
                }
            }
            coinItems = remaining;
        }, 20);

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
        coinBasketX = Math.max(8, Math.min(320 - COIN_BASKET_WIDTH - 8, relX - COIN_BASKET_WIDTH / 2));
    }

    // Arcade Game 5: Whack-A-Glitch (Fast 20s 3x3 Cyber Terminal Reflex)
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
            const next = whackGrid.map((cell) =>
                cell.expiresAt > 0 && now > cell.expiresAt ? { kind: "empty" as const, expiresAt: 0 } : cell
            );
            const emptyIndices = next.map((c, idx) => (c.kind === "empty" ? idx : -1)).filter((idx) => idx !== -1);
            if (emptyIndices.length > 0 && Math.random() < 0.78) {
                const pickIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
                const r = Math.random();
                const kind: GlitchCell["kind"] = r < 0.34 ? "bomb" : r < 0.56 ? "golden" : "bug";
                next[pickIdx] = { kind, expiresAt: now + 590 };
            }
            whackGrid = next;
        }, 185);

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
            whackScore = Math.max(0, whackScore - 65);
            synth.playDiceRollSfx();
        } else if (cell.kind === "golden") {
            whackScore += 70;
            synth.playSlotTickSfx(780);
        } else {
            whackScore += 35;
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

    // --- INTERACTIVE WILD FIREFLY NET CATCHER MINIGAME & 24-HOUR SKY WISH LANTERNS ---
    function persistFireflyJarCount(nextCount: number) {
        fireflyJarCount = Math.max(0, nextCount);
        if (typeof window !== "undefined" && myUsername) {
            try {
                localStorage.setItem(
                    `pfpuwu_firefly_jar_${myUsername.toLowerCase()}`,
                    String(fireflyJarCount)
                );
            } catch {}
        }
    }

    function stopFireflyCatcherTimers() {
        if (catcherTimerId) {
            clearInterval(catcherTimerId);
            catcherTimerId = null;
        }
        if (catcherCountdownId) {
            clearInterval(catcherCountdownId);
            catcherCountdownId = null;
        }
    }

    function openFireflyCatcher(wildFlyId: number | null = null) {
        activeWildFireflyId = wildFlyId;
        showFireflyCatcherModal = true;
        startFireflyCatcherGame();
    }

    function closeFireflyCatcher() {
        stopFireflyCatcherTimers();
        showFireflyCatcherModal = false;
    }

    function startFireflyCatcherGame() {
        stopFireflyCatcherTimers();
        synth.playNatureChimeSfx();
        catcherHits = 0;
        catcherTimeLeft = 10;
        catcherPhase = "playing";
        catcherSwingCooldownUntil = 0;
        catcherSwingAnimUntil = 0;
        catcherStatusMsg = "Aim your net over the darting ✨ Firefly and click / press SPACE (3x to capture)!";
        catcherTarget = {
            x: 60 + Math.random() * 200,
            y: 45 + Math.random() * 110,
            vx: (Math.random() > 0.5 ? 1 : -1) * 4.4,
            vy: (Math.random() > 0.5 ? 1 : -1) * 3.5,
            isSweetSpot: false,
            nextBurstAt: Date.now() + 450
        };
        catcherDecoys = [
            { id: 1, x: 70, y: 60, vx: 3.1, vy: -2.4, icon: "🐝" },
            { id: 2, x: 240, y: 140, vx: -3.4, vy: 2.7, icon: "🐝" },
            { id: 3, x: 160, y: 165, vx: 2.8, vy: -3.2, icon: "🦇" }
        ];

        catcherTimerId = window.setInterval(() => {
            if (catcherPhase !== "playing") return;
            const now = Date.now();
            const speedMult = 1 + catcherHits * 0.34;

            let tx = catcherTarget.x + catcherTarget.vx;
            let ty = catcherTarget.y + catcherTarget.vy;
            let tvx = catcherTarget.vx;
            let tvy = catcherTarget.vy;
            let isSweetSpot = catcherTarget.isSweetSpot;
            let nextBurstAt = catcherTarget.nextBurstAt;

            if (now >= nextBurstAt) {
                // 28% chance of brief 0.45s Sweet-Spot hover, otherwise erratic high-speed dart!
                if (!isSweetSpot && Math.random() < 0.28) {
                    isSweetSpot = true;
                    tvx *= 0.22;
                    tvy *= 0.22;
                    nextBurstAt = now + 460;
                } else {
                    isSweetSpot = false;
                    const angle = Math.random() * Math.PI * 2;
                    const baseSpd = (4.1 + Math.random() * 2.2) * speedMult;
                    tvx = Math.cos(angle) * baseSpd;
                    tvy = Math.sin(angle) * baseSpd;
                    nextBurstAt = now + 380 + Math.random() * 340;
                }
            }

            if (tx <= 22 || tx >= 298) {
                tvx = -tvx;
                tx = Math.max(22, Math.min(298, tx));
            }
            if (ty <= 22 || ty >= 188) {
                tvy = -tvy;
                ty = Math.max(22, Math.min(188, ty));
            }

            catcherTarget = { x: tx, y: ty, vx: tvx, vy: tvy, isSweetSpot, nextBurstAt };

            catcherDecoys = catcherDecoys.map((d) => {
                let dx = d.x + d.vx;
                let dy = d.y + d.vy;
                let dvx = d.vx;
                let dvy = d.vy;
                if (dx <= 18 || dx >= 302) {
                    dvx = -dvx;
                    dx = Math.max(18, Math.min(302, dx));
                }
                if (dy <= 18 || dy >= 192) {
                    dvy = -dvy;
                    dy = Math.max(18, Math.min(192, dy));
                }
                return { ...d, x: dx, y: dy, vx: dvx, vy: dvy };
            });
        }, 22);

        catcherCountdownId = window.setInterval(() => {
            if (catcherPhase !== "playing") return;
            catcherTimeLeft--;
            if (catcherTimeLeft <= 0) {
                catcherPhase = "escaped";
                stopFireflyCatcherTimers();
                synth.playDiceRollSfx();
                catcherStatusMsg = "✨ Whoosh! The wild firefly darted up into the forest canopy! Try again.";
            }
        }, 1000);
    }

    function handleCatcherPointerMove(e: MouseEvent | TouchEvent) {
        const el = e.currentTarget as HTMLElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        const relX = ((clientX - rect.left) / rect.width) * 320;
        const relY = ((clientY - rect.top) / rect.height) * 210;
        catcherNetPos = {
            x: Math.max(20, Math.min(300, relX)),
            y: Math.max(20, Math.min(190, relY))
        };
    }

    function swingFireflyNet(e?: MouseEvent | TouchEvent) {
        if (e) {
            handleCatcherPointerMove(e);
        }
        if (catcherPhase !== "playing") return;
        const now = Date.now();
        if (now < catcherSwingCooldownUntil) return;

        catcherSwingAnimUntil = now + 220;

        // Check if player hit a stinging wasp/bat decoy first
        const hitDecoy = catcherDecoys.find(
            (d) => Math.hypot(d.x - catcherNetPos.x, d.y - catcherNetPos.y) <= 22
        );
        if (hitDecoy) {
            synth.playDiceRollSfx();
            catcherTimeLeft = Math.max(1, catcherTimeLeft - 1);
            catcherSwingCooldownUntil = now + 650;
            catcherStatusMsg = `🐝 Ouch! Netted a ${hitDecoy.icon} decoy (-1s & brief net stun)!`;
            return;
        }

        const dist = Math.hypot(catcherTarget.x - catcherNetPos.x, catcherTarget.y - catcherNetPos.y);
        const catchRadius = catcherTarget.isSweetSpot ? 32 : 25;

        if (dist <= catchRadius) {
            catcherHits++;
            synth.playNatureChimeSfx();
            if (catcherHits >= CATCHER_REQUIRED_HITS) {
                catcherPhase = "won";
                stopFireflyCatcherTimers();
                persistFireflyJarCount(fireflyJarCount + 1);
                if (activeWildFireflyId !== null) {
                    const wf = wildFireflies.find((f) => f.id === activeWildFireflyId);
                    if (wf) wf.respawnUntil = Date.now() + 14000;
                }
                triggerEmote("✨");
                for (let i = 0; i < 20; i++) {
                    particles.push({
                        x: myX + (Math.random() - 0.5) * 3,
                        y: myY + (Math.random() - 0.5) * 3,
                        vx: (Math.random() - 0.5) * 0.09,
                        vy: (Math.random() - 0.5) * 0.09,
                        color: "#ccff66",
                        size: 4,
                        life: 0,
                        maxLife: 60
                    });
                }
                catcherStatusMsg = `🫙 CAPTURED! You now have ${fireflyJarCount} ✨ Firefly${fireflyJarCount === 1 ? "" : "s"} in your jar!`;
                showToast(`🦋 Caught a wild Firefly! (🫙 ${fireflyJarCount} in Jar — Visit the Shrine to light a 24h Lantern!)`, 5000);
            } else {
                // Firefly darts to a new spot and speeds up!
                const angle = Math.random() * Math.PI * 2;
                const spd = 5.4 + catcherHits * 1.4;
                catcherTarget = {
                    x: 40 + Math.random() * 240,
                    y: 35 + Math.random() * 140,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    isSweetSpot: false,
                    nextBurstAt: now + 360
                };
                catcherStatusMsg = `✨ Netted (${catcherHits}/${CATCHER_REQUIRED_HITS})! It broke free and sped up — catch it again!`;
            }
        } else {
            synth.playCardSfx();
            catcherSwingCooldownUntil = now + 520;
            catcherStatusMsg = "💨 Missed! Wait 0.5s for net recovery and time your swing!";
        }
    }

    function openLanternSanctuary() {
        showLanternModal = true;
        loadActiveWishLanterns().then((lanterns) => {
            wishLanterns = lanterns;
        });
    }

    async function releaseFireflyWish() {
        if (isReleasingLantern) return;
        if (fireflyJarCount <= 0) {
            showToast("🦋 You need 1 ✨ Captured Firefly in your Jar to light a Wish Lantern! Catch one in the Woods first.", 4500);
            return;
        }
        const wish = fireflyWishInput.trim();
        if (!wish) {
            showToast("🏮 Write a message for your 24-hour Sky Wish Lantern first!", 3500);
            return;
        }

        isReleasingLantern = true;
        fireflyWishInput = "";
        persistFireflyJarCount(fireflyJarCount - 1);
        synth.playNatureChimeSfx();
        triggerConfettiCelebration();

        const nowMs = Date.now();
        const newLantern: WishLanternRecord = {
            id: `lantern_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
            user_id: myId || myUsername,
            username: myUsername.replace(/^@/, "").toLowerCase(),
            wish: wish.slice(0, 120),
            color: selectedLanternColor,
            created_at: new Date(nowMs).toISOString(),
            expires_at: new Date(nowMs + WISH_LANTERN_TTL_MS).toISOString(),
            likes: []
        };

        wishLanterns = await saveNewWishLantern(newLantern);
        isReleasingLantern = false;

        speechBubble = { text: `🏮 ${wish}`, expiresAt: Date.now() + 7000 };
        networkManager?.broadcastForestEvent({
            kind: "firefly_wish",
            user: myUsername,
            wish,
            lantern: newLantern
        });
        showToast("🏮 Your Sky Wish Lantern has been released and will glow for 24 hours!", 5000);
    }

    async function handleGlowLantern(lanternId: string) {
        if (!myUsername) return;
        synth.playNatureChimeSfx();
        wishLanterns = await toggleWishLanternGlow(lanternId, myUsername);
        networkManager?.broadcastForestEvent({
            kind: "lantern_glow",
            lanternId,
            user: myUsername
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
        } else if (currentZone === "museum") {
            pendingInteractionTarget = null;
            const clickedPed = getNearestMuseumPedestal(gridPos.x, gridPos.y, 1.35);
            if (clickedPed) {
                if (gridDistance(myX, myY, clickedPed.x, clickedPed.y) <= 3.3) {
                    openMuseumSpotInspector(clickedPed.spotNumber, "inspect");
                    return;
                }
                pendingInteractionTarget = `museum_spot_${clickedPed.spotNumber}`;
                activeWaypoints = findPath(
                    myX,
                    myY,
                    clickedPed.x,
                    Math.min(28.5, clickedPed.y + 0.9),
                    MUSEUM_COLLISION_MAP,
                    MAP_SIZE
                );
                waypointStuckFrames = 0;
                return;
            }
        } else {
            pendingInteractionTarget = null;
            if (gx >= 21 && gx <= 23 && gy >= 22 && gy <= 24) {
                // Direct click on the Firefly Wish Lantern Shrine (22, 23)
                if (gridDistance(myX, myY, 22.0, 23.0) <= 3.6) {
                    openLanternSanctuary();
                    return;
                }
                pendingInteractionTarget = "lantern_shrine";
            }
        }

        const activeCollision =
            currentZone === "forest"
                ? FOREST_COLLISION_MAP
                : currentZone === "museum"
                  ? MUSEUM_COLLISION_MAP
                  : COLLISION_MAP;
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

        if (
            !isTypingInTextInput() &&
            !showArcadeModal &&
            !showGraffitiModal &&
            !showDJModal &&
            !showGuideModal &&
            !showLeaderboardModal &&
            !showFireflyCatcherModal &&
            !showLanternModal &&
            !showMuseumModal
        ) {
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
                    else if (pendingInteractionTarget === "catch_firefly") openFireflyCatcher(activeWildFireflyId);
                    else if (pendingInteractionTarget === "lantern_shrine") openLanternSanctuary();
                    else if (pendingInteractionTarget.startsWith("museum_spot_")) {
                        const sNum = parseInt(pendingInteractionTarget.replace("museum_spot_", ""), 10) || 1;
                        openMuseumSpotInspector(sNum, "inspect");
                    }
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

        // Seamless East/West Portal Edge Walking Transition between Casino, Whispering Woods & Grand Art Museum
        if (currentZone === "casino" && myX >= 30.2 && myY >= 13.8 && myY <= 18.0) {
            switchWorldZone("forest", 2.4, 16.0);
            return;
        } else if (currentZone === "casino" && myX <= 1.6 && myY >= 13.8 && myY <= 18.0) {
            switchWorldZone("museum", 29.4, 16.0);
            return;
        } else if (currentZone === "forest" && myX <= 1.6 && myY >= 13.8 && myY <= 18.0) {
            switchWorldZone("casino", 29.4, 16.0);
            return;
        } else if (currentZone === "museum" && myX >= 30.2 && myY >= 13.8 && myY <= 18.0) {
            switchWorldZone("casino", 2.4, 16.0);
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

            diceManager.updateOccupants(allPlayers, myId);

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
        } else if (currentZone === "museum") {
            activeStation = "none";
        } else {
            // Animate Fireflies clustered near the Firefly Lantern Shrine (22, 23)
            const nowMs = Date.now();
            for (const wf of wildFireflies) {
                if (wf.respawnUntil > nowMs) continue;
                wf.phase += deltaSec * wf.speed;
                wf.x = wf.anchorX + Math.sin(wf.phase) * 0.48;
                wf.y = wf.anchorY + Math.cos(wf.phase * 1.3) * 0.42;
            }

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
              : currentZone === "museum"
                ? "🏛️ UwU Grand Art Museum"
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
        } else if (currentZone === "museum") {
            grad.addColorStop(0, "#100e1c");
            grad.addColorStop(0.5, "#19152b");
            grad.addColorStop(1, "#241e3c");
        } else {
            grad.addColorStop(0, "#050510");
            grad.addColorStop(0.5, "#0d061c");
            grad.addColorStop(1, "#18092c");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const activeFloor =
            currentZone === "forest"
                ? forestFloorCache
                : currentZone === "museum"
                  ? museumFloorCache
                  : floorCache;
        if (activeFloor.canvas) {
            const mapOriginScreenX = canvasWidth / 2 - cameraX;
            const mapOriginScreenY = canvasHeight / 2 - cameraY;
            const drawX = Math.round(mapOriginScreenX - activeFloor.originX);
            const drawY = Math.round(mapOriginScreenY - activeFloor.originY);
            ctx.drawImage(activeFloor.canvas, drawX, drawY);
        }

        const animCoords =
            currentZone === "forest"
                ? FOREST_ANIMATED_TILE_COORDS
                : currentZone === "museum"
                  ? MUSEUM_ANIMATED_TILE_COORDS
                  : ANIMATED_TILE_COORDS;
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

        const activeCollision =
            currentZone === "forest"
                ? FOREST_COLLISION_MAP
                : currentZone === "museum"
                  ? MUSEUM_COLLISION_MAP
                  : COLLISION_MAP;

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

        const objectsList =
            currentZone === "forest"
                ? FOREST_OBJECTS
                : currentZone === "museum"
                  ? MUSEUM_OBJECTS
                  : WORLD_OBJECTS;
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

        // Render roaming wild fireflies in Whispering Woods
        if (currentZone === "forest") {
            const nowMs = Date.now();
            for (const wf of wildFireflies) {
                if (wf.respawnUntil > nowMs) continue;
                const bobZ = 0.42 + Math.sin(timeMs / 240 + wf.phase) * 0.14;
                const sc = gridToScreen(wf.x, wf.y, bobZ, cameraX, cameraY, canvasWidth, canvasHeight);
                const pulse = 0.65 + Math.sin(timeMs / 170 + wf.phase) * 0.35;

                ctx.save();
                const aura = ctx.createRadialGradient(sc.x, sc.y, 1, sc.x, sc.y, 18);
                aura.addColorStop(0, `rgba(212, 255, 110, ${0.88 * pulse})`);
                aura.addColorStop(0.5, `rgba(120, 255, 160, ${0.38 * pulse})`);
                aura.addColorStop(1, "rgba(0, 255, 140, 0)");
                ctx.fillStyle = aura;
                ctx.beginPath();
                ctx.arc(sc.x, sc.y, 18, 0, Math.PI * 2);
                ctx.fill();

                // Fluttering wings
                const wingSpread = 4 + Math.sin(timeMs / 45 + wf.phase) * 2.5;
                ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
                ctx.beginPath();
                ctx.ellipse(sc.x - 3.5, sc.y - 2, wingSpread, 2.2, -0.4, 0, Math.PI * 2);
                ctx.ellipse(sc.x + 3.5, sc.y - 2, wingSpread, 2.2, 0.4, 0, Math.PI * 2);
                ctx.fill();

                // Glowing abdomen
                ctx.fillStyle = "#eaff7b";
                ctx.beginPath();
                ctx.arc(sc.x, sc.y, 3.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
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

            // Floating 24-Hour Sky Wish Lanterns above the Shrine
            const visibleLanterns = wishLanterns.slice(0, 7);
            const lanternPalette: Record<string, string> = {
                gold: "#ffd54f",
                sakura: "#ff80ab",
                cyan: "#4dd0e1",
                emerald: "#69f0ae",
                violet: "#b388ff"
            };
            for (let lIdx = 0; lIdx < visibleLanterns.length; lIdx++) {
                const lantern = visibleLanterns[lIdx];
                const angle = (lIdx / Math.max(1, visibleLanterns.length)) * Math.PI * 2 + timeMs / 2800;
                const radiusX = 28 + (lIdx % 2) * 14;
                const lx = Math.cos(angle) * radiusX;
                const ly = -52 - (lIdx % 3) * 13 + Math.sin(timeMs / 480 + lIdx) * 4;
                const lColor = lanternPalette[lantern.color] || "#ffd54f";

                // Warm lantern glow
                const lGlow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 12);
                lGlow.addColorStop(0, lColor);
                lGlow.addColorStop(1, "rgba(255, 213, 79, 0)");
                ctx.fillStyle = lGlow;
                ctx.beginPath();
                ctx.arc(lx, ly, 12, 0, Math.PI * 2);
                ctx.fill();

                // Lantern body
                ctx.fillStyle = lColor;
                ctx.fillRect(lx - 4, ly - 5, 8, 10);
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 0.8;
                ctx.strokeRect(lx - 4, ly - 5, 8, 10);
            }

            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffe082";
            ctx.fillText(`🏮 ${wishLanterns.length} WISHES [CLICK/E]`, 0, -78);
            ctx.font = "13px sans-serif";
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
        } else if (obj.type === "museum_pedestal") {
            const spotNum = obj.data?.spotNumber || 1;
            const rawArt = museumState.spots[spotNum] || null;
            const art = rawArt && isValidArtworkItem(rawArt) ? rawArt : null;
            const isNear = gridDistance(myX, myY, obj.x, obj.y) <= 2.9;

            // Ground shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
            ctx.beginPath();
            ctx.ellipse(0, 5, 28, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            // Golden Spotlight Cone on Floor
            const spotGlow = ctx.createRadialGradient(0, -10, 4, 0, -10, 42);
            spotGlow.addColorStop(
                0,
                art
                    ? "rgba(255, 224, 130, 0.34)"
                    : isNear
                      ? "rgba(0, 229, 255, 0.32)"
                      : "rgba(180, 160, 255, 0.16)"
            );
            spotGlow.addColorStop(1, "rgba(255, 215, 0, 0)");
            ctx.fillStyle = spotGlow;
            ctx.beginPath();
            ctx.ellipse(0, 0, 36, 18, 0, 0, Math.PI * 2);
            ctx.fill();

            // 3D Marble Plinth Base + Stepped Column
            drawIsoPrism(
                ctx,
                22,
                11,
                8,
                "#e2dfd7",
                "#c5c0b4",
                "#9e988c",
                art ? "#d4af37" : "rgba(255,255,255,0.45)"
            );
            ctx.save();
            ctx.translate(0, -8);
            drawIsoPrism(
                ctx,
                17,
                8.5,
                18,
                "#f5f2eb",
                "#d8d3c8",
                "#b5afa2",
                art ? "#ffd700" : "rgba(180,220,255,0.5)"
            );
            ctx.restore();

            // Velvet Rope Brass Posts on Left & Right
            [-23, 23].forEach((rx) => {
                ctx.fillStyle = "#d4af37";
                ctx.fillRect(rx - 1.5, -14, 3, 15);
                ctx.beginPath();
                ctx.arc(rx, -15, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.strokeStyle = "#b71c1c";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-23, -11);
            ctx.quadraticCurveTo(0, -3, 23, -11);
            ctx.stroke();

            // Front Brass Number Plaque on Plinth
            ctx.fillStyle = "#2b1d03";
            ctx.fillRect(-13, -19, 26, 10);
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 1;
            ctx.strokeRect(-13, -19, 26, 10);
            ctx.fillStyle = "#ffd700";
            ctx.font = 'bold 8px "MS Sans Serif", Tahoma, monospace';
            ctx.textAlign = "center";
            ctx.fillText(`#${spotNum}`, 0, -11.5);

            if (art) {
                const cachedArtCanvas = getCachedPedestalArtworkCanvas(art);
                const hoverBob = Math.sin(timeMs / 420 + spotNum) * 2;
                if (cachedArtCanvas) {
                    ctx.drawImage(cachedArtCanvas, -40, -104 + hoverBob, 80, 80);
                }

                // Floating Museum Exhibit Title & Artist Pill above Artwork (with Artist Avatar!)
                const artistAvatarImg = getCachedAvatarImage(art.artistAvatarUrl || "/unicorn.png");
                const badgeText = `${art.artType === "3d" ? "🧱" : "🎨"} @${art.artistUsername}${art.likes.length > 0 ? ` ❤️${art.likes.length}` : ""}`;
                ctx.font = 'bold 9px "MS Sans Serif", Tahoma, sans-serif';
                const textW = ctx.measureText(badgeText).width;
                const iconPad = artistAvatarImg ? 15 : 0;
                const bw = Math.max(62, textW + 12 + iconPad);
                const by = -114 + hoverBob;
                ctx.fillStyle = isNear ? "rgba(26, 15, 54, 0.95)" : "rgba(12, 10, 24, 0.86)";
                ctx.fillRect(-bw / 2, by, bw, 16);
                ctx.strokeStyle = isNear ? "#00e5ff" : "#ffd700";
                ctx.lineWidth = isNear ? 1.5 : 1;
                ctx.strokeRect(-bw / 2, by, bw, 16);
                if (artistAvatarImg) {
                    ctx.drawImage(artistAvatarImg, -bw / 2 + 3, by + 1, 14, 14);
                }
                ctx.fillStyle = "#ffffff";
                ctx.fillText(badgeText, iconPad / 2, by + 11);
            } else {
                // Open Pedestal Holographic Invitation Crystal
                const bob = Math.sin(timeMs / 280 + spotNum) * 3.5;
                ctx.save();
                ctx.translate(0, -44 + bob);
                ctx.fillStyle = isNear ? "rgba(0, 229, 255, 0.85)" : "rgba(255, 215, 0, 0.65)";
                ctx.beginPath();
                ctx.moveTo(0, -11);
                ctx.lineTo(9, 0);
                ctx.lineTo(0, 11);
                ctx.lineTo(-9, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();

                ctx.font = "bold 8px monospace";
                ctx.fillStyle = isNear ? "#00ffff" : "#ffe082";
                ctx.textAlign = "center";
                ctx.fillText(
                    isNear ? `✨ SPOT #${spotNum} [CLICK/E]` : `SPOT #${spotNum} [OPEN]`,
                    0,
                    -64 + bob
                );
            }
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
            } else if (myX <= 4.0 && myY >= 13.5 && myY <= 18.5) {
                promptText = "🏛️ Walk West → Grand Art Museum";
            }
        } else if (currentZone === "museum") {
            const nearPed = getNearestMuseumPedestal(myX, myY, 3.1);
            if (nearPed) {
                const art = museumState.spots[nearPed.spotNumber];
                if (art) {
                    promptText = `🏛️ Spot #${nearPed.spotNumber}: "${art.title}" by @${art.artistUsername} [Press E / Click to Inspect]`;
                } else {
                    promptText = `✨ Open Spot #${nearPed.spotNumber} (${nearPed.wingName}) [Press E / Click to Exhibit 2D or 3D Art]`;
                }
            } else if (myX >= 28.0 && myY >= 13.5 && myY <= 18.5) {
                promptText = "🎲 Walk East → Casino Lounge";
            } else {
                promptText = "🎨 Press [E] or Click Any Pedestal to Open 2D/3D Art Studio & Vault";
            }
        } else {
            if (activeStation === "campfire") {
                promptText = "🔥 Campfire Circle";
            } else if (activeStation === "picnic") {
                promptText = "🧺 Woodland Picnic";
            } else if (activeStation === "fishing") {
                promptText = "🎣 Koi Pond [Press E to Cast]";
            } else if (activeStation === "fireflies") {
                promptText = `🏮 Wish Lantern Shrine [Press E — ${wishLanterns.length} Active 24h]`;
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
            else if (hx <= 1 && hy >= 14 && hy <= 17) hoverLabel = "🏛️ Grand Art Museum";
        } else if (currentZone === "museum") {
            const ped = getNearestMuseumPedestal(hx + 0.5, hy + 0.5, 1.25);
            if (ped) {
                const art = museumState.spots[ped.spotNumber];
                hoverLabel = art
                    ? `🏛️ Spot #${ped.spotNumber}: "${art.title}" (@${art.artistUsername})`
                    : `✨ Spot #${ped.spotNumber} — Open Pedestal (Click to Exhibit)`;
            } else if (hx >= 30 && hy >= 14 && hy <= 17) {
                hoverLabel = "🎲 Casino Lounge";
            }
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
            <span class="room-pill" title={currentZoneName}>
                <span class="room-name-text">{currentZoneName}</span>
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
                        <button class="travel-item museum-item" onclick={() => teleportTo(16.0, 15.5, "Grand Art Museum", "museum")}>
                            🏛️ Grand Art Museum
                        </button>
                    </div>
                {/if}
            </div>

            <button
                class="win98-btn museum-open-btn"
                onclick={() => openMuseumSpotInspector(activeMuseumSpot || 1, currentZone === "museum" ? "inspect" : "studio")}
                title="Open 2D & 3D IsoBrick Art Studio, Personal Vault & Museum Exhibits"
            >
                🏛️ Art Studio
            </button>

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

        <!-- 1. CRAPS / DICE DUEL HUD (Turn-by-Turn 2-4 Party Arena & Solo vs House) -->
        {#if activeStation === "dice"}
            {@const isDiceRolling = dicePhaseState !== "idle" && dicePhaseState !== "finished"}
            {@const seatedCount = diceSeatsState.filter((s) => s.occupant !== null).length}
            {@const readyCount = diceSeatsState.filter((s) => s.occupant !== null && s.isReady).length}
            {@const activeRoller = diceScoresState.find((s) => s.id === diceActiveRollerIdState) || null}
            {@const isMyTurnToRoll = isDiceRolling && diceActiveRollerIdState === myId}
            {@const arenaParties =
                diceScoresState.length > 0
                    ? diceScoresState
                    : seatedCount >= 2
                    ? diceSeatsState
                          .filter((s) => s.occupant !== null)
                          .map((s) => ({
                              id: s.occupant!.id,
                              username: s.occupant!.username,
                              avatarUrl: s.occupant!.avatarUrl,
                              roundRolls: [] as number[],
                              roundDicePairs: [] as Array<[number, number]>,
                              currentDice: [6, 6] as [number, number],
                              totalSum: 0,
                              isDealer: false
                          }))
                    : [
                          {
                              id: myId,
                              username: myUsername || "You",
                              avatarUrl: $userProfile?.avatar_url || "/unicorn.png",
                              roundRolls: [] as number[],
                              roundDicePairs: [] as Array<[number, number]>,
                              currentDice: [6, 6] as [number, number],
                              totalSum: 0,
                              isDealer: false
                          },
                          {
                              id: "house_dealer",
                              username: "🦄 House Dealer",
                              avatarUrl: "dealer_unicorn",
                              roundRolls: [] as number[],
                              roundDicePairs: [] as Array<[number, number]>,
                              currentDice: [5, 5] as [number, number],
                              totalSum: 0,
                              isDealer: true
                          }
                      ]}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🎲 Craps Dice Duel ({arenaParties.length} Parties)</span>
                    <span class="hud-payout-tag">
                        {isDiceRolling ? `Pot: ${dicePotAmountState} $UWU` : `${readyCount}/${Math.max(2, seatedCount)} Ready`}
                    </span>
                </div>
                <div class="hud-body">
                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={isDiceRolling || amIReady}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <!-- Round Progress Steps -->
                    <div class="round-steps-row">
                        <span class="r-pill" class:active={diceRoundState === 1} class:done={diceRoundState > 1 || dicePhaseState === "finished"}>
                            Round 1
                        </span>
                        <span class="r-pill" class:active={diceRoundState === 2} class:done={diceRoundState > 2 || dicePhaseState === "finished"}>
                            Round 2
                        </span>
                        <span class="r-pill" class:active={diceRoundState === 3 && dicePhaseState !== "finished"} class:done={dicePhaseState === "finished"}>
                            Round 3
                        </span>
                        <span class="r-pill" class:active={dicePhaseState === "finished"}>👑 Winner</span>
                    </div>

                    <!-- Live Turn & Roll Commentary Banner -->
                    <div
                        class="dice-turn-banner"
                        class:my-turn={isMyTurnToRoll}
                        class:finished={dicePhaseState === "finished"}
                    >
                        {#if isMyTurnToRoll}
                            🎯 <strong>YOUR TURN!</strong> Click <em>"ROLL YOUR DICE"</em> below for Round {diceRoundState} of 3!
                        {:else if isDiceRolling && diceActiveRollerIdState === "house_dealer"}
                            🦄 <strong>House Dealer</strong> is rolling for Round {diceRoundState} of 3...
                        {:else if isDiceRolling && activeRoller}
                            ⏳ <strong>Round {diceRoundState}/3:</strong> Waiting for <strong>@{activeRoller.username}</strong> to roll their dice...
                        {:else}
                            {diceLastSummaryState}
                        {/if}
                    </div>

                    <!-- Multi-Party 3D Visual Dice Arena Grid (Supports 2, 3, or 4 Parties!) -->
                    <div class="dice-arena-box" class:multi-party={arenaParties.length >= 3}>
                        {#each arenaParties as party, pIdx}
                            {@const isPartyShaking = isDiceShaking && (diceLastRollerIdState === party.id || (!diceLastRollerIdState && pIdx === 0))}
                            {@const die1 = isPartyShaking ? rollingAnimDice[pIdx % 2 === 0 ? 0 : 2] : party.currentDice?.[0] || 6}
                            {@const die2 = isPartyShaking ? rollingAnimDice[pIdx % 2 === 0 ? 1 : 3] : party.currentDice?.[1] || 6}
                            {@const isPartyActiveTurn = isDiceRolling && diceActiveRollerIdState === party.id}
                            {@const isPartyWinner =
                                dicePhaseState === "finished" &&
                                (diceWinnerIdsState.includes(party.id) || diceWinnerIdState === party.id)}
                            {@const hasRolledThisRound =
                                isDiceRolling && party.roundRolls.length >= diceRoundState}
                            <div
                                class="dice-fighter-card"
                                class:dealer-card={party.isDealer}
                                class:active-turn-glow={isPartyActiveTurn}
                                class:winner-glow={isPartyWinner}
                            >
                                <div class="fighter-header">
                                    <span class="fighter-name">
                                        #{pIdx + 1} {party.id === myId ? `🧑 @${party.username} (YOU)` : party.isDealer ? party.username : `⚔️ @${party.username}`}
                                    </span>
                                    <span class="fighter-sum" title="3-Round Total Sum">
                                        Σ {party.totalSum}
                                    </span>
                                </div>

                                <div class="party-turn-pill-row">
                                    {#if isPartyWinner}
                                        <span class="party-state-tag win">👑 WINNER</span>
                                    {:else if isPartyActiveTurn}
                                        <span class="party-state-tag active">🎲 ROLLING NOW</span>
                                    {:else if hasRolledThisRound}
                                        <span class="party-state-tag done">✓ Rolled R{diceRoundState}: {party.roundRolls[diceRoundState - 1]}</span>
                                    {:else if isDiceRolling}
                                        <span class="party-state-tag wait">⏳ Waiting R{diceRoundState}</span>
                                    {:else}
                                        {@const seatInfo = diceSeatsState.find((s) => s.occupant?.id === party.id)}
                                        <span class="party-state-tag" class:done={seatInfo?.isReady}>
                                            {party.isDealer ? "House Dealer" : seatInfo?.isReady ? "✅ READY" : "Seated"}
                                        </span>
                                    {/if}
                                </div>

                                <div class="dice-pair-row">
                                    {#each [die1, die2] as dieVal}
                                        <div
                                            class="visual-die-3d"
                                            class:player-die={!party.isDealer}
                                            class:dealer-die={party.isDealer}
                                            class:shaking={isPartyShaking}
                                        >
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
                                    {#each [0, 1, 2] as rIdx}
                                        <span
                                            class="mini-r-chip"
                                            class:filled={party.roundRolls[rIdx] !== undefined}
                                            class:current={isDiceRolling && diceRoundState === rIdx + 1 && party.roundRolls[rIdx] === undefined}
                                        >
                                            R{rIdx + 1}: {party.roundRolls[rIdx] ?? "–"}
                                        </span>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>

                    {#if dicePhaseState === "finished"}
                        <div
                            class="dice-result-banner"
                            class:win={diceWinnerIdsState.includes(myId) || diceWinnerIdState === myId}
                        >
                            {#if diceWinnerIdsState.includes(myId) || diceWinnerIdState === myId}
                                👑 YOU WON +{Math.round(dicePotAmountState / Math.max(1, diceWinnerIdsState.length))} $UWU! ({diceScoresState.map((s) => `${s.id === myId ? "You" : s.username}: ${s.totalSum}`).join(" · ")})
                            {:else}
                                🎲 {diceWinnerNameState} Wins! ({diceScoresState.map((s) => `${s.id === myId ? "You" : s.username}: ${s.totalSum}`).join(" · ")})
                            {/if}
                        </div>
                    {/if}

                    <!-- 4 Party Seats around the Table (2-4 Player Multiplayer PvP) -->
                    <div class="dice-seats-row">
                        {#each diceSeatsState as seat, sIdx}
                            <button
                                class="seat-badge"
                                class:occupied={seat.occupant !== null}
                                class:ready={seat.isReady}
                                disabled={isDiceRolling}
                                onclick={() => sitAtDiceSeat(sIdx)}
                            >
                                <span class="seat-title">{seat.label}</span>
                                {#if seat.occupant}
                                    <span class="seat-user">@{seat.occupant.username}</span>
                                    <span class="seat-status">{seat.isReady ? "✅ READY" : "⏳ Sit"}</span>
                                {:else}
                                    <span class="seat-empty">+ Join Seat</span>
                                {/if}
                            </button>
                        {/each}
                    </div>

                    <!-- Turn-Based Action Controls -->
                    <div class="hud-actions-col">
                        {#if isDiceRolling}
                            {#if isMyTurnToRoll}
                                <button
                                    class="win98-btn primary-start-btn roll-my-turn-btn"
                                    onclick={() => rollMyDiceTurn(false)}
                                >
                                    🎲 ROLL YOUR DICE! (Round {diceRoundState} of 3)
                                </button>
                            {:else if diceActiveRollerIdState === "house_dealer"}
                                <button class="win98-btn primary-start-btn" disabled>
                                    🦄 House Dealer Rolling Round {diceRoundState} / 3...
                                </button>
                            {:else}
                                <button class="win98-btn primary-start-btn" disabled>
                                    ⏳ Waiting for @{activeRoller?.username || "Player"} to Roll (R{diceRoundState}/3)...
                                </button>
                                <button
                                    class="win98-btn bot-test-btn"
                                    onclick={() => rollMyDiceTurn(true)}
                                    title="Use if the other player disconnected or is AFK"
                                >
                                    ⚡ Nudge / Auto-Roll for AFK @{activeRoller?.username || "Player"}
                                </button>
                            {/if}
                        {:else}
                            <div class="dice-lobby-btns">
                                <button
                                    class="win98-btn primary-start-btn pvp-ready-btn"
                                    class:is-ready={amIReady}
                                    onclick={toggleDicePvPReady}
                                >
                                    {#if amIReady}
                                        ✅ READY ({readyCount}/{Math.max(2, seatedCount)} Parties) — Click to Cancel
                                    {:else}
                                        ⚔️ Ready Up for Party Duel ({selectedWager} $UWU)
                                    {/if}
                                </button>

                                {#if readyCount >= 2 && readyCount < seatedCount}
                                    <button
                                        class="win98-btn primary-start-btn start-ready-now-btn"
                                        onclick={startManualPvPDuel}
                                    >
                                        🚀 Start {readyCount}-Party Duel Now!
                                    </button>
                                {/if}

                                <button
                                    class="win98-btn bot-test-btn"
                                    onclick={startInstantSoloDiceDuel}
                                >
                                    🦄 {dicePhaseState === "finished" && diceModeState === "solo_dealer" ? "Rematch" : "Solo Duel"} vs House Dealer ({selectedWager} $UWU)
                                </button>
                            </div>
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

        <!-- 9. WHISPERING WOODS: FIREFLY SHRINE & 24H WISH LANTERN HUD -->
        {#if activeStation === "fireflies"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🏮 Firefly Wish Shrine</span>
                    <span class="hud-payout-tag">🫙 Jar: {fireflyJarCount} ✨</span>
                </div>
                <div class="hud-body">
                    <div class="roulette-status-bar" style="background:#0d1f16; color:#ccff66; border-color:#2e7d32;">
                        <span>🏮 Active (24h): <strong>{wishLanterns.length}</strong></span>
                        <span>🫙 Caught: <strong>{fireflyJarCount}</strong></span>
                    </div>

                    <div class="scores-table" style="background:#102218; padding:5px; border:1px solid #69f0ae;">
                        {#each wishLanterns.slice(0, 3) as w}
                            <div class="player-score-row" style="color:#f0fff0; justify-content:space-between; gap:6px;">
                                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                    🏮 <strong>@{w.username}:</strong> {w.wish}
                                </span>
                                <small style="color:#a5d6a7; flex-shrink:0;">{formatLanternTimeRemaining(w.expires_at)}</small>
                            </div>
                        {/each}
                    </div>

                    <div class="bj-actions-row">
                        <button
                            class="win98-btn"
                            style="flex:1; font-weight:bold; background:#1b5e20; color:#ccff66;"
                            onclick={() => openFireflyCatcher()}
                        >
                            🦋 Catch Firefly
                        </button>
                        <button
                            class="win98-btn primary-start-btn"
                            style="flex:1.2;"
                            onclick={openLanternSanctuary}
                        >
                            🏮 Sky Lanterns ({wishLanterns.length})
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
                        <div class="guide-card">
                            <div class="guide-card-title">🏛️ Grand Art Museum</div>
                            <p>25 Exhibition Pedestals, 2D Gallery Easel, 3D IsoBrick Lego Builder & Personal Art Vault.</p>
                            <button class="win98-btn" onclick={() => teleportTo(16.0, 15.5, "Grand Art Museum", "museum")}>Teleport</button>
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
                                    🪙 100 $UWU Token (Win 200 $UWU)
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
                                            class:armored-brick={b.hp > 1}
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
                                    style="left:{brickPaddleX}px; top:204px; width:{BRICK_PADDLE_WIDTH}px;"
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
                                <button class="win98-btn" onclick={() => (brickPaddleX = Math.min(312 - BRICK_PADDLE_WIDTH, brickPaddleX + 28))}>▶</button>
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
                                {#each snakeHazards as hz}
                                    <div
                                        class="snake-hazard-cell"
                                        style="left:{hz.x * 20}px; top:{hz.y * 18.5}px;"
                                    >
                                        ⚡
                                    </div>
                                {/each}

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
                                            Use <strong>[WASD / Arrows]</strong> to collect 💎 & 🦄 — Dodge ⚡!
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
                                    style="left:{coinBasketX}px; top:196px; width:{COIN_BASKET_WIDTH}px;"
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
                                            Catch 🪙 💎 🦄 — Dodge 💣 & 💀!
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
                                <button class="win98-btn" onclick={() => (coinBasketX = Math.min(312 - COIN_BASKET_WIDTH, coinBasketX + 28))}>▶</button>
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
                                            <small>-60</small>
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

                    <!-- Persistent Global Top 10 High Score Board (Skill Arcade Cabinets) -->
                    {#if activeArcadeTab !== "mines"}
                        {@const activeBoard = arcadeLeaderboards[activeArcadeTab] || []}
                        <div class="arcade-leaderboard-panel">
                            <div class="arcade-lb-header">
                                <span>🏆 GLOBAL TOP 10 HIGH SCORES — {activeArcadeTab === "brick" ? "BRICK BREAKER" : activeArcadeTab === "snake" ? "SNAKE 98" : activeArcadeTab === "coin" ? "COIN RUSH" : "WHACK-A-GLITCH"}</span>
                                <span class="arcade-lb-sub">Your Best: {arcadeBestScores[activeArcadeTab]} PTS</span>
                            </div>
                            <div class="arcade-lb-list">
                                {#if activeBoard.length === 0}
                                    <div class="arcade-lb-empty">No scores recorded yet — set the #1 world record!</div>
                                {:else}
                                    {#each activeBoard as row, rIdx}
                                        {@const isMyRow = row.username.toLowerCase() === myUsername.replace(/^@/, "").toLowerCase()}
                                        <div class="arcade-lb-row" class:is-me={isMyRow}>
                                            <span class="arcade-lb-rank">
                                                {rIdx === 0 ? "🥇" : rIdx === 1 ? "🥈" : rIdx === 2 ? "🥉" : `#${rIdx + 1}`}
                                            </span>
                                            <span class="arcade-lb-user">
                                                @{row.username}
                                                {#if isMyRow}<small class="you-pill">YOU</small>{/if}
                                            </span>
                                            <span class="arcade-lb-score">{row.score.toLocaleString()} PTS</span>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
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

    <!-- Modal 5: 🦋 WILD FIREFLY NET CATCHER CHALLENGE -->
    {#if showFireflyCatcherModal}
        <div class="modal-overlay" onclick={closeFireflyCatcher}>
            <div class="win98-window firefly-catcher-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🦋 Whispering Woods — Firefly Net Catcher</span>
                    <button class="win98-close" onclick={closeFireflyCatcher}>X</button>
                </div>
                <div class="win98-body arcade-body">
                    <div class="roulette-status-bar" style="background:#0d1f16; color:#ccff66; border-color:#2e7d32;">
                        <span>🎯 Catches: <strong>{catcherHits} / {CATCHER_REQUIRED_HITS}</strong></span>
                        <span>⏱️ Time: <strong>{catcherTimeLeft.toFixed(1)}s</strong></span>
                        <span>🫙 Jar: <strong>{fireflyJarCount} ✨</strong></span>
                    </div>

                    <div
                        class="arcade-crt-stage firefly-catcher-stage"
                        onmousemove={handleCatcherPointerMove}
                        ontouchmove={handleCatcherPointerMove}
                        onmousedown={swingFireflyNet}
                    >
                        <!-- Moonlit forest atmosphere -->
                        <div class="catcher-moon">🌙</div>

                        <!-- Decoy hazards (Wasps & Bats) -->
                        {#each catcherDecoys as decoy (decoy.id)}
                            <div
                                class="catcher-decoy-sprite"
                                style="left:{decoy.x - 12}px; top:{decoy.y - 12}px;"
                            >
                                {decoy.icon}
                            </div>
                        {/each}

                        <!-- Erratic Wild Firefly Target -->
                        <div
                            class="catcher-firefly-sprite"
                            style="left:{catcherTarget.x - 14}px; top:{catcherTarget.y - 14}px;"
                        >
                            <span class="catcher-firefly-core">✨</span>
                        </div>

                        <!-- Player Bamboo Net Reticle -->
                        <div
                            class="catcher-net-reticle"
                            class:net-swinging={catcherSwingAnimUntil > Date.now()}
                            style="left:{catcherNetPos.x - 22}px; top:{catcherNetPos.y - 22}px;"
                        >
                            🦋
                        </div>

                        {#if catcherStatusMsg}
                            <div class="catcher-feedback-banner">{catcherStatusMsg}</div>
                        {/if}

                        {#if catcherPhase !== "playing"}
                            <div class="arcade-crt-overlay">
                                <div class="crt-title" style="color:#ccff66;">
                                    {catcherPhase === "won"
                                        ? "🫙✨ WILD FIREFLY CAPTURED!"
                                        : "💨 THE FIREFLY DARTED INTO THE TREES!"}
                                </div>
                                <p class="crt-sub">
                                    {catcherPhase === "won"
                                        ? `You now have ${fireflyJarCount} firefl${fireflyJarCount === 1 ? "y" : "ies"} in your jar to light a 24h Sky Wish Lantern!`
                                        : "Track the darting glow and time 3 net swings while avoiding 🐝 & 🦇."}
                                </p>
                            </div>
                        {/if}
                    </div>

                    <div class="arcade-controls-row">
                        {#if catcherPhase === "playing"}
                            <button class="win98-btn cashout-btn" style="flex:1;" onclick={() => swingFireflyNet()}>
                                🦋 SWING NET! [Click / Space] ({catcherHits}/{CATCHER_REQUIRED_HITS})
                            </button>
                        {:else}
                            <button class="win98-btn" style="flex:1;" onclick={startFireflyCatcherGame}>
                                🔄 Hunt Another Firefly
                            </button>
                            <button
                                class="win98-btn primary-start-btn"
                                style="flex:1.2;"
                                onclick={() => {
                                    closeFireflyCatcher();
                                    openLanternSanctuary();
                                }}
                            >
                                🏮 Go to Sky Lanterns ({fireflyJarCount} ✨)
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 6: 🏮 24-HOUR SKY WISH LANTERN SANCTUARY -->
    {#if showLanternModal}
        <div class="modal-overlay" onclick={() => (showLanternModal = false)}>
            <div class="win98-window lantern-sanctuary-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🏮 Whispering Woods — 24-Hour Sky Wish Lantern Sanctuary</span>
                    <button class="win98-close" onclick={() => (showLanternModal = false)}>X</button>
                </div>
                <div class="win98-body lantern-sanctuary-body">
                    <!-- Top Firefly Jar & Compose Bar -->
                    <div class="lantern-compose-card">
                        <div class="lantern-compose-top">
                            <div class="jar-status-badge" class:has-firefly={fireflyJarCount > 0}>
                                <span>🫙 Firefly Jar: <strong>{fireflyJarCount} Caught ✨</strong></span>
                                <small>(1 Captured Firefly lights 1 24-Hour Lantern)</small>
                            </div>
                            <button
                                class="win98-btn"
                                style="background:#1b5e20; color:#ccff66; font-weight:bold;"
                                onclick={() => {
                                    showLanternModal = false;
                                    openFireflyCatcher();
                                }}
                            >
                                🦋 Hunt Wild Firefly
                            </button>
                        </div>

                        <div class="lantern-color-row">
                            <span class="field-label">Lantern Glow:</span>
                            <div class="lantern-color-pills">
                                {#each LANTERN_COLOR_OPTIONS as cOpt}
                                    <button
                                        type="button"
                                        class="win98-btn lantern-color-btn"
                                        class:active-wager={selectedLanternColor === cOpt.id}
                                        onclick={() => (selectedLanternColor = cOpt.id)}
                                    >
                                        <span class="color-dot" style="background:{cOpt.hex};"></span>
                                        {cOpt.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        {#if fireflyJarCount > 0}
                            <div class="lantern-input-row">
                                <input
                                    type="text"
                                    class="win98-input"
                                    style="flex:1; padding:6px 8px; font-size:12px;"
                                    placeholder="Write a wish or message for the woods (stays in the sky for 24 hours)..."
                                    bind:value={fireflyWishInput}
                                    maxlength="120"
                                    onkeydown={(e) => {
                                        if (e.key === "Enter") releaseFireflyWish();
                                    }}
                                />
                                <button
                                    class="win98-btn primary-start-btn"
                                    disabled={isReleasingLantern || !fireflyWishInput.trim()}
                                    onclick={releaseFireflyWish}
                                >
                                    {isReleasingLantern ? "Releasing..." : "🏮 Light & Release (24h)"}
                                </button>
                            </div>
                        {:else}
                            <div class="lantern-need-firefly-notice">
                                <span>🦋 Your Firefly Jar is empty! Catch a wild firefly flying in the Whispering Woods to light a 24-hour Wish Lantern.</span>
                                <button
                                    class="win98-btn primary-start-btn"
                                    onclick={() => {
                                        showLanternModal = false;
                                        openFireflyCatcher();
                                    }}
                                >
                                    🦋 Catch a Firefly Now
                                </button>
                            </div>
                        {/if}
                    </div>

                    <!-- Starry Night Sky Gallery of Active 24-Hour Lanterns -->
                    <div class="lantern-sky-header">
                        <span>🌌 Active Sky Lanterns ({wishLanterns.length}) — Persists Globally for 24 Hours</span>
                    </div>

                    <div class="lantern-sky-grid">
                        {#if wishLanterns.length === 0}
                            <div class="lantern-sky-empty">
                                No lanterns are floating right now. Catch a firefly and release the first wish into the night sky!
                            </div>
                        {:else}
                            {#each wishLanterns as lantern (lantern.id)}
                                {@const colorMeta = LANTERN_COLOR_OPTIONS.find((c) => c.id === lantern.color) || LANTERN_COLOR_OPTIONS[0]}
                                {@const hasLiked = lantern.likes.some((u) => u.toLowerCase() === myUsername.replace(/^@/, "").toLowerCase())}
                                <div class="sky-lantern-card" style="--lantern-accent: {colorMeta.hex};">
                                    <div class="sky-lantern-card-head">
                                        <span class="sky-lantern-author">
                                            <span class="sky-lantern-ico">🏮</span>
                                            <strong>@{lantern.username}</strong>
                                        </span>
                                        <span class="sky-lantern-ttl" title="Expires after 24 hours">
                                            ⏳ {formatLanternTimeRemaining(lantern.expires_at)}
                                        </span>
                                    </div>
                                    <p class="sky-lantern-wish">"{lantern.wish}"</p>
                                    <div class="sky-lantern-card-foot">
                                        <button
                                            class="win98-btn lantern-glow-btn"
                                            class:glowed={hasLiked}
                                            onclick={() => handleGlowLantern(lantern.id)}
                                        >
                                            ✨ Glow {lantern.likes.length > 0 ? `(${lantern.likes.length})` : ""}
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 7: 🏛️ UWU GRAND ART MUSEUM — 2D GALLERY EASEL, 3D ISOBRICK BUILDER, PERSONAL ART VAULT & @0XSHA3 CURATOR DESK -->
    {#if showMuseumModal}
        <MuseumStudioModal
            {museumState}
            initialTab={museumModalTab}
            initialSpotNumber={activeMuseumSpot}
            myUserId={myId}
            myUsername={myUsername}
            myDisplayName={$userProfile?.x_display_name || myUsername}
            myAvatarUrl={toCompactAvatarUrl($userProfile?.avatar_url, $userProfile?.avatar_traits)}
            myChips={chips}
            onClose={() => (showMuseumModal = false)}
            onSaveToVault={handleSaveArtworkToVault}
            onExhibitOnSpot={handleExhibitArtworkOnSpot}
            onSubmitToQueue={handleSubmitArtworkToQueue}
            onCuratorApproveToSpot={handleCuratorApproveToSpot}
            onRemoveFromQueue={handleRemoveFromCuratorQueue}
            onVacateSpot={handleVacateMuseumSpot}
            onDeleteFromVault={handleDeleteArtworkFromVault}
            onToggleLike={handleToggleMuseumLike}
            onTipArtist={(artistUsername) => {
                showMuseumModal = false;
                openSendUwuModal(artistUsername);
            }}
        />
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
                                onclick={() => handleWorldXLogin("oauth1")}
                                disabled={isLoggingInWithX}
                            >
                                <span class="gate-x-logo">𝕏</span>
                                <span>{isLoggingInWithX ? "Connecting to 𝕏..." : "Sign In with 𝕏 to Play"}</span>
                            </button>

                            <button
                                type="button"
                                class="win98-btn gate-secondary-btn"
                                onclick={() => handleWorldXLogin("oauth2")}
                                disabled={isLoggingInWithX}
                            >
                                ⚡ Sign In via 𝕏 OAuth 2.0 (Fixes "No request token")
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
        flex-wrap: nowrap;
        min-height: 32px;
        box-sizing: border-box;
    }

    .toolbar-left,
    .toolbar-right,
    .quick-travel-bar {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .toolbar-left {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
    }

    .toolbar-right {
        flex-shrink: 0;
        white-space: nowrap;
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
        white-space: nowrap;
        flex-shrink: 0;
    }

    .room-pill {
        width: 195px;
        max-width: 195px;
        min-width: 0;
        flex: 0 1 195px;
        justify-content: space-between;
        overflow: hidden;
        box-sizing: border-box;
    }

    .room-name-text {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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

    .museum-open-btn {
        background: #4a148c;
        color: #ffd700;
        font-weight: bold;
        padding: 2px 7px;
    }

    .museum-item {
        color: #4a148c;
        font-weight: bold;
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
        left: 0;
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

    /* 3D Visual Craps Dice Arena (2-to-4 Party Turn-Based Grid) */
    .dice-turn-banner {
        background: #102027;
        color: #e0f7fa;
        border: 1px solid #4fc3f7;
        padding: 5px 8px;
        font-size: 11px;
        text-align: center;
        border-radius: 2px;
        line-height: 1.3;
    }

    .dice-turn-banner.my-turn {
        background: linear-gradient(90deg, #004d40, #1b5e20);
        color: #ffff00;
        border-color: #00ff88;
        box-shadow: 0 0 8px rgba(0, 255, 136, 0.45);
    }

    .dice-turn-banner.finished {
        background: #311b92;
        color: #ffd700;
        border-color: #ffd700;
    }

    .dice-arena-box {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        background: radial-gradient(circle at 50% 50%, #0d4228 0%, #062315 100%);
        border: 2px inset #808080;
        padding: 8px;
        color: #ffffff;
    }

    .dice-fighter-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        background: rgba(0, 0, 0, 0.38);
        border: 1px solid rgba(255, 255, 255, 0.22);
        padding: 6px;
        border-radius: 3px;
        transition: border-color 0.15s, box-shadow 0.15s;
    }

    .dice-fighter-card.active-turn-glow {
        border-color: #00ff88;
        box-shadow: inset 0 0 10px rgba(0, 255, 136, 0.38), 0 0 6px rgba(0, 255, 136, 0.35);
        background: rgba(0, 255, 136, 0.12);
    }

    .dice-fighter-card.winner-glow {
        border-color: #ffd700;
        box-shadow: inset 0 0 12px rgba(255, 215, 0, 0.5);
        background: rgba(255, 215, 0, 0.16);
    }

    .fighter-header {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        font-weight: bold;
        gap: 4px;
    }

    .fighter-name {
        color: #e0f7fa;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 110px;
    }

    .fighter-sum {
        background: #000000;
        color: #ffd700;
        font-size: 12px;
        font-family: monospace;
        padding: 1px 5px;
        border: 1px solid #ffd700;
        border-radius: 2px;
        flex-shrink: 0;
    }

    .party-turn-pill-row {
        width: 100%;
        display: flex;
        justify-content: center;
    }

    .party-state-tag {
        font-size: 9px;
        font-weight: bold;
        padding: 1px 6px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.12);
        color: #cfd8dc;
    }

    .party-state-tag.active {
        background: #00e676;
        color: #002211;
    }

    .party-state-tag.done {
        background: rgba(0, 229, 255, 0.22);
        color: #84ffff;
        border: 1px solid rgba(0, 229, 255, 0.45);
    }

    .party-state-tag.win {
        background: #ffd700;
        color: #000000;
    }

    .dice-pair-row {
        display: flex;
        gap: 8px;
        margin: 2px 0;
    }

    .visual-die-3d {
        width: 38px;
        height: 38px;
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
        padding: 4px;
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
        width: 6px;
        height: 6px;
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
        border: 1px solid transparent;
    }

    .mini-r-chip.current {
        border-color: #ffd700;
        color: #ffff00;
    }

    .mini-r-chip.filled {
        background: rgba(0, 255, 136, 0.22);
        color: #ffffff;
        font-weight: bold;
    }

    .dice-lobby-btns {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
    }

    .roll-my-turn-btn {
        background: linear-gradient(90deg, #00c853, #009624) !important;
        color: #ffffff !important;
        font-size: 12px !important;
        padding: 7px 10px !important;
        box-shadow: 0 0 8px rgba(0, 230, 118, 0.5);
    }

    .pvp-ready-btn.is-ready {
        background: #1b5e20 !important;
        color: #ffff00 !important;
    }

    .start-ready-now-btn {
        background: #ff6f00 !important;
        color: #ffffff !important;
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

    .arcade-brick.armored-brick {
        border: 2px solid #ffffff;
        box-shadow: 0 0 8px #ffd700, inset 0 0 4px rgba(0, 0, 0, 0.5);
    }

    .snake-hazard-cell {
        position: absolute;
        width: 20px;
        height: 18.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        background: rgba(255, 23, 68, 0.28);
        border: 1px solid #ff1744;
        box-shadow: 0 0 6px rgba(255, 23, 68, 0.6);
        border-radius: 2px;
    }

    /* Persistent Global Top 10 Arcade High Score Board */
    .arcade-leaderboard-panel {
        background: #0b0e1a;
        border: 2px inset #808080;
        padding: 6px 8px;
        color: #e0f7fa;
        font-size: 11px;
    }

    .arcade-lb-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        padding-bottom: 4px;
        margin-bottom: 4px;
        border-bottom: 1px solid rgba(0, 255, 255, 0.25);
        font-weight: bold;
        color: #ffd700;
        font-size: 10.5px;
    }

    .arcade-lb-sub {
        color: #00ffff;
        font-weight: bold;
    }

    .arcade-lb-list {
        max-height: 112px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .arcade-lb-empty {
        text-align: center;
        padding: 8px;
        color: #90a4ae;
        font-style: italic;
    }

    .arcade-lb-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 2px;
    }

    .arcade-lb-row.is-me {
        background: rgba(0, 255, 136, 0.16);
        border: 1px solid rgba(0, 255, 136, 0.45);
    }

    .arcade-lb-rank {
        width: 28px;
        font-weight: bold;
        color: #ffd700;
    }

    .arcade-lb-user {
        flex: 1;
        font-weight: bold;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .you-pill {
        background: #00e676;
        color: #002412;
        padding: 0 4px;
        border-radius: 2px;
        font-size: 9px;
        font-weight: bold;
    }

    .arcade-lb-score {
        font-family: monospace;
        font-weight: bold;
        color: #00ffff;
    }

    /* Wild Firefly Net Catcher Mini-Game Modal */
    .firefly-catcher-window {
        width: 400px;
        max-width: 96vw;
    }

    .firefly-catcher-stage {
        background: radial-gradient(circle at 50% 25%, #163324 0%, #07140d 65%, #030906 100%);
        box-shadow: inset 0 0 22px rgba(105, 240, 174, 0.25);
        cursor: crosshair;
    }

    .catcher-moon {
        position: absolute;
        top: 10px;
        right: 16px;
        font-size: 22px;
        opacity: 0.75;
        pointer-events: none;
    }

    .catcher-firefly-sprite {
        position: absolute;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(234, 255, 123, 0.95) 0%, rgba(105, 240, 174, 0.45) 55%, transparent 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        box-shadow: 0 0 14px #ccff66;
    }

    .catcher-firefly-core {
        font-size: 16px;
        filter: drop-shadow(0 0 4px #ffffff);
    }

    .catcher-decoy-sprite {
        position: absolute;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        pointer-events: none;
        filter: drop-shadow(0 0 5px #ff1744);
    }

    .catcher-net-reticle {
        position: absolute;
        width: 44px;
        height: 44px;
        border: 2px dashed rgba(204, 255, 102, 0.85);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        pointer-events: none;
        transition: transform 0.08s ease;
        background: rgba(204, 255, 102, 0.08);
    }

    .catcher-net-reticle.net-swinging {
        transform: scale(1.25) rotate(-18deg);
        border-style: solid;
        border-color: #ffffff;
        background: rgba(204, 255, 102, 0.32);
        box-shadow: 0 0 14px #ccff66;
    }

    .catcher-feedback-banner {
        position: absolute;
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(5, 20, 12, 0.9);
        border: 1px solid #ccff66;
        color: #ccff66;
        padding: 2px 10px;
        font-size: 11px;
        font-weight: bold;
        white-space: nowrap;
        pointer-events: none;
    }

    /* 24-Hour Sky Wish Lantern Sanctuary Modal */
    .lantern-sanctuary-window {
        width: 560px;
        max-width: 96vw;
    }

    .lantern-sanctuary-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lantern-compose-card {
        background: linear-gradient(180deg, #0d1f17 0%, #07120d 100%);
        border: 2px inset #2e7d32;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        color: #e8f5e9;
    }

    .lantern-compose-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }

    .jar-status-badge {
        display: flex;
        flex-direction: column;
        font-size: 11px;
        color: #ffd54f;
    }

    .jar-status-badge.has-firefly {
        color: #ccff66;
    }

    .jar-status-badge small {
        font-size: 10px;
        color: #a5d6a7;
    }

    .lantern-color-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 11px;
    }

    .lantern-color-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .lantern-color-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10.5px;
        padding: 3px 7px;
    }

    .color-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        border: 1px solid #000;
        display: inline-block;
    }

    .lantern-input-row {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .lantern-need-firefly-notice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        background: rgba(255, 213, 79, 0.12);
        border: 1px dashed #ffd54f;
        padding: 6px 8px;
        font-size: 11px;
        color: #fff8e1;
    }

    .lantern-sky-header {
        font-size: 11px;
        font-weight: bold;
        color: #1b5e20;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .lantern-sky-grid {
        max-height: 250px;
        overflow-y: auto;
        background: radial-gradient(circle at 50% 15%, #162238 0%, #090d18 75%, #05070e 100%);
        border: 3px inset #808080;
        padding: 8px;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .lantern-sky-empty {
        grid-column: 1 / -1;
        text-align: center;
        padding: 28px 12px;
        color: #b0bec5;
        font-size: 11.5px;
    }

    .sky-lantern-card {
        background: rgba(14, 22, 38, 0.88);
        border: 1px solid var(--lantern-accent, #ffd54f);
        box-shadow: 0 0 10px rgba(255, 213, 79, 0.15);
        border-radius: 4px;
        padding: 7px 9px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 5px;
        color: #ffffff;
    }

    .sky-lantern-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 4px;
        font-size: 10.5px;
    }

    .sky-lantern-author {
        color: var(--lantern-accent, #ffd54f);
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .sky-lantern-ttl {
        font-size: 9.5px;
        color: #90caf9;
        background: rgba(0, 0, 0, 0.45);
        padding: 1px 5px;
        border-radius: 3px;
    }

    .sky-lantern-wish {
        margin: 2px 0;
        font-size: 11.5px;
        line-height: 1.35;
        color: #fffde7;
        word-break: break-word;
    }

    .sky-lantern-card-foot {
        display: flex;
        justify-content: flex-end;
    }

    .lantern-glow-btn {
        font-size: 10px;
        padding: 2px 7px;
        background: #1c2838;
        color: #ffe082;
    }

    .lantern-glow-btn.glowed {
        background: #ffd54f;
        color: #1a1200;
        font-weight: bold;
    }

    @media (max-width: 768px) {
        .mmo-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
            padding: 4px 6px;
        }
        .toolbar-left {
            width: 100%;
            justify-content: space-between;
            flex-wrap: nowrap;
        }
        .room-pill {
            width: 0;
            max-width: none;
            flex: 1 1 0;
        }
        .toolbar-right {
            width: 100%;
            flex-wrap: wrap;
            gap: 4px;
        }
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
        .my-stats-banner,
        .lantern-sky-grid {
            grid-template-columns: repeat(1, 1fr);
        }
    }
</style>
