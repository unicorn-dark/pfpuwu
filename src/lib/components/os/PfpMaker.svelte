<script lang="ts">
    import { onMount } from "svelte";

    // 1. New Layering Sequence
    const LAYER_ORDER = [
        "background",
        "body",
        "face_accessory",
        "eyes",
        "eyewear",
        "hair",
        "costume",
        "accessory",
        "headgear",
        "horn",
    ];

    // Helper function to dynamically generate your file paths without hardcoding!
    // Helper function that takes an array of custom names!
    const generateTraits = (
        traitName: string,
        names: string[],
        hasNone: boolean,
    ) => {
        const arr = [];
        if (hasNone) {
            arr.push({ name: "None", src: null });
        }

        // Loop through your custom names
        names.forEach((name, index) => {
            arr.push({
                name: name,
                // index is 0-based, but your files are 1-based, so we add 1!
                src: `/traits/${traitName}/${traitName}_${index + 1}.png`,
            });
        });
        return arr;
    };

    // 2. Map Traits to your /static folder paths
    const TRAITS: Record<string, any[]> = {
        background: generateTraits("background", ["Teal"], true),

        body: generateTraits(
            "body",
            [
                "Normal",
                "Black",
                "Alien",
                "Zombie", // Make sure you have 4 names here!
            ],
            false,
        ),

        face_accessory: generateTraits(
            "face_accessory",
            [
                "Grillz",
                "Ciggrette",
                "Sandwhich",
                "Tatoo",
                "Scar",
                "Mustache",
                "Heart",
                "Ring",
                "Clown",
                "Cigar",
                "Toothpick",
                "Cute",
                // Add the remaining 8 names here
            ],
            true,
        ),

        eyes: generateTraits(
            "eyes",
            [
                "Normal",
                "Cute",
                "Accept",
                "Bummer",
                "Happy",
                "Circle",
                "Closed",
                "Round",
                "Tall",
                "Solid-Tall",
                "Asian",
                "Heart",
                "Sharp",
                "Flat",
                "Chill",
                "Sparkle",
                "Aztec",
                "Relaxed",
                "Tripping",
                "Enjoying",
                // Add the remaining 15 names here
            ],
            true,
        ),

        eyewear: generateTraits(
            "eyewear",
            [
                "MOG glasses",
                "Bitcoin",
                "Classic glasses",
                "Party",
                "Eyepatch",
                "Deal with it",
            ],
            true,
        ),

        hair: generateTraits(
            "hair",
            [
                "Long",
                "Round",
                "Florida",
                "Short",
                "Rock",
                "Thick",
                "Longer",
                "Femboy",
                "Boycut",
                "Norewood 4",
                "Norewood 3",
                "Norewood 2",
                "Liberal women",
                "Rebel kid",
                "Longest",
                "Stacy",
                "Norewood 5",
                "Hair 1",
                "Hair 2",
            ],
            true,
        ),

        costume: generateTraits(
            "costume",
            [
                "School girl",
                "Samurai",
                "Mario",
                "Mickey",
                "Assasin",
                "Night suit",
                "Mcdonalds",
                "Detective",
                "Joe",
                "Black coat",
                "Asian",
                "Pirate",
                "Suit",
                "Superhero",
                "Roman",
                "Clown",
                "Tracksuit",
                "Tracksuit black",
                "Bear",
            ],
            true,
        ),

        accessory: generateTraits(
            "accessory",
            [
                "Hectacorn",
                "Katana",
                "Glock",
                "Card",
                "Pokemon Card",
                "Sword",
                "Mc Donalds",
                "Cash",
                "Minecraft AXE",
                "UNO reverse",
                "Chinese lamp",
                "Pirate hand",
                "Pop Corn",
                "Blade",
                "Guitar",
                "Whip",
                "Coke",
                "Monster",
                "Celary",
                "Pineapple Kool-aid",
                "Knife",
            ],
            true,
        ),

        headgear: generateTraits(
            "headgear",
            [
                "Plant",
                "Pirate hat",
                "Cap",
                "Halo",
                "Cap 2",
                "Night cap",
                "Mc donalds",
                "Detective hat",
            ],
            true,
        ),

        horn: generateTraits(
            "horn",
            [
                "White",
                "Meat",
                "Strawberry",
                "Pineapple",
                "Pizza",
                "Fire",
                "Watermelon",
                "Corn",
                "Cheese",
                "Mushroom",
                "Cloud",
                "Rainbow",
                "Gold",
                "Cookie",
                "Ice-cream",
                "Night",
                "Cactus",
                "Dougnut",
                "Carrot",
                "Barber",
                "Avacado",
            ],
            true,
        ),
    };

    // Set initial load state (so the character isn't totally naked on boot)
    let currentTraits: Record<string, number> = $state({
        background: 1,
        body: 0,
        face_accessory: 0,
        eyes: 1,
        eyewear: 0,
        hair: 1,
        costume: 1,
        accessory: 0,
        headgear: 0,
        horn: 0,
    });

    let activeTab = $state("body");
    let canvasElement: any = $state(null);
    let isRendering = $state(false);
    let showRing = $state(false);

    // 3. Async Image Loading Engine
    async function renderPfp() {
        if (!canvasElement) return;

        isRendering = true;
        const ctx = canvasElement.getContext("2d");

        // DYNAMICALLY BUILD THE LAYER STACK
        const imagePathsToLoad: string[] = [];

        LAYER_ORDER.forEach((layerName) => {
            // RING BACK: Insert at the very back, sitting on the background but behind the body
            if (layerName === "body" && showRing) {
                imagePathsToLoad.push("/traits/ring/ring_back.png");
            }

            // RING FRONT: Insert exactly between the body/costume and the accessory layers
            if (layerName === "accessory" && showRing) {
                imagePathsToLoad.push("/traits/ring/ring_front.png");
            }

            // Push the standard trait layer (if it is not 'None')
            const selectedTraitIndex = currentTraits[layerName];
            const traitObj = TRAITS[layerName][selectedTraitIndex];

            if (traitObj && traitObj.src !== null) {
                imagePathsToLoad.push(traitObj.src);
            }
        });

        // 4. LOAD IMAGES
        const images = await Promise.all(
            imagePathsToLoad.map((src) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => resolve(img);
                    img.onerror = () => {
                        console.warn(`Failed to load: ${src}`);
                        resolve(null);
                    };
                    img.src = src;
                });
            }),
        );

        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        images.forEach((img: any) => {
            if (img) {
                ctx.drawImage(
                    img,
                    0,
                    0,
                    canvasElement.width,
                    canvasElement.height,
                );
            }
        });

        isRendering = false;
    }

    $effect(() => {
        if (currentTraits) renderPfp();
    });

    onMount(() => {
        renderPfp();
    });

    function randomize() {
        // True randomizer: Loops through every active trait and picks a valid index
        // based on the actual length of the dynamically generated arrays!
        LAYER_ORDER.forEach((layer) => {
            currentTraits[layer] = Math.floor(
                Math.random() * TRAITS[layer].length,
            );
        });
    }

    function exportPng() {
        const link = document.createElement("a");
        link.download = "win98-avatar.png";
        link.href = canvasElement.toDataURL();
        link.click();
    }
