<script lang="ts">
    import { fade } from "svelte/transition";

    type Category = {
        id: string;
        name: string;
        icon: string;
    };

    type Coin = {
        id: string;
        name: string;
        image: string | null;
        fallbackEmoji: string;
        matches: string[];
    };

    // 1. Defined Evaluation Categories
    const categories: Category[] = [
        { id: "animal", name: "Animal Coin", icon: "📊" },
        { id: "mission", name: "Idealistic Mission", icon: "🎯" },
        { id: "finance", name: "Finance Themed", icon: "💵" },
        { id: "airdrop", name: "Distribution / Airdrop", icon: "🪂" },
        { id: "duration", name: "Duration > 1 Year", icon: "📅" },
        { id: "virality", name: "Virality / Ticker", icon: "📢" },
        { id: "community", name: "Community", icon: "👥" },
        { id: "upside", name: "Cheap with High Upside", icon: "📈" }
    ];

    // 2. Pre-seeded State with accurate Token Images
    let coins = $state<Coin[]>([
        { id: "uwu", name: "UWU", image: "https://dd.dexscreener.com/ds-data/tokens/solana/UWUy7J86LUiBv5SjAUZ53LMGhtnqvbQ7QNSSkyupump.png", fallbackEmoji: "🦄", matches: ["animal", "mission", "finance", "airdrop", "duration", "virality", "community", "upside"] },
        { id: "doge", name: "DOGE", image: "https://assets.coingecko.com/coins/images/5/standard/dogecoin.png", fallbackEmoji: "🪙", matches: ["animal", "virality"] },
        { id: "pepe", name: "PEPE", image: "https://dd.dexscreener.com/ds-data/tokens/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933.png", fallbackEmoji: "🐸", matches: ["animal", "duration"] },
        { id: "shib", name: "SHIB", image: "https://assets.coingecko.com/coins/images/11939/standard/shiba.png", fallbackEmoji: "🐕", matches: ["animal", "duration"] },
        { id: "bonk", name: "BONK", image: "https://dd.dexscreener.com/ds-data/tokens/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263.png", fallbackEmoji: "🐕‍🦺", matches: ["animal", "airdrop", "duration", "virality"] },
        { id: "spx", name: "SPX", image: "https://dd.dexscreener.com/ds-data/tokens/ethereum/0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c.png", fallbackEmoji: "📀", matches: ["mission", "finance", "duration", "community", "upside"] },
        { id: "neet", name: "NEET", image: "https://dd.dexscreener.com/ds-data/tokens/solana/Ce2gx9KGXJ6C9Mp5b5x1sn9Mg87JwEbrQby4Zqo3pump.png", fallbackEmoji: "🌐", matches: ["mission", "finance", "duration", "virality", "community", "upside"] }
    ]);

    // 3. Form State
    let showAddForm = $state(false);
    let newCoinName = $state("");
    let searchQuery = $state("");
    let newCoinImage = $state<string | null>(null);
    let isFetching = $state(false);
    let newCoinMatches = $state<string[]>([]);

    function toggleCategoryMatch(catId: string) {
        if (newCoinMatches.includes(catId)) {
            newCoinMatches = newCoinMatches.filter(id => id !== catId);
        } else {
            newCoinMatches = [...newCoinMatches, catId];
        }
    }

    async function searchDexScreenerIcon() {
        if (!searchQuery.trim()) return;

        isFetching = true;
        try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${searchQuery.trim()}`);
            const data = await res.json();

            if (data.pairs && data.pairs.length > 0) {
                const pairWithImage = data.pairs.find((p: any) => p.info && p.info.imageUrl);

                if (pairWithImage) {
                    newCoinImage = pairWithImage.info.imageUrl;
                    newCoinName = pairWithImage.baseToken.symbol;
                } else {
                    alert("Token found, but no image registered on DexScreener.");
                }
            } else {
                alert("Could not find this Ticker or Contract Address on DexScreener.");
            }
        } catch (err) {
            console.error("DexScreener fetch error:", err);
            alert("Error connecting to DexScreener API.");
        } finally {
            isFetching = false;
        }
    }

    function submitNewCoin() {
        if (!newCoinName.trim()) {
            alert("Please enter a valid asset name!");
            return;
        }
        const newAsset: Coin = {
            id: newCoinName.trim().toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
            name: newCoinName.trim().toUpperCase(),
            image: newCoinImage,
            fallbackEmoji: "🪙",
            matches: [...newCoinMatches]
        };
        coins = [...coins, newAsset];

        newCoinName = "";
        searchQuery = "";
        newCoinImage = null;
        newCoinMatches = [];
        showAddForm = false;
    }

    function removeMatch(coinId: string, categoryId: string) {
        if (coinId === "uwu") return;
        coins = coins.map(c => {
            if (c.id === coinId) {
                return { ...c, matches: c.matches.filter(m => m !== categoryId) };
            }
            return c;
        });
    }

    function clearBoard() {
        if (confirm("Are you sure you want to clear the board? This will remove all assets except UwU.")) {
            coins = coins.filter(c => c.id === "uwu");
        }
    }

    const leaderboard = $derived.by(() => {
        return coins
            .map(coin => ({
                ...coin,
                score: coin.matches.length
            }))
            .sort((a, b) => b.score - a.score);
    });

    function getScoreColorStyle(score: number) {
        const maxScore = categories.length;
        const ratio = score / (maxScore || 1);
        const hue = ratio * 120;
        return `background-color: hsl(${hue}, 85%, 35%); color: #ffffff; text-shadow: 1px 1px 0px #000;`;
    }
