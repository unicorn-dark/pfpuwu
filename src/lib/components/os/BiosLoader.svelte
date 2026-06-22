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

    let displayHtml = $state(generateFrame(false));
    let glitchInterval: any;

    const allTraitFiles = import.meta.glob("/static/traits/**/*.png");
    const preloadPaths = Object.keys(allTraitFiles).map((path) =>
        path.replace("/static", ""),
    );

    onMount(async () => {
        // 1. Instantly fire off the background image cache warmer
        preloadPaths.forEach((src) => {
            const img = new Image();
            img.src = src;
        });

        // 2. Start the visual glitch
        glitchInterval = setInterval(() => {
            displayHtml = generateFrame(true);
        }, 50);

        // 3. Dump the text to the screen instantly (no typewriter effect, no delays)
        lines = [
            "Unicorn Mememtic Warfare LLC 2026.",
            "SVELTEKIT OS ACPI BIOS Revision 3105",
            `[OK] ${preloadPaths.length} visual assets cached to VRAM.`,
            "Mounting Virtual File System...",
            "Starting Desktop Environment...",
        ];

        // 4. Wait strictly for the browser to finish rendering the basic HTML/CSS
        if (document.readyState !== "complete") {
            await new Promise((resolve) =>
                window.addEventListener("load", resolve),
            );
        }

        // 5. A tiny 300ms pause just so the user's brain registers the cool boot screen,
        // then immediately open the OS.
        await new Promise((r) => setTimeout(r, 300));
        isBooting.set(false);
    });

    onDestroy(() => {
        if (glitchInterval) clearInterval(glitchInterval);
    });
</script>

<div class="bios-screen">
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
