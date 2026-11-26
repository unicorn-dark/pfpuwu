<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { isBooting } from "$lib/stores/os.js";

    // We use $state for variables that need to update the UI
    let lines: string[] = $state([]);

    const originalAscii = `


                                                              ==
                                                             ==~
                                                           +=~==
                                                          +=~~=*
                                                         ===+=+
                                                        +~~=~=*      =
                                                      ^=*=====      ~-=
                          ~---       ]]]]]((((((((((((+==+*+*)]]] =~--~
                          ----~>](((((((((((((((((((^+*=~=~=+(((((*--~=
                          >=----+)(((((((((((((((((^====+++*)((((*---+**
                       ](((<=-----+(((((((((((((((^===~~===+(((((<=--+^**
                     ((((((>~~+**=--+<(((((((((((^=++===~~=>((((((+--=*^*
                    ((((((((*~+^^^+~--=)(((((((((<+~==++++^((((()((*~-~+~-
                  ](((((((((^~+^^^^^*~-~^>((((((((>=~=~===+><(((>~=>(+------
                ]((((((((((^~~+^^^^^^^+~-~^(((((((*~~~~~---~*((()=------------
                ]((((((((((^-~+^^^^^^^^+--+(((<~=~-----------=<<+~-------------*
              ]((((((((((((*-~+^^^^^^^*---+(((^--------------~^+----------------~=
             ](((((((((((((*--=*^^^**=~---~^(^-------------------------------------
          ]((((((((((((((((^--~++=~--------~*>=--------------------------------------
         ]]]]]((((]((((((((<~----------------------~>))))))<^-------------------------~
             ((((]((((((((((*--------------------~^{@@@@@@@@%>--------------------------~
            ](((]]((((((((((>~-------------------)%@@@@@@@@@%<----------------------------
            ]((][(((((((((((>~-------------------)%@@@@@@@@@@}~------------------------~=*)]
           [((( ]((((((((((()+-------------------)%@@@@@@@@@@{~---------------------=^(((((((((
           ]((]](((((((((((((^~------------------>#@@@@@@@@@@{~------------------~*)((((((((((((
           [][ ](((((((((((((<=-------------------~^}#@@@@@@%(------------------+<(((((][[((({](]
              ](((((((((((((((*-----------------------------------------------~*((((((({@@[(({]((
             ]((](((((((((((((<=----------------------------------------------+(((((((((((((((((
            [((]](((((((((((((((+--------------------------------------------~<(((((((((((((((((
               ](((((((((((((((((>~------------------------------------------^((((((((((((((((((
               [(((((((((((((((((()~----------------------------------------~)(((((((((((((((((
                ](((((((((((((((((((=---------------------------------------~)((((((((((((((((
                ]((((]((((((((((((((()~--------------------------------------<(((((((((((((((
                []]((]](((((()>^^))((((<=------------------------------------=(((((((((((((
                   ](((((((()^++++++++*^>+~-----------------------------------=^(((((((((
                    ]((((((((>+++++++++++++++++===~-------------------~++++++++*
                     ((((((((<*++++++++++++++++++++++++=~~~------~==+++++++++++*
                     ](((((((((^++*^>>>>>>>^***++++++++++++++*^+++++++++++**^>>*+
                    ](((((((((()^***++++++++***^^^>^^^+++++++++^>^*^^^^^****+++++++
                    ](((((((((>*++++++++++++++++++++++***^>>>^^^*^^*+++++++++++++++++
                   ]((((((((<*+++++++++++++++++++++++++++++++****^^*++++++++++++++++++*
                   ](((((()^++++++++++++++++++=====++++=++++>*+*^*^*++++++++++++++++++++*
                   ](((((>+++++++++++++++++++>>**========+++>*+*^+^^+++++++++++++++++++++*
                   }]((<^^*++++++++++++++++==*>**)<**)+==++++***++>^++++++++++++++++++++*^^^
                   ]((<*++*^^++++++**+++++++========^+=+++++++++++>^+++++++++++++++++*^*+++*
                   ](<~=*^*+*^*++++>++++++++++++++++++++++++++++++^^+++++++++++*^++*^*++*^++
                     ~---~+^*+*^++>+++++++++++++++++++++++++*^+*^+*^++++++++++++*^^^++^*=--~
                     ~-----~*^+*^^*+++++++++++++++++++++++++**=+*+^*++++++++++++*>^+^^=----~
                     ~------~*^*^*++++++++++++++++++++++++++++^*+++**++++++++++++*>^+------~
                       ~--~=*))^+++++++++++++++++++++++++++++++++++**+++++++++++++*<=~---~
                         ]((((^++++++++++++++++++++++++++++++++++++**++++++++++++++*<
                         ]((]>*++++++++++++++++++++++++++++++++++++^^++++++++++++++*<
                        ](((<*+++++++++++++++++++++++++++++++++++++^^++++++++++++++*^
                        [[[ ^++++++++++++++++++++++++++++++++++++++^^+++++++++++++++*>
                            *++++++++++++++++++++++++++++++++++++++^*++++++++++++++++*
                             **+++++++++++++++++++++++++++++++++++++*+++++++++++++++*^
                                **++++++++++++++++++++++++++++++++++*+++++++++***
                                   ----~~~~~===+++++++++****+++==~~~~~~~~~---=
                                   **+=--------~=+*           ^*=---------=+*>
                                   ++++++*******++            +++**+*****+++++
                                   ++++++++++++++*            *++++++++++++++*
                                   *+++++++++++++              *++++++++++++*
                                       ++*******


                                                                                                                `;

    const glitchChars = "[]()<>^=*+@#%{}";
    const asciiLines = originalAscii.split("\n");
    const colorMap = asciiLines.map((line, y) => {
        return line.split("").map((char, x) => {
            if (char === " ") return null;
            if (char === "-") return "#ffffff";
            if (char === "(") return "#b300b3";
            if (char === "[" || char === "]") return "#000000";
            if (char === "+") return "#fcd303";
            if (char === "@") return "#000000";
            if (y <= 10 && x >= 45 && x <= 72) return "#f0d8a8";
            if (y >= 36 && y <= 39 && x >= 32 && x <= 46) return "#f0d8a8";
            if (y >= 8 && y <= 13 && x <= 34) return "#b300b3";
            if (y >= 14 && y <= 33 && x <= 26) return "#b300b3";
            if (y >= 34 && y <= 45 && x <= 22) return "#b300b3";
            if (y >= 7 && y <= 11 && x >= 75) return "#b300b3";
            if (y >= 12 && y <= 15 && x >= 74) return "#b300b3";
            if (y >= 16 && y <= 26 && x >= 73) return "#b300b3";
            if (y >= 34 && y <= 51) return "#fcd303";
            if (y === 52) return "#fcd303";
            if (y === 53) return "#ffffff";
            if (y >= 54) return "#fcd303";
            return "#ffffff";
        });
    });

    const generateFrame = (isGlitching = false) => {
        let newHtml = "";
        for (let y = 0; y < asciiLines.length; y++) {
            let currentSpanColor = null;
            let lineHtml = "";
            for (let x = 0; x < asciiLines[y].length; x++) {
                const origChar = asciiLines[y][x];
                let displayChar = origChar;

                if (isGlitching && origChar !== " " && origChar !== "\n") {
                    if (Math.random() < 0.15) {
                        displayChar =
                            glitchChars[
                                Math.floor(Math.random() * glitchChars.length)
                            ];
                    }
                }

                const color = colorMap[y][x];
                if (color !== currentSpanColor) {
                    if (currentSpanColor !== null) {
                        lineHtml += "</span>";
                    }
                    lineHtml += `<span style="color: ${color}; text-shadow: 0 0 2px ${color}88;">`;
                    currentSpanColor = color;
                }
                lineHtml += displayChar;
            }
            if (currentSpanColor !== null) {
                lineHtml += "</span>";
            }
            newHtml += lineHtml + "\n";
        }
        return newHtml;
    };

    import { ALL_TRAIT_SRC_PATHS, getCachedTraitImage } from "$lib/utils/traits";

    let displayHtml = $state(generateFrame(false));
    let glitchInterval: any;
    let bootCompleted = false;

    const CORE_BOOT_TRAITS = [
        "/traits/body/classic.png",
        "/traits/eyes/classic.png",
        "/traits/head/classic.png",
        "/traits/horn/classic.png"
    ];

    function scheduleBackgroundTraitWarm() {
        if (typeof window === "undefined") return;
        const remaining = ALL_TRAIT_SRC_PATHS.filter((s) => !CORE_BOOT_TRAITS.includes(s));
        let cursor = 0;
        const warmChunk = () => {
            const end = Math.min(cursor + 6, remaining.length);
            for (let i = cursor; i < end; i++) {
                void getCachedTraitImage(remaining[i]);
            }
            cursor = end;
            if (cursor < remaining.length) {
                if ("requestIdleCallback" in window) {
                    (window as any).requestIdleCallback(warmChunk, { timeout: 2500 });
                } else {
                    setTimeout(warmChunk, 120);
                }
            }
        };
        if ("requestIdleCallback" in window) {
            (window as any).requestIdleCallback(warmChunk, { timeout: 1500 });
        } else {
            setTimeout(warmChunk, 400);
        }
    }

    function finishBoot() {
        if (bootCompleted) return;
        bootCompleted = true;
        if (glitchInterval) {
            clearInterval(glitchInterval);
            glitchInterval = null;
        }
        scheduleBackgroundTraitWarm();
        isBooting.set(false);
    }

    onMount(async () => {
        // 1. Lightweight 10 FPS visual glitch
        glitchInterval = setInterval(() => {
            displayHtml = generateFrame(true);
        }, 100);

        // 2. Crisp BIOS boot text
        lines = [
            "Unicorn Mememtic Warfare LLC 2026.",
            "SVELTEKIT OS ACPI BIOS Revision 3105",
            "Mounting Virtual File System...",
            "Loading core graphics & ASMR audio engine..."
        ];

        // 3. Only await the 4 core default unicorn traits (capped at 550ms) so boot is instant
        const corePreload = Promise.all(CORE_BOOT_TRAITS.map((src) => getCachedTraitImage(src)));
        await Promise.race([corePreload, new Promise((r) => setTimeout(r, 550))]);

        lines = [
            ...lines,
            `[OK] Core subsystems online (${ALL_TRAIT_SRC_PATHS.length} traits lazy-queued).`,
            "Starting Desktop Environment..."
        ];

        await new Promise((r) => setTimeout(r, 180));
        finishBoot();
    });

    onDestroy(() => {
        if (glitchInterval) clearInterval(glitchInterval);
    });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="bios-screen"
    onclick={finishBoot}
    onkeydown={finishBoot}
    tabindex="0"
