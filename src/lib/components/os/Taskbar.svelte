<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        activeWindows,
        openWindow,
        restoreWindow,
        focusWindow,
        minimizeWindow,
    } from "$lib/stores/os";

    let startMenuOpen = $state(false);
    let time = $state("");
    let clockInterval: any;

    // Hardcoded list of apps for the Start Menu
    const apps = [
        { id: "pfp-app", title: "PFP Maker", icon: "🎨", w: 960, h: 690 },
        { id: "jspaint", title: "JS Paint", icon: "🖌️", w: 800, h: 600 },
        { id: "minesweeper", title: "Minesweeper", icon: "💣", w: 260, h: 320 },
        {
            id: "privateers-blog",
            title: "Privateer Blog",
            icon: "🌐",
            w: 480,
            h: 600,
        },
        { id: "notepad", title: "Notepad", icon: "📝", w: 500, h: 400 },
    ];

    onMount(() => {
        const updateTime = () => {
            time = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        };
        updateTime();
        clockInterval = setInterval(updateTime, 1000);
    });

    onDestroy(() => {
        if (clockInterval) clearInterval(clockInterval);
    });

    const toggleStartMenu = () => (startMenuOpen = !startMenuOpen);
    const closeMenu = () => (startMenuOpen = false);

    const launchApp = (app: any) => {
        openWindow(app.id, app.title, app.w, app.h);
        startMenuOpen = false;
    };

    const handleTaskbarClick = (win: any) => {
        if (win.isMinimized) {
            restoreWindow(win.id);
        } else {
            // In a real OS, clicking an already focused app minimizes it.
            // For now, we will just ensure it comes to the front.
            focusWindow(win.id);
        }
    };
</script>

{#if startMenuOpen}
    <div class="start-menu-backdrop" onclick={closeMenu}></div>
{/if}

<div class="taskbar">
    <button
        class="start-button {startMenuOpen ? 'active' : ''}"
        onclick={toggleStartMenu}
    >
        <span class="windows-logo">⊞</span> Start
    </button>

    <div class="taskbar-apps">
        {#each $activeWindows as win}
            {#if win.isOpen}
                <button
                    class="taskbar-app-btn {win.isMinimized ? '' : 'active'}"
                    onclick={() => handleTaskbarClick(win)}
                >
                    {win.title}
                </button>
            {/if}
        {/each}
    </div>

    <div class="system-tray">
        <span class="clock">{time}</span>
    </div>

    {#if startMenuOpen}
        <div class="start-menu">
            <div class="start-menu-sidebar">
                <span>Windows 98</span>
            </div>
            <div class="start-menu-items">
                {#each apps as app}
                    <button class="start-item" onclick={() => launchApp(app)}>
                        <span class="icon">{app.icon}</span>
                        {app.title}
                    </button>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    .taskbar {
        position: fixed;
        /* 1. Tell the browser to lift the taskbar above the gesture line */
        bottom: env(safe-area-inset-bottom, 0px);
        left: 0;
        /* 2. Use 100% instead of 100vw to prevent weird mobile scrollbar offsets */
        width: 100%;
        height: 35px;
        background: #c0c0c0;
        border-top: 2px solid #ffffff;
        display: flex;
        align-items: center;
        padding: 2px;
        box-sizing: border-box;
        /* 3. Add an extra 9 just to absolutely guarantee nothing covers it */
        z-index: 99999;
    }

    /* Start Button */
    .start-button {
        display: flex;
        align-items: center;
        gap: 5px;
        font-weight: bold;
        font-size: 1rem;
        padding: 4px 8px;
        margin-right: 5px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
    }

    .start-button.active,
    .start-button:active {
        border-color: #000000 #ffffff #ffffff #000000;
        background: #e0e0e0;
        padding: 5px 7px 3px 9px; /* Push-in effect */
    }

    .windows-logo {
        color: #000;
        font-size: 1.2rem;
    }

    /* Running Apps Area */
    .taskbar-apps {
        flex-grow: 1;
        display: flex;
        gap: 4px;
        overflow-x: auto;
        padding-right: 10px;
    }

    .taskbar-app-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 4px 10px;
        font-size: 0.85rem;
        font-weight: bold;
        cursor: pointer;
        min-width: 120px;
        max-width: 160px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
    }

    /* Pushed-in state for currently open/focused windows */
    .taskbar-app-btn.active {
        border-color: #000000 #ffffff #ffffff #000000;
        background: #d3d3d3;
        background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            #c0c0c0 2px,
            #c0c0c0 4px
        );
    }

    /* System Tray */
    .system-tray {
        padding: 4px 10px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080; /* Inset border */
        margin-left: 5px;
        display: flex;
        align-items: center;
        background: #c0c0c0;
    }

    .clock {
        font-size: 0.85rem;
    }

    /* Start Menu */
    .start-menu-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 9998;
    }

    .start-menu {
        position: absolute;
        bottom: 35px;
        left: 0;
        width: 250px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        display: flex;
        flex-direction: row;
        z-index: 10000;
        box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.5);
    }

    .start-menu-sidebar {
        width: 30px;
        background: linear-gradient(to bottom, #000080, #1084d0);
        display: flex;
        align-items: flex-end;
        padding-bottom: 5px;
    }

    .start-menu-sidebar span {
        color: white;
        font-weight: bold;
        font-size: 1.2rem;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        padding: 10px 5px;
        letter-spacing: 1px;
    }

    .start-menu-items {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        padding: 2px;
    }

    .start-item {
        display: flex;
        align-items: center;
        gap: 10px;
        background: transparent;
        border: none;
        padding: 10px;
        text-align: left;
        font-size: 1rem;
        cursor: pointer;
        width: 100%;
    }

    .start-item:hover {
        background: #000080;
        color: white;
    }

    .start-item .icon {
        font-size: 1.5rem;
    }

    /* Mobile overrides for Taskbar/Start Menu */
    /* =========================================
       MOBILE OVERRIDES (Windows CE / Tile UI)
       ========================================= */
    @media (max-width: 768px) {
        .taskbar-apps {
            display: none;
        }

        .start-menu {
            flex-direction: column;
            width: 100%; /* Changed from 100vw to prevent horizontal bleed */
            height: calc(100vh - 35px);
            height: calc(100dvh - 35px);
            bottom: 35px;
            left: 0;
            background: #008080;
            border: none;
            box-shadow: none;
            overflow-y: auto;
            box-sizing: border-box; /* Ensures padding stays inside the screen */
        }

        .start-menu-sidebar {
            display: none;
        }

        .start-menu-items {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            padding: 12px;
            box-sizing: border-box;
            width: 100%;
        }

        .start-item {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            width: 100%;
            aspect-ratio: 1;
            background: #c0c0c0;
            border: 2px solid;
            border-color: #ffffff #000000 #000000 #ffffff;
            color: #000;
            padding: 4px;
            box-sizing: border-box;

            /* THE MAGIC FIX: Forces the button to shrink and traps long text inside */
            min-width: 0;
            overflow: hidden;

            font-size: 0.75rem; /* Scaled down slightly so text fits */
            line-height: 1.1;
            text-align: center;
        }

        .start-item:hover {
            background: #c0c0c0;
            color: #000;
        }

        .start-item:active {
            border-color: #000000 #ffffff #ffffff #000000;
            background: #d3d3d3;
        }

        .start-item .icon {
            font-size: 2rem; /* Scaled down so it doesn't push the text out */
            margin-bottom: 6px;
        }
    }
</style>
