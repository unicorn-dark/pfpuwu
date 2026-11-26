<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        APP_REGISTRY,
        activeWindows,
        openWindow,
        openChatDrawer,
        restoreWindow,
        focusWindow,
        minimizeWindow,
        highestZIndex
    } from "$lib/stores/os";
    import {
        soundEnabled,
        soundPack,
        soundVolume,
        SOUND_PACKS,
        playClick,
        playPop,
        playAppOpen,
        type SoundPackId
    } from "$lib/utils/audio";
    import {
        userProfile,
        showAuthModal,
        authModalReason,
        showAvatarCustomizer,
        logoutX
    } from "$lib/stores/auth";

    let startMenuOpen = $state(false);
    let profileMenuOpen = $state(false);
    let soundMenuOpen = $state(false);
    let time = $state("");
    let clockInterval: any;

    onMount(() => {
        const updateTime = () => {
            time = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });
        };
        updateTime();
        clockInterval = setInterval(updateTime, 1000);
    });

    onDestroy(() => {
        if (clockInterval) clearInterval(clockInterval);
    });

    const toggleStartMenu = () => {
        startMenuOpen = !startMenuOpen;
        if (startMenuOpen) {
            profileMenuOpen = false;
            soundMenuOpen = false;
        }
    };
    const closeMenu = () => (startMenuOpen = false);

    const toggleProfileMenu = () => {
        profileMenuOpen = !profileMenuOpen;
        if (profileMenuOpen) {
            startMenuOpen = false;
            soundMenuOpen = false;
        }
    };
    const closeProfileMenu = () => (profileMenuOpen = false);

    const toggleSoundMenu = () => {
        soundMenuOpen = !soundMenuOpen;
        if (soundMenuOpen) {
            startMenuOpen = false;
            profileMenuOpen = false;
        }
    };

    const selectSoundPack = (id: SoundPackId) => {
        $soundPack = id;
        $soundEnabled = true;
        playClick("primary");
        setTimeout(() => playPop("up"), 90);
    };

    const launchApp = (app: any) => {
        playAppOpen();
        if (app.id === "chatbox") {
            openChatDrawer();
            startMenuOpen = false;
            return;
        }
        openWindow(app.id, app.title, app.defaultWidth, app.defaultHeight);
        startMenuOpen = false;
    };

    const handleTaskbarClick = (win: any) => {
        if (win.isMinimized) {
            restoreWindow(win.id);
        } else if (win.zIndex === $highestZIndex) {
            minimizeWindow(win.id);
        } else {
            focusWindow(win.id);
        }
    };

    function openIdentityDialog() {
        authModalReason.set("Login with X (Twitter) to choose your avatar persona and join Global Chat.");
        showAuthModal.set(true);
    }
</script>

