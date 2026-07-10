<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { fade } from "svelte/transition";

    // Game States
    let gameState = $state<"START" | "PLAYING" | "GAMEOVER">("START");
    let hasStarted = $state(false);

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let animationFrameId: number;
    let width = $state(0);
    let height = $state(0);

    // Audio Context
    let audioCtx: AudioContext | null = null;

    // Physics Engine
    let birdY = 0;
    let birdVelocity = 0;
    const gravity = 0.35;
    const jumpStrength = -6.5;
    const birdSize = 30;

    let pipes: Array<{
        x: number;
        topH: number;
        bottomY: number;
        passed: boolean;
        type: "green" | "red";
    }> = [];
    const pipeWidth = 60;
    const pipeGap = 190;
    const pipeSpeed = 3.0;

    let score = 0;
    let marketCap = $state(100_000);
    let hectocornImg: HTMLImageElement;

    function formatMC(num: number) {
        if (num >= 1e12) return "$" + (num / 1e12).toFixed(2) + "T";
        if (num >= 1e9) return "$" + (num / 1e9).toFixed(2) + "B";
        if (num >= 1e6) return "$" + (num / 1e6).toFixed(2) + "M";
        if (num >= 1e3) return "$" + (num / 1e3).toFixed(0) + "k";
        return "$" + Math.floor(num).toLocaleString();
    }

    function calculateMarketCap(pipesPassed: number) {
        return Math.floor(100_000 * Math.pow(1.7, pipesPassed));
    }

    // --- MOBILE AUDIO FIX ---
    function initAudio() {
        if (!audioCtx) {
            // Webkit fallback is required for iOS Safari
            audioCtx = new (
                window.AudioContext || (window as any).webkitAudioContext
            )();
        }
        // Apple requires resuming the context directly inside the tap event
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    }

    function playSound(type: "flap" | "score" | "crash") {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        // Cranked up the gain (volume) so it's audible on mobile speakers
        if (type === "flap") {
            osc.type = "square";
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gainNode.gain.setValueAtTime(0.1, now); // Increased from 0.05
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === "score") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.setValueAtTime(1500, now + 0.05);
            gainNode.gain.setValueAtTime(0.2, now); // Increased from 0.1
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === "crash") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
            gainNode.gain.setValueAtTime(0.4, now); // Increased from 0.2
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    }

    // --- VIRAL IMAGE GENERATOR ---
    function generateShareImage() {
        const shareCanvas = document.createElement("canvas");
        shareCanvas.width = 1080;
        shareCanvas.height = 1080;
        const sCtx = shareCanvas.getContext("2d");
        if (!sCtx) return;

        sCtx.fillStyle = "#00FFFF";
        sCtx.fillRect(0, 0, 1080, 1080);

        sCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        sCtx.lineWidth = 4;
        for (let i = 0; i < 1080; i += 60) {
            sCtx.beginPath();
            sCtx.moveTo(i, 0);
            sCtx.lineTo(i, 1080);
            sCtx.stroke();
            sCtx.beginPath();
            sCtx.moveTo(0, i);
            sCtx.lineTo(1080, i);
            sCtx.stroke();
        }

        for (let i = 0; i < 20; i++) {
            const isGreen = Math.random() > 0.5;
            sCtx.fillStyle = isGreen
                ? "rgba(0, 255, 0, 0.3)"
                : "rgba(255, 0, 0, 0.3)";
            sCtx.strokeStyle = "rgba(0, 0, 0, 0.3)";
            sCtx.lineWidth = 6;

            const cx = Math.random() * 1080;
            const cy = Math.random() * 1080;
            const cWidth = 40 + Math.random() * 60;
            const cHeight = 80 + Math.random() * 200;
            const wickHeight = cHeight + 40 + Math.random() * 100;

            sCtx.fillRect(
                cx + cWidth / 2 - 4,
                cy - (wickHeight - cHeight) / 2,
                8,
                wickHeight,
            );
            sCtx.fillRect(cx, cy, cWidth, cHeight);
            sCtx.strokeRect(cx, cy, cWidth, cHeight);
        }

        if (hectocornImg.complete && hectocornImg.naturalHeight !== 0) {
            sCtx.drawImage(hectocornImg, 540 - 250, 120, 500, 500);
        }

        sCtx.textAlign = "center";

        sCtx.font = 'bold 80px "Courier New", monospace';
        sCtx.fillStyle = "#FFFF00";
        sCtx.shadowColor = "#000";
        sCtx.shadowOffsetX = 8;
        sCtx.shadowOffsetY = 8;
        sCtx.fillText("I PUMPED UWU TO", 540, 700);

        sCtx.font = 'bold 160px "Courier New", monospace';
        sCtx.fillStyle = "#00FF00";
        sCtx.fillText(formatMC(marketCap), 540, 860);

        sCtx.font = 'bold 50px "Courier New", monospace';
        sCtx.fillStyle = "#FFFFFF";
        sCtx.shadowOffsetX = 4;
        sCtx.shadowOffsetY = 4;
        sCtx.fillText("Can you beat me? Play at uwu.meme", 540, 1000);

        const link = document.createElement("a");
        link.download = `UwU-Hectocorn-Run.png`;
        link.href = shareCanvas.toDataURL("image/png");
        link.click();
    }

    // --- GAME ENGINE ---
    function resetGame() {
        hasStarted = false;
        birdY = height / 2;
        birdVelocity = 0;
        pipes = [];
        score = 0;
        marketCap = calculateMarketCap(0);
        gameState = "PLAYING";
        gameLoop();
    }

    function spawnPipe(startX: number) {
        const minPipeH = 50;
        const maxPipeH = height - pipeGap - minPipeH;
        const topH =
            Math.floor(Math.random() * (maxPipeH - minPipeH + 1)) + minPipeH;
        const type = Math.random() > 0.5 ? "green" : "red";

        pipes.push({
            x: startX,
            topH: topH,
            bottomY: topH + pipeGap,
            passed: false,
            type,
        });
    }

    function flap() {
        // Must be called on every tap to satisfy Apple's strict audio rules
        initAudio();

        if (gameState === "START" || gameState === "GAMEOVER") {
            resetGame();
            return;
        }

        if (!hasStarted) {
            hasStarted = true;
            spawnPipe(width + 200);
        }

        birdVelocity = jumpStrength;
        playSound("flap");
    }

    function gameOver() {
        gameState = "GAMEOVER";
        playSound("crash");
        cancelAnimationFrame(animationFrameId);
    }

    function gameLoop() {
        if (gameState !== "PLAYING" || !ctx) return;

        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        for (let i = 0; i < height; i += 40) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }

        if (hasStarted) {
            birdVelocity += gravity;
            birdY += birdVelocity;

            if (birdY + birdSize >= height || birdY - birdSize <= 0) {
                gameOver();
                return;
            }

            for (let i = pipes.length - 1; i >= 0; i--) {
                let p = pipes[i];
                p.x -= pipeSpeed;

                ctx.fillStyle = p.type === "red" ? "#ff0000" : "#00ff00";
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 3;

                ctx.fillRect(p.x + pipeWidth / 2 - 2, 0, 4, p.topH);
                ctx.fillRect(p.x, p.topH - 100, pipeWidth, 100);
                ctx.strokeRect(p.x, p.topH - 100, pipeWidth, 100);

                ctx.fillRect(
                    p.x + pipeWidth / 2 - 2,
                    p.bottomY,
                    4,
                    height - p.bottomY,
                );
                ctx.fillRect(p.x, p.bottomY, pipeWidth, 100);
                ctx.strokeRect(p.x, p.bottomY, pipeWidth, 100);

                const birdLeft = width / 3 - birdSize + 10;
                const birdRight = width / 3 + birdSize - 10;
                const birdTop = birdY - birdSize + 10;
                const birdBottom = birdY + birdSize - 10;

                if (birdRight > p.x && birdLeft < p.x + pipeWidth) {
                    if (birdTop < p.topH || birdBottom > p.bottomY) {
                        gameOver();
                        return;
                    }
                }

                if (!p.passed && p.x + pipeWidth < width / 3) {
                    p.passed = true;
                    score++;
                    marketCap = calculateMarketCap(score);
                    playSound("score");
                }

                if (p.x + pipeWidth < 0) {
                    pipes.splice(i, 1);
                }
            }

            if (pipes.length === 0 || pipes[pipes.length - 1].x < width - 250) {
                spawnPipe(width);
            }
        } else {
            birdY = height / 2 + Math.sin(Date.now() / 150) * 10;
        }

        ctx.save();
        ctx.translate(width / 3, birdY);
        const rotation = hasStarted
            ? Math.min(Math.PI / 4, Math.max(-Math.PI / 4, birdVelocity * 0.1))
            : 0;
        ctx.rotate(rotation);

        if (hectocornImg.complete && hectocornImg.naturalHeight !== 0) {
            ctx.drawImage(
                hectocornImg,
                -birdSize * 1.5,
                -birdSize * 1.5,
                birdSize * 3,
                birdSize * 3,
            );
        } else {
            ctx.fillStyle = "#ffff00";
            ctx.beginPath();
            ctx.arc(0, 0, birdSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();

        animationFrameId = requestAnimationFrame(gameLoop);
    }

    // --- EVENT LISTENERS ---
    function handleKeyDown(e: KeyboardEvent) {
        if (e.code === "Space") {
            e.preventDefault();
            flap();
        }
    }

    // MOBILE DOUBLE-JUMP FIX: Unified pointerdown handles both touch and mouse safely
    function handleInput(e: Event) {
        e.preventDefault();
        flap();
    }

    onMount(() => {
        hectocornImg = new Image();
        hectocornImg.src = "/images/hectacorn.jpg";

        ctx = canvas.getContext("2d");
        window.addEventListener("keydown", handleKeyDown);

        setTimeout(() => {
            if (ctx && gameState === "START") {
                ctx.fillStyle = "#00FFFF";
                ctx.fillRect(0, 0, width, height);
                ctx.fillStyle = "#00FF00";
                ctx.fillRect(0, height - 50, width, 50);
            }
        }, 100);
    });

    onDestroy(() => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("keydown", handleKeyDown);
        if (audioCtx) audioCtx.close();
    });
