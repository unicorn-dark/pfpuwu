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

    // Attempt to pull the image using DexScreener API
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

        // Reset states
        newCoinName = "";
        searchQuery = "";
        newCoinImage = null;
        newCoinMatches = [];
        showAddForm = false;
    }

    function removeMatch(coinId: string, categoryId: string) {
        if (coinId === "uwu") return; // Safety check

        coins = coins.map(c => {
            if (c.id === coinId) {
                return { ...c, matches: c.matches.filter(m => m !== categoryId) };
            }
            return c;
        });
    }

    // Clear board strictly preserving UwU
    function clearBoard() {
        if (confirm("Are you sure you want to clear the board? This will remove all assets except UwU.")) {
            coins = coins.filter(c => c.id === "uwu");
        }
    }

    // 4. Reactive Leaderboard
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
    <div class="app-toolbar">
        <button class="win-btn menu-trigger" onclick={() => showAddForm = !showAddForm}>
            ➕ {showAddForm ? "Cancel Action" : "Add Custom Asset"}
        </button>
        <button class="win-btn danger-btn" onclick={clearBoard}>
            🗑️ Clear Data
        </button>
    </div>

    {#if showAddForm}
        <div class="win-panel form-overlay" in:fade={{ duration: 150 }}>
            <div class="win-inset form-wrapper">
                <h3>💾 Register New Speculative Asset</h3>

                <div class="fetch-row">
                    <label for="coin-query">Search (Ticker or CA):</label>
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
                        <button
                            type="button"
                            class="checkbox-chip {newCoinMatches.includes(cat.id) ? 'checked' : ''}"
                            onclick={() => toggleCategoryMatch(cat.id)}
                        >
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

    <div class="scrollable-content">
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
                                    <div class="asset-sticker" title="{matchedCoin.name}">

                                        <!-- Delete from row button -->
                                        {#if matchedCoin.id !== 'uwu'}
                                            <button
                                                class="remove-match-btn win-btn"
                                                onclick={() => removeMatch(matchedCoin.id, cat.id)}
                                                title="Remove from {cat.name}"
                                            >
                                                x
                                            </button>
                                        {/if}

                                        <div class="sticker-avatar">
                                            {#if matchedCoin.image}
                                                <img src={matchedCoin.image} alt={matchedCoin.name} class="coin-img" />
                                            {:else}
                                                <span class="emoji-fallback">{matchedCoin.fallbackEmoji}</span>
                                            {/if}
                                        </div>
                                        <span class="sticker-label">{matchedCoin.name}</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <div class="leaderboard-panel mt-10">
            <div class="panel-header">🎯 Aggregate Evaluation Analysis Matrix</div>
            <div class="leaderboard-grid win-inset">
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
                        <span class="pill-score">Score: {item.score}/{categories.length}</span>
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
    }

    .scrollable-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: 6px;
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
        font-family: "Pixelated MS Sans Serif", monospace, Arial;
        font-size: 11px;
        cursor: pointer;
        font-weight: bold;
    }

    .win-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 3px 7px 1px 9px;
        background: #dfdfdf;
    }

    .danger-btn {
        color: #a00000;
    }

    .win-input {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 4px;
        font-family: inherit;
        font-size: 12px;
        outline: none;
    }

    .app-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px;
        border-bottom: 2px solid #808080;
        box-shadow: 0 1px 0 #ffffff;
        font-size: 11px;
        flex-shrink: 0;
    }

    /* Form Styles */
    .form-overlay {
        margin: 6px;
        background: #d4d4d4;
        flex-shrink: 0;
    }

    .form-wrapper {
        padding: 12px;
        background: #f1f1f1;
    }

    .form-wrapper h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #000080;
    }

    .fetch-row, .manual-entry-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        flex-wrap: wrap; /* Allows wrapping on smaller screens */
    }

    .search-input {
        flex-grow: 1;
        min-width: 150px;
    }

    .short-input {
        width: 100px;
    }

    .preview-box {
        width: 28px;
        height: 28px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        color: #808080;
        margin-left: auto;
    }

    .preview-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .category-checkbox-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 6px;
        margin-bottom: 12px;
        margin-top: 5px;
    }

    .checkbox-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        padding: 4px 8px;
        font-size: 11px;
        text-align: left;
        cursor: pointer;
        width: 100%;
    }

    .checkbox-chip.checked {
        background: #000080;
        color: #ffffff;
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 1px 1px 2px #000;
    }

    .form-actions {
        display: flex;
        justify-content: flex-end;
    }

    .save-btn {
        background: #008000;
        color: #ffffff;
        padding: 6px 16px;
        font-size: 12px;
        border-color: #ffffff #000000 #000000 #ffffff;
    }

    /* Matrix Styles */
    .matrix-container {
        overflow-x: auto;
    }

    .matrix-header-row {
        display: flex;
        background: #000080;
        color: #ffffff;
        font-weight: bold;
        font-size: 12px;
        border-bottom: 2px solid #808080;
    }

    .header-cell {
        padding: 6px;
        text-shadow: 1px 1px 0px #000;
    }

    .left-col {
        width: 220px;
        flex-shrink: 0;
        border-right: 2px solid #808080;
    }

    .right-col {
        flex-grow: 1;
        padding-left: 12px;
    }

    .matrix-row {
        display: flex;
        border-bottom: 1px solid #808080;
        background: #e0e0e0;
    }

    .matrix-row:nth-child(even) {
        background: #d6d6d6;
    }

    .category-cell {
        width: 220px;
        flex-shrink: 0;
        padding: 8px 6px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
        font-size: 12px;
        border-right: 2px solid #808080;
        background: rgba(255, 255, 255, 0.15);
    }

    .assets-cell {
        flex-grow: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 14px;
        padding: 6px 12px;
        min-height: 48px;
    }

    /* Sticker Styles & Hover Logic */
    .asset-sticker-wrapper {
        position: relative;
    }

    .asset-sticker {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 52px;
        text-align: center;
    }

    .sticker-avatar {
        font-size: 22px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1px solid #808080;
        border-radius: 4px;
        box-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        overflow: hidden;
    }

    .coin-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .sticker-label {
        font-size: 9px;
        font-weight: bold;
        margin-top: 3px;
        color: #101010;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    /* The 'X' Button on hover */
    .remove-match-btn {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 18px;
        height: 18px;
        padding: 0 !important;
        font-size: 9px;
        color: red;
        z-index: 10;
        display: none;
    }

    /* Show 'X' button when hovering the wrapper (Desktop) */
    .asset-sticker-wrapper:hover .remove-match-btn {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* Leaderboard */
    .leaderboard-panel {
        background: #b5b5b5;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        padding: 6px;
    }

    .panel-header {
        background: #000080;
        color: #ffffff;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 4px;
        text-shadow: 1px 1px 0px #000;
    }

    .leaderboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 6px;
        padding: 8px;
        max-height: 180px;
        overflow-y: auto;
    }

    .leaderboard-pill {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: bold;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
    }

    .pill-badge {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .leaderboard-tiny-img {
        width: 14px;
        height: 14px;
        border-radius: 2px;
    }

    .mt-10 { margin-top: 10px; }

    /* =========================================
       MOBILE RESPONSIVENESS OVERRIDES
       ========================================= */
    @media (max-width: 650px) {
        .matrix-header-row {
            display: none; /* Hide top headers to save space */
        }

        .matrix-row {
            flex-direction: column; /* Stack category on top of icons */
        }

        .category-cell {
            width: 100%;
            border-right: none;
            border-bottom: 2px solid #808080;
            padding: 6px 8px;
        }

        .assets-cell {
            width: 100%;
            padding: 10px 8px;
            justify-content: flex-start;
        }

        .app-toolbar {
            flex-direction: row; /* Keep buttons next to each other */
            gap: 6px;
        }

        /* Always show the remove button on touch devices since they can't hover */
        @media (hover: none) {
            .remove-match-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.85; /* Slight transparency so it's not too aggressive */
            }
        }
    }
</style>
