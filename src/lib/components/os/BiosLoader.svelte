<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { isBooting } from "$lib/stores/os";
    import {
        ALL_TRAIT_SRC_PATHS,
        LAYER_ORDER,
        TRAITS,
        getCachedTraitImage
    } from "$lib/utils/traits";

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
                       ~--~=*))^+++++++++++++++++++++++++++++++++++**++++++++++++++*<
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
    const colorMap = asciiLines.map((line, y) =>
        line.split("").map((char, x) => {
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
        })
    );

    const generateFrame = (isGlitching = false) => {
        let newHtml = "";
        for (let y = 0; y < asciiLines.length; y++) {
            let currentSpanColor = null;
            let lineHtml = "";
            for (let x = 0; x < asciiLines[y].length; x++) {
                const origChar = asciiLines[y][x];
                let displayChar = origChar;
                if (isGlitching && origChar !== " " && origChar !== "\n" && Math.random() < 0.15) {
                    displayChar = glitchChars[Math.floor(Math.random() * glitchChars.length)];
                }
                const color = colorMap[y][x];
                if (color !== currentSpanColor) {
                    if (currentSpanColor !== null) lineHtml += "</span>";
                    lineHtml += `<span style="color: ${color}; text-shadow: 0 0 2px ${color}88;">`;
                    currentSpanColor = color;
                }
                lineHtml += displayChar;
            }
            if (currentSpanColor !== null) lineHtml += "</span>";
            newHtml += lineHtml + "\n";
        }
        return newHtml;
    };

    let displayHtml = $state(generateFrame(false));
    let glitchInterval: ReturnType<typeof setInterval>;

    function skipBoot() {
        isBooting.set(false);
    }

    onMount(async () => {
        glitchInterval = setInterval(() => {
            displayHtml = generateFrame(true);
        }, 60);

        lines = [
            "Unicorn Memetic Social OS v2.0 (Y2K Edition)",
            "Mounting X-Identity & Social Layer...",
            "Pre-warming initial avatar layers..."
        ];

        // Fast non-blocking boot: preload only the first default trait per layer (~7 files)
        const starterPaths: string[] = [];
        LAYER_ORDER.forEach((layer) => {
            const defaultIdx = layer !== "body" && TRAITS[layer]?.length > 1 ? 1 : 0;
            const src = TRAITS[layer]?.[defaultIdx]?.src;
            if (src) starterPaths.push(src);
        });

        await Promise.race([
            Promise.all(starterPaths.map((src) => getCachedTraitImage(src))),
            new Promise((r) => setTimeout(r, 450))
        ]);

        // Warm the remaining trait files in the background without blocking boot
        setTimeout(() => {
            ALL_TRAIT_SRC_PATHS.forEach((src) => {
                getCachedTraitImage(src);
            });
        }, 100);

        lines = [
            ...lines,
            "[OK] Y2K Window Manager & Ephemeral Social Layer Ready.",
            "Booting Desktop..."
        ];

        await new Promise((r) => setTimeout(r, 180));
        isBooting.set(false);
    });

    onDestroy(() => {
        if (glitchInterval) clearInterval(glitchInterval);
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bios-screen" onclick={skipBoot}>
    <div class="bios-header">
        <div class="logo-container">
            <pre class="ascii-unicorn">{@html displayHtml}</pre>
        </div>
        <div class="title-container">
            <h1 class="megatrends-title">Unicorn</h1>
            <h2 class="megatrends-subtitle">pfpuwu social os // y2k</h2>
        </div>
    </div>

    <div class="boot-text">
        {#each lines as line}
            <p>{line}</p>
        {/each}
    </div>
</div>

<style>
    .bios-screen {
        width: 100vw;
        height: 100dvh;
        background-color: #0b0d13;
        color: #fff;
        font-family: var(--os-font-mono);
        padding: 2rem 3rem;
        box-sizing: border-box;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        cursor: pointer;
    }

    .bios-header {
        display: flex;
        align-items: center;
        gap: 2.5rem;
        margin-bottom: 1.5rem;
    }

    .logo-container {
        flex-shrink: 0;
    }

    .ascii-unicorn {
        font-family: var(--os-font-mono);
        font-weight: bold;
        font-size: 4.5px;
        line-height: 4.5px;
        letter-spacing: 0;
        margin: 0;
    }

    .title-container {
        display: flex;
        flex-direction: column;
    }

    .megatrends-title {
        font-family: "Times New Roman", Times, serif;
        font-size: 4.2rem;
        font-weight: bold;
        color: #f8fafc;
        margin: 0;
        letter-spacing: -0.02em;
        line-height: 1;
    }

    .megatrends-subtitle {
        font-family: var(--os-font-mono);
        font-size: 0.95rem;
        color: #00e5ff;
        margin: 8px 0 0 0;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        text-shadow: 0 0 10px rgba(0, 229, 255, 0.7);
    }

    .boot-text p {
        margin: 0 0 0.35rem 0;
        font-size: 0.95rem;
        font-weight: bold;
        color: #e2e8f0;
    }

    @media (max-width: 768px) {
        .bios-screen {
            padding: 1rem;
        }
        .bios-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
        }
        .megatrends-title {
            font-size: 2.8rem;
        }
        .ascii-unicorn {
            font-size: 2.8px;
            line-height: 2.8px;
        }
    }
</style>