</script>

<div class="app-container">
    <!-- TOOLBAR -->
    <div class="app-toolbar">
        <button class="win-btn menu-trigger" onclick={() => showAddForm = !showAddForm}>
            ➕ {showAddForm ? "Cancel Action" : "Add Custom Asset"}
        </button>
        <button class="win-btn danger-btn" onclick={clearBoard}>
            🗑️ Clear Data
        </button>
    </div>

    <!-- ADD ASSET OVERLAY -->
    {#if showAddForm}
        <div class="win-panel form-overlay" in:fade={{ duration: 150 }}>
            <div class="win-inset form-wrapper">
                <h3>💾 Register New Speculative Asset</h3>
                <div class="fetch-row">
                    <label for="coin-query">Search (Ticker/CA):</label>
                    <input id="coin-query" type="text" class="win-input search-input" placeholder="0x... or PEPE" bind:value={searchQuery} />
                    <button class="win-btn" onclick={searchDexScreenerIcon} disabled={isFetching}>
                        {isFetching ? "⏳ Searching..." : "🔍 Fetch Icon"}
                    </button>
                </div>
                <div class="form-row manual-entry-row">
                    <label for="coin-ticker">Token Name:</label>
                    <input id="coin-ticker" type="text" class="win-input short-input" placeholder="Ticker" bind:value={newCoinName} />
                    <div class="preview-box">
                        {#if newCoinImage}
                            <img src={newCoinImage} alt="Preview" class="preview-img" />
                        {:else}
                            <span>No IMG</span>
                        {/if}
                    </div>
                </div>
                <p class="checkbox-instruction">Select all metrics this asset natively satisfies:</p>
                <div class="category-checkbox-grid">
                    {#each categories as cat}
                        <button type="button" class="checkbox-chip {newCoinMatches.includes(cat.id) ? 'checked' : ''}" onclick={() => toggleCategoryMatch(cat.id)}>
                            <span class="chip-icon">{cat.icon}</span> {cat.name}
                        </button>
                    {/each}
                </div>
                <div class="form-actions">
                    <button class="win-btn save-btn" onclick={submitNewCoin}>Execute Injection</button>
                </div>
            </div>
        </div>
    {/if}

    <!-- MAIN SIDE-BY-SIDE WORKSPACE -->
    <div class="main-workspace">

        <!-- LEFT: THE MATRIX (Strict vertical compression on Desktop) -->
        <div class="matrix-wrapper">
            <div class="matrix-container win-inset">
                <div class="matrix-header-row">
                    <div class="header-cell left-col">CATEGORY</div>
                    <div class="header-cell right-col">COINS THAT FIT</div>
                </div>

                <div class="matrix-body">
                    {#each categories as cat}
                        <div class="matrix-row">
                            <div class="category-cell">
                                <span class="category-graphic">{cat.icon}</span>
                                <span class="category-title-text">{cat.name}</span>
                            </div>

                            <div class="assets-cell">
                                {#each coins.filter(c => c.matches.includes(cat.id)) as matchedCoin}
                                    <div class="asset-sticker-wrapper">
                                        {#if matchedCoin.id !== 'uwu'}
                                            <button class="remove-match-btn" onclick={() => removeMatch(matchedCoin.id, cat.id)} title="Remove from {cat.name}">x</button>
                                        {/if}

                                        <div class="asset-sticker" title="{matchedCoin.name}">
                                            <div class="sticker-avatar">
                                                {#if matchedCoin.image}
                                                    <img src={matchedCoin.image} alt={matchedCoin.name} class="coin-img" />
                                                {:else}
                                                    <span class="emoji-fallback">{matchedCoin.fallbackEmoji}</span>
                                                {/if}
                                            </div>
                                            <!-- Gradient overly for text readability -->
                                            <div class="sticker-overlay"></div>
                                            <span class="sticker-label">{matchedCoin.name}</span>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <!-- RIGHT: THE LEADERBOARD SIDEBAR -->
        <div class="leaderboard-wrapper win-panel">
            <div class="panel-header">🎯 Analysis Matrix</div>
            <div class="leaderboard-list win-inset">
                {#each leaderboard as item}
                    <div class="leaderboard-pill" style={getScoreColorStyle(item.score)}>
                        <span class="pill-badge">
                            {#if item.image}
                                <img src={item.image} alt={item.name} class="leaderboard-tiny-img" />
                            {:else}
                                {item.fallbackEmoji}
                            {/if}
                            {item.name}
                        </span>
                        <span class="pill-score">{item.score}/{categories.length}</span>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>

<style>
    /* App Container */
    .app-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: "Pixelated MS Sans Serif", monospace, Arial, sans-serif;
        color: #000000;
        user-select: none;
        background: #c0c0c0;
        box-sizing: border-box;
        overflow: hidden;
    }

    /* Window Elements */
    .win-panel {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        box-shadow: 1px 1px 0px 0px #000000;
        padding: 4px;
        box-sizing: border-box;
    }

    .win-inset {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        background: #ffffff;
        box-sizing: border-box;
    }

    .win-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 2px 8px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        font-weight: bold;
    }

    .win-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 3px 7px 1px 9px;
        background: #dfdfdf;
    }

    .danger-btn { color: #a00000; }
    .win-input {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 4px;
        font-family: inherit;
        font-size: 11px;
        outline: none;
    }

    .app-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px;
        border-bottom: 2px solid #808080;
        box-shadow: 0 1px 0 #ffffff;
        flex-shrink: 0;
    }

    /* Form Styles */
    .form-overlay {
        margin: 6px 6px 0 6px;
        background: #d4d4d4;
        flex-shrink: 0;
    }

    .form-wrapper { padding: 8px; background: #f1f1f1; }
    .form-wrapper h3 { margin: 0 0 8px 0; font-size: 13px; color: #000080; }
    .fetch-row, .manual-entry-row {
        display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;
    }
    .search-input { flex-grow: 1; min-width: 150px; }
    .short-input { width: 100px; }

    .preview-box {
        width: 24px; height: 24px; border: 2px solid; border-color: #808080 #ffffff #ffffff #808080;
        background: #fff; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #808080; margin-left: auto;
    }
    .preview-img { width: 100%; height: 100%; object-fit: cover; }

    .category-checkbox-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px; margin-bottom: 8px; margin-top: 4px; }
    .checkbox-chip { display: flex; align-items: center; gap: 6px; background: #c0c0c0; border: 2px solid; border-color: #ffffff #808080 #808080 #ffffff; padding: 2px 6px; font-size: 10px; cursor: pointer; width: 100%; }
    .checkbox-chip.checked { background: #000080; color: #ffffff; border-color: #000000 #ffffff #ffffff #000000; box-shadow: inset 1px 1px 2px #000; }
    .form-actions { display: flex; justify-content: flex-end; }
    .save-btn { background: #008000; color: #ffffff; padding: 4px 16px; border-color: #ffffff #000000 #000000 #ffffff; }

    /* Layout Strategy (DESKTOP) */
    .main-workspace {
        display: flex;
        flex-direction: row;
        flex-grow: 1;
        padding: 6px;
        gap: 6px;
        overflow: hidden;
        min-height: 0;
    }

    .matrix-wrapper {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
    }

    .matrix-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .matrix-header-row {
        display: flex; background: #000080; color: #ffffff; font-weight: bold; font-size: 11px; border-bottom: 2px solid #808080; flex-shrink: 0;
    }
    .header-cell { padding: 4px 8px; text-shadow: 1px 1px 0px #000; }
    .left-col { width: 150px; flex-shrink: 0; border-right: 2px solid #808080; }
    .right-col { flex-grow: 1; }

    .matrix-body {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        min-height: 0;
    }

    .matrix-row {
        display: flex;
        flex: 1;
        min-height: 0;
        border-bottom: 1px solid #808080;
        background: #e0e0e0;
    }
    .matrix-row:nth-child(even) { background: #d6d6d6; }

    .category-cell {
        width: 150px; flex-shrink: 0; padding: 4px 8px; display: flex; align-items: center; gap: 8px; font-weight: bold; font-size: 11px; border-right: 2px solid #808080; background: rgba(255, 255, 255, 0.15);
    }

    .assets-cell {
        flex-grow: 1;
        display: flex;
        flex-wrap: nowrap; /* Desktop: strictly single line */
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        min-width: 0;
        overflow: hidden;
    }

    /* Shrinkable Dynamic Stickers (Desktop) */
    .asset-sticker-wrapper {
        position: relative;
        height: 100%;
        max-height: 55px;
        aspect-ratio: 1 / 1;
        flex: 0 1 auto; /* Allow horizontal shrinking on desktop */
        min-width: 0;
        min-height: 0;
        transition: transform 0.1s ease;
    }
    .asset-sticker-wrapper:hover {
        transform: scale(1.08);
        z-index: 10;
    }

    .asset-sticker {
        position: relative;
        width: 100%;
        height: 100%;
        background: #ffffff;
        border: 2px solid #000000;
        border-radius: 6px;
        box-shadow: 2px 2px 0px #000000;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        container-type: inline-size;
    }

    .sticker-avatar { width: 100%; height: 100%; background: #ffffff; }

    .emoji-fallback {
        display: flex; align-items: center; justify-content: center; height: 100%;
        font-size: min(32px, 45cqw);
    }

    .coin-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(1.8) contrast(1.2);
    }

    .sticker-overlay {
        position: absolute; bottom: 0; left: 0; width: 100%; height: 50%;
        background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
        pointer-events: none; z-index: 1;
    }

    .sticker-label {
        position: absolute;
        bottom: 1px;
        left: 50%;
        transform: translateX(-50%);
        font-size: min(11px, 18cqw);
        font-weight: 900;
        color: #ffff00;
        text-transform: uppercase;
        white-space: nowrap;
        z-index: 2;
        pointer-events: none;
        letter-spacing: 0.5px;
        text-shadow:
            1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000,
            0px 2px 2px rgba(0,0,0,0.9);
    }

    .remove-match-btn {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 16px;
        height: 16px;
        border: 2px solid #000;
        background: #ff0000;
        color: white;
        font-weight: bold;
        padding: 0;
        font-size: 9px;
        line-height: 9px;
        border-radius: 50%;
        z-index: 20;
        display: none;
        cursor: pointer;
    }
    .asset-sticker-wrapper:hover .remove-match-btn {
        display: flex; align-items: center; justify-content: center;
    }

    /* Leaderboard Sidebar */
    .leaderboard-wrapper {
        width: 200px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
    }

    .panel-header {
        background: #000080; color: #ffffff; padding: 4px 6px; font-size: 11px; font-weight: bold; margin-bottom: 4px; text-shadow: 1px 1px 0px #000;
    }

    .leaderboard-list {
        flex-grow: 1;
        overflow-y: auto;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .leaderboard-pill {
        display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; font-size: 10px; font-weight: bold; border: 2px solid; border-color: #ffffff #000000 #000000 #ffffff; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);
    }

    .pill-badge { display: flex; align-items: center; gap: 6px; }
    .leaderboard-tiny-img { width: 14px; height: 14px; border-radius: 2px; }

    /* =========================================
       FIXED MOBILE FALLBACK
       ========================================= */
    @media (max-width: 800px) {
        .main-workspace {
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
        }
        .matrix-wrapper {
            min-height: auto; /* Removed fixed height restriction */
            height: auto; /* Let it grow infinitely down */
            overflow: visible;
        }
        .leaderboard-wrapper {
            width: 100%;
            height: auto;
            max-height: 300px; /* Cap the leaderboard height slightly */
            flex-shrink: 0;
            margin-top: 10px; /* Force separation between matrix and leaderboard */
        }

        .matrix-header-row { display: none; }

        /* Unlock row heights so wrapping doesn't cause bleeding */
        .matrix-row {
            flex-direction: column;
            min-height: auto;
            height: auto;
            flex: none; /* Turn off flex equalization */
        }
        .category-cell {
            width: 100%;
            border-right: none;
            border-bottom: 2px solid #808080;
            padding: 6px 8px;
        }

        /* Enable Wrapping! */
        .assets-cell {
            padding: 10px 8px;
            flex-wrap: wrap; /* CRITICAL FIX: allow to flow to next line */
            height: auto;
            overflow: visible; /* Prevent clipping */
            gap: 12px; /* Nicer touch-friendly gap */
        }

        .app-toolbar { flex-direction: row; }

        /* Stop shrinking on mobile and lock size so they neatly grid out */
        .asset-sticker-wrapper {
            flex: 0 0 auto;
            width: 55px; /* Hardcoded size for mobile */
            height: 55px;
            max-height: none; /* Release desktop constraints */
        }

        /* Force close button visibility on touch screens */
        @media (hover: none) {
            .remove-match-btn { display: flex; opacity: 0.9; top: -6px; right: -6px; }
        }
    }
</style>
