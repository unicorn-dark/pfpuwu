<script lang="ts">
    import { onMount } from 'svelte';

    const CA = "UWUy7J86LUiBv5SjAUZ53LMGhtnqvbQ7QNSSkyupump";
    
    let price = $state("0.0000");
    let change24h = $state(0);
    let copied = $state(false);
    
    let candles: any[] = $state([]);
    let chartHighStr = $state("0");
    let chartLowStr = $state("0");
    let currentPricePct = $state(50);

    // --- CUSTOM MEDIA PLAYER STATE ---
    let audioRef: any;
    let isPlaying = $state(false);
    let currentTrackIndex = $state(0);
    
    const playlist = [
    // --- RAVE / ELECTRONIC / SYNTHWAVE (Royalty Free Streams) ---
    { title: "Synthwave Test 1", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { title: "Cyberpunk City", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
    { title: "Neon Nights", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
    { title: "Trance State", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
    { title: "Acid Bassline", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
    { title: "Retro Future", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
    { title: "Warehouse Rave 1998", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3" },
    { title: "Digital Horizon", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" },
    { title: "Matrix Upload", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3" },
    { title: "Vaporwave Mall", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3" },
    { title: "Eurodance Anthem", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3" },
    { title: "BPM 160", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3" },
    { title: "Laser Grid", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3" },
    { title: "Hacker's Den", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3" },
    { title: "Dial-up Connection", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3" },
    { title: "System Override", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3" },
    { title: "Terminal Velocity", artist: "SoundHelix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3" },
];

    let currentTrack = $derived(playlist[currentTrackIndex]);

    function togglePlay() {
        if (!audioRef) return;
        if (isPlaying) {
            audioRef.pause();
        } else {
            audioRef.play();
        }
        isPlaying = !isPlaying;
    }

    function playTrack(index: number) {
        currentTrackIndex = index;
        if (audioRef) {
            audioRef.src = playlist[currentTrackIndex].url;
            audioRef.play();
            isPlaying = true;
        }
    }

    function nextTrack() {
        playTrack((currentTrackIndex + 1) % playlist.length);
    }

    function prevTrack() {
        playTrack((currentTrackIndex - 1 + playlist.length) % playlist.length);
    }
    // ---------------------------------

    onMount(async () => {
        let currentPriceNum = 0.0068;

        // 1. Dexscreener Fetch
        try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CA}`);
            const data = await res.json();
            if (data.pairs && data.pairs.length > 0) {
                const pair = data.pairs[0]; 
                currentPriceNum = parseFloat(pair.priceUsd);
                price = currentPriceNum.toPrecision(5);
                change24h = Number(pair.priceChange.h24);
            }
        } catch (e) {
            console.error("Dexscreener fetch failed", e);
        }

        // 2. Birdeye Secure Fetch
        try {
            const serverRes = await fetch('/api/uwu-chart');
            const birdeyeData = await serverRes.json();

            if (birdeyeData?.data?.items && birdeyeData.data.items.length > 0) {
                processRealChartData(birdeyeData.data.items, currentPriceNum);
            } else {
                throw new Error("No chart data returned");
            }
        } catch (e) {
            console.error("Secure fetch failed, falling back to mock", e);
            generateFallbackChart(currentPriceNum, change24h);
        }
    });

    const copyCA = () => {
        navigator.clipboard.writeText(CA);
        copied = true;
        setTimeout(() => copied = false, 2000);
    };

    function processRealChartData(items: any[], livePrice: number) {
        const chartData = items.slice(-14);
        const minLow = Math.min(...chartData.map(c => c.l), livePrice);
        const maxHigh = Math.max(...chartData.map(c => c.h), livePrice);
        const range = maxHigh - minLow || 0.00001;

        chartHighStr = maxHigh.toPrecision(5);
        chartLowStr = minLow.toPrecision(5);
        currentPricePct = ((livePrice - minLow) / range) * 80 + 10;

        candles = chartData.map(c => {
            const bodyBottom = ((Math.min(c.o, c.c) - minLow) / range) * 80 + 10;
            const bodyTop = ((Math.max(c.o, c.c) - minLow) / range) * 80 + 10;
            const wickBottom = ((c.l - minLow) / range) * 80 + 10;
            const wickTop = ((c.h - minLow) / range) * 80 + 10;

            return {
                isGreen: c.c >= c.o,
                bodyBottom: bodyBottom,
                bodyHeight: Math.max(bodyTop - bodyBottom, 1),
                wickBottom: wickBottom,
                wickHeight: Math.max(wickTop - wickBottom, 1)
            };
        });
    }

    function generateFallbackChart(currentPrice: number, changePct: number) {
        const numCandles = 14;
        let generated = [];
        const startPrice = currentPrice / (1 + (changePct / 100));
        let lastClose = startPrice;

        for (let i = 0; i < numCandles - 1; i++) {
            const volatility = currentPrice * 0.06; 
            const open = lastClose;
            const progress = i / numCandles;
            const targetPrice = startPrice + ((currentPrice - startPrice) * progress);
            const close = targetPrice + (Math.random() - 0.5) * volatility;
            const high = Math.max(open, close) + (Math.random() * volatility * 0.5);
            const low = Math.min(open, close) - (Math.random() * volatility * 0.5);
            generated.push({ o: open, h: high, l: low, c: close });
            lastClose = close;
        }

        generated.push({ 
            o: lastClose, 
            h: Math.max(lastClose, currentPrice) + (currentPrice * 0.02), 
            l: Math.min(lastClose, currentPrice) - (currentPrice * 0.02), 
            c: currentPrice 
        });

        processRealChartData(generated, currentPrice);
    }
</script>

<aside class="win98-sidebar">
    <div class="win98-titlebar">
        <span class="title-text">🦄 Unicorn</span>
        <div class="title-controls">
            <button class="control-btn">?</button>
            <button class="control-btn">×</button>
        </div>
    </div>

    <div class="sidebar-content">
        <div class="logo-row">
            <div class="logo-inset">
                <img src="/unicorn.png" alt="Unicorn" class="unicorn-pixel" onerror={(e: any) => e.target.style.display = 'none'} />
            </div>
            <div class="header-right">
                <h1 class="token-title">UwU Token</h1>
                <button class="win98-btn action-btn" onclick={() => window.open('https://x.com/unicornandmemes', '_blank')}>
                    It's in the name
                </button>
            </div>
        </div>

        <fieldset class="win98-fieldset">
            <legend>Contract Address</legend>
            <div class="ca-container">
                <input type="text" readonly value={CA} class="win98-input" />
                <button class="win98-btn copy-btn" onclick={copyCA}>
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
        </fieldset>

        <div class="ticker-grid">
            <div class="data-well">
                <div class="well-label">LAST PRICE</div>
                <div class="well-value numerical">${price}</div>
            </div>
            <div class="data-well">
                <div class="well-label">24HR CHANGE</div>
                <div class="well-value numerical" style="color: {change24h >= 0 ? '#00F0FF' : '#FF007F'}">
                    {change24h >= 0 ? '+' : ''}{change24h}%
                </div>
            </div>
        </div>

        <fieldset class="win98-fieldset">
            <legend>Live Terminal Chart (4H)</legend>
            <div class="retro-chart-box">
                <div class="scale-line" style="bottom: 90%">
                    <span class="scale-label">H: ${chartHighStr}</span>
                </div>
                <div class="scale-line" style="bottom: {currentPricePct}%">
                    <span class="scale-label">C: ${price}</span>
                </div>
                <div class="scale-line" style="bottom: 10%">
                    <span class="scale-label">L: ${chartLowStr}</span>
                </div>
                
                <div class="candles-container">
                    {#each candles as candle}
                        <div class="candle-wrapper">
                            <div class="wick" style="bottom: {candle.wickBottom}%; height: {candle.wickHeight}%;"></div>
                            <div class="body {candle.isGreen ? 'green' : 'red'}" style="bottom: {candle.bodyBottom}%; height: {candle.bodyHeight}%;"></div>
                        </div>
                    {/each}
                </div>
            </div>
        </fieldset>

        <fieldset class="win98-fieldset player-fieldset">
            <legend>Media Player</legend>
            
            <audio bind:this={audioRef} src={playlist[0].url} onended={nextTrack}></audio>
            
            <div class="player-lcd">
                <div class="lcd-status">{isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}</div>
                <div class="lcd-track-marquee">
                    <span>{currentTrack.artist} - {currentTrack.title}</span>
                </div>
            </div>

            <div class="player-controls">
                <button class="win98-btn ctrl-btn" onclick={prevTrack} title="Previous">⏮</button>
                <button class="win98-btn ctrl-btn" onclick={togglePlay} title="Play/Pause">
                    {isPlaying ? '⏸' : '▶'}
                </button>
                <button class="win98-btn ctrl-btn" onclick={nextTrack} title="Next">⏭</button>
            </div>

            <div class="player-playlist">
                {#each playlist as track, i}
                    <div 
                        class="playlist-item {i === currentTrackIndex ? 'active' : ''}"
                        onclick={() => playTrack(i)}
                    >
                        <span class="track-num">{i + 1}.</span> {track.title}
                    </div>
                {/each}
            </div>
        </fieldset>

        <div class="hyperlink-matrix">
            <a href="https://x.com/unicornandmemes" target="_blank" class="win98-btn link-btn" title="X (Twitter)">
                <img src="https://www.google.com/s2/favicons?domain=x.com&sz=32" alt="X" class="app-icon" />
            </a>
            <a href="https://t.me/UnicornItsInTheName/1" target="_blank" class="win98-btn link-btn" title="Telegram">
                <img src="https://www.google.com/s2/favicons?domain=t.me&sz=32" alt="Telegram" class="app-icon" />
            </a>
            <a href="https://dexscreener.com/solana/7v2kmgkqktt4xu9dpzkjfmtngqbbwbvxy4ubxtt1zfng" target="_blank" class="win98-btn link-btn" title="Dexscreener">
                <img src="https://www.google.com/s2/favicons?domain=dexscreener.com&sz=32" alt="Dexscreener" class="app-icon" />
            </a>
        </div>
    </div>
</aside>

<style>
    .win98-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 35px;
        width: 320px;
        background: #c0c0c0;
        border-left: 2px solid #ffffff;
        box-shadow: inset 1px 0 0 #dfdfdf, -2px 0 4px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        font-family: 'Tahoma', 'MS Sans Serif', Geneva, sans-serif;
        font-size: 11px;
        color: #000000;
        z-index: 9998;
    }

    .sidebar-content::-webkit-scrollbar { width: 16px; }
    .sidebar-content::-webkit-scrollbar-track { background: #e6e6e6; box-shadow: inset 1px 1px 0 #808080; }
    .sidebar-content::-webkit-scrollbar-thumb { background: #c0c0c0; border: 2px solid; border-color: #fff #5a5a5a #5a5a5a #fff; }

    .win98-titlebar {
        background: linear-gradient(90deg, #000080, #1080d0);
        padding: 3px 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .title-text { color: #ffffff; font-weight: bold; font-size: 11px; letter-spacing: 0.5px; }
    .title-controls { display: flex; gap: 2px; }
    .control-btn {
        background: #c0c0c0;
        border: 1px solid;
        border-color: #fff #000 #000 #fff;
        font-size: 9px;
        font-weight: bold;
        padding: 0px 4px;
        cursor: pointer;
    }

    .sidebar-content {
        padding: 8px;
        overflow-y: auto;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .logo-row { display: flex; gap: 10px; align-items: center; }
    .logo-inset {
        width: 54px;
        height: 54px;
        background: #000000;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .unicorn-pixel { width: 48px; height: 48px; image-rendering: pixelated; }
    .header-right { display: flex; flex-direction: column; gap: 4px; flex-grow: 1; }
    .token-title { margin: 0; font-size: 16px; font-weight: bold; color: #000080; text-transform: uppercase; }

    .win98-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #808080;
        color: #000000;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 6px;
        cursor: pointer;
        text-align: center;
    }
    .win98-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 1px 1px 0 #000000;
        padding: 5px 5px 3px 7px;
    }

    .action-btn { width: 100%; text-transform: uppercase; }

    .win98-fieldset {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        margin: 0;
        padding: 8px;
    }
    .win98-fieldset legend { font-weight: bold; padding: 0 4px; }

    .ca-container { display: flex; gap: 4px; }
    .win98-input {
        flex-grow: 1;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        color: #000;
        font-family: monospace;
        font-size: 11px;
        padding: 3px;
        outline: none;
    }
    .copy-btn { min-width: 60px; }

    .ticker-grid { display: flex; gap: 6px; }
    .data-well {
        flex: 1;
        background: #000000;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        padding: 4px 6px;
    }
    .well-label { color: #808080; font-size: 9px; font-weight: bold; }
    .well-value { color: #ffffff; font-size: 14px; font-weight: bold; margin-top: 2px; }
    .numerical { font-family: 'Courier New', Courier, monospace; letter-spacing: -0.5px; }

    .retro-chart-box {
        background: #2d1b47;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        height: 180px; 
        position: relative;
        overflow: hidden;
    }

    .scale-line {
        position: absolute;
        left: 0;
        width: 100%;
        border-bottom: 1px dotted #FFFF00; 
        z-index: 0;
    }
    .scale-label {
        position: absolute;
        right: 4px;
        bottom: 2px;
        color: #FFFF00;
        font-size: 9px;
        font-weight: bold;
        font-family: 'Courier New', Courier, monospace;
        background: #2d1b47; 
        padding: 0 2px;
    }

    .candles-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: space-evenly; 
        align-items: flex-end;
        padding: 0 40px 0 10px; 
        box-sizing: border-box;
    }
    .candle-wrapper {
        position: relative;
        width: 12px;
        height: 100%;
    }
    .wick {
        position: absolute;
        width: 1px;
        background: #FFFFFF;
        left: 5px; 
        z-index: 1;
    }
    .body {
        position: absolute;
        width: 100%;
        z-index: 2;
        border: 1px solid #ffffff;
        box-sizing: border-box;
    }
    .body.green { background: #00F0FF; border-color: #00F0FF; }
    .body.red { background: #FF007F; border-color: #FF007F; }

    /* --- NATIVE SVELTE MEDIA PLAYER --- */
    /* --- NATIVE SVELTE MEDIA PLAYER --- */
    .player-fieldset {
        /* 1. Tell the entire player to stretch and fill the remaining sidebar space */
        flex-grow: 1; 
        display: flex;
        flex-direction: column;
        gap: 6px;
        /* 2. Critical for nested flex scrolling: tells the box it's allowed to shrink if needed */
        min-height: 0; 
        margin-bottom: 10px; /* Adds a little breathing room above the external links */
    }
    
    .player-lcd {
        background: #000000;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080; 
        padding: 4px 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        height: 32px;
        /* Prevent the LCD from stretching */
        flex-shrink: 0; 
        overflow: hidden;
    }
    /* ... keep your existing .lcd-status and .lcd-track-marquee rules ... */

    /* ... keep your existing .player-controls and .ctrl-btn rules ... */

    .player-playlist {
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        /* 3. Tell the white playlist box to stretch to fill the newly expanded fieldset */
        flex-grow: 1; 
        overflow-y: auto;
        display: block; /* Block handles vertical scrolling better than flex */
        min-height: 60px; /* Keep a minimum size just in case */
    }
    .lcd-status {
        color: #00ff00; /* Classic Winamp Green */
        font-size: 9px;
        font-weight: bold;
        font-family: 'Courier New', Courier, monospace;
    }
    .lcd-track-marquee {
        color: #00ff00;
        font-size: 11px;
        font-weight: bold;
        white-space: nowrap;
        font-family: 'Courier New', Courier, monospace;
        /* Simple static scroll fallback */
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .player-controls {
        display: flex;
        gap: 4px;
        justify-content: center;
    }
    .ctrl-btn {
        flex: 1;
        font-size: 14px; /* Slightly larger symbols */
        padding: 2px 0;
    }

    
    .playlist-item {
        padding: 2px 4px;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .playlist-item:hover {
        background: #e0e0e0;
    }
    .playlist-item.active {
        background: #000080; /* Classic Windows Selection Blue */
        color: #ffffff;
    }
    .track-num {
        display: inline-block;
        width: 15px;
        color: inherit;
    }

    .hyperlink-matrix { display: flex; flex-direction: row; gap: 8px; }
    .link-btn { flex: 1; display: flex; justify-content: center; align-items: center; padding: 6px 0; }
    .app-icon { width: 18px; height: 18px; image-rendering: -webkit-optimize-contrast; }

    @media (max-width: 768px) {
        .win98-sidebar { display: none !important; }
    }
</style>