>
    <div class="bios-header">
        <div class="logo-container">
            <pre class="ascii-unicorn">{@html displayHtml}</pre>
        </div>
        <div class="title-container">
            <h1 class="megatrends-title">Unicorn</h1>
            <h2 class="megatrends-subtitle">it's in the name</h2>
        </div>
    </div>

    <div class="boot-text">
        {#each lines as line}
            <p>{line === " " ? "\u00A0" : line}</p>
        {/each}
        <p class="bios-skip-hint">Click or press any key to skip...</p>
    </div>
</div>

<style>
    .bios-screen {
        width: 100vw;
        height: 100vh;
        background-color: #111;
        color: #fff;
        font-family: "Courier New", Courier, monospace;
        padding: 2rem 4rem;
        box-sizing: border-box;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
    }

    .bios-header {
        display: flex;
        align-items: center;
        gap: 3rem; /* Increased gap to give the larger ASCII breathing room */
        margin-bottom: 2rem;
    }

    .logo-container {
        flex-shrink: 0;
    }

    .ascii-unicorn {
        font-family: "Courier New", Courier, monospace;
        font-weight: bold;
        /* Doubled the font size to make the ASCII much bigger on Desktop */
        font-size: 5px;
        line-height: 5px;
        letter-spacing: 0;
        margin: 0;
    }

    .title-container {
        display: flex;
        flex-direction: column;
    }

    .megatrends-title {
        font-family: "Times New Roman", Times, serif;
        font-size: 5rem;
        font-weight: bold;
        color: #eeeeee;
        margin: 0;
        letter-spacing: -0.02em;
        line-height: 1;
    }

    .megatrends-subtitle {
        font-family:
            "Courier New", Courier, monospace; /* Hacker terminal font */
        font-size: 1rem;

        color: #fcd303; /* Cyberpunk Alert Yellow */
        margin: 0;
        margin-top: 8px;
        letter-spacing: 0.2em; /* Spaced out for a cinematic look */
        /* Subtle neon glow */
        text-shadow: 0 0 10px rgba(252, 211, 3, 0.8);
    }

    .boot-text {
        width: 100%;
        text-align: left;
    }

    .boot-text p {
        margin: 0 0 0.4rem 0;
        font-size: 1.1rem;
        font-weight: bold;
        color: #e0e0e0;
        text-shadow: 0 0 1px rgba(255, 255, 255, 0.4);
    }

    .bios-skip-hint {
        margin-top: 1.2rem !important;
        font-size: 0.85rem !important;
        color: #9ca3af !important;
        opacity: 0.8;
    }

    /* Mobile Responsiveness */
    @media (max-width: 768px) {
        .bios-screen {
            padding: 1rem;
        }

        .bios-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .ascii-unicorn {
            /* Kept smaller on mobile so the grid doesn't blow out the viewport */
            font-size: 3px;
            line-height: 3px;
        }
    }
</style>