</script>

<div class="pfp-maker-layout">
    <div class="preview-box field-row">
        <div class="canvas-container">
            <canvas
                bind:this={canvasElement}
                class:is-loading={isRendering}
                width="2048"
                height="2048"
            ></canvas>
        </div>
        <div class="action-row">
            <label class="win98-checkbox-label">
                <input type="checkbox" bind:checked={showRing} />
                <span>3D Ring</span>
            </label>
            <button class="win98-btn" onclick={randomize}>🎲 Randomize</button>
            <button class="win98-btn save-btn" onclick={exportPng}
                >💾 Save Avatar</button
            >
        </div>
    </div>

    <div class="control-box">
        <menu role="tablist" class="win98-tabs">
            {#each Object.keys(TRAITS) as tab}
                <li role="tab" aria-selected={activeTab === tab}>
                    <button onclick={() => (activeTab = tab)}>
                        {tab.charAt(0).toUpperCase() +
                            tab.slice(1).replace("_", " ")}
                    </button>
                </li>
            {/each}
        </menu>

        <div role="tabpanel" class="tab-panel">
            <div class="trait-grid">
                {#each TRAITS[activeTab] as trait, idx}
                    <button
                        class="trait-option"
                        class:selected={currentTraits[activeTab] === idx}
                        onclick={() => (currentTraits[activeTab] = idx)}
                    >
                        <span class="option-title">{trait.name}</span>
                    </button>
                {/each}
            </div>
        </div>
    </div>
</div>

<style>
    .pfp-maker-layout {
        display: flex;
        gap: 14px;
        height: 100%;
        width: 100%;
        background: #c0c0c0;
        box-sizing: border-box;
        flex-grow: 1;
        min-height: 0;
    }

    .preview-box {
        display: flex;
        flex-direction: column;
        background: #ececec;
        padding: 6px;
        border: 2px solid;
        border-color: #000000 #ffffff #ffffff #000000;
        flex-grow: 1;
        min-width: 250px;
    }

    .canvas-container {
        flex-grow: 1;
        width: 100%;
        min-height: 0;
        background: #000;
        border: 2px solid;
        border-color: #000000 #ffffff #ffffff #000000;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    }

    canvas {
        max-width: 100%;
        max-height: 100%;
        aspect-ratio: 1;
        object-fit: contain;
        image-rendering: pixelated;

        transition:
            filter 0.15s ease-in-out,
            opacity 0.15s ease-in-out;
    }

    canvas.is-loading {
        filter: blur(6px);
        opacity: 0.6;
    }

    .action-row {
        display: flex;
        flex-direction: row;
        gap: 6px;
        margin-top: 8px;
    }

    .action-row button {
        flex: 1;
    }
    .win98-checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 0 10px;
        font-weight: bold;
        font-size: 0.9rem;
        cursor: pointer;
        flex-shrink: 0;
    }

    .win98-checkbox-label input[type="checkbox"] {
        margin: 0;
        cursor: pointer;
        width: 14px;
        height: 14px;
    }

    .win98-checkbox-label:active {
        border-color: #000000 #ffffff #ffffff #000000;
    }

    .control-box {
        width: 320px;
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        flex-grow: 1;
        min-width: 0;
    }

    .win98-btn {
        font-family: inherit;
        font-weight: bold;
        padding: 6px 12px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
    }

    .win98-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
    }

    .save-btn {
        background: #000080;
        color: white;
        border-color: #fff #000 #000 #fff;
    }

    .win98-tabs {
        list-style-type: none;
        margin: 0 -2px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 2;
    }

    .win98-tabs li {
        margin: 0;
    }

    .win98-tabs button {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        border-top-left-radius: 3px;
        border-bottom-left-radius: 3px;
        padding: 8px 12px;
        font-weight: bold;
        cursor: pointer;
        width: 100%;
        text-align: left;
    }

    .win98-tabs li[aria-selected="true"] button {
        background: #c0c0c0;
        border-right: 2px solid #c0c0c0;
        margin-right: -2px;
        padding-right: 14px;
    }

    .tab-panel {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        flex-grow: 1;
        padding: 12px;
        overflow-y: auto;
        z-index: 1;
    }

    .trait-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .trait-option {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 10px;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
    }

    .trait-option:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 11px 9px 9px 11px;
    }

    .trait-option.selected {
        background: #000080;
        color: white;
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 11px 9px 9px 11px;
        outline: 1px dotted #e0e0e0;
        outline-offset: -4px;
    }

    .option-title {
        font-weight: bold;
        font-size: 0.95rem;
    }

    @media (max-width: 768px) {
        :global(.win98-window .window-body) {
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            padding: 4px !important;
            flex: 1 !important;
            min-height: 0 !important;
        }

        .pfp-maker-layout {
            flex-direction: column;
            flex: 1;
            min-height: 0;
            height: 100%;
        }

        .preview-box {
            width: 100%;
            max-height: 45vh;
            box-sizing: border-box;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .canvas-container {
            flex: 1;
            min-height: 0;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        canvas {
            max-width: 100%;
            max-height: 100%;
            aspect-ratio: 1;
            object-fit: contain;
        }

        .action-row {
            flex-shrink: 0;
        }

        .control-box {
            display: flex;
            flex-direction: column;
            width: 100%;
            flex: 1;
            min-height: 0;
        }

        .win98-tabs {
            display: flex;
            flex-direction: row;
            margin: 0 0 -2px 0;
            overflow-x: auto;
            white-space: nowrap;
            flex-shrink: 0;
            width: 100%;
        }

        .win98-tabs button {
            border-radius: 3px 3px 0 0;
            text-align: center;
        }

        .win98-tabs li[aria-selected="true"] button {
            border-right: 2px solid #000000;
            border-bottom: 2px solid #c0c0c0;
            margin-right: 0;
            margin-bottom: -2px;
            padding-right: 12px;
            padding-bottom: 10px;
        }

        .tab-panel {
            flex: 1;
            width: 100%;
            box-sizing: border-box;
            overflow-y: auto;
            min-height: 0;
            height: 0;
            -webkit-overflow-scrolling: touch;
        }
    }
</style>
