<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { isBooting } from '$lib/stores/os.js';

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
    const CA = "UWUy7J86LUiBv5SjAUZ53LMGhtnqvbQ7QNSSkyupump";
    
    const asciiLines = originalAscii.split('\n');
    const colorMap = asciiLines.map((line, y) => {
        return line.split('').map((char, x) => {
            if (char === ' ') return null;
            if (char === '-') return '#ffffff'; 
            if (char === '(') return '#b300b3'; 
            if (char === '[' || char === ']') return '#000000'; 
            if (char === '+') return '#fcd303'; 
            if (char === '@') return '#000000'; 
            if (y <= 10 && x >= 45 && x <= 72) return '#f0d8a8';
            if (y >= 36 && y <= 39 && x >= 32 && x <= 46) return '#f0d8a8';
            if (y >= 8 && y <= 13 && x <= 34) return '#b300b3';
            if (y >= 14 && y <= 33 && x <= 26) return '#b300b3';
            if (y >= 34 && y <= 45 && x <= 22) return '#b300b3';
            if (y >= 7 && y <= 11 && x >= 75) return '#b300b3';
            if (y >= 12 && y <= 15 && x >= 74) return '#b300b3';
            if (y >= 16 && y <= 26 && x >= 73) return '#b300b3';
            if (y >= 34 && y <= 51) return '#fcd303';
            if (y === 52) return '#fcd303'; 
            if (y === 53) return '#ffffff'; 
            if (y >= 54) return '#fcd303';  
            return '#ffffff';
        });
    });

    const generateFrame = (isGlitching = false) => {
        let newHtml = '';
        for (let y = 0; y < asciiLines.length; y++) {
            let currentSpanColor = null;
            let lineHtml = '';
            for (let x = 0; x < asciiLines[y].length; x++) {
                const origChar = asciiLines[y][x];
                let displayChar = origChar;
                
                if (isGlitching && origChar !== ' ' && origChar !== '\n') {
                    if (Math.random() < 0.15) {
                        displayChar = glitchChars[Math.floor(Math.random() * glitchChars.length)];
                    }
                }
                
                const color = colorMap[y][x];
                if (color !== currentSpanColor) {
                    if (currentSpanColor !== null) {
                        lineHtml += '</span>';
                    }
                    lineHtml += `<span style="color: ${color}; text-shadow: 0 0 2px ${color}88;">`;
                    currentSpanColor = color;
                }
                lineHtml += displayChar;
            }
            if (currentSpanColor !== null) {
                lineHtml += '</span>';
            }
            newHtml += lineHtml + '\n';
        }
        return newHtml;
    };

    let displayHtml = $state(generateFrame(false));
    let glitchInterval: any;

    const bootSequence = [
        "Unicorn Mememtic Warfare LLC 2026.",
        "SVELTEKIT OS ACPI BIOS Revision 3105",
        "CPU: Intel(R) Core(TM) i9-10980XE CPU @ 3.00GHz",
        "Speed: 3000MHz",
        " ",
        "Total Memory: 65536MB (DDR4-2133)",
        "USB Devices total: 1 Drive, 3 Keyboards, 1 Mouse, 4 Hubs",
        " "
    ];

    // Helper function to push text to the screen organically
    const addLine = async (text: string, delay: number = 50) => {
        await new Promise(r => setTimeout(r, Math.random() * delay + delay));
        lines = [...lines, text];
    };

    onMount(async () => {
        // Start visual glitch effect
        glitchInterval = setInterval(() => {
            displayHtml = generateFrame(true);
        }, 50);

        // 1. Rapidly print initial hardware sequence
        for (const line of bootSequence) {
            await addLine(line, 20);
        }

        // 2. Wait for actual website assets (DOM, Images, CSS) to load
        await addLine("Mounting Virtual File System...", 100);
        if (document.readyState !== 'complete') {
            await new Promise(resolve => window.addEventListener('load', resolve));
        }
        await addLine("[OK] Core OS assets loaded into memory.", 50);
        await addLine(" ", 10);

        // 3. Functional Network Pre-fetching (Warms up the cache for UwUSidebar)
        await addLine("Initializing Market Data Streams...", 200);
        try {
            // We ping Dexscreener here so the browser caches the response instantly
            await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CA}`);
            await addLine("[OK] Secure connection to Dexscreener established.", 50);
        } catch(e) {
            await addLine("[WARN] Market stream timeout. Working offline.", 50);
        }
        
        await addLine("Synchronizing Historical Charts...", 100);
        try {
            // Ping your secure Birdeye route
            await fetch('/api/uwu-chart');
            await addLine("[OK] OHLCV historical index synced.", 50);
        } catch(e) {
            await addLine("[WARN] Historical index unavailable.", 50);
        }

        // 4. Final OS Handoff
        await addLine(" ", 10);
        await addLine("Starting Desktop Environment...", 300);
        
        // Brief dramatic pause before booting
        await new Promise(r => setTimeout(r, 600)); 
        
        // Hides the BIOS screen and reveals the desktop
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
        font-family: 'Courier New', Courier, monospace;
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
        font-family: 'Courier New', Courier, monospace;
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
        font-family: 'Times New Roman', Times, serif; 
        font-size: 5rem;
        font-weight: bold;
        color: #eeeeee;
        margin: 0;
        letter-spacing: -0.02em;
        line-height: 1;
    }
    
    .megatrends-subtitle {
        font-family: 'Courier New', Courier, monospace; /* Hacker terminal font */
        font-size: 1rem;
        
        color: #FCD303; /* Cyberpunk Alert Yellow */
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