<!-- src/lib/components/os/UwUWorldApp.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { userProfile } from "$lib/stores/auth";
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
        StaticFloorCache,
        drawRichIsometricTile,
        resolveMoveWithSliding,
        getCurrentZone,
        type WorldObject
    } from "$lib/game/isometric/worldMap";
    import { findPath, type Point } from "$lib/game/isometric/pathfinding";
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
        VaultManager,
        DiceDuelManager,
        RouletteGameManager,
        ROULETTE_SECTORS,
        BETTABLE_ROULETTE_SECTORS,
        DJ_TRACKS,
        RETRO_PALETTE_16,
        type MusicGenre
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
    const vaultManager = new VaultManager();
    const diceManager = new DiceDuelManager();
    const rouletteManager = new RouletteGameManager();
    const floorCache = new StaticFloorCache();

    // Svelte 5 Reactivity Version Counters
    let diceTick = $state(0);
    let rouletteTick = $state(0);
    let vaultTick = $state(0);

    // Local Player State — Spawn on the wide-open Central VIP Crosswalk (15.5, 16.5)
    let myId = $state("");
    let myUsername = $state("anon");
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
    let currentZoneName = $state("🎲 High Roller Casino Lounge");
    let chatInput = $state("");
    let chatInputEl: HTMLInputElement | null = $state(null);
    let isChatFocused = $state(false);
    let recentChatLog = $state<Array<{ user: string; text: string; ts: number }>>([]);
    let isMusicPlaying = $state(true);
    let currentTrackId = $state(3); // Start on Ibiza Deep House Groove
    const DJ_GENRE_FILTERS: Array<MusicGenre | "All"> = ["All", "Classical", "House", "Electronic", "Techno", "Rave"];
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

    // Persistent Offscreen Graffiti Canvas (48x32)
    let persistentGraffitiCanvas: HTMLCanvasElement | null = null;
    let persistentGraffitiCtx: CanvasRenderingContext2D | null = null;
    let graffitiCanvas: HTMLCanvasElement | null = $state(null);
    let graffitiCtx: CanvasRenderingContext2D | null = null;
    let selectedGraffitiColor = $state("#00ffff");
    let graffitiBrushSize = $state(1);
    let isGraffitiPainting = false;
    let graffitiSaveTimeout: number | null = null;

    // Active Proximity Game Station (Strictly ONE station active at a time, with tight 2.3-tile radius!)
    let activeStation = $state<"none" | "dice" | "roulette" | "blackjack" | "slots" | "crash" | "mines" | "vault">("none");
    let isSeatedAtDiceTable = $state(false);
    let myDiceSeatIndex = $state(-1);
    let amIReady = $state(false);
    let activeDiceWager = $state(100);

    // Meme Roulette State (Strict Paid-Bet Validation)
    let activeRouletteBet = $state<string>("pepe");
    let lockedRouletteBetId = $state<string | null>(null);
    let lockedRouletteWager = $state(0);

    // --- CYBER BLACKJACK 21 STATE ---
    interface PlayingCard {
        rank: string;
        suit: string;
        value: number;
    }
    let bjPhase = $state<"betting" | "player" | "dealer" | "done">("betting");
    let bjPlayerHand = $state<PlayingCard[]>([]);
    let bjDealerHand = $state<PlayingCard[]>([]);
    let bjMessage = $state("Place your $UWU bet and click DEAL HAND!");
    let bjCurrentBet = $state(100);

    // --- GOLDEN UWU SLOTS STATE (Weighted Virtual Reel with ~9% House Edge) ---
    const SLOT_REEL_STRIP = [
        "💀", "💀", "💀", "💀", "💀", "💀", "💀", // 35% Blank Skull
        "🍒", "🍒", "🍒", "🍒", "🍒",             // 25% Cherry
        "🐸", "🐸", "🐸", "🐸",                   // 20% Pepe
        "🚀", "🚀", "🚀",                         // 15% Rocket
        "💎",                                     // 5% Diamond
        "🦄"                                      // Rare Jackpot
    ];
    let slotReels = $state<[string, string, string]>(["🍒", "🐸", "🚀"]);
    let isSlotSpinning = $state(false);
    let slotMessage = $state("Match 3 across or first 2 symbols to win! (House Edge: 9%)");

    // --- NEW GAME 1: ROCKET CRASH MULTIPLIER STATE ---
    let crashPhase = $state<"idle" | "flying" | "crashed" | "cashed_out">("idle");
    let crashMultiplier = $state(1.0);
    let crashTargetPoint = 1.0;
    let crashBetAmount = $state(100);
    let crashMessage = $state("Launch the UwU Rocket and CASH OUT before it crashes!");
    let crashTimerId: number | null = null;
    let crashHistory = $state<number[]>([1.42, 2.85, 1.0, 4.12, 1.18]);

    // --- NEW GAME 2: CYBER MINES (5x5 Grid) STATE ---
    let minesPhase = $state<"idle" | "playing" | "boom" | "cashed">("idle");
    let minesBombCount = $state(5);
    let minesBetAmount = $state(100);
    let minesRevealed = $state<boolean[]>(Array(25).fill(false));
    let minesBombLocations = $state<boolean[]>(Array(25).fill(false));
    let minesSafeClicks = $state(0);
    let minesCurrentMultiplier = $state(1.0);
    let minesMessage = $state("Reveal safe 💎 tiles to multiply your bet—cash out before hitting a 💣!");

    // --- 90s ARCADE: CYBER COIN RUSH MINI-GAME ---
    let arcadeActive = $state(false);
    let arcadeScore = $state(0);
    let arcadeHighScore = $state(120);
    let arcadeTimeLeft = $state(20);
    let arcadePlayerX = $state(50);
    let arcadeItems = $state<Array<{ id: number; x: number; y: number; type: "coin" | "gem" | "bomb"; speed: number }>>([]);
    let arcadeTimerId: number | null = null;
    let arcadeTickId: number | null = null;

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

    onMount(() => {
        floorCache.build();
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
            const idx = diceManager.getSeatedPlayerSeat(myId);
            myDiceSeatIndex = idx;
            isSeatedAtDiceTable = idx !== -1;
            amIReady = idx !== -1 ? diceManager.seats[idx].isReady : false;
        };
        rouletteManager.onStateChanged = () => {
            rouletteTick++;
        };
        vaultManager.onStateChanged = () => {
            vaultTick++;
        };

        const profile = $userProfile;
        myId = profile?.id || "user_" + Math.random().toString(36).substring(2, 9);
        myUsername = profile?.x_username || "anon" + Math.floor(Math.random() * 900 + 100);
        const avatarUrl = profile?.avatar_url || "/unicorn.png";

        loadOrInitPlayerStats(myId, myUsername, avatarUrl, profile?.x_display_name).then((loaded) => {
            chips = loaded.chips;
            myWins = loaded.wins;
            myLosses = loaded.losses;
            myNetProfit = loaded.net_profit;
            myHighScore = loaded.high_score;
            lastDailyClaimIso = loaded.last_daily_claim;
            refreshDailyRewardStatus();
            networkManager?.broadcastStats(loaded);
        });

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
            losses: myLosses
        };

        networkManager = new WorldNetworkManager(myId, initialAvatar);
        networkManager.onOnlineCountChanged = (count) => {
            onlineCount = count;
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
        networkManager.onVaultUnlocked = (heroes) => {
            triggerConfettiCelebration();
            synth.playWinFanfare();
            hasVaultCrown = true;
            recordGameOutcome(1000, "win", 1000);
            showToast(`💎 VAULT CRACKED BY ${heroes.join(", ")}! (+1,000 $UWU Bonus!)`, 8000);
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
        };
        networkManager.onDiceRollRound = (round, scores) => {
            synth.playDiceRollSfx();
            scores.forEach((s) => diceManager.scores.set(s.id, s));
            diceManager.currentRound = round;
            diceManager.lastRollTimestamp = performance.now();
            diceTick++;
        };
        networkManager.onDiceTournamentWon = (winner) => {
            diceTick++;
            if (winner.id === myId) {
                triggerConfettiCelebration();
                synth.playWinFanfare();
                hasHighRollerCrown = true;
                const payout = Math.round(activeDiceWager * 1.8); // 10% House Rake!
                recordGameOutcome(payout, "win", payout - activeDiceWager);
                showToast(`👑 YOU WON THE DICE DUEL! Payout: +${payout} $UWU (1.8x)!`, 7500);
            } else if (diceManager.scores.has(myId)) {
                recordGameOutcome(0, "loss", 0);
                showToast(`🎲 ${winner.username} won the Dice Duel (${winner.totalSum} pts). House takes the pot!`, 5500);
            }
        };
        networkManager.onRouletteSpinResult = (winner) => {
            if (!rouletteManager.isSpinning) {
                const targetIdx = ROULETTE_SECTORS.findIndex((s) => s.id === winner.id);
                rouletteManager.spin(targetIdx !== -1 ? targetIdx : undefined);
            }
        };
        networkManager.onCasinoJackpot = (user, game, amount) => {
            showToast(`🎰 HIGH ROLLER ALERT: @${user} won +${amount} $UWU on ${game}!`, 5500);
        };
        networkManager.onWebRTCSignal = (fromUserId, payload) => {
            voiceManager?.handleSignalingMessage(fromUserId, payload);
        };

        networkManager.init();

        // Local Dice & Roulette Manager Callbacks
        diceManager.onRoundRoll = (round, scores) => {
            synth.playDiceRollSfx();
            diceTick++;
            networkManager?.broadcastDiceRollRound(round, scores);
        };
        diceManager.onTournamentWon = (winner) => {
            diceTick++;
            networkManager?.broadcastDiceTournamentWon(winner);
            if (winner.id === myId) {
                triggerConfettiCelebration();
                synth.playWinFanfare();
                hasHighRollerCrown = true;
                const payout = Math.round(activeDiceWager * 1.8); // 10% House Rake
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
        };

        rouletteManager.onSpinFinished = (winner) => {
            rouletteTick++;
            networkManager?.broadcastRouletteSpin(winner);

            // STRICT PAID-BET VALIDATION: Only pay out if the player actually locked and paid a bet for this spin!
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
                        `🎡 Landed on ${winner.icon} ${winner.name} (${winner.multiplier}x). House wins your ${wagerAmt} $UWU bet!`,
                        5000
                    );
                }
            } else {
                showToast(`🎡 Roulette landed on ${winner.icon} ${winner.name} (${winner.multiplier}x)!`, 3500);
            }
        };

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
                true
            );
        };
        voiceManager.onSignalingMessage = (toUserId, payload) => {
            networkManager?.sendWebRTCSignal(toUserId, payload);
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
        stopArcadeMiniGame();
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
        if (!hasMicPermission) {
            hasMicPermission = await voiceManager.init();
        }
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (isChatFocused || showTransferModal || document.activeElement === chatInputEl) return;

        if (showArcadeModal && arcadeActive) {
            if (e.code === "ArrowLeft" || e.code === "KeyA") {
                e.preventDefault();
                arcadePlayerX = Math.max(8, arcadePlayerX - 9);
                return;
            }
            if (e.code === "ArrowRight" || e.code === "KeyD") {
                e.preventDefault();
                arcadePlayerX = Math.min(92, arcadePlayerX + 9);
                return;
            }
        }

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
            true
        );
    }

    function triggerEmote(emote: string) {
        synth.playChipSfx();
        currentEmote = { icon: emote, expiresAt: Date.now() + 5000 };
        networkManager?.broadcastEmote(emote);
    }

    function teleportTo(gx: number, gy: number, zoneTitle: string) {
        const resolved = resolveMoveWithSliding(gx, gy, 0, 0, 0.22);
        myX = resolved.x;
        myY = resolved.y;
        activeWaypoints = [];
        pendingInteractionTarget = null;
        showGuideModal = false;
        showToast(`⚡ Teleported to ${zoneTitle}!`, 3000);
        networkManager?.broadcastPosition(
            myX,
            myY,
            myDir,
            false,
            isDancing,
            isSpeaking,
            DANCE_MOVES[currentDanceIndex].id,
            true
        );
    }

    function handleInteraction() {
        if (gridDistance(myX, myY, 16.0, 2.5) <= 3.2) {
            showDJModal = true;
            return;
        }
        if (gridDistance(myX, myY, 27.5, 15.5) <= 3.2) {
            openGraffitiModal();
            return;
        }
        if (gridDistance(myX, myY, 27.5, 12.5) <= 3.0) {
            openArcadeModal();
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
    }

    function ensureEnoughChips(wager: number): boolean {
        if (chips >= wager) return true;
        refreshDailyRewardStatus();
        if (dailyStatus.canClaim) {
            showToast(`🪙 Low on $UWU! Click "🎁 Daily +1,000" in the top bar to claim your daily reward!`, 4500);
        } else {
            showToast(`🪙 Insufficient $UWU (Need ${wager} $UWU). Play the 90s Arcade or wait for Daily Reward!`, 4500);
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
            showToast(`🎲 Seated at ${seat.label}! Click "Roll 3-Round Duel vs House Dealer" to play!`, 3000);
        } else {
            activeWaypoints = findPath(myX, myY, seat.coord.x, seat.coord.y, COLLISION_MAP, MAP_SIZE);
            waypointStuckFrames = 0;
        }
    }

    function startInstantSoloDiceDuel() {
        if (diceManager.phase !== "idle") return;
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
    }

    function toggleDicePvPReady() {
        if (diceManager.phase !== "idle") return;
        syncLocalPlayerIntoDiceRoster();
        if (!amIReady) {
            if (!ensureEnoughChips(selectedWager)) return;
            activeDiceWager = selectedWager;
            recordGameOutcome(-activeDiceWager, "neutral", 0);
            synth.playChipSfx();
        }
        amIReady = diceManager.toggleReady(myId);
        diceTick++;
        networkManager?.broadcastDiceSeats(diceManager.seats);
    }

    // --- 2. WEIGHTED MEME ROULETTE ACTIONS ---
    function selectRouletteSector(betId: string) {
        activeRouletteBet = betId;
        synth.playChipSfx();
        const sec = BETTABLE_ROULETTE_SECTORS.find((s) => s.id === betId);
        if (sec && gridDistance(myX, myY, sec.tile.x + 0.5, sec.tile.y + 0.5) > 1.2) {
            activeWaypoints = findPath(myX, myY, sec.tile.x + 0.5, sec.tile.y + 0.5, COLLISION_MAP, MAP_SIZE);
            waypointStuckFrames = 0;
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
        crashMessage = "🚀 ROCKET CLIMBING! Click CASH OUT before it explodes!";
        synth.playChipSfx();

        if (crashTimerId) clearInterval(crashTimerId);
        const startTs = performance.now();

        crashTimerId = window.setInterval(() => {
            const elapsedSec = (performance.now() - startTs) / 1000;
            const nextMult = Math.floor(Math.pow(1.085, elapsedSec * 10) * 100) / 100;

            if (nextMult >= crashTargetPoint) {
                if (crashTimerId) clearInterval(crashTimerId);
                crashTimerId = null;
                crashMultiplier = crashTargetPoint;
                crashPhase = "crashed";
                crashHistory = [crashTargetPoint, ...crashHistory.slice(0, 5)];
                synth.playDiceRollSfx();
                recordGameOutcome(0, "loss", 0);
                crashMessage = `💥 CRASHED at ${crashTargetPoint.toFixed(2)}x! House takes ${crashBetAmount} $UWU.`;
            } else {
                crashMultiplier = nextMult;
            }
        }, 60);
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

    // --- 6. NEW GAME: CYBER MINES (5x5 Grid with 8% House Edge) ---
    function startCyberMines() {
        if (!ensureEnoughChips(selectedWager)) return;
        minesBetAmount = selectedWager;
        recordGameOutcome(-minesBetAmount, "neutral", 0);

        const bombs = Array(25).fill(false);
        let placed = 0;
        while (placed < minesBombCount) {
            const idx = Math.floor(Math.random() * 25);
            if (!bombs[idx]) {
                bombs[idx] = true;
                placed++;
            }
        }
        minesBombLocations = bombs;
        minesRevealed = Array(25).fill(false);
        minesSafeClicks = 0;
        minesCurrentMultiplier = 1.0;
        minesPhase = "playing";
        minesMessage = `Pick a tile! (${25 - minesBombCount} 💎 Gems, ${minesBombCount} 💣 Bombs hidden)`;
        synth.playChipSfx();
    }

    function clickMinesTile(idx: number) {
        if (minesPhase !== "playing" || minesRevealed[idx]) return;
        minesRevealed[idx] = true;
        minesRevealed = [...minesRevealed];

        if (minesBombLocations[idx]) {
            minesPhase = "boom";
            synth.playDiceRollSfx();
            recordGameOutcome(0, "loss", 0);
            minesMessage = `💥 BOOM! You hit a Glitch Bomb! House takes ${minesBetAmount} $UWU.`;
        } else {
            minesSafeClicks++;
            // Combinatorial multiplier with 8% House Edge (0.92 factor)
            let prob = 1.0;
            for (let i = 0; i < minesSafeClicks; i++) {
                prob *= (25 - minesBombCount - i) / (25 - i);
            }
            minesCurrentMultiplier = Math.max(1.05, Math.floor((0.92 / prob) * 100) / 100);
            synth.playChipSfx();
            minesMessage = `💎 Safe! Multiplier: ${minesCurrentMultiplier.toFixed(2)}x (${Math.round(minesBetAmount * minesCurrentMultiplier)} $UWU)`;
        }
    }

    function cashOutCyberMines() {
        if (minesPhase !== "playing" || minesSafeClicks === 0) return;
        minesPhase = "cashed";
        const win = Math.round(minesBetAmount * minesCurrentMultiplier);
        recordGameOutcome(win, "win", win - minesBetAmount);
        synth.playWinFanfare();
        minesMessage = `💰 CASHED OUT +${win} $UWU (${minesCurrentMultiplier.toFixed(2)}x)!`;
    }

    // --- 7. 90s ARCADE: CYBER COIN RUSH ---
    function openArcadeModal() {
        showArcadeModal = true;
        startArcadeMiniGame();
    }

    function startArcadeMiniGame() {
        stopArcadeMiniGame();
        arcadeActive = true;
        arcadeScore = 0;
        arcadeTimeLeft = 20;
        arcadePlayerX = 50;
        arcadeItems = [];

        arcadeTimerId = window.setInterval(() => {
            arcadeTimeLeft--;
            if (arcadeTimeLeft <= 0) {
                finishArcadeMiniGame();
            }
        }, 1000);

        let nextId = 1;
        arcadeTickId = window.setInterval(() => {
            if (!arcadeActive) return;
            if (Math.random() < 0.35) {
                const rand = Math.random();
                const type = rand < 0.25 ? "bomb" : rand < 0.45 ? "gem" : "coin";
                arcadeItems.push({
                    id: nextId++,
                    x: 10 + Math.random() * 80,
                    y: 0,
                    type,
                    speed: 3.5 + Math.random() * 2.5
                });
            }

            const remaining: typeof arcadeItems = [];
            for (const item of arcadeItems) {
                item.y += item.speed;
                if (item.y >= 82 && item.y <= 96 && Math.abs(item.x - arcadePlayerX) <= 13) {
                    if (item.type === "coin") {
                        arcadeScore += 10;
                        synth.playChipSfx();
                    } else if (item.type === "gem") {
                        arcadeScore += 25;
                        synth.playWinFanfare();
                    } else {
                        arcadeScore = Math.max(0, arcadeScore - 30);
                        synth.playDiceRollSfx();
                    }
                } else if (item.y < 100) {
                    remaining.push(item);
                }
            }
            arcadeItems = remaining;
        }, 50);
    }

    function finishArcadeMiniGame() {
        stopArcadeMiniGame();
        if (arcadeScore > arcadeHighScore) {
            arcadeHighScore = arcadeScore;
        }
        if (arcadeScore > 0) {
            recordGameOutcome(arcadeScore, "win", arcadeScore);
            synth.playWinFanfare();
            showToast(`🕹️ Arcade Complete! You earned +${arcadeScore} $UWU Chips!`, 5000);
        }
    }

    function stopArcadeMiniGame() {
        arcadeActive = false;
        if (arcadeTimerId) {
            clearInterval(arcadeTimerId);
            arcadeTimerId = null;
        }
        if (arcadeTickId) {
            clearInterval(arcadeTickId);
            arcadeTickId = null;
        }
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
        if (!canvasElement || e.target !== canvasElement) return;

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

        // 1. Direct click on Roulette Betting Mats
        const clickedSector = BETTABLE_ROULETTE_SECTORS.find((s) => s.tile.x === gx && s.tile.y === gy);
        if (clickedSector) {
            selectRouletteSector(clickedSector.id);
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
            pendingInteractionTarget = "graffiti";
        } else if ((gx === 26 || gx === 28) && gy === 12) {
            pendingInteractionTarget = "arcade";
        } else if ((gx === 15 || gx === 16) && gy === 2) {
            pendingInteractionTarget = "dj";
        }

        activeWaypoints = findPath(myX, myY, gridPos.x, gridPos.y, COLLISION_MAP, MAP_SIZE);
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
    }

    function applyGraffitiDataUrl(dataUrl: string) {
        if (!dataUrl || typeof window === "undefined") return;
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
        };
        img.src = dataUrl;
    }

    function schedulePersistGraffiti() {
        if (graffitiSaveTimeout) clearTimeout(graffitiSaveTimeout);
        graffitiSaveTimeout = window.setTimeout(() => {
            if (!persistentGraffitiCanvas) return;
            const dataUrl = persistentGraffitiCanvas.toDataURL("image/png");
            saveGraffitiWallState(dataUrl, myUsername);
            networkManager?.broadcastGraffitiSnapshot(dataUrl);
        }, 450);
    }

    function openGraffitiModal() {
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
        if (persistentGraffitiCtx) {
            persistentGraffitiCtx.fillStyle = "#090418";
            persistentGraffitiCtx.fillRect(0, 0, 48, 32);
        }
        if (graffitiCtx) {
            graffitiCtx.fillStyle = "#090418";
            graffitiCtx.fillRect(0, 0, 384, 256);
        }
        schedulePersistGraffiti();
    }

    function handleGraffitiPointerDown(e: MouseEvent | TouchEvent) {
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
        if (!graffitiCanvas) return;
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
        let moveX = 0;
        let moveY = 0;
        const speed = 4.8;

        if (!isChatFocused && !showArcadeModal && !showTransferModal) {
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
                    else if (pendingInteractionTarget === "arcade") openArcadeModal();
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

            const res = resolveMoveWithSliding(myX, myY, stepX, stepY, 0.22);
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
            const safeRes = resolveMoveWithSliding(myX, myY, 0, 0, 0.22);
            myX = safeRes.x;
            myY = safeRes.y;
            isWalking = false;
            if (isDancing) {
                walkAnimTick += deltaSec * 5.8;
            }
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
            DANCE_MOVES[currentDanceIndex].id
        );

        networkManager?.tickInterpolation(deltaSec);

        if (voiceManager && networkManager) {
            voiceManager.updateSpatialVolumes({ x: myX, y: myY }, networkManager.getRemotePositions());
        }

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

        vaultManager.update(allPlayers, (heroes) => {
            triggerConfettiCelebration();
            synth.playWinFanfare();
            hasVaultCrown = true;
            recordGameOutcome(1000, "win", 1000);
            showToast(`💎 VAULT UNLOCKED! +1,000 $UWU Heist Bonus!`, 7000);
            networkManager?.broadcastVaultUnlocked(heroes);
        });

        diceManager.updateOccupants(allPlayers);

        // Well-Separated Station Proximity Detection (Strictly ONE active station within 2.35 tiles!)
        const stationCandidates: Array<{ id: typeof activeStation; dist: number; maxRadius: number }> = [
            { id: "dice", dist: gridDistance(myX, myY, 11.5, 13.5), maxRadius: 2.35 },
            { id: "roulette", dist: gridDistance(myX, myY, 19.5, 14.0), maxRadius: 2.5 },
            { id: "blackjack", dist: gridDistance(myX, myY, 11.5, 19.5), maxRadius: 2.35 },
            { id: "slots", dist: gridDistance(myX, myY, 21.0, 19.5), maxRadius: 2.25 },
            { id: "crash", dist: gridDistance(myX, myY, 15.5, 12.5), maxRadius: 2.2 },
            { id: "mines", dist: gridDistance(myX, myY, 27.5, 19.5), maxRadius: 2.35 },
            { id: "vault", dist: gridDistance(myX, myY, 5.5, 16.5), maxRadius: 3.4 }
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

        // Auto-select Roulette sector when stepping onto a Roulette floor mat (x: 18..20, y: 14..15)
        const curTx = Math.floor(myX);
        const curTy = Math.floor(myY);
        const matSector = BETTABLE_ROULETTE_SECTORS.find((s) => s.tile.x === curTx && s.tile.y === curTy);
        if (matSector && activeRouletteBet !== matSector.id) {
            activeRouletteBet = matSector.id;
            synth.playChipSfx();
            showToast(`🎰 Selected ${matSector.icon} ${matSector.name} (${matSector.multiplier}x)! Click LOCK BET & SPIN!`, 2800);
        }

        const zone = getCurrentZone(myX, myY);
        currentZoneName = zone ? zone.name : "🎲 High Roller Casino Lounge";

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
        grad.addColorStop(0, "#050510");
        grad.addColorStop(0.5, "#0d061c");
        grad.addColorStop(1, "#18092c");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        if (floorCache.canvas) {
            const mapOriginScreenX = canvasWidth / 2 - cameraX;
            const mapOriginScreenY = canvasHeight / 2 - cameraY;
            const drawX = Math.round(mapOriginScreenX - floorCache.originX);
            const drawY = Math.round(mapOriginScreenY - floorCache.originY);
            ctx.drawImage(floorCache.canvas, drawX, drawY);
        }

        for (let i = 0; i < ANIMATED_TILE_COORDS.length; i++) {
            const t = ANIMATED_TILE_COORDS[i];
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

        drawVaultConduitLines(ctx);

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

            const isSolid = COLLISION_MAP[hy]?.[hx];
            ctx.strokeStyle = isSolid ? "rgba(255, 180, 0, 0.85)" : "rgba(0, 255, 255, 0.9)";
            ctx.fillStyle = isSolid ? "rgba(255, 180, 0, 0.14)" : "rgba(0, 255, 255, 0.18)";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

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

        // 3. Collect & Depth-Sort 3D World Objects, Standing Transparent Unicorn House Dealers & Players
        renderEntities.length = 0;

        for (let i = 0; i < WORLD_OBJECTS.length; i++) {
            const obj = WORLD_OBJECTS[i];
            renderEntities.push({
                depth: calculateDepth(obj.x, obj.y, obj.z || 0, obj.depthOffset || 0),
                type: "obj",
                payload: obj
            });
        }

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

        const remotes = networkManager?.getRemotePlayers() || [];
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

    function drawVaultConduitLines(ctx: CanvasRenderingContext2D) {
        const vaultSc = gridToScreen(5.5, 16.5, 0, cameraX, cameraY, canvasWidth, canvasHeight);
        ctx.save();
        vaultManager.padCoordinates.forEach((pad, idx) => {
            const padSc = gridToScreen(pad.x, pad.y, 0, cameraX, cameraY, canvasWidth, canvasHeight);
            const active = vaultManager.state.pads[idx];
            ctx.strokeStyle = active ? "#00ff88" : "rgba(255, 50, 100, 0.45)";
            ctx.lineWidth = active ? 3 : 1.5;
            ctx.beginPath();
            ctx.moveTo(padSc.x, padSc.y);
            ctx.lineTo(vaultSc.x, vaultSc.y);
            ctx.stroke();
        });
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

            drawIsoPrism(ctx, 31, 15.5, 20, "#5c2410", "#421808", "#2e1005", "#ffd700");

            ctx.fillStyle = "#086638";
            ctx.beginPath();
            ctx.moveTo(0, -13 - 20);
            ctx.lineTo(26, -20);
            ctx.lineTo(0, 13 - 20);
            ctx.lineTo(-26, -20);
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
            ctx.fillRect(-10, -25 - bounce, 8, 8);
            ctx.strokeStyle = "#aa0000";
            ctx.strokeRect(-10, -25 - bounce, 8, 8);
            ctx.fillStyle = "#cc0000";
            ctx.font = "bold 7px monospace";
            ctx.textAlign = "center";
            ctx.fillText(String(d1), -6, -19 - bounce);

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(2, -25 - bounce * 0.8, 8, 8);
            ctx.strokeRect(2, -25 - bounce * 0.8, 8, 8);
            ctx.fillStyle = "#cc0000";
            ctx.fillText(String(d2), 6, -19 - bounce * 0.8);
        } else if (obj.type === "roulette_wheel") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 34, 17, 0, 0, Math.PI * 2);
            ctx.fill();

            drawIsoPrism(ctx, 30, 15, 19, "#3d1c0a", "#2b1206", "#1f0c04", "#ffd700");

            ctx.save();
            ctx.translate(0, -20);
            ctx.scale(1, 0.5);
            ctx.rotate(rouletteManager.currentAngle);

            const sectors = ROULETTE_SECTORS.length;
            for (let i = 0; i < sectors; i++) {
                ctx.fillStyle = ROULETTE_SECTORS[i].color;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, 23, (i * Math.PI * 2) / sectors, ((i + 1) * Math.PI * 2) / sectors);
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
            ctx.ellipse(0, -20, 23, 11.5, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Golden Pointer Needle at Top of Wheel
            ctx.fillStyle = "#ffff00";
            ctx.beginPath();
            ctx.moveTo(0, -29);
            ctx.lineTo(-4, -35);
            ctx.lineTo(4, -35);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#ffd700";
            ctx.beginPath();
            ctx.ellipse(0, -21, 5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "blackjack_table") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 34, 17, 0, 0, Math.PI * 2);
            ctx.fill();

            drawIsoPrism(ctx, 30, 15, 19, "#0d3b66", "#2a160c", "#1c0e07", "#00ffff");

            ctx.strokeStyle = "rgba(255, 215, 0, 0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, -19, 18, 9, 0, 0, Math.PI);
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-9, -23, 6, 8);
            ctx.fillRect(2, -23, 6, 8);

            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#ffd700";
            ctx.textAlign = "center";
            ctx.fillText("21", 0, -27);
        } else if (obj.type === "slot_machine") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 18, 9, 0, 0, Math.PI * 2);
            ctx.fill();

            drawIsoPrism(ctx, 16, 8, 42, "#ffd700", "#2a1442", "#1a0b2e", "#ffd700");

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-10, -34, 20, 11);
            ctx.strokeStyle = "#ff00aa";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-10, -34, 20, 11);

            ctx.font = "8px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🍒🐸🚀", 0, -26);

            const flash = Math.floor(timeMs / 200) % 2 === 0;
            ctx.fillStyle = flash ? "#ff0055" : "#ffff00";
            ctx.beginPath();
            ctx.arc(0, -45, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#c0c0c0";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(15, -24);
            ctx.lineTo(20, -35);
            ctx.stroke();
            ctx.fillStyle = "#ff0033";
            ctx.beginPath();
            ctx.arc(20, -36, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "crash_rocket") {
            // 3D Isometric Rocket Crash Launchpad Terminal
            drawIsoPrism(ctx, 26, 13, 22, "#1a103c", "#110a28", "#0a0518", "#ff0055");
            const rocketLift = crashPhase === "flying" ? Math.min(28, (crashMultiplier - 1) * 10) : 0;
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(crashPhase === "crashed" ? "💥" : "🚀", 0, -26 - rocketLift);
            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#00ff88";
            ctx.fillText("CRASH", 0, -10);
        } else if (obj.type === "mines_table") {
            // 3D Isometric Cyber Mines Table
            drawIsoPrism(ctx, 26, 13, 20, "#0b3b3c", "#072627", "#041819", "#00ff88");
            ctx.font = "14px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("💎💣", 0, -23);
            ctx.font = "bold 8px monospace";
            ctx.fillStyle = "#ffd700";
            ctx.fillText("MINES", 0, -9);
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
        } else if (obj.type === "arcade") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 3, 17, 8.5, 0, 0, Math.PI * 2);
            ctx.fill();

            drawIsoPrism(ctx, 15, 7.5, 44, "#ff00aa", "#1e1238", "#120924", "#00ffff");

            ctx.fillStyle = "#001f29";
            ctx.fillRect(-9, -35, 18, 13);
            ctx.strokeStyle = "#00ffff";
            ctx.lineWidth = 1;
            ctx.strokeRect(-9, -35, 18, 13);

            const hop = Math.abs(Math.sin(timeMs / 150)) * 3;
            ctx.fillStyle = "#ffcc00";
            ctx.fillRect(-3, -29 - hop, 6, 6);
        } else if (obj.type === "fountain") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(0, 4, 44, 22, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#5c6470";
            ctx.beginPath();
            ctx.ellipse(0, 0, 42, 21, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#0099cc";
            ctx.beginPath();
            ctx.ellipse(0, -2, 37, 18, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#848d99";
            ctx.fillRect(-7, -30, 14, 28);
            ctx.fillStyle = "#00ccff";
            ctx.beginPath();
            ctx.ellipse(0, -30, 19, 9.5, 0, 0, Math.PI * 2);
            ctx.fill();

            const spray = Math.sin(timeMs / 150) * 5;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(0, -30);
            ctx.quadraticCurveTo(-18, -48 + spray, -26, -8);
            ctx.moveTo(0, -30);
            ctx.quadraticCurveTo(18, -48 + spray, 26, -8);
            ctx.stroke();
        } else if (obj.type === "dj_booth") {
            drawIsoPrism(ctx, 44, 20, 26, "#18182c", "#101020", "#0a0a16", "#00ffff");

            ctx.fillStyle = "#222233";
            ctx.beginPath();
            ctx.ellipse(-16, -26, 9, 5, 0, 0, Math.PI * 2);
            ctx.ellipse(16, -26, 9, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ff00ff";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            for (let b = -5; b <= 5; b++) {
                const bh = 4 + Math.abs(Math.sin(timeMs / 120 + b)) * 12;
                ctx.fillStyle = b % 2 === 0 ? "#00ffff" : "#ff00aa";
                ctx.fillRect(b * 6 - 2, -6 - bh, 4, bh);
            }
        } else if (obj.type === "vault") {
            const isUnlocked = vaultManager.state.isUnlocked;
            drawIsoPrism(
                ctx,
                28,
                14,
                48,
                isUnlocked ? "#164a3b" : "#2b323d",
                isUnlocked ? "#0f382c" : "#1f252e",
                "#151920",
                isUnlocked ? "#00ff88" : "#ff3366"
            );

            ctx.save();
            ctx.translate(0, -24);
            if (isUnlocked) ctx.rotate(timeMs / 400);
            ctx.fillStyle = "#ffd700";
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            ctx.font = "bold 9px monospace";
            ctx.fillStyle = isUnlocked ? "#00ff88" : "#ffffff";
            ctx.textAlign = "center";
            ctx.fillText(isUnlocked ? "VAULT OPEN" : "BANK SAFE", 0, -54);
        } else if (obj.type === "pressure_pad") {
            const padIndex = (obj.data?.index || 1) - 1;
            const isPressed = vaultManager.state.pads[padIndex];
            ctx.fillStyle = isPressed ? "rgba(0, 255, 136, 0.85)" : "rgba(50, 55, 70, 0.9)";
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = isPressed ? "#ffffff" : "#ff3366";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = "bold 8px monospace";
            ctx.fillStyle = isPressed ? "#000000" : "#ffffff";
            ctx.textAlign = "center";
            ctx.fillText(`PAD ${padIndex + 1}`, 0, 3);
        } else if (obj.type === "street_lamp") {
            ctx.fillStyle = "#222222";
            ctx.fillRect(-2, -44, 4, 44);
            ctx.fillStyle = "#fffae0";
            ctx.beginPath();
            ctx.arc(0, -46, 6, 0, Math.PI * 2);
            ctx.fill();

            const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
            glow.addColorStop(0, "rgba(255, 235, 160, 0.26)");
            glow.addColorStop(1, "rgba(255, 235, 160, 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.ellipse(0, 0, 34, 17, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "palm_tree") {
            ctx.fillStyle = "#5c3c1e";
            ctx.fillRect(-4, -38, 8, 38);
            const sway = Math.sin(timeMs / 450 + obj.x) * 2;
            ctx.fillStyle = "#199e52";
            ctx.beginPath();
            ctx.arc(-12 + sway, -42, 14, 0, Math.PI * 2);
            ctx.arc(12 + sway, -42, 14, 0, Math.PI * 2);
            ctx.arc(sway, -52, 16, 0, Math.PI * 2);
            ctx.fill();
        } else if (obj.type === "sofa" || obj.type === "bar_counter") {
            drawIsoPrism(
                ctx,
                22,
                11,
                16,
                obj.type === "bar_counter" ? "#00d2ff" : "#8a1540",
                "#5c0d2a",
                "#3d081b",
                "#ffd700"
            );
        } else if (obj.type === "vip_pillar") {
            drawIsoPrism(ctx, 10, 5, 38, "#ffd700", "#282238", "#181424", "#ffd700");
        }

        ctx.restore();
    }

    function renderProximityPill(ctx: CanvasRenderingContext2D) {
        let promptText = "";
        if (activeStation === "dice") {
            promptText = "🎲 Craps Table: Click [🎲 Roll 3-Round Duel vs House Dealer] in the HUD!";
        } else if (activeStation === "roulette") {
            promptText = "🎡 Meme Roulette: Pick a sector & click [🎰 LOCK BET & SPIN] in the HUD!";
        } else if (activeStation === "blackjack") {
            promptText = "🃏 Cyber Blackjack 21: Play against the Unicorn House Dealer in the HUD!";
        } else if (activeStation === "slots") {
            promptText = "🎰 Golden UwU Slots: Press [E] or click PULL LEVER in the HUD!";
        } else if (activeStation === "crash") {
            promptText = "🚀 Rocket Crash: Launch & Cash Out before the explosion!";
        } else if (activeStation === "mines") {
            promptText = "💣 Cyber Mines: Reveal safe gems in the HUD to multiply your bet!";
        } else if (gridDistance(myX, myY, 16.0, 2.5) <= 3.2) {
            promptText = "🪩 DJ Stage: Press [E] to pick Classical, House, Electronic, Techno, or Rave!";
        } else if (gridDistance(myX, myY, 27.5, 15.5) <= 3.2) {
            promptText = "🎨 Live Graffiti Wall: Press [E] or click wall to paint (Saved permanently)!";
        } else if (gridDistance(myX, myY, 27.5, 12.5) <= 2.8) {
            promptText = "🕹️ 90s Arcade Cabinet: Press [E] to play Cyber Coin Rush!";
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
        if (hx === 10 && hy === 13) hoverLabel = "🎲 Dice Seat P1 (Click to Sit)";
        else if (hx === 12 && hy === 13) hoverLabel = "🎲 Dice Seat P2 (Click to Sit)";
        else if (hx === 11 && hy === 12) hoverLabel = "🎲 Dice Seat P3 (Click to Sit)";
        else if (hx === 11 && hy === 14) hoverLabel = "🎲 Dice Seat P4 (Click to Sit)";
        else if (hx === 11 && hy === 13) hoverLabel = "🎲 3-Round Craps Table (NW Pit)";
        else if (hx === 19 && hy === 12) hoverLabel = "🎡 Meme Roulette Wheel (NE Pit)";
        else if (hx === 11 && hy === 19) hoverLabel = "🃏 Cyber Blackjack 21 (SW Pit)";
        else if ((hx === 20 || hx === 21) && hy === 19) hoverLabel = "🎰 Golden UwU Slot Machine (SE Pit)";
        else if (hx === 15 && hy === 12) hoverLabel = "🚀 Rocket Crash Terminal";
        else if (hx === 27 && hy === 19) hoverLabel = "💣 Cyber Mines Table";
        else if (hx >= 18 && hx <= 20 && (hy === 14 || hy === 15)) {
            const sec = BETTABLE_ROULETTE_SECTORS.find((s) => s.tile.x === hx && s.tile.y === hy);
            if (sec) hoverLabel = `${sec.icon} Bet ${sec.name} (${sec.multiplier}x — ${sec.weight}% odds)`;
        } else if ((hx === 15 || hx === 16) && hy === 2) hoverLabel = "🪩 Multi-Genre DJ Booth";
        else if ((hx === 27 || hx === 28) && hy === 15) hoverLabel = "🎨 Persistent Live Graffiti Mural";
        else if ((hx === 26 || hx === 28) && hy === 12) hoverLabel = "🕹️ 90s Arcade (Cyber Coin Rush)";
        else if (hx === 5 && hy === 16) hoverLabel = "💎 Armored Bank Vault";

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
    <!-- Top Windows 98 Toolbar -->
    <div class="mmo-toolbar">
        <div class="toolbar-left">
            <span class="room-pill">{currentZoneName}</span>
            <span class="online-pill">🟢 {onlineCount}</span>
            <span class="chips-pill" title="Your $UWU Casino Balance & Win/Loss Record">
                🪙 {chips.toLocaleString()} $UWU
                <span class="wl-badge">({myWins}W-{myLosses}L)</span>
            </span>

            <button
                class="win98-btn daily-reward-btn"
                class:daily-ready={dailyStatus.canClaim}
                onclick={claimDailyReward}
                title="Claim 1,000 $UWU once every 24 hours"
            >
                {dailyStatus.canClaim
                    ? "🎁 Daily +1,000 $UWU"
                    : `⏳ Daily (${dailyStatus.formattedRemaining})`}
            </button>
        </div>

        <!-- Quick Travel District Navigator -->
        <div class="quick-travel-bar">
            <span class="qt-label">⚡ Travel:</span>
            <button class="win98-btn qt-btn" onclick={() => teleportTo(15.5, 16.5, "Casino Center")}>🎲 Casino</button>
            <button class="win98-btn qt-btn" onclick={() => teleportTo(16.0, 6.5, "Cyber Nightclub")}>🪩 Club</button>
            <button class="win98-btn qt-btn" onclick={() => teleportTo(16.0, 23.5, "Grand Plaza")}>⛲ Plaza</button>
            <button class="win98-btn qt-btn" onclick={() => teleportTo(7.5, 16.5, "Bank Vault")}>💎 Vault</button>
            <button class="win98-btn qt-btn" onclick={() => teleportTo(25.5, 14.5, "90s Arcade")}>🕹️ Arcade</button>
        </div>

        <div class="toolbar-right">
            <button class="win98-btn leaderboard-btn" onclick={openLeaderboard}>
                🏆 Leaderboard
            </button>

            <button class="win98-btn send-uwu-btn" onclick={() => openSendUwuModal("")}>
                💸 Send $UWU
            </button>

            <button class="win98-btn guide-btn" onclick={() => (showGuideModal = true)}>
                📖 Guide
            </button>

            <button
                class="win98-btn sound-btn"
                onclick={() => {
                    isMusicPlaying = !isMusicPlaying;
                    synth.setMute(!isMusicPlaying);
                    if (isMusicPlaying) synth.playTrack(currentTrackId);
                }}
            >
                {isMusicPlaying ? "🔊" : "🔇"}
            </button>

            <button
                class="win98-btn voice-btn"
                onclick={async () => {
                    await ensureVoiceInitialized();
                    if (voiceManager) {
                        isMuted = voiceManager.toggleUserMute();
                    }
                }}
            >
                {isMuted ? "🔇 Mic" : "🎙️"}
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

        <!-- 1. OVERHAULED CRAPS / DICE DUEL HUD (NW Pit: 11.5, 13.5) -->
        {#if activeStation === "dice"}
            <div class="game-hud win98-window" data-tick={diceTick}>
                <div class="win98-title-bar">
                    <span class="win98-title">🎲 3-Round Craps Duel (1.8x Payout • 10% House Edge)</span>
                </div>
                <div class="hud-body">
                    <div class="bj-dealer-banner">
                        <img src={dealerAvatarSrc} alt="Craps House Dealer" class="bj-dealer-sprite" />
                        <div class="bj-dealer-info">
                            <strong>🦄 Standing Craps House Dealer</strong>
                            <span>Roll 2 dice for 3 rounds! Highest 3-round total wins <strong>1.8x</strong>. Dealer wins ties.</span>
                        </div>
                    </div>

                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={diceManager.phase !== "idle"}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <!-- Round Progress Bar & Live Scoreboard -->
                    {#if diceManager.phase !== "idle"}
                        <div class="dice-tournament-banner">
                            <div class="round-steps-row">
                                <span class="r-pill" class:active={diceManager.currentRound >= 1}>R1</span>
                                <span class="r-pill" class:active={diceManager.currentRound >= 2}>R2</span>
                                <span class="r-pill" class:active={diceManager.currentRound >= 3}>R3</span>
                                <span class="r-pill" class:active={diceManager.phase === "finished"}>🏆 Result</span>
                            </div>

                            <div class="scores-table">
                                {#each Array.from(diceManager.scores.values()) as score}
                                    <div class="player-score-row" class:is-winner={score.id === diceManager.winnerId}>
                                        <span class="score-name">{score.username}</span>
                                        <span class="score-dice">
                                            {DICE_PIP_ICONS[score.currentDice[0]] || "🎲"}{DICE_PIP_ICONS[score.currentDice[1]] || "🎲"} ({score.currentDice[0] + score.currentDice[1]})
                                        </span>
                                        <span class="score-rounds">[{score.roundRolls.join(" + ")}]</span>
                                        <span class="score-total">= {score.totalSum}</span>
                                    </div>
                                {/each}
                            </div>

                            {#if diceManager.phase === "finished"}
                                <div class="tournament-winner">
                                    {diceManager.winnerId === myId
                                        ? `👑 YOU WON +${Math.round(activeDiceWager * 1.8)} $UWU!`
                                        : `🏠 ${diceManager.winnerName} Wins!`}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- 4 Player Seats for PvP Mode -->
                    <div class="dice-seats-row">
                        {#each diceManager.seats as seat, sIdx}
                            <button
                                class="seat-badge"
                                class:occupied={seat.occupant !== null}
                                class:ready={seat.isReady}
                                onclick={() => sitAtDiceSeat(sIdx)}
                            >
                                <span class="seat-title">{seat.label}</span>
                                {#if seat.occupant}
                                    <span class="seat-user">@{seat.occupant.username}</span>
                                    <span class="seat-status">{seat.isReady ? "✅ READY" : "🪑 Seated"}</span>
                                {:else}
                                    <span class="seat-empty">[Sit Here]</span>
                                {/if}
                            </button>
                        {/each}
                    </div>

                    <div class="hud-actions-col">
                        {#if diceManager.phase === "idle"}
                            <button class="win98-btn primary-start-btn" onclick={startInstantSoloDiceDuel}>
                                🎲 Roll 3-Round Duel vs House Dealer ({selectedWager} $UWU)
                            </button>
                            {#if isSeatedAtDiceTable && diceManager.seats.filter((s) => s.occupant !== null).length >= 2}
                                <button class="win98-btn bot-test-btn" onclick={toggleDicePvPReady}>
                                    {amIReady ? "✕ Cancel PvP Ready" : `⚔️ Ready for Multiplayer PvP (${selectedWager} $UWU)`}
                                </button>
                            {/if}
                        {:else if diceManager.phase === "finished"}
                            <button class="win98-btn primary-start-btn" onclick={() => diceManager.reset()}>
                                🔄 Roll Again
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <!-- 2. WEIGHTED MEME ROULETTE HUD (NE Pit: 19.5, 12.5) -->
        {#if activeStation === "roulette"}
            <div class="game-hud win98-window" data-tick={rouletteTick}>
                <div class="win98-title-bar">
                    <span class="win98-title">🎡 Meme Roulette (Weighted Wheel + 💀 12% House Zero)</span>
                </div>
                <div class="hud-body">
                    <div class="hud-instructions">
                        <strong>Casino Odds:</strong> 100-pocket weighted wheel including <strong>💀 House Zero (0x — 12% chance)</strong>. Pick a sector and click <strong>LOCK BET & SPIN</strong>!
                    </div>

                    <div class="wager-selector">
                        <span>Wager:</span>
                        {#each WAGER_OPTIONS as w}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedWager === w}
                                disabled={rouletteManager.isSpinning}
                                onclick={() => (selectedWager = w)}
                            >
                                {w}
                            </button>
                        {/each}
                    </div>

                    <div class="roulette-status-bar">
                        <span>
                            {#if rouletteManager.isSpinning}
                                🌀 <strong>SPINNING WHEEL...</strong>
                            {:else}
                                ⏱️ Next Auto-Spin: <strong>{rouletteManager.countdownSeconds}s</strong>
                            {/if}
                        </span>
                        {#if rouletteManager.history.length > 0}
                            <span class="roulette-history">
                                Last:
                                {#each rouletteManager.history.slice(0, 5) as h}
                                    <span title="{h.name} ({h.multiplier}x)">{h.icon}</span>
                                {/each}
                            </span>
                        {/if}
                    </div>

                    <div class="roulette-grid">
                        {#each BETTABLE_ROULETTE_SECTORS as sector}
                            <button
                                class="win98-btn meme-tile-btn"
                                class:active-bet={activeRouletteBet === sector.id}
                                onclick={() => selectRouletteSector(sector.id)}
                            >
                                <span class="meme-icon">{sector.icon}</span>
                                <span class="meme-title">{sector.name}</span>
                                <span class="meme-multiplier" style="color: {sector.color}">
                                    {sector.multiplier}x <small>({sector.weight}%)</small>
                                </span>
                            </button>
                        {/each}
                    </div>

                    <button
                        class="win98-btn primary-start-btn"
                        disabled={rouletteManager.isSpinning}
                        onclick={spinRouletteWithBet}
                    >
                        {rouletteManager.isSpinning
                            ? "🎡 WHEEL SPINNING..."
                            : `🎰 LOCK BET & SPIN NOW (${selectedWager} $UWU)`}
                    </button>
                </div>
            </div>
        {/if}

        <!-- 3. CYBER BLACKJACK 21 HUD (SW Pit: 11.5, 19.5) -->
        {#if activeStation === "blackjack"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🃏 Cyber Blackjack 21 (6:5 Vegas Rules)</span>
                </div>
                <div class="hud-body">
                    <div class="bj-dealer-banner">
                        <img src={dealerAvatarSrc} alt="Unicorn House Dealer" class="bj-dealer-sprite" />
                        <div class="bj-dealer-info">
                            <strong>🦄 Unicorn House Dealer</strong>
                            <span>Beat the Dealer without busting over 21! Blackjack pays <strong>2.2x</strong>, wins pay <strong>1.9x</strong>.</span>
                        </div>
                    </div>

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

        <!-- 4. GOLDEN UWU SLOTS HUD (SE Pit: 20.5, 19.5 — Separated from Roulette!) -->
        {#if activeStation === "slots"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🎰 Golden UwU Jackpot Slots (SE Casino Pit)</span>
                </div>
                <div class="hud-body">
                    <div class="hud-instructions">
                        <strong>Paytable:</strong> 3-of-a-kind pays <strong>🍒 4x • 🐸 8x • 🚀 15x • 💎 30x • 🦄 60x</strong>! First 2 reels matching non-skull (`r1 = r2`) pays <strong>1.6x</strong>. `💀` is a blank dud!
                    </div>

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

                    <div class="bj-status-msg">{slotMessage}</div>

                    <button
                        class="win98-btn primary-start-btn"
                        disabled={isSlotSpinning}
                        onclick={spinSlotMachine}
                    >
                        {isSlotSpinning ? "🎰 SPINNING REELS..." : `🎰 PULL LEVER (${selectedWager} $UWU)`}
                    </button>
                </div>
            </div>
        {/if}

        <!-- 5. NEW GAME: ROCKET CRASH MULTIPLIER HUD (Center North Pit: 15.5, 12.5) -->
        {#if activeStation === "crash"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">🚀 UwU Rocket Crash (Multiplier Cashout)</span>
                </div>
                <div class="hud-body">
                    <div class="hud-instructions">
                        <strong>How to Play:</strong> Launch the rocket and click <strong>💰 CASH OUT</strong> before it explodes! (8% instant pad explosion house edge).
                    </div>

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

                    <div class="crash-display" class:crashed={crashPhase === "crashed"}>
                        <span class="crash-mult">{crashMultiplier.toFixed(2)}x</span>
                        <span class="crash-sub">
                            {crashPhase === "flying"
                                ? `Cashout Value: +${Math.round(crashBetAmount * crashMultiplier)} $UWU`
                                : crashPhase === "crashed"
                                  ? "💥 EXPLODED!"
                                  : "Ready on Launchpad"}
                        </span>
                    </div>

                    <div class="roulette-status-bar">
                        <span>Recent Crashes:</span>
                        <span>
                            {#each crashHistory as ch}
                                <strong style="color: {ch >= 2.0 ? '#007a3d' : '#b71c1c'}; margin-left: 4px;">{ch.toFixed(2)}x</strong>
                            {/each}
                        </span>
                    </div>

                    <div class="bj-status-msg">{crashMessage}</div>

                    {#if crashPhase === "flying"}
                        <button class="win98-btn cashout-btn" onclick={cashOutRocketCrash}>
                            💰 CASH OUT NOW (+{Math.round(crashBetAmount * crashMultiplier)} $UWU)
                        </button>
                    {:else}
                        <button class="win98-btn primary-start-btn" onclick={startRocketCrash}>
                            🚀 LAUNCH ROCKET ({selectedWager} $UWU)
                        </button>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- 6. NEW GAME: CYBER MINES 5x5 GRID HUD (East Alley South: 27.5, 19.5) -->
        {#if activeStation === "mines"}
            <div class="game-hud win98-window">
                <div class="win98-title-bar">
                    <span class="win98-title">💣 Cyber Mines (5x5 High-Stakes Grid)</span>
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
                        <span style="margin-left:auto">Bombs:</span>
                        {#each [3, 5, 8] as bCount}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={minesBombCount === bCount}
                                disabled={minesPhase === "playing"}
                                onclick={() => (minesBombCount = bCount)}
                            >
                                {bCount}💣
                            </button>
                        {/each}
                    </div>

                    <div class="mines-grid">
                        {#each Array(25) as _, idx}
                            <button
                                class="win98-btn mines-cell"
                                class:revealed={minesRevealed[idx]}
                                disabled={minesPhase !== "playing" || minesRevealed[idx]}
                                onclick={() => clickMinesTile(idx)}
                            >
                                {#if minesRevealed[idx] || minesPhase === "boom" || minesPhase === "cashed"}
                                    {minesBombLocations[idx] ? "💣" : "💎"}
                                {:else}
                                    ?
                                {/if}
                            </button>
                        {/each}
                    </div>

                    <div class="bj-status-msg">{minesMessage}</div>

                    {#if minesPhase === "playing"}
                        <button
                            class="win98-btn cashout-btn"
                            disabled={minesSafeClicks === 0}
                            onclick={cashOutCyberMines}
                        >
                            💰 CASH OUT +{Math.round(minesBetAmount * minesCurrentMultiplier)} $UWU ({minesCurrentMultiplier.toFixed(2)}x)
                        </button>
                    {:else}
                        <button class="win98-btn primary-start-btn" onclick={startCyberMines}>
                            💣 START MINES GAME ({selectedWager} $UWU)
                        </button>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- 7. ARMORED BANK VAULT CO-OP & SOLO HEIST HUD -->
        {#if activeStation === "vault"}
            <div class="game-hud win98-window" data-tick={vaultTick}>
                <div class="win98-title-bar">
                    <span class="win98-title">💎 Armored Bank Vault Heist</span>
                </div>
                <div class="hud-body">
                    <div class="hud-instructions">
                        <strong>How to Play:</strong> Activate all 4 Pressure Pads simultaneously! Playing solo? Deploy <strong>Holo-Clones</strong> onto Pads 2–4 and step onto <strong>Pad 1 (NW)</strong>!
                    </div>

                    <div class="dice-seats-row">
                        {#each vaultManager.padCoordinates as pad, idx}
                            <button
                                class="seat-badge"
                                class:ready={vaultManager.state.pads[idx]}
                                onclick={() => {
                                    activeWaypoints = findPath(myX, myY, pad.x, pad.y, COLLISION_MAP, MAP_SIZE);
                                }}
                            >
                                <span class="seat-title">Pad {idx + 1}</span>
                                <span class="seat-status">
                                    {vaultManager.state.pads[idx] ? "🟢 ACTIVE" : "🔴 IDLE"}
                                </span>
                            </button>
                        {/each}
                    </div>

                    <div class="hud-actions-col">
                        <button
                            class="win98-btn bot-test-btn"
                            onclick={() => {
                                vaultManager.toggleHoloDecoys();
                                synth.playChipSfx();
                            }}
                        >
                            {vaultManager.state.holoDecoysActive
                                ? "🤖 Holo-Clones Deployed on Pads 2–4! (Step on Pad 1)"
                                : "🤖 Deploy Solo Holo-Clones on Pads 2–4"}
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

    <!-- Modal 1: Interactive Game Guide & Teleport Directory -->
    {#if showGuideModal}
        <div class="modal-overlay" onclick={() => (showGuideModal = false)}>
            <div class="win98-window guide-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">📖 UwU World MMO — All 8 Games & Districts Guide</span>
                    <button class="win98-close" onclick={() => (showGuideModal = false)}>X</button>
                </div>
                <div class="win98-body guide-body">
                    <p class="guide-intro">
                        All casino games are well-spaced across the 4 corners of the Casino Lounge and feature realistic Vegas house-edge odds:
                    </p>
                    <div class="guide-grid">
                        <div class="guide-card">
                            <div class="guide-card-title">🎲 3-Round Craps Duel (NW Pit)</div>
                            <p>Roll 3 rounds of 2 dice against the standing <strong>Unicorn House Dealer</strong> or PvP players. Pays 1.8x (10% House Edge).</p>
                            <button class="win98-btn" onclick={() => teleportTo(11.5, 14.5, "Craps Table")}>Teleport to Craps</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🎡 Meme Roulette (NE Pit)</div>
                            <p>100-pocket weighted wheel with 3x–25x sectors and a 12% <strong>💀 House Zero</strong> pocket. Lock your bet & spin!</p>
                            <button class="win98-btn" onclick={() => teleportTo(19.5, 14.5, "Meme Roulette")}>Teleport to Roulette</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🃏 Cyber Blackjack 21 (SW Pit)</div>
                            <p>Beat the standing Unicorn House Dealer without busting over 21. Natural 21 pays 2.2x!</p>
                            <button class="win98-btn" onclick={() => teleportTo(11.5, 20.5, "Cyber Blackjack")}>Teleport to Blackjack</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🎰 Golden UwU Slots (SE Pit)</div>
                            <p>Separated in the SE Pit! Weighted reels with `💀` blanks, front-pair 1.6x, and 3-of-a-kind jackpots up to 60x!</p>
                            <button class="win98-btn" onclick={() => teleportTo(20.5, 20.5, "Golden Slots")}>Teleport to Slots</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">🚀 Rocket Crash (North Center Pit)</div>
                            <p>Watch the rocket multiplier climb from 1.00x upward and Cash Out before it explodes!</p>
                            <button class="win98-btn" onclick={() => teleportTo(15.5, 13.8, "Rocket Crash")}>Teleport to Crash</button>
                        </div>
                        <div class="guide-card">
                            <div class="guide-card-title">💣 Cyber Mines & 🕹️ 90s Arcade</div>
                            <p>Uncover safe diamonds on the 5x5 Cyber Mines grid or play Cyber Coin Rush & paint on the persistent Graffiti Wall!</p>
                            <button class="win98-btn" onclick={() => teleportTo(26.5, 19.5, "Cyber Mines")}>Teleport to Mines</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 2: 90s Arcade "Cyber Coin Rush" Mini-Game -->
    {#if showArcadeModal}
        <div
            class="modal-overlay"
            onclick={() => {
                stopArcadeMiniGame();
                showArcadeModal = false;
            }}
        >
            <div class="win98-window arcade-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🕹️ UWU 98 ARCADE — Cyber Coin Rush</span>
                    <button
                        class="win98-close"
                        onclick={() => {
                            stopArcadeMiniGame();
                            showArcadeModal = false;
                        }}>X</button
                    >
                </div>
                <div class="win98-body">
                    <div class="arcade-hud-top">
                        <span>🪙 Score: <strong>{arcadeScore} $UWU</strong></span>
                        <span>🏆 High: <strong>{arcadeHighScore}</strong></span>
                        <span>⏱️ Time: <strong>{arcadeTimeLeft}s</strong></span>
                    </div>
                    <div
                        class="arcade-screen"
                        onmousemove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            arcadePlayerX = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
                        }}
                    >
                        {#each arcadeItems as item (item.id)}
                            <div class="arcade-falling-item" style="left: {item.x}%; top: {item.y}%">
                                {item.type === "coin" ? "🪙" : item.type === "gem" ? "💎" : "💣"}
                            </div>
                        {/each}
                        <div class="arcade-catcher" style="left: {arcadePlayerX}%">🛸</div>
                    </div>
                    <div class="arcade-controls-footer">
                        <span>Move mouse or Left/Right keys to catch 🪙 (+10) & 💎 (+25), dodge 💣 (-30)!</span>
                        {#if !arcadeActive}
                            <button class="win98-btn primary-start-btn" onclick={startArcadeMiniGame}>
                                🔄 Play Again
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 3: Persistent Live Isometric Pixel Graffiti Billboard -->
    {#if showGraffitiModal}
        <div class="modal-overlay" onclick={() => (showGraffitiModal = false)}>
            <div class="win98-window graffiti-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🎨 Persistent 3D Billboard Graffiti Painter (48x32)</span>
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

                    <div class="graffiti-footer">
                        <span>💾 Automatically saved to Supabase & local storage so artwork persists across sessions!</span>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Modal 4: Multi-Genre DJ Booth (Classical, House, Electronic, Techno, Rave) -->
    {#if showDJModal}
        <div class="modal-overlay" onclick={() => (showDJModal = false)}>
            <div class="win98-window dj-window" onclick={(e) => e.stopPropagation()}>
                <div class="win98-title-bar">
                    <span class="win98-title">🪩 Multi-Genre Nightclub DJ Booth (10 Tracks)</span>
                    <button class="win98-close" onclick={() => (showDJModal = false)}>X</button>
                </div>
                <div class="win98-body">
                    <div class="genre-tabs">
                        {#each ["All", "Classical", "House", "Electronic", "Techno", "Rave"] as g}
                            <button
                                class="win98-btn wager-btn"
                                class:active-wager={selectedGenreFilter === g}
                                onclick={() => (selectedGenreFilter = g)}
                            >
                                {g}
                            </button>
                        {/each}
                    </div>

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
                                    showDJModal = false;
                                    networkManager?.broadcastDJTrack(track.id, myUsername);
                                }}
                            >
                                <div class="track-left">
                                    <span class="genre-pill">{track.genre}</span>
                                    <span>{track.title}</span>
                                </div>
                                <span class="track-bpm">{track.bpm} BPM</span>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .mmo-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background-color: #c0c0c0;
        overflow: hidden;
        user-select: none;
        font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
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
        width: 440px;
        max-width: 94vw;
    }

    .genre-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: 8px;
    }

    .dj-track-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 280px;
        overflow-y: auto;
    }

    .track-select-btn {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        font-weight: bold;
    }

    .track-left {
        display: flex;
        align-items: center;
        gap: 6px;
        text-align: left;
    }

    .genre-pill {
        background: #000080;
        color: #ffff00;
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 2px;
    }

    .track-select-btn.active-track {
        background: #004d40;
        color: #00ff88;
    }

    @media (max-width: 768px) {
        .desktop-ptt-hint,
        .quick-travel-bar {
            display: none;
        }
        .guide-grid,
        .my-stats-banner {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