</script>

<div
    class="game-wrapper app-container"
    bind:clientWidth={width}
    bind:clientHeight={height}
    onpointerdown={handleInput}
    role="button"
    tabindex="0"
>
    <canvas bind:this={canvas} {width} {height} class="game-canvas"></canvas>

    {#if gameState === "PLAYING"}
        <div class="score-hud">
            <div class="mc-label">CURRENT M-CAP</div>
            <div class="mc-value">{formatMC(marketCap)}</div>
        </div>

        {#if !hasStarted}
            <div class="ready-overlay blink">
                <h2>TAP TO START</h2>
            </div>
        {/if}
    {/if}

    {#if gameState === "START"}
        <div class="overlay-panel win-panel" in:fade>
            <h1 class="neon-title">FLAPPY<br />HECTOCORN</h1>
            <p>Help UwU reach 1 Trillion Market Cap!</p>
            <img
                src="/images/hectacorn.jpg"
                alt="Hectocorn"
                class="preview-img"
                onerror={(e) => (e.currentTarget.style.display = "none")}
            />
            <div class="instructions">
                <strong>PC:</strong> Press [SPACE] or Click<br />
                <strong>MOBILE:</strong> Tap Screen
            </div>
            <button
                class="win-btn blink"
                onpointerdown={(e) => {
                    e.stopPropagation();
                    flap();
                }}
            >
                TAP TO PUMP
            </button>
        </div>
    {/if}

    {#if gameState === "GAMEOVER"}
        <div class="overlay-panel win-panel" in:fade>
            <h1 class="neon-title text-red">RUG PULLED!</h1>
            <div class="stats-box win-inset">
                <div class="stats-row">
                    <span>Pipes Passed:</span>
                    <span class="text-white">{score}</span>
                </div>
                <div class="stats-row divider">
                    <span>Peak Market Cap:</span>
                    <span class="text-green text-large"
                        >{formatMC(marketCap)}</span
                    >
                </div>
            </div>

            {#if marketCap >= 1_000_000_000_000}
                <div class="win-banner blink">🎉 HECTOCORN ACHIEVED! 🎉</div>
            {:else if marketCap >= 1_000_000_000}
                <div class="win-banner">🦄 UNICORN STATUS 🦄</div>
            {:else}
                <div class="win-banner text-red">📉 KEEP HOLDING 📉</div>
            {/if}

            <div class="button-group mt-10">
                <button
                    class="win-btn share-btn"
                    onpointerdown={(e) => {
                        e.stopPropagation();
                        generateShareImage();
                    }}
                >
                    📸 SHARE TO X
                </button>

                <button
                    class="win-btn blink"
                    onpointerdown={(e) => {
                        e.stopPropagation();
                        flap();
                    }}
                >
                    BUY THE DIP (RETRY)
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .game-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        background: #000;
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        touch-action: none;
        font-family: "Pixelated MS Sans Serif", monospace;
    }

    .game-canvas {
        display: block;
        filter: saturate(250%) contrast(1.2) brightness(1.1);
    }

    .score-hud {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        text-shadow:
            2px 2px 0px #000,
            -2px -2px 0px #000,
            2px -2px 0px #000,
            -2px 2px 0px #000;
        pointer-events: none;
    }

    .ready-overlay {
        position: absolute;
        top: 60%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #fff;
        text-shadow: 2px 2px 0px #000;
        pointer-events: none;
    }

    .ready-overlay h2 {
        margin: 0;
        font-size: 24px;
    }

    .mc-label {
        color: #ffff00;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
    }

    .mc-value {
        color: #00ff00;
        font-size: 32px;
        font-weight: bold;
    }

    .overlay-panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 320px;
        max-width: 90%;
        background: #c0c0c0;
        border: 4px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        padding: 20px;
        text-align: center;
        box-shadow: 10px 10px 0px rgba(0, 0, 0, 0.5);
    }

    .win-inset {
        background: #000080;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        color: white;
        padding: 15px;
        margin: 15px 0;
    }

    .neon-title {
        font-size: 32px;
        margin: 0 0 10px 0;
        color: #ffff00;
        text-shadow: 2px 2px 0 #000;
        line-height: 1.1;
    }

    .preview-img {
        width: 80px;
        height: 80px;
        border: 2px solid #000;
        border-radius: 50%;
        margin: 10px auto;
        display: block;
    }

    .instructions {
        font-size: 12px;
        margin: 15px 0;
        line-height: 1.5;
        background: #fff;
        color: #000;
        padding: 5px;
        border: 1px solid #000;
    }

    .stats-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: bold;
    }

    .divider {
        border-top: 2px dashed #808080;
        padding-top: 12px;
        margin-top: 12px;
    }

    .text-white {
        color: #ffffff;
    }
    .text-green {
        color: #00ff00;
    }
    .text-red {
        color: #ff0000;
    }
    .text-large {
        font-size: 24px;
        text-shadow: 1px 1px 0 #000;
    }
    .mt-10 {
        margin-top: 15px;
    }

    .win-banner {
        background: #000;
        color: #ffff00;
        padding: 5px;
        border: 2px solid #fff;
        font-weight: bold;
    }

    .button-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .win-btn {
        background: #c0c0c0;
        border: 3px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 10px 20px;
        font-family: inherit;
        font-weight: bold;
        font-size: 16px;
        cursor: pointer;
        width: 100%;
    }

    .win-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 11px 19px 9px 21px;
    }

    .share-btn {
        background: #1da1f2;
        color: white;
        border-color: #a0d8f8 #005080 #005080 #a0d8f8;
    }

    .blink {
        animation: blinker 1s linear infinite;
    }

    @keyframes blinker {
        50% {
            opacity: 0;
        }
    }
</style>
