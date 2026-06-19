<script lang="ts">
    import { onMount } from 'svelte';
    
    const LAYER_ORDER = [
        'background', 'body', 'eyes', 'face', 'hair', 'costume', 'accessory', 'headgear', 'horn'
    ];

    // 2. Map Traits to your /static folder paths
    const TRAITS: Record<string, any[]> = {
        background: [
            { name: 'Teal', src: '/traits/background/background_01.png' }
        ],
        body: [
            { name: 'Normal', src: '/traits/body/body_01.png' },
            { name: 'black', src: '/traits/body/body_02.png' },
            { name: 'Alien', src: '/traits/body/body_03.png' }
        ],
        eyes: [
            { name: '1', src: '/traits/eyes/eyes_01.png' },
            { name: '2', src: '/traits/eyes/eyes_02.png' },
            { name: '3', src: '/traits/eyes/eyes_03.png' },
            { name: '4', src: '/traits/eyes/eyes_04.png' },
            { name: '5', src: '/traits/eyes/eyes_05.png' },
            { name: '6', src: '/traits/eyes/eyes_06.png' },
            { name: '7', src: '/traits/eyes/eyes_07.png' },
            { name: '8', src: '/traits/eyes/eyes_08.png' },
            { name: '9', src: '/traits/eyes/eyes_09.png' },
            { name: '10', src: '/traits/eyes/eyes_10.png' },
            { name: '11', src: '/traits/eyes/eyes_11.png' },
            { name: '12', src: '/traits/eyes/eyes_12.png' },
            { name: '13', src: '/traits/eyes/eyes_13.png' },
            { name: '14', src: '/traits/eyes/eyes_14.png' },
            { name: '15', src: '/traits/eyes/eyes_15.png' },
            { name: '16', src: '/traits/eyes/eyes_16.png' },
            { name: '17', src: '/traits/eyes/eyes_17.png' },
            { name: '18', src: '/traits/eyes/eyes_18.png' },
            { name: '19', src: '/traits/eyes/eyes_19.png' },
            { name: '20', src: '/traits/eyes/eyes_20.png' }
        ],
        face: [
            { name: 'None', src: '/traits/face/face_06.png' },
            { name: '7', src: '/traits/face/face_07.png' },
            { name: '8', src: '/traits/face/face_08.png' },
            { name: '9', src: '/traits/face/face_09.png' },
            { name: '10', src: '/traits/face/face_10.png' },
            { name: '11', src: '/traits/face/face_11.png' },
            { name: '12', src: '/traits/face/face_12.png' },
            { name: '13', src: '/traits/face/face_13.png' },
            { name: '14', src: '/traits/face/face_14.png' },
            { name: '15', src: '/traits/face/face_15.png' },
            { name: '16', src: '/traits/face/face_16.png' },
            { name: '17', src: '/traits/face/face_17.png' },
            { name: '18', src: '/traits/face/face_18.png' },
            { name: '19', src: '/traits/face/face_19.png' },
            { name: '20', src: '/traits/face/face_20.png' } // Need a transparent 1x1px png for "None" options
        ],
        hair: [
            { name: 'None', src: '/traits/hair/hair_01.png' },
            { name: '2', src: '/traits/hair/hair_02.png' },
            { name: '3', src: '/traits/hair/hair_03.png' },
            { name: '4', src: '/traits/hair/hair_04.png' },
            { name: '5', src: '/traits/hair/hair_05.png' },
            { name: '6', src: '/traits/hair/hair_06.png' },
            { name: '7', src: '/traits/hair/hair_07.png' },
            { name: '8', src: '/traits/hair/hair_08.png' },
            { name: '9', src: '/traits/hair/hair_09.png' },
            { name: '10', src: '/traits/hair/hair_10.png' },
            { name: '11', src: '/traits/hair/hair_11.png' },
            { name: '12', src: '/traits/hair/hair_12.png' },
            { name: '13', src: '/traits/hair/hair_13.png' },
            { name: '14', src: '/traits/hair/hair_14.png' },
            { name: '15', src: '/traits/hair/hair_15.png' },
            { name: '16', src: '/traits/hair/hair_16.png' },
            { name: '17', src: '/traits/hair/hair_17.png' },
            { name: '18', src: '/traits/hair/hair_18.png' },
            { name: '19', src: '/traits/hair/hair_19.png' },
            { name: '20', src: '/traits/hair/hair_20.png' }
        ],
        costume: [
            { name: 'None', src: '/traits/costume/costume_08.png' },
            { name: 'None', src: '/traits/costume/costume_11.png' },
            { name: 'None', src: '/traits/costume/costume_12.png' }
        ],
        accessory: [
            { name: 'None', src: '/traits/accessory/accessory_04.png' },
            { name: '5', src: '/traits/accessory/accessory_05.png' },
            { name: '6', src: '/traits/accessory/accessory_06.png' },
            { name: '12', src: '/traits/accessory/accessory_12.png' },
            { name: '16', src: '/traits/accessory/accessory_16.png' },
            { name: '17', src: '/traits/accessory/accessory_17.png' },
            { name: '18', src: '/traits/accessory/accessory_18.png' }
        ],
        headgear: [
            { name: 'Pirarte Hat', src: '/traits/headgear/headgear_12.png' },
        ],
        horn: [
            { name: 'None', src: '/traits/horn/horn_01.png' },
            { name: '2', src: '/traits/horn/horn_02.png' },
            { name: '3', src: '/traits/horn/horn_03.png' },
            { name: '4', src: '/traits/horn/horn_04.png' },
            { name: '5', src: '/traits/horn/horn_05.png' },
            { name: '6', src: '/traits/horn/horn_06.png' },
            { name: '7', src: '/traits/horn/horn_07.png' },
            { name: '8', src: '/traits/horn/horn_08.png' },
            { name: '9', src: '/traits/horn/horn_09.png' },
            { name: '10', src: '/traits/horn/horn_10.png' },
            { name: '11', src: '/traits/horn/horn_11.png' },
            { name: '12', src: '/traits/horn/horn_12.png' },
            { name: '13', src: '/traits/horn/horn_13.png' },
            { name: '14', src: '/traits/horn/horn_14.png' },
            { name: '15', src: '/traits/horn/horn_15.png' },
            { name: '16', src: '/traits/horn/horn_16.png' },
            { name: '17', src: '/traits/horn/horn_17.png' },
            { name: '18', src: '/traits/horn/horn_18.png' },
            { name: '19', src: '/traits/horn/horn_19.png' },
            { name: '20', src: '/traits/horn/horn_20.png' }
        ]
    };

    let currentTraits: Record<string, number> = $state({
        background: 0, body: 0, eyes: 0, face: 0, 
        hair: 0, costume: 0, accessory: 0, headgear: 0, horn: 0
    });

    let activeTab = $state('body');
    let canvasElement: any = $state(null);
    let isRendering = $state(false);
    
    // 3. Async Image Loading Engine
    async function renderPfp() {
        if (!canvasElement) return;
        
        // 1. Instantly trigger the blur effect
        isRendering = true; 
        
        const ctx = canvasElement.getContext('2d');

        const imagePathsToLoad = LAYER_ORDER.map(layerName => {
            const selectedTraitIndex = currentTraits[layerName];
            return TRAITS[layerName][selectedTraitIndex].src;
        });

        const images = await Promise.all(imagePathsToLoad.map(src => {
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
        }));

        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        images.forEach(img => {
            if (img) {
                ctx.drawImage(img, 0, 0, canvasElement.width, canvasElement.height);
            }
        });

        // 2. Remove the blur the moment drawing is complete
        isRendering = false; 
    }

    $effect(() => {
        if (currentTraits) renderPfp();
    });

    onMount(() => {
        renderPfp();
    });

    function randomize() {
        currentTraits.background = Math.floor(Math.random() * TRAITS.background.length);
        currentTraits.body = Math.floor(Math.random() * TRAITS.body.length);
        currentTraits.eyes = Math.floor(Math.random() * TRAITS.eyes.length);
        currentTraits.mouth = Math.floor(Math.random() * TRAITS.mouth.length);
        currentTraits.clothing = Math.floor(Math.random() * TRAITS.clothing.length);
        currentTraits.hat = Math.floor(Math.random() * TRAITS.hat.length);
    }

    function exportPng() {
        const link = document.createElement('a');
        link.download = 'win98-avatar.png';
        link.href = canvasElement.toDataURL();
        link.click();
    }
