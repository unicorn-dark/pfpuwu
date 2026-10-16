<script lang="ts">
    import { onMount } from "svelte";
    import {
        APP_REGISTRY,
        activeWindows,
        openWindow,
        openChatDrawer
    } from "$lib/stores/os";
    import { initAuth } from "$lib/stores/auth";
    import Window from "./Window.svelte";
    import Taskbar from "./Taskbar.svelte";
    import PfpMaker from "./PfpMaker.svelte";
    import ChatboxApp from "./ChatboxApp.svelte";
    import MemeExplorerApp from "./MemeExplorerApp.svelte";
    import MinesweeperApp from "./MinesweeperApp.svelte";
    import PrivateersApp from "./PrivateersApp.svelte";
    import Roadmap from "./Roadmap.svelte";
    import UwUWorldApp from "./UwUWorldApp.svelte";
    import SoundManager from "./SoundManager.svelte";
    import XAuthModal from "./XAuthModal.svelte";
    import AvatarCustomizerModal from "./AvatarCustomizerModal.svelte";
    import {
        userProfile,
        showAuthModal,
        authModalReason,
        showAvatarCustomizer
    } from "$lib/stores/auth";

    const launchApp = (appId: string) => {
        if (appId === "chatbox") {
            openChatDrawer();
            return;
        }
        const def = APP_REGISTRY.find((a) => a.id === appId);
        if (!def) return;
        openWindow(def.id, def.title, def.defaultWidth, def.defaultHeight);
    };

    onMount(() => {
        initAuth();

        let path = window.location.pathname.toLowerCase();
        if (path.length > 1 && path.endsWith("/")) {
            path = path.slice(0, -1);
        }

        if (path.startsWith("/space/")) {
            // MySpace is temporarily disabled per user request
            return;
        }

        switch (path) {
            case "/pfp":
                launchApp("pfp-app");
                break;
            case "/chat":
                openChatDrawer();
                break;
            case "/explorer":
                launchApp("meme-explorer");
                break;
            case "/roadmap":
                launchApp("roadmap");
                break;
            case "/world":
                launchApp("uwu-world");
                break;
            case "/blog":
                launchApp("privateers-blog");
                break;
            case "/paint":
                launchApp("jspaint");
                break;
            case "/minesweeper":
                launchApp("minesweeper");
                break;
            case "/":
            default:
                // On opening the site: Meme Explorer is open on top, PFP Maker is open under it
                launchApp("pfp-app");
                launchApp("meme-explorer");
                break;
        }
    });
</script>

<div class="desktop">
    <SoundManager />
    <XAuthModal />
    <AvatarCustomizerModal />

    <div class="workspace">
        <div class="shortcuts">
            <!-- Dedicated X Identity & Persona Avatar Shortcuts -->
            {#if !$userProfile}
                <button
                    class="shortcut shortcut-login"
                    onclick={() => {
                        authModalReason.set("Sign in with X (Twitter) to choose your Persona Avatar and unlock Global Chat.");
                        showAuthModal.set(true);
                    }}
                    ondblclick={() => {
                        authModalReason.set("Sign in with X (Twitter) to choose your Persona Avatar and unlock Global Chat.");
                        showAuthModal.set(true);
                    }}
                    title="Sign in with X (Twitter)"
                >
                    <div class="icon-placeholder x-login-icon">𝕏</div>
                    <span class="x-badge-title">Sign In (𝕏)</span>
                </button>
            {:else}
                <button
                    class="shortcut shortcut-avatar"
                    onclick={() => showAvatarCustomizer.set(true)}
                    ondblclick={() => showAvatarCustomizer.set(true)}
                    title="Customize your transparent Persona Avatar"
                >
                    <div class="icon-placeholder avatar-icon-box">
                        <img
                            src={$userProfile.avatar_url || "/unicorn.png"}
                            alt="Persona Avatar"
                            class="desktop-persona-img"
                            onerror={(e: any) => (e.currentTarget.src = "/unicorn.png")}
                        />
                    </div>
                    <span>My Avatar</span>
                </button>
            {/if}

            {#each APP_REGISTRY as app (app.id)}
                <button
                    class="shortcut"
                    onclick={() => launchApp(app.id)}
                    ondblclick={() => launchApp(app.id)}
                >
                    <div class="icon-placeholder">{app.icon}</div>
                    <span>{app.title}</span>
                </button>
            {/each}
        </div>

        {#each $activeWindows as win (win.id)}
            {#if win.isOpen}
                {@const appDef = APP_REGISTRY.find((a) => a.id === win.appId)}
                <Window
                    id={win.id}
                    title={win.title}
                    icon={win.icon}
                    zIndex={win.zIndex}
                    initialWidth={win.width}
                    initialHeight={win.height}
                    isMinimized={win.isMinimized}
                    minWidth={appDef?.minWidth || 250}
                    minHeight={appDef?.minHeight || 150}
                >
                    {#if win.id === "pfp-app"}
                        <div class="app-content">
                            <PfpMaker />
                        </div>
                    {:else if win.id === "meme-explorer"}
                        <div class="app-content">
                            <MemeExplorerApp />
                        </div>
                    {:else if win.id === "jspaint"}
                        <iframe
                            src="https://jspaint.app"
                            title="JS Paint"
                            class="app-iframe"
                        ></iframe>
                    {:else if win.id === "minesweeper"}
                        <div class="app-content">
                            <MinesweeperApp />
                        </div>
                    {:else if win.id === "privateers-blog"}
                        <div class="app-content">
                            <PrivateersApp />
                        </div>
                    {:else if win.id === "roadmap"}
                        <div class="app-content">
                            <Roadmap />
                        </div>
                    {:else if win.id === "uwu-world"}
                        <div class="app-content">
                            <UwUWorldApp />
                        </div>
                    {/if}
                </Window>
            {/if}
        {/each}
    </div>

    <Taskbar />
    <ChatboxApp />
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

    .workspace {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 35px;
        right: 0;
        overflow: hidden;
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
        font-family: inherit;
    }

    .icon-placeholder {
        font-size: 2rem;
        margin-bottom: 5px;
    }

    .shortcut span {
        background-color: #000080;
        padding: 2px 4px;
        border: 1px dotted transparent;
        font-size: 11px;
        text-align: center;
    }

    .shortcut:focus span,
    .shortcut:hover span {
        border: 1px dotted yellow;
    }

    .x-login-icon {
        background: #000000;
        color: #ffffff;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
        box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.4);
        font-weight: 900;
        font-size: 1.3rem;
        margin-bottom: 5px;
        box-sizing: border-box;
    }

    .x-badge-title {
        background-color: #000080 !important;
        font-weight: bold;
        color: #ffff00 !important;
    }

    .avatar-icon-box {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.2);
        border: 1px dotted #ffffff;
        margin-bottom: 5px;
        box-sizing: border-box;
    }

    .desktop-persona-img {
        width: 32px;
        height: 32px;
        object-fit: contain;
        image-rendering: pixelated;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    }

    .app-content {
        height: 100%;
        width: 100%;
        color: black;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .app-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #c0c0c0;
        display: block;
    }
</style>
