<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    const CA = "UWUy7J86LUiBv5SjAUZ53LMGhtnqvbQ7QNSSkyupump";

    let price = $state("0.0000");
    let change24h = $state(0);
    let copied = $state(false);

    let candles: any[] = $state([]);
    let chartHighStr = $state("0");
    let chartLowStr = $state("0");
    let currentPricePct = $state(50);

    // --- SIDEBAR STATE & LOGIC ---
    let isSidebarOpen = $state(true);
    let resizeInterval: ReturnType<typeof setInterval>;

    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;

        document.body.style.setProperty(
            "--sidebar-width",
            isSidebarOpen ? "320px" : "0px",
        );

        let start = Date.now();
        if (resizeInterval) clearInterval(resizeInterval);
        resizeInterval = setInterval(() => {
            window.dispatchEvent(new Event("resize"));
            if (Date.now() - start > 350) clearInterval(resizeInterval);
        }, 16);
    }

    // --- BRAINWAVES STATE & LOGIC ---
    // Locked to 900Hz based on Dubuis' 2004 "Fréquences et Conscience" specifications
    const baseFreq = 900;
    let beatFreq = $state(30);
    let switchTime = $state(4.0);

    let isSwitched = $state(false);
    let isPlayingBrainwave = $state(false);

    let leftFreq = $derived(isSwitched ? baseFreq + beatFreq : baseFreq);
    let rightFreq = $derived(isSwitched ? baseFreq : baseFreq + beatFreq);

    let audioCtx: any = null;
    let oscLeft: any = null;
    let oscRight: any = null;
    let masterGain: any = null;
    let switchInterval: ReturnType<typeof setInterval>;

    function setPreset(beat: number, time: number) {
        beatFreq = beat;
        switchTime = time;
    }

    async function startBrainwave() {
        if (isPlayingBrainwave) return;

        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.8;
        masterGain.connect(audioCtx.destination);

        oscLeft = audioCtx.createOscillator();
        oscRight = audioCtx.createOscillator();
        oscLeft.type = 'sine';
        oscRight.type = 'sine';

        if (audioCtx.createStereoPanner) {
            const panLeft = audioCtx.createStereoPanner();
            const panRight = audioCtx.createStereoPanner();
            panLeft.pan.value = -1;
            panRight.pan.value = 1;
            oscLeft.connect(panLeft).connect(masterGain);
            oscRight.connect(panRight).connect(masterGain);
        } else {
            const merger = audioCtx.createChannelMerger(2);
            oscLeft.connect(merger, 0, 0);
            oscRight.connect(merger, 0, 1);
            merger.connect(masterGain);
        }

        isPlayingBrainwave = true;
        isSwitched = false;

        oscLeft.frequency.setValueAtTime(leftFreq, audioCtx.currentTime);
        oscRight.frequency.setValueAtTime(rightFreq, audioCtx.currentTime);

        oscLeft.start();
        oscRight.start();
    }

    function stopBrainwave() {
        if (!isPlayingBrainwave) return;
        if (oscLeft) { oscLeft.stop(); oscLeft.disconnect(); }
        if (oscRight) { oscRight.stop(); oscRight.disconnect(); }
        if (audioCtx) audioCtx.suspend();

        isPlayingBrainwave = false;
        isSwitched = false;
    }

    $effect(() => {
        if (isPlayingBrainwave && oscLeft && oscRight && masterGain && audioCtx) {
            oscLeft.frequency.setValueAtTime(leftFreq, audioCtx.currentTime);
            oscRight.frequency.setValueAtTime(rightFreq, audioCtx.currentTime);
        }
    });

    $effect(() => {
        if (switchInterval) clearInterval(switchInterval);

        if (isPlayingBrainwave) {
            switchInterval = setInterval(() => {
                isSwitched = !isSwitched;
            }, switchTime * 1000);
        }
    });

    onDestroy(() => {
        if (isPlayingBrainwave) stopBrainwave();
    });
    // ---------------------------------

    onMount(async () => {
        document.body.style.setProperty("--sidebar-width", "320px");

        let currentPriceNum = 0.0068;

        try {
            const res = await fetch(
                `https://api.dexscreener.com/latest/dex/tokens/${CA}`,
            );
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

        try {
            const serverRes = await fetch("/api/uwu-chart");
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
        toggleSidebar();
    });

    const copyCA = () => {
        navigator.clipboard.writeText(CA);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    };

    function processRealChartData(items: any[], livePrice: number) {
        const chartData = items.slice(-14);
        const minLow = Math.min(...chartData.map((c) => c.l), livePrice);
        const maxHigh = Math.max(...chartData.map((c) => c.h), livePrice);
        const range = maxHigh - minLow || 0.00001;

        chartHighStr = maxHigh.toPrecision(5);
        chartLowStr = minLow.toPrecision(5);
        currentPricePct = ((livePrice - minLow) / range) * 80 + 10;

        candles = chartData.map((c) => {
            const bodyBottom =
                ((Math.min(c.o, c.c) - minLow) / range) * 80 + 10;
            const bodyTop = ((Math.max(c.o, c.c) - minLow) / range) * 80 + 10;
            const wickBottom = ((c.l - minLow) / range) * 80 + 10;
            const wickTop = ((c.h - minLow) / range) * 80 + 10;

            return {
                isGreen: c.c >= c.o,
                bodyBottom: bodyBottom,
                bodyHeight: Math.max(bodyTop - bodyBottom, 1),
                wickBottom: wickBottom,
                wickHeight: Math.max(wickTop - wickBottom, 1),
            };
        });
    }

    function generateFallbackChart(currentPrice: number, changePct: number) {
        const numCandles = 14;
        let generated = [];
        const startPrice = currentPrice / (1 + changePct / 100);
        let lastClose = startPrice;

        for (let i = 0; i < numCandles - 1; i++) {
            const volatility = currentPrice * 0.06;
            const open = lastClose;
            const progress = i / numCandles;
            const targetPrice =
                startPrice + (currentPrice - startPrice) * progress;
            const close = targetPrice + (Math.random() - 0.5) * volatility;
            const high =
                Math.max(open, close) + Math.random() * volatility * 0.5;
            const low =
                Math.min(open, close) - Math.random() * volatility * 0.5;
            generated.push({ o: open, h: high, l: low, c: close });
            lastClose = close;
        }

        generated.push({
            o: lastClose,
            h: Math.max(lastClose, currentPrice) + currentPrice * 0.02,
            l: Math.min(lastClose, currentPrice) - currentPrice * 0.02,
            c: currentPrice,
        });

        processRealChartData(generated, currentPrice);
    }
</script>

<aside class="win98-sidebar {isSidebarOpen ? '' : 'collapsed'}">
    <button
        class="win98-btn sidebar-toggle"
        onclick={toggleSidebar}
        title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
    >
        {isSidebarOpen ? "▶" : "◀"}
    </button>

    <div class="win98-titlebar">
        <span class="title-text">🦄 Unicorn</span>
        <div class="title-controls">
            <button class="control-btn">?</button>
            <button class="control-btn" onclick={toggleSidebar}>×</button>
        </div>
    </div>

    <div class="sidebar-content">
        <div class="logo-row">
            <div class="logo-inset">
                <img
                    src="/unicorn.png"
                    alt="Unicorn"
                    class="unicorn-pixel"
                    onerror={(e: any) => (e.target.style.display = "none")}
                />
            </div>
            <div class="header-right">
                <h1 class="token-title">UwU Token</h1>
                <button
                    class="win98-btn action-btn"
                    onclick={() =>
                        window.open("https://x.com/unicornandmemes", "_blank")}
                >
                    It's in the name
                </button>
            </div>
        </div>

        <fieldset class="win98-fieldset">
            <legend>Contract Address</legend>
            <div class="ca-container">
                <input type="text" readonly value={CA} class="win98-input" />
                <button class="win98-btn copy-btn" onclick={copyCA}>
                    {copied ? "Copied!" : "Copy"}
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
                <div
                    class="well-value numerical"
                    style="color: {change24h >= 0 ? '#00F0FF' : '#FF007F'}"
                >
                    {change24h >= 0 ? "+" : ""}{change24h}%
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
                            <div
                                class="wick"
                                style="bottom: {candle.wickBottom}%; height: {candle.wickHeight}%;"
                            ></div>
                            <div
                                class="body {candle.isGreen ? 'green' : 'red'}"
                                style="bottom: {candle.bodyBottom}%; height: {candle.bodyHeight}%;"
                            ></div>
                        </div>
                    {/each}
                </div>
            </div>
        </fieldset>

        <fieldset class="win98-fieldset brainwave-fieldset">
            <legend>Initiation Brainwaves</legend>

            <div class="player-lcd">
                <div class="lcd-status">
                    <span>{isPlayingBrainwave ? "▶ TRANSMITTING..." : "⏸ INACTIVE"}</span>
                    <span class="lcd-base-hz">BASE: {baseFreq}Hz</span>
                </div>
                <div class="lcd-freq-display">
                    <span class="chan {isSwitched ? 'inactive' : 'active'}">L: {leftFreq.toFixed(1)}</span>
                    <span class="swap-indicator">{isSwitched ? "⇌" : "⇋"}</span>
                    <span class="chan {!isSwitched ? 'inactive' : 'active'}">R: {rightFreq.toFixed(1)}</span>
                </div>
            </div>

            <div class="bw-preset-grid">
                <button class="win98-btn bw-preset-btn" onclick={() => setPreset(30, 4.0)}>Earth (30Hz)</button>
                <button class="win98-btn bw-preset-btn" onclick={() => setPreset(10, 4.0)}>Astral (10Hz)</button>
                <button class="win98-btn bw-preset-btn" onclick={() => setPreset(6, 4.0)}>Mental (6Hz)</button>
                <button class="win98-btn bw-preset-btn" onclick={() => setPreset(2, 4.0)}>Eternity (2Hz)</button>
            </div>

            <div class="bw-sliders">
                <div class="bw-slider-group">
                    <div class="bw-slider-header">
                        <span>Switch Timer</span>
                        <span>{switchTime}s</span>
                    </div>
                    <input type="range" class="win98-slider" min="1" max="20" step="0.5" bind:value={switchTime} />
                </div>
            </div>

            <div class="player-controls">
                <button
                    class="win98-btn ctrl-btn"
                    style={isPlayingBrainwave ? "color: #008000;" : ""}
                    onclick={startBrainwave}
                    disabled={isPlayingBrainwave}
                >
                    ▶ START
                </button>
                <button
                    class="win98-btn ctrl-btn"
                    style={!isPlayingBrainwave ? "color: #FF0000;" : ""}
                    onclick={stopBrainwave}
                    disabled={!isPlayingBrainwave}
                >
                    ⏹ STOP
                </button>
            </div>
        </fieldset>

        <div class="hyperlink-matrix">
            <a
                href="https://x.com/unicornandmemes"
                target="_blank"
                class="win98-btn link-btn"
                title="X (Twitter)"
            >
                <img
                    src="https://www.google.com/s2/favicons?domain=x.com&sz=32"
                    alt="X"
                    class="app-icon"
                />
            </a>
            <a
                href="https://t.me/UnicornItsInTheName/1"
                target="_blank"
                class="win98-btn link-btn"
                title="Telegram"
            >
                <img
                    src="https://www.google.com/s2/favicons?domain=t.me&sz=32"
                    alt="Telegram"
                    class="app-icon"
                />
            </a>
            <a
                href="https://dexscreener.com/solana/7v2kmgkqktt4xu9dpzkjfmtngqbbwbvxy4ubxtt1zfng"
                target="_blank"
                class="win98-btn link-btn"
                title="Dexscreener"
            >
                <img
                    src="https://www.google.com/s2/favicons?domain=dexscreener.com&sz=32"
                    alt="Dexscreener"
                    class="app-icon"
                />
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
        max-width: 320px;
        background: #c0c0c0;
        border-left: 2px solid #ffffff;
        box-shadow:
            inset 1px 0 0 #dfdfdf,
            -2px 0 4px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        font-family: "Tahoma", "MS Sans Serif", Geneva, sans-serif;
        font-size: 11px;
        color: #000000;
        z-index: 9998;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform: translateX(0);
    }

    .win98-sidebar.collapsed {
        transform: translateX(100%);
    }

    .sidebar-toggle {
        position: absolute;
        left: -10px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 48px;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow:
            inset 1px 1px 0 #ffffff,
            inset -1px -1px 0 #808080;
        transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .win98-sidebar.collapsed .sidebar-toggle {
        left: -24px;
        border-right: none;
        box-shadow:
            inset 1px 1px 0 #ffffff,
            inset 0px -1px 0 #808080;
    }

    .win98-titlebar {
        background: linear-gradient(90deg, #000080, #1080d0);
        padding: 3px 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .title-text {
        color: #ffffff;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 0.5px;
    }
    .title-controls {
        display: flex;
        gap: 2px;
    }
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
        overflow-y: hidden;
        overflow-x: hidden;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .logo-row {
        display: flex;
        gap: 10px;
        align-items: center;
    }
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
    .unicorn-pixel {
        width: 48px;
        height: 48px;
        image-rendering: pixelated;
    }
    .header-right {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-grow: 1;
    }
    .token-title {
        margin: 0;
        font-size: 16px;
        font-weight: bold;
        color: #000080;
        text-transform: uppercase;
    }

    .win98-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow:
            inset 1px 1px 0 #ffffff,
            inset -1px -1px 0 #808080;
        color: #000000;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 6px;
        cursor: pointer;
        text-align: center;
    }
    .win98-btn:active, .win98-btn:active:not(:disabled) {
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 1px 1px 0 #000000;
        padding: 5px 5px 3px 7px;
    }
    .win98-btn:disabled {
        color: #808080;
        text-shadow: 1px 1px 0 #ffffff;
        cursor: not-allowed;
    }

    .action-btn {
        width: 100%;
        text-transform: uppercase;
    }

    .win98-fieldset {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        margin: 0;
        padding: 8px;
        min-width: 0;
    }
    .win98-fieldset legend {
        font-weight: bold;
        padding: 0 4px;
    }

    .ca-container {
        display: flex;
        gap: 4px;
    }
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
        min-width: 0;
    }
    .copy-btn {
        min-width: 60px;
    }

    .ticker-grid {
        display: flex;
        gap: 6px;
    }
    .data-well {
        flex: 1;
        background: #000000;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        padding: 4px 6px;
        min-width: 0;
    }
    .well-label {
        color: #808080;
        font-size: 9px;
        font-weight: bold;
    }
    .well-value {
        color: #ffffff;
        font-size: 14px;
        font-weight: bold;
        margin-top: 2px;
    }
    .numerical {
        font-family: "Courier New", Courier, monospace;
        letter-spacing: -0.5px;
    }

    .retro-chart-box {
        background: #2d1b47;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        height: 150px;
        position: relative;
        overflow: hidden;
    }

    .scale-line {
        position: absolute;
        left: 0;
        width: 100%;
        border-bottom: 1px dotted #ffff00;
        z-index: 0;
    }
    .scale-label {
        position: absolute;
        right: 4px;
        bottom: 2px;
        color: #ffff00;
        font-size: 9px;
        font-weight: bold;
        font-family: "Courier New", Courier, monospace;
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
        background: #ffffff;
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
    .body.green {
        background: #00f0ff;
        border-color: #00f0ff;
    }
    .body.red {
        background: #ff007f;
        border-color: #ff007f;
    }

    /* BRAINWAVES STYLING */
    .brainwave-fieldset {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
        flex-shrink: 0;
    }

    .player-lcd {
        background: #000000;
        border: 2px solid;
        border-color: #808080 #fff #fff #808080;
        padding: 4px 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;
    }
    .lcd-status {
        color: #00ff00;
        font-size: 9px;
        font-weight: bold;
        font-family: "Courier New", Courier, monospace;
        display: flex;
        justify-content: space-between;
    }
    .lcd-base-hz {
        color: #008080;
    }
    .lcd-freq-display {
        display: flex;
        justify-content: space-between;
        font-family: "Courier New", Courier, monospace;
        font-size: 13px;
        font-weight: bold;
    }
    .chan {
        color: #00ff00;
    }
    .chan.active {
        color: #fff;
        text-shadow: 0 0 5px #00ff00;
    }
    .chan.inactive {
        color: #008000;
    }
    .swap-indicator {
        color: #008080;
    }

    .bw-preset-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
    }
    .bw-preset-btn {
        font-size: 9px;
        padding: 4px 2px;
    }

    .bw-sliders {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #e6e6e6;
        padding: 6px;
        border: 1px inset #fff;
    }
    .bw-slider-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .bw-slider-header {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        font-weight: bold;
        color: #333;
    }

    .win98-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        background: transparent;
        margin: 0;
        height: 16px;
        flex-grow: 1;
    }
    .win98-slider:focus {
        outline: none;
    }
    .win98-slider::-webkit-slider-runnable-track {
        width: 100%;
        height: 4px;
        background: #000;
        border-bottom: 1px solid #fff;
        border-right: 1px solid #fff;
        box-shadow: inset 1px 1px 0 #808080;
    }
    .win98-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        height: 14px;
        width: 8px;
        background: #c0c0c0;
        border: 1px solid;
        border-color: #fff #000 #000 #fff;
        box-shadow: inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #808080;
        margin-top: -6px;
        cursor: pointer;
    }

    .player-controls {
        display: flex;
        gap: 4px;
        justify-content: center;
        margin-top: 4px;
    }
    .ctrl-btn {
        flex: 1;
        font-size: 11px;
        padding: 6px 0;
    }

    .hyperlink-matrix {
        display: flex;
        flex-direction: row;
        gap: 8px;
        flex-shrink: 0;
        margin-top: auto;
    }
    .link-btn {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 6px 0;
    }
    .app-icon {
        width: 18px;
        height: 18px;
        image-rendering: -webkit-optimize-contrast;
    }

    @media (max-width: 768px) {
        .win98-sidebar {
            display: none !important;
        }
    }
</style>