{#if startMenuOpen || profileMenuOpen || soundMenuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="taskbar-backdrop"
        onclick={() => {
            closeMenu();
            closeProfileMenu();
            soundMenuOpen = false;
        }}
    ></div>
{/if}

<div class="taskbar">
    <button
        class="start-button {startMenuOpen ? 'active' : ''}"
        onclick={toggleStartMenu}
    >
        <img src="/win-98.png" class="windows-logo-img" alt="Win98 Logo" />
        Start
    </button>

    <div class="taskbar-apps">
        {#each $activeWindows as win (win.id)}
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

    <!-- X Login / Identity & Profile Section -->
    {#if $userProfile}
        <div class="profile-tray-wrapper">
            <button
                class="win98-user-btn {profileMenuOpen ? 'active' : ''}"
                onclick={toggleProfileMenu}
                title="Profile (@{$userProfile.x_username}) - Click for options"
            >
                <img
                    src={$userProfile.avatar_url || "/unicorn.png"}
                    alt="avatar"
                    class="tray-avatar"
                    onerror={(e: any) => (e.currentTarget.src = "/unicorn.png")}
                />
                <span class="tray-username">@{$userProfile.x_username}</span>
                <span class="tray-caret">▲</span>
            </button>

            {#if profileMenuOpen}
                <div class="profile-popup-menu">
                    <div class="profile-menu-header">
                        <img
                            src={$userProfile.avatar_url || "/unicorn.png"}
                            alt="avatar"
                            class="menu-header-avatar"
                        />
                        <div class="menu-header-info">
                            <span class="menu-header-name">@{$userProfile.x_username}</span>
                            <span class="menu-header-badge">Persona Active</span>
                        </div>
                    </div>
                    <div class="menu-divider"></div>
                    <button
                        class="profile-menu-item"
                        onclick={() => {
                            closeProfileMenu();
                            openWindow("namecard", "My Namecard", 880, 620);
                        }}
                    >
                        <span class="item-icon">🪪</span>
                        <span>My Namecard</span>
                    </button>
                    <button
                        class="profile-menu-item"
                        onclick={() => {
                            closeProfileMenu();
                            showAvatarCustomizer.set(true);
                        }}
                    >
                        <span class="item-icon">🎨</span>
                        <span>Customize Avatar</span>
                    </button>
                    <button
                        class="profile-menu-item"
                        onclick={() => {
                            closeProfileMenu();
                            openChatDrawer();
                        }}
                    >
                        <span class="item-icon">💬</span>
                        <span>Global Chat</span>
                    </button>
                    <div class="menu-divider"></div>
                    <button
                        class="profile-menu-item logout-item"
                        onclick={() => {
                            closeProfileMenu();
                            logoutX();
                        }}
                    >
                        <span class="item-icon">🚪</span>
                        <span>Log Off</span>
                    </button>
                </div>
            {/if}
        </div>
    {:else}
        <button
            class="win98-login-callout"
            onclick={openIdentityDialog}
            title="Sign in with X to unlock Global Chat & Avatar Persona"
        >
            <span class="callout-badge">𝕏</span>
            <span class="callout-text">Sign In</span>
        </button>
    {/if}

    <div class="system-tray">
        <button
            class="sound-toggle-btn {soundMenuOpen ? 'active' : ''}"
            onclick={toggleSoundMenu}
            title="ASMR Sound Engine & Volume"
        >
            {$soundEnabled ? "🔊" : "🔇"}
        </button>
        <span class="clock">{time}</span>

        {#if soundMenuOpen}
            <div class="sound-mixer-popover" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="ASMR Audio Mixer">
                <div class="sound-mixer-header">
                    <span>🎧 ASMR Audio Engine</span>
                    <button
                        type="button"
                        class="mixer-mute-btn"
                        data-sfx={$soundEnabled ? "pop-down" : "pop-up"}
                        onclick={() => ($soundEnabled = !$soundEnabled)}
                    >
                        {$soundEnabled ? "Mute" : "Unmute"}
                    </button>
                </div>

                <div class="sound-vol-row">
                    <span class="mixer-label">Level:</span>
                    {#each [
                        { label: "Low", val: 0.4 },
                        { label: "Med", val: 0.75 },
                        { label: "Crisp", val: 1.0 }
                    ] as vOpt (vOpt.val)}
                        <button
                            type="button"
                            class="mixer-vol-btn {Math.abs($soundVolume - vOpt.val) < 0.08 ? 'active' : ''}"
                            onclick={() => {
                                $soundVolume = vOpt.val;
                                $soundEnabled = true;
                                playClick("primary");
                            }}
                        >
                            {vOpt.label}
                        </button>
                    {/each}
                </div>

                <div class="menu-divider"></div>
                <div class="mixer-pack-title">Tactile Sound Pack:</div>
                <div class="mixer-pack-list">
                    {#each SOUND_PACKS as pack (pack.id)}
                        <button
                            type="button"
                            class="mixer-pack-btn {$soundPack === pack.id ? 'active' : ''}"
                            onclick={() => selectSoundPack(pack.id)}
                        >
                            <span class="pack-icon">{pack.icon}</span>
                            <span class="pack-text">
                                <strong>{pack.name}</strong>
                                <small>{pack.desc}</small>
                            </span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    {#if startMenuOpen}
        <div class="start-menu">
            <div class="start-menu-sidebar">
                <span>Windows 98</span>
            </div>
            <div class="start-menu-items">
                {#each APP_REGISTRY as app (app.id)}
                    <button class="start-item" onclick={() => launchApp(app)}>
                        <span class="icon">{app.icon}</span>
                        {app.title}
                    </button>
                {/each}
                <div class="menu-divider"></div>
                {#if $userProfile}
                    <button
                        class="start-item"
                        onclick={() => {
                            startMenuOpen = false;
                            showAvatarCustomizer.set(true);
                        }}
                    >
                        <span class="icon">🎨</span>
                        Customize Avatar
                    </button>
                {/if}
                <button
                    class="start-item"
                    onclick={() => {
                        startMenuOpen = false;
                        openIdentityDialog();
                    }}
                >
                    <span class="icon">𝕏</span>
                    {$userProfile ? `@${$userProfile.x_username} (Account)` : "Login with X"}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .windows-logo-img {
        width: 16px;
        height: 16px;
        margin-right: 2px;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
    }

    .taskbar {
        position: fixed;
        bottom: env(safe-area-inset-bottom, 0px);
        left: 0;
        width: 100%;
        height: 35px;
        background: #c0c0c0;
        border-top: 2px solid #ffffff;
        display: flex;
        align-items: center;
        padding: 2px;
        box-sizing: border-box;
        z-index: 99999;
    }

    .start-button {
        display: flex;
        align-items: center;
        gap: 5px;
        font-family: inherit;
        font-weight: bold;
        font-size: 0.9rem;
        padding: 4px 8px;
        margin-right: 5px;
        background: #c0c0c0;
        color: #000000;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
    }

    .start-button.active,
    .start-button:active {
        border-color: #000000 #ffffff #ffffff #000000;
        background: #e0e0e0;
        padding: 5px 7px 3px 9px;
    }

    .taskbar-apps {
        flex-grow: 1;
        display: flex;
        gap: 4px;
        overflow-x: auto;
        padding-right: 6px;
    }

    .taskbar-app-btn {
        background: #c0c0c0;
        color: #000000;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 4px 10px;
        font-family: inherit;
        font-size: 0.8rem;
        font-weight: bold;
        cursor: pointer;
        min-width: 110px;
        max-width: 160px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
    }

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

    .win98-user-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #c0c0c0;
        color: #000000;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 3px 8px;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        margin-left: 3px;
        flex-shrink: 0;
        user-select: none;
    }

    .win98-user-btn:active,
    .win98-user-btn.active {
        border-color: #000000 #ffffff #ffffff #000000;
        background: #d4d0c8;
    }

    .tray-avatar {
        width: 18px;
        height: 18px;
        object-fit: contain;
        background: #ffffff;
        border: 1px solid #808080;
    }

    .tray-username {
        max-width: 90px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .tray-caret {
        font-size: 8px;
        opacity: 0.7;
    }

    /* Profile Tray Popup Menu */
    .profile-tray-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .profile-popup-menu {
        position: absolute;
        bottom: 35px;
        right: 0;
        width: 220px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        display: flex;
        flex-direction: column;
        z-index: 10001;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
        padding: 2px;
    }

    .profile-menu-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: #000080;
        color: #ffffff;
    }

    .menu-header-avatar {
        width: 28px;
        height: 28px;
        border: 1px solid #ffffff;
        background: #ffffff;
        object-fit: contain;
        flex-shrink: 0;
    }

    .menu-header-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        line-height: 1.2;
    }

    .menu-header-name {
        font-weight: bold;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .menu-header-badge {
        font-size: 9px;
        color: #90ee90;
        font-weight: normal;
    }

    .profile-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: none;
        padding: 6px 8px;
        text-align: left;
        font-family: inherit;
        font-size: 11px;
        color: #000000;
        cursor: pointer;
        width: 100%;
        box-sizing: border-box;
    }

    .profile-menu-item:hover {
        background: #000080;
        color: #ffffff;
    }

    .profile-menu-item .item-icon {
        font-size: 13px;
        width: 16px;
        text-align: center;
    }

    /* Prominent X Login Callout */
    .win98-login-callout {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #000080;
        color: #ffffff;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 3px 10px;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        margin-left: 4px;
        flex-shrink: 0;
        box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.4);
    }

    .win98-login-callout:hover {
        background: #1084d0;
    }

    .win98-login-callout:active {
        border-color: #000000 #ffffff #ffffff #000000;
    }

    .callout-badge {
        font-size: 13px;
        font-weight: 900;
        line-height: 1;
    }

    .callout-text {
        letter-spacing: 0.5px;
    }

    .system-tray {
        position: relative;
        padding: 3px 8px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        margin-left: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        background: #c0c0c0;
        flex-shrink: 0;
    }

    .sound-toggle-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        padding: 0 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        outline: none;
    }

    .sound-toggle-btn.active {
        background: #000080;
        color: #ffffff;
    }

    .sound-mixer-popover {
        position: absolute;
        bottom: 35px;
        right: 0;
        width: 248px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
        z-index: 10002;
        padding: 3px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 11px;
        color: #000000;
    }

    .sound-mixer-header {
        background: linear-gradient(90deg, #000080, #1084d0);
        color: #ffffff;
        padding: 4px 6px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    }

    .mixer-mute-btn,
    .mixer-vol-btn {
        background: #c0c0c0;
        color: #000000;
        border: 1.5px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: bold;
        cursor: pointer;
    }

    .mixer-vol-btn.active {
        background: #000080;
        color: #ffffff;
        border-color: #000000 #ffffff #ffffff #000000;
    }

    .sound-vol-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px;
    }

    .mixer-label {
        font-weight: bold;
        margin-right: auto;
    }

    .mixer-pack-title {
        font-weight: bold;
        padding: 0 4px;
        font-size: 10px;
        color: #222222;
    }

    .mixer-pack-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 0 2px 2px;
    }

    .mixer-pack-btn {
        display: flex;
        align-items: center;
        gap: 7px;
        width: 100%;
        text-align: left;
        background: #dfdfdf;
        border: 1.5px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        padding: 5px 6px;
        cursor: pointer;
        color: #000000;
    }

    .mixer-pack-btn:hover {
        background: #eaeaea;
    }

    .mixer-pack-btn.active {
        background: #000080;
        color: #ffffff;
        border-color: #000000 #ffffff #ffffff #000000;
    }

    .pack-icon {
        font-size: 15px;
        flex-shrink: 0;
    }

    .pack-text {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
    }

    .pack-text strong {
        font-size: 11px;
    }

    .pack-text small {
        font-size: 9.5px;
        opacity: 0.85;
    }

    .clock {
        font-size: 0.8rem;
        color: #000000;
    }

    .taskbar-backdrop {
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
        width: 240px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        display: flex;
        flex-direction: row;
        z-index: 10000;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
    }

    .start-menu-sidebar {
        width: 28px;
        background: linear-gradient(to bottom, #000080, #1084d0);
        display: flex;
        align-items: flex-end;
        padding-bottom: 5px;
    }

    .start-menu-sidebar span {
        color: white;
        font-weight: bold;
        font-size: 1.1rem;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        padding: 10px 4px;
        letter-spacing: 1px;
    }

    .start-menu-items {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        padding: 2px;
    }

    .menu-divider {
        height: 2px;
        background: #808080;
        border-bottom: 1px solid #ffffff;
        margin: 3px 2px;
    }

    .start-item {
        display: flex;
        align-items: center;
        gap: 10px;
        background: transparent;
        border: none;
        padding: 8px 10px;
        text-align: left;
        font-family: inherit;
        font-size: 0.9rem;
        color: #000000;
        cursor: pointer;
        width: 100%;
    }

    .start-item:hover {
        background: #000080;
        color: white;
    }

    .start-item .icon {
        font-size: 1.3rem;
    }

    @media (max-width: 768px) {
        .taskbar-apps {
            display: none;
        }

        .start-button {
            margin-right: auto;
        }

        .start-menu {
            flex-direction: column;
            width: 100%;
            height: calc(100dvh - 35px);
            bottom: 35px;
            left: 0;
            background: #008080;
            border: none;
            box-shadow: none;
            overflow-y: auto;
            box-sizing: border-box;
        }

        .start-menu-sidebar,
        .menu-divider {
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
            min-width: 0;
            overflow: hidden;
            font-size: 0.75rem;
            line-height: 1.1;
            text-align: center;
        }

        .start-item:active {
            border-color: #000000 #ffffff #ffffff #000000;
            background: #d3d3d3;
        }

        .start-item .icon {
            font-size: 1.8rem;
            margin-bottom: 6px;
        }
    }
</style>
