<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fade } from "svelte/transition";

    // --- STATE ---
    let initialInvestment = $state<number>(100);
    const CURRENT_UWU_MC = 50_000_000;
    let targetMarketCap = $state<number>(CURRENT_UWU_MC);

    const currentValue = $derived(
        (targetMarketCap / CURRENT_UWU_MC) * (initialInvestment || 0),
    );

    // Graph Dimensions (PC)
    let svgWidth = $state(800);
    let svgHeight = $state(400);
    let mouseX = $state<number | null>(null);
    let isHovering = $state(false);

    // Mobile Scroll State
    let mobileScrollContainer: HTMLDivElement | null = $state(null);
    let mobileViewHeight = $state(0);
    let spineY = $state(0);
    let nodeOffsets = $state<number[]>([]);

    // --- DATA ---
    type Milestone = {
        id: string;
        name: string;
        mc: number;
        type: "tier" | "asset" | "current";
        desc: string;
    };

    const milestones: Milestone[] = [
        {
            id: "minicorn",
            name: "Minicorn",
            mc: 1_000_000,
            type: "tier",
            desc: "The journey begins.",
        },
        {
            id: "soonicorn",
            name: "Soonicorn",
            mc: 900_000_000,
            type: "tier",
            desc: "Almost a unicorn!",
        },
        {
            id: "unicorn",
            name: "Unicorn",
            mc: 1_000_000_000,
            type: "tier",
            desc: "Billion dollar club.",
        },
        {
            id: "pepe",
            name: "Pepe",
            mc: 4_000_000_000,
            type: "asset",
            desc: "Frog money.",
        },
        {
            id: "decacorn",
            name: "Decacorn",
            mc: 10_000_000_000,
            type: "tier",
            desc: "10 Billion milestone.",
        },
        {
            id: "doge",
            name: "Doge",
            mc: 20_000_000_000,
            type: "asset",
            desc: "Much wow.",
        },
        {
            id: "sol",
            name: "Solana",
            mc: 70_000_000_000,
            type: "asset",
            desc: "Fast layer 1.",
        },
        {
            id: "hectacorn",
            name: "Hectacorn",
            mc: 100_000_000_000,
            type: "tier",
            desc: "100 Billion milestone.",
        },
        {
            id: "eth",
            name: "Ethereum",
            mc: 400_000_000_000,
            type: "asset",
            desc: "Smart contracts.",
        },
        {
            id: "kilocorn",
            name: "Kilocorn",
            mc: 1_000_000_000_000,
            type: "tier",
            desc: "1 Trillion milestone!",
        },
        {
            id: "btc",
            name: "Bitcoin",
            mc: 1_300_000_000_000,
            type: "asset",
            desc: "Digital gold.",
        },
    ];

    const orderedMilestones: Milestone[] = [
        {
            id: "current",
            name: "UwU Current",
            mc: CURRENT_UWU_MC,
            type: "current",
            desc: "You are early.",
        },
        ...milestones,
    ];

    const MIN_LOG = Math.log10(400_000);
    const MAX_LOG = Math.log10(2_000_000_000_000);

    function formatNumber(num: number) {
        if (num >= 1e12)
            return (num / 1e12).toFixed(1).replace(/\.0$/, "") + "T";
        if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
        if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
        if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
        return num.toString();
    }

    function formatCurrency(num: number) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(num);
    }

    function getX(mc: number, w: number) {
        return ((Math.log10(mc) - MIN_LOG) / (MAX_LOG - MIN_LOG)) * w;
    }
    function getY(mc: number, h: number) {
        return h - ((Math.log10(mc) - MIN_LOG) / (MAX_LOG - MIN_LOG)) * h;
    }

    // Mobile specific interpolation
    const MOBILE_TIMELINE_HEIGHT = 1500;
    function getMobileY(mc: number) {
        return (
            ((Math.log10(mc) - MIN_LOG) / (MAX_LOG - MIN_LOG)) *
            MOBILE_TIMELINE_HEIGHT
        );
    }

    // PC: Hover Graph
    function handleGraphHover(e: MouseEvent) {
        if (!e.currentTarget) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        isHovering = true;
        const ratio = mouseX / svgWidth;
        const logMC = MIN_LOG + ratio * (MAX_LOG - MIN_LOG);
        targetMarketCap = Math.max(CURRENT_UWU_MC, Math.pow(10, logMC));
    }

    function handleGraphLeave() {
        isHovering = false;
        mouseX = null;
        targetMarketCap = CURRENT_UWU_MC;
    }

    const activeMilestone = $derived.by(() => {
        if (!isHovering && targetMarketCap === CURRENT_UWU_MC) return null;
        const closest = milestones.reduce((prev, curr) =>
            Math.abs(curr.mc - targetMarketCap) <
            Math.abs(prev.mc - targetMarketCap)
                ? curr
                : prev,
        );
        const threshold = targetMarketCap * 0.5;
        return Math.abs(closest.mc - targetMarketCap) < threshold
            ? closest
            : null;
    });

    // Mobile: Layout Calculation & Scroll Interpolation
    async function updateNodeOffsets() {
        if (!mobileScrollContainer) return;
        const nodes = mobileScrollContainer.querySelectorAll(".timeline-node");
        nodeOffsets = Array.from(nodes).map(
            (n) =>
                (n as HTMLElement).offsetTop +
                (n as HTMLElement).offsetHeight / 2,
        );
        handleMobileScroll();
    }

    function handleMobileScroll() {
        if (!mobileScrollContainer || nodeOffsets.length === 0) return;
        spineY = mobileScrollContainer.scrollTop;

        if (spineY <= nodeOffsets[0]) {
            targetMarketCap = orderedMilestones[0].mc;
        } else if (spineY >= nodeOffsets[nodeOffsets.length - 1]) {
            targetMarketCap =
                orderedMilestones[orderedMilestones.length - 1].mc;
        } else {
            for (let i = 0; i < nodeOffsets.length - 1; i++) {
                const y1 = nodeOffsets[i];
                const y2 = nodeOffsets[i + 1];

                if (spineY >= y1 && spineY <= y2) {
                    const progress = (spineY - y1) / (y2 - y1);
                    const log1 = Math.log10(orderedMilestones[i].mc);
                    const log2 = Math.log10(orderedMilestones[i + 1].mc);
                    const currentLog = log1 + progress * (log2 - log1);
                    targetMarketCap = Math.max(
                        CURRENT_UWU_MC,
                        Math.pow(10, currentLog),
                    );
                    break;
                }
            }
        }
    }

    onMount(() => {
        setTimeout(updateNodeOffsets, 150);
        window.addEventListener("resize", updateNodeOffsets);
        return () => window.removeEventListener("resize", updateNodeOffsets);
    });
