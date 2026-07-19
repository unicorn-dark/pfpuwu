<script lang="ts">
    import { onMount } from "svelte";
    import { activeWindows, openWindow } from "$lib/stores/os";
    import Window from "./Window.svelte";
    import PfpMaker from "./PfpMaker.svelte";
    import Taskbar from "./Taskbar.svelte";
    import MinesweeperApp from "./MinesweeperApp.svelte";
    import PrivateersApp from "./PrivateersApp.svelte";
    import NotepadApp from "./NotepadApp.svelte";
    import UwUSidebar from "./UwUSidebar.svelte";
    import VideoPlayerApp from "./VideoPlayerApp.svelte";
    import MemeExplorerApp from "./MemeExplorerApp.svelte";
    import Roadmap from "./Roadmap.svelte";
    import FlappyHectacorn from "./FlappyHectacorn.svelte";
    import MemeCoinGuide from "./MemeCoinGuide.svelte";
    import SoundManager from "./SoundManager.svelte";

    const desktopVideos = [
        {
            id: "vid-demo4",
            title: "pizza.mov",
            src: "video/pizza.mp4",
            width: 720,
            height: 1280,
        },
    ];

    const launchMemeExpApp = () => {
        openWindow("meme-explorer", "Meme Explorer", 900, 600);
    };
    const launchPfpApp = () => {
        // Boost size to 720x480 for better layout presentation on desktop
        openWindow("pfp-app", "PFP Generator v1.0", 960, 690);
    };
    const launchJSPaint = () => {
        openWindow("jspaint", "untitled - Paint", 800, 600);
    };
    const launchMinesweeper = () => {
        openWindow("minesweeper", "Minesweeper", 260, 320);
    };
    const launchRoadmap = () => {
        openWindow("roadmap", "UwU Roadmap", 850, 700);
    };
    const launchFlappy = () => {
        openWindow("flappy", "Flappy Hectocorn", 850, 700);
    };
    const launchMemeGuide = () => {
        openWindow("memeGuide", "Memecoin Guide", 850, 700);
    };
    const launchBlog = () => {
        openWindow(
            "privateers-blog",
            "Internet Explorer - PrivateerSA",
            840,
            780,
        );
    };
    const launchNotepad = () => {
        openWindow("notepad", "untitled - Notepad", 500, 400);
    };

    const launchVideo = (vid: any) => {
        // 1. Determine the safe available space on the user's screen
        const isDesktop = window.innerWidth > 768;
        // Subtract sidebar (320px) and a safety margin (40px)
        const maxSafeWidth = isDesktop
            ? window.innerWidth - 360
            : window.innerWidth - 40;
        // Subtract taskbar (35px) and a safety margin (60px)
        const maxSafeHeight = window.innerHeight - 95;

        // 2. Calculate the scale factor to fit the video into the safe space
        const widthScale = maxSafeWidth / vid.width;
        const heightScale = maxSafeHeight / vid.height;

        // Use the smallest scale to maintain aspect ratio (and never scale > 1)
        const scale = Math.min(1, widthScale, heightScale);

        // 3. Apply the scale to the video dimensions
        const finalWidth = Math.floor(vid.width * scale);
        const finalHeight = Math.floor(vid.height * scale);

        // 4. Open the window with the newly scaled size (plus the window chrome padding)
        openWindow(vid.id, vid.title, finalWidth + 12, finalHeight + 40);
    };

    // Client-side Application Router
    onMount(() => {
        // Grab the path, normalize to lowercase, and strip any trailing slash
        let path = window.location.pathname.toLowerCase();
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        switch (path) {
            case '/memeguide':
                launchMemeGuide();
                break;
            case '/pfp':
                launchPfpApp();
                break;
            case '/explorer':
                launchMemeExpApp();
                break;
            case '/roadmap':
                launchRoadmap();
                break;
            case '/blog':
                launchBlog();
                break;
            case '/pumpit':
                launchFlappy();
                break;
            case '/paint':
                launchJSPaint();
                break;
            case '/minesweeper':
                launchMinesweeper();
                break;
            case '/notepad':
                launchNotepad();
                break;
            case '/':
            default:
                // Default root logic or unmapped routes
                launchPfpApp();
                launchMemeExpApp();
                break;
        }
    });
</script>