</script>

<div class="pfp-maker-layout">
    <div class="preview-box field-row">
        <div class="canvas-container">
    <canvas bind:this={canvasElement} class:is-loading={isRendering} width="2048" height="2048"></canvas>
</div>
        <div class="action-row">
            <button class="win98-btn" onclick={randomize}>🎲 Randomize</button>
            <button class="win98-btn save-btn" onclick={exportPng}>💾 Save Avatar</button>
        </div>
    </div>

    <div class="control-box">
        <menu role="tablist" class="win98-tabs">
            {#each Object.keys(TRAITS) as tab}
                <li role="tab" aria-selected={activeTab === tab}>
                    <button onclick={() => activeTab = tab}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                        onclick={() => currentTraits[activeTab] = idx}
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
        /* Grab the height constraint from the window */
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
        /* Let the preview box grow to fill all remaining window space! */
        flex-grow: 1; 
        min-width: 250px;
    }

    .canvas-container {
        /* Let the container fill all vertical space above the buttons */
        flex-grow: 1;
        width: 100%;
        min-height: 0; /* Crucial: allows it to shrink safely */
        background: #000;
        border: 2px solid;
        border-color: #000000 #ffffff #ffffff #000000;
        /* Center the growing canvas */
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
        
        /* Smooth transition for the blur effect */
        transition: filter 0.15s ease-in-out, opacity 0.15s ease-in-out;
    }

    /* The subtle loading cue */
    canvas.is-loading {
        filter: blur(6px);
        opacity: 0.6;
    }

    .action-row {
        display: flex;
        flex-direction: row; /* Put buttons side-by-side to save vertical space */
        gap: 6px;
        margin-top: 8px;
    }

    .action-row button {
        flex: 1; /* Stretch buttons evenly */
    }

    /* =========================================
       DESKTOP: VERTICAL SIDE-TABS
       ========================================= */
    .control-box {
        /* FIXED width. Never grow or shrink! */
        width: 320px; 
        flex-shrink: 0;
        display: flex;
        flex-direction: row; 
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
.control-box {
        flex-grow: 1;
        display: flex;
        flex-direction: row; /* Puts tabs on the left, panel on the right */
        min-width: 0;
    }

    .win98-tabs {
        list-style-type: none;
        margin: 0 -2px 0 0; /* Pull right slightly to overlap the panel border */
        padding: 0;
        display: flex;
        flex-direction: column; /* Stack tabs vertically */
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

    /* The magic trick to blend the selected tab into the panel */
    .win98-tabs li[aria-selected="true"] button {
        background: #c0c0c0;
        border-right: 2px solid #c0c0c0; /* Overwrite the black border with gray */
        margin-right: -2px; /* Pull it over the panel line */
        padding-right: 14px; /* Slight padding bump to secure the overlap */
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
        background: #c0c0c0; /* Use standard Win98 gray for unselected */
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff; /* 3D popped-out border */
        padding: 10px; /* Base padding */
        text-align: left;
        cursor: pointer;
        font-family: inherit;
    }

    /* Pushed-in effect when clicking */
    .trait-option:active {
        border-color: #000000 #ffffff #ffffff #000000;
        /* Shift padding 1px down and right to create a physical indent */
        padding: 11px 9px 9px 11px; 
    }

    /* Locked pushed-in effect for the active selection */
    .trait-option.selected {
        background: #000080; /* Classic selection blue */
        color: white;
        border-color: #000000 #ffffff #ffffff #000000; /* Inverted border */
        padding: 11px 9px 9px 11px; /* Keeps the text indented */
        
        /* The iconic inner dotted focus ring */
        outline: 1px dotted #e0e0e0; 
        outline-offset: -4px; 
    }

    .option-title {
        font-weight: bold;
        font-size: 0.95rem;
    }
    /* =========================================
       Responsive Mobile UI Transforms
       ========================================= */
    /* =========================================
       Responsive Mobile UI Transforms
       ========================================= */
    @media (max-width: 768px) {
        /* 1. Strictly lock the parent Window Body */
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
            flex-shrink: 0; /* Prevent the canvas from squishing the buttons */
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
        
        /* 2. THE NUCLEAR SCROLL FIX */
        .tab-panel {
            flex: 1; 
            width: 100%; 
            box-sizing: border-box;
            overflow-y: auto; 
            min-height: 0;
            height: 0; /* Forces the browser to calculate height based on remaining space, not content */
            -webkit-overflow-scrolling: touch; /* Re-enables smooth momentum scrolling on iOS */
        }
    }
</style>