</script>

<div class="roadmap-app app-container">
    <div class="win98-menubar sentence-header">
        <span class="sentence-text">
            If I invest $<input
                id="invest-amount"
                type="number"
                class="inline-input"
                bind:value={initialInvestment}
                min="1"
            />, it becomes
            <span class="success-text">{formatCurrency(currentValue)}</span>
            at <span class="mc-value">{formatNumber(targetMarketCap)}</span> Market
            Cap.
        </span>
    </div>

    <div class="pc-view win-panel">
        <div
            class="graph-container win-inset"
            bind:clientWidth={svgWidth}
            bind:clientHeight={svgHeight}
            onmousemove={handleGraphHover}
            onmouseleave={handleGraphLeave}
            role="presentation"
        >
            <svg
                width="100%"
                height="100%"
                style="position: absolute; z-index: 1;"
            >
                {#each [1e6, 1e9, 1e12] as lineMC}
                    <line
                        x1={getX(lineMC, svgWidth)}
                        y1="0"
                        x2={getX(lineMC, svgWidth)}
                        y2={svgHeight}
                        stroke="#c0c0c0"
                        stroke-width="1"
                        stroke-dasharray="4"
                    />
                    <text
                        x={getX(lineMC, svgWidth) + 5}
                        y="15"
                        fill="#ffffff"
                        font-size="10"
                        font-family="monospace"
                        style="text-shadow: 1px 1px 0px #000;"
                    >
                        {formatNumber(lineMC)}
                    </text>
                {/each}

                <line
                    x1={getX(Math.pow(10, MIN_LOG), svgWidth)}
                    y1={getY(Math.pow(10, MIN_LOG), svgHeight)}
                    x2={getX(Math.pow(10, MAX_LOG), svgWidth)}
                    y2={getY(Math.pow(10, MAX_LOG), svgHeight)}
                    stroke="#ffffff"
                    stroke-width="5"
                />

                {#each milestones as milestone}
                    {@const cx = getX(milestone.mc, svgWidth)}
                    {@const cy = getY(milestone.mc, svgHeight)}

                    <circle
                        {cx}
                        {cy}
                        r="6"
                        fill={milestone.type === "asset"
                            ? "#ffff00"
                            : "#00ff00"}
                        stroke="#000000"
                        stroke-width="2"
                    />

                    {#if activeMilestone?.id !== milestone.id}
                        <text
                            x={cx}
                            y={cy - 14}
                            fill="#ffffff"
                            font-size="11"
                            font-weight="bold"
                            font-family="monospace"
                            text-anchor="middle"
                            style="text-shadow: 1px 1px 0px #000;"
                        >
                            {milestone.name}
                        </text>
                    {/if}
                {/each}

                <circle
                    cx={getX(CURRENT_UWU_MC, svgWidth)}
                    cy={getY(CURRENT_UWU_MC, svgHeight)}
                    r="7"
                    fill="#ff0000"
                    class="blinking-dot"
                />
                <text
                    x={getX(CURRENT_UWU_MC, svgWidth) + 14}
                    y={getY(CURRENT_UWU_MC, svgHeight) + 4}
                    fill="#ff0000"
                    font-size="12"
                    font-weight="bold"
                    font-family="monospace"
                    style="text-shadow: 1px 1px 0px #000;"
                >
                    YOU ARE HERE
                </text>

                {#if activeMilestone && isHovering && mouseX !== null}
                    {@const targetX = getX(activeMilestone.mc, svgWidth)}
                    {@const targetY = getY(activeMilestone.mc, svgHeight)}

                    {@const panelLeftX = svgWidth - 175}
                    {@const panelTopY = svgHeight - 165}

                    <path
                        d="M {panelLeftX} {panelTopY} L {targetX} {panelTopY} L {targetX} {targetY}"
                        stroke="#ffffcc"
                        stroke-width="2"
                        fill="none"
                        stroke-dasharray="4"
                    />
                {/if}

                {#if isHovering && mouseX !== null}
                    {@const curveX = mouseX}
                    {@const curveY = getY(targetMarketCap, svgHeight)}

                    <line
                        x1="0"
                        y1={curveY}
                        x2={curveX}
                        y2={curveY}
                        stroke="#ffffff"
                        stroke-width="1"
                        stroke-dasharray="2"
                    />
                    <line
                        x1={curveX}
                        y1={curveY}
                        x2={curveX}
                        y2={svgHeight}
                        stroke="#ffffff"
                        stroke-width="1"
                        stroke-dasharray="2"
                    />
                    <circle
                        cx={curveX}
                        cy={curveY}
                        r="5"
                        fill="#ffffff"
                        stroke="#000"
                        stroke-width="2"
                    />

                    <rect
                        x="0"
                        y={curveY - 12}
                        width="55"
                        height="24"
                        fill="#000080"
                    />
                    <text
                        x="4"
                        y={curveY + 4}
                        fill="#ffffff"
                        font-size="11"
                        font-weight="bold"
                        font-family="monospace"
                        >{formatNumber(targetMarketCap)}</text
                    >
                {/if}
            </svg>

            {#if activeMilestone && isHovering && mouseX !== null}
                <div class="fixed-panel win-panel" in:fade={{ duration: 100 }}>
                    <div class="tooltip-header">
                        {activeMilestone.name} ({formatNumber(
                            activeMilestone.mc,
                        )})
                    </div>
                    <div class="tooltip-image-box win-inset">
                        <img
                            src={`/images/roadmap/${activeMilestone.id}.png`}
                            alt={activeMilestone.name}
                            onerror={(e) =>
                                (e.currentTarget.style.display = "none")}
                        />
                        <span class="placeholder-text"
                            >🖼️ {activeMilestone.name}.bmp</span
                        >
                    </div>
                    <div class="tooltip-desc">{activeMilestone.desc}</div>
                </div>
            {/if}
        </div>
    </div>

    <div
        class="mobile-view win-inset"
        bind:this={mobileScrollContainer}
        bind:clientHeight={mobileViewHeight}
        onscroll={handleMobileScroll}
    >
        <div class="mobile-reader-line"></div>

        <div
            class="timeline-bounds"
            style="padding-top: {mobileViewHeight /
                2}px; padding-bottom: {mobileViewHeight / 2}px;"
        >
            <div class="timeline-spine-container">
                <div class="timeline-spine-bg"></div>
                <div
                    class="timeline-spine-fill"
                    style="height: {spineY}px;"
                ></div>

                <div class="timeline-nodes-list">
                    {#each orderedMilestones as milestone, i}
                        <div
                            class="timeline-node {milestone.type} {spineY >=
                            (nodeOffsets[i] || 0)
                                ? 'passed'
                                : ''}"
                        >
                            <div
                                class="node-marker {milestone.type === 'current'
                                    ? 'blinking-dot'
                                    : ''}"
                            ></div>
                            <div class="node-content win-panel">
                                <div class="node-title">{milestone.name}</div>
                                <div class="node-mc">
                                    {formatNumber(milestone.mc)} Market Cap
                                </div>

                                {#if milestone.type !== "current"}
                                    <div class="mobile-image-box win-inset">
                                        <img
                                            src={`/images/roadmap/${milestone.id}.png`}
                                            alt={milestone.name}
                                            onerror={(e) =>
                                                (e.currentTarget.style.display =
                                                    "none")}
                                        />
                                        <span class="placeholder-text"
                                            >🖼️ Image Placeholder</span
                                        >
                                    </div>
                                {/if}
                                <div class="node-desc">{milestone.desc}</div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .app-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: #c0c0c0;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
    }

    .win-panel {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        padding: 4px;
    }
    .win-inset {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        background: #ffffff;
    }

    .sentence-header {
        background: #000080;
        color: #ffffff;
        padding: 12px;
        text-align: center;
        border-bottom: 2px solid #ffffff;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .sentence-text {
        font-size: 16px;
        line-height: 1.8;
    }

    .inline-input {
        width: 75px;
        display: inline-block;
        background: #ffffff;
        color: #000000;
        border: 2px solid;
        border-color: #808080 #dfdfdf #dfdfdf #808080;
        padding: 2px 4px;
        font-family: monospace;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        margin: 0 6px;
        outline: none;
    }

    .success-text {
        color: #00ff00;
        font-weight: bold;
        font-family: monospace;
        font-size: 18px;
    }
    .mc-value {
        color: #ffffcc;
        font-weight: bold;
        font-family: monospace;
        font-size: 18px;
    }

    .pc-view {
        flex: 1;
        display: flex;
        margin: 8px;
        min-height: 0;
    }

    /* NEW: Dark Grey Background for high contrast */
    .graph-container {
        flex: 1;
        position: relative;
        overflow: hidden;
        cursor: crosshair;
        background: #808080;
    }

    .blinking-dot {
        animation: blink 1.5s infinite;
    }
    @keyframes blink {
        0%,
        100% {
            opacity: 1;
            filter: drop-shadow(0 0 2px #ff0000);
        }
        50% {
            opacity: 0.2;
            filter: drop-shadow(0 0 8px #ff0000);
        }
    }

    /* Fixed Panel Bottom Right */
    .fixed-panel {
        position: absolute;
        right: 10px;
        bottom: 10px;
        width: 160px;
        z-index: 10;
        box-shadow:
            -2px -2px 0px rgba(0, 0, 0, 0.2),
            2px 2px 0px rgba(0, 0, 0, 0.5);
    }
    .tooltip-header {
        font-weight: bold;
        font-size: 12px;
        margin-bottom: 4px;
        border-bottom: 1px solid #808000;
        padding-bottom: 2px;
    }
    .tooltip-image-box,
    .mobile-image-box {
        width: 100%;
        height: 100px;
        background: #c0c0c0;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        overflow: hidden;
        position: relative;
    }
    .tooltip-image-box img,
    .mobile-image-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        position: absolute;
        z-index: 2;
    }
    .placeholder-text {
        color: #808080;
        font-size: 10px;
        z-index: 1;
    }
    .tooltip-desc {
        font-size: 11px;
    }

    .mobile-view {
        display: none;
    }

    /* RESPONSIVE SWITCH */
    @media (max-width: 768px) {
        .pc-view {
            display: none !important;
        }
        .sentence-header {
            position: sticky;
            top: 0;
            z-index: 50;
            padding: 16px 8px;
        }

        .mobile-view {
            display: block;
            flex: 1;
            overflow-y: auto;
            background: #808080; /* Match PC Dark Grey */
            position: relative;
        }

        .mobile-reader-line {
            position: sticky;
            top: 50%;
            left: 0;
            width: 100%;
            height: 2px;
            background: #ff0000;
            z-index: 20;
            pointer-events: none;
            box-shadow: 0px 1px 0px rgba(255, 255, 255, 0.5);
            transform: translateY(-50%);
        }

        .mobile-reader-line::before {
            content: "►";
            position: absolute;
            left: 2px;
            top: -9px;
            color: #ff0000;
            font-size: 16px;
        }

        .timeline-spine-container {
            position: relative;
            margin-left: 20px;
            width: calc(100% - 40px);
        }

        .timeline-spine-bg {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 6px;
            background: #404040;
            border-right: 1px solid #ffffff;
            border-bottom: 1px solid #ffffff;
        }

        .timeline-spine-fill {
            position: absolute;
            top: 0;
            left: 0;
            width: 6px;
            background: #ffffff; /* Thick White Spine to match PC */
        }

        .timeline-nodes-list {
            display: flex;
            flex-direction: column;
            gap: 70px;
        }

        .timeline-node {
            position: relative;
            width: calc(100% - 24px);
            margin-left: 24px;
            opacity: 0.6;
            transition: opacity 0.3s;
        }

        .timeline-node.passed {
            opacity: 1;
        }

        .node-marker {
            position: absolute;
            left: -31px;
            top: 50%;
            transform: translateY(-50%);
            width: 14px;
            height: 14px;
            background: #a0a0a0;
            border: 2px solid #000000;
            border-radius: 50%;
            transition: background 0.3s;
        }

        .timeline-node.passed.tier .node-marker {
            background: #00ff00;
        }
        .timeline-node.passed.asset .node-marker {
            background: #ffff00;
        }
        .timeline-node.current .node-marker {
            background: #ff0000;
            border-radius: 0;
        }

        .node-content {
            background: #c0c0c0;
        }
        .node-title {
            font-weight: bold;
            font-size: 14px;
            color: #000080;
        }
        .node-mc {
            font-family: monospace;
            font-size: 12px;
            margin-bottom: 6px;
        }
        .node-desc {
            font-size: 12px;
            margin-top: 4px;
        }
    }
</style>