<div class="desktop">
    <SoundManager />
    <div class="workspace">
        <div class="shortcuts">
            <button
                class="shortcut"
                onclick={launchPfpApp}
                ondblclick={launchPfpApp}
            >
                <div class="icon-placeholder">🎨</div>
                <span>PFP Maker</span>
            </button>

            <button
                class="shortcut"
                onclick={launchJSPaint}
                ondblclick={launchJSPaint}
            >
                <div class="icon-placeholder">🖌️</div>
                <span>JS Paint</span>
            </button>

            <button
                class="shortcut"
                onclick={launchMinesweeper}
                ondblclick={launchMinesweeper}
            >
                <div class="icon-placeholder">💣</div>
                <span>Minesweeper</span>
            </button>

            <button
                class="shortcut"
                onclick={launchBlog}
                ondblclick={launchBlog}
            >
                <div class="icon-placeholder">🌐</div>
                <span>Privateer Blog</span>
            </button>

            <button
                class="shortcut"
                onclick={launchNotepad}
                ondblclick={launchNotepad}
            >
                <div class="icon-placeholder">📝</div>
                <span>Notepad</span>
            </button>

            <button
                class="shortcut"
                onclick={launchRoadmap}
                ondblclick={launchRoadmap}
            >
                <div class="icon-placeholder">🗺️</div>
                <span>Roadmap</span>
            </button>

            <button
                class="shortcut"
                onclick={launchMemeExpApp}
                ondblclick={launchMemeExpApp}
            >
                <div class="icon-placeholder">🦄</div>
                <span>Meme Explorer</span>
            </button>

            <button
                class="shortcut"
                onclick={launchFlappy}
                ondblclick={launchFlappy}
            >
                <img
                    src="/images/hectacorn.jpg"
                    alt="Pump It Icon"
                    class="custom-icon"
                />
                <span>Pump It</span>
            </button>

            <button
                class="shortcut"
                onclick={launchMemeGuide}
                ondblclick={launchMemeGuide}
            >
                <div class="icon-placeholder">📜</div>
                <span>Meme Guide</span>
            </button>

            {#each desktopVideos as vid}
                <button
                    class="shortcut"
                    onclick={() => launchVideo(vid)}
                    ondblclick={() => launchVideo(vid)}
                >
                    <div class="icon-placeholder">🎞️</div>
                    <span>{vid.title}</span>
                </button>
            {/each}
        </div>

        {#each $activeWindows as win (win.id)}
            {#if win.isOpen}
                <Window
                    id={win.id}
                    title={win.title}
                    zIndex={win.zIndex}
                    initialWidth={win.width}
                    initialHeight={win.height}
                    isMinimized={win.isMinimized}
                    minWidth={win.id === "pfp-app" ? 640 : 250}
                    minHeight={win.id === "pfp-app" ? 440 : 150}
                >
                    {#if win.id === "pfp-app"}
                        <div class="app-content">
                            <PfpMaker />
                        </div>
                    {:else if win.id === "jspaint"}
                        <iframe
                            src="https://jspaint.app"
                            title="JS Paint"
                            class="app-iframe"
                        ></iframe>
                    {:else if win.id === "meme-explorer"}
                        <div class="app-content">
                            <MemeExplorerApp />
                        </div>
                    {:else if win.id === "minesweeper"}
                        <div class="app-content">
                            <MinesweeperApp />
                        </div>
                    {:else if win.id === "privateers-blog"}
                        <div class="app-content">
                            <PrivateersApp />
                        </div>
                    {:else if win.id === "notepad"}
                        <div class="app-content">
                            <NotepadApp />
                        </div>
                    {:else if win.id === "roadmap"}
                        <div class="app-content">
                            <Roadmap />
                        </div>
                    {:else if win.id === "flappy"}
                        <div
                            class="app-content"
                            style="padding: 0; background: #000;"
                        >
                            <FlappyHectacorn />
                        </div>
                    {:else if win.id === "memeGuide"}
                        <div class="app-content">
                            <MemeCoinGuide />
                        </div>
                    {:else if win.id.startsWith("vid-")}
                        {@const videoData = desktopVideos.find(
                            (v) => v.id === win.id,
                        )}
                        <div
                            class="app-content"
                            style="padding: 0; background: #000;"
                        >
                            {#if videoData}
                                <VideoPlayerApp src={videoData.src} />
                            {/if}
                        </div>
                    {/if}
                </Window>
            {/if}
        {/each}
    </div>
    <UwUSidebar />
    <Taskbar />
</div>

<style>
    .desktop {
        width: 100%;
        height: 100%;
        height: 100dvh;
        background-color: #008080;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
    }
    .maximized {
        width: 100% !important;
        height: 100% !important;
        top: 0 !important;
        left: 0 !important;
    }
    .workspace {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 35px;
        right: var(--sidebar-width, 320px);
        overflow: hidden;
        transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @media (max-width: 768px) {
        .workspace {
            right: 0px;
        }
    }

    .shortcuts {
        height: 100%;
        box-sizing: border-box;
        padding: 20px;
        display: flex;
        flex-direction: column;
        flex-wrap: wrap;
        align-content: flex-start;
        gap: 20px 30px;
    }

    .shortcut {
        width: 80px;
        background: transparent;
        border: none;
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
    }

    .icon-placeholder {
        font-size: 2rem;
        margin-bottom: 5px;
    }

    .shortcut span {
        background-color: #000080;
        padding: 2px 4px;
        border: 1px dotted transparent;
    }

    .shortcut:focus span {
        border: 1px dotted yellow;
    }

    .app-content {
        height: 100%;
        color: black;
    }

    .app-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #c0c0c0;
        display: block;
    }

    .custom-icon {
        width: 36px;
        height: 36px;
        margin-bottom: 5px;
        object-fit: cover;
        border-radius: 8px;
        box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    }

    @media (max-width: 768px) {
        .desktop {
            padding-right: 0px;
        }
    }
</style>
