<script lang="ts">
    import {
        showAuthModal,
        authModalReason,
        loginWithX,
        userProfile,
        logoutX,
        showAvatarCustomizer
    } from "$lib/stores/auth";

    let statusMessage = $state("");
    let isSubmitting = $state(false);
    let showDevMode = $state(false);
    let devHandle = $state("");

    function closeModal() {
        showAuthModal.set(false);
        statusMessage = "";
        showDevMode = false;
    }

    async function handleOAuthClick() {
        isSubmitting = true;
        statusMessage = "";
        const res = await loginWithX();
        isSubmitting = false;
        if (!res.ok) {
            statusMessage =
                res.error ||
                "X OAuth is not yet enabled in your Supabase Dashboard (Auth -> Providers -> Twitter).";
        }
    }

    // Dev sandbox bypass: only shown when OAuth fails or explicitly toggled for offline testing
    async function handleDevLogin(e: Event) {
        e.preventDefault();
        const cleaned = devHandle.replace(/^@/, "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!cleaned) return;

        const fakeProfile = {
            id: `dev-${Date.now()}`,
            x_user_id: `x_dev_${cleaned}`,
            x_username: cleaned,
            x_display_name: cleaned,
            avatar_url: "/unicorn.png",
            avatar_traits: {},
            updated_at: new Date().toISOString()
        };

        userProfile.set(fakeProfile);
        localStorage.setItem("pfpuwu_user_profile_v2", JSON.stringify(fakeProfile));
        closeModal();
        showAvatarCustomizer.set(true);
    }
</script>

{#if $showAuthModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="win98-modal-backdrop" onclick={closeModal}>
        <div class="win98-dialog" onclick={(e) => e.stopPropagation()}>
            <div class="title-bar">
                <div class="title-bar-text">𝕏 Network Authentication — Security Gate</div>
                <div class="title-bar-controls">
                    <button onclick={closeModal} aria-label="Close">X</button>
                </div>
            </div>

            <div class="dialog-body">
                {#if $userProfile}
                    <fieldset class="win98-fieldset">
                        <legend>Active 𝕏 Identity</legend>
                        <div class="profile-row">
                            <img
                                src={$userProfile.avatar_url || "/unicorn.png"}
                                alt={$userProfile.x_username}
                                class="profile-avatar"
                                onerror={(e: any) => (e.currentTarget.src = "/unicorn.png")}
                            />
                            <div class="profile-meta">
                                <strong>{$userProfile.x_display_name}</strong>
                                <span>@{$userProfile.x_username}</span>
                                <span class="status-ok">🟢 Authenticated via 𝕏</span>
                            </div>
                        </div>
                    </fieldset>
                    <p class="dialog-note">
                        Your 𝕏 handle is tied to your central Avatar Persona across Global Chat, MySpace, and your Desktop Pet.
                    </p>
                    <div class="dialog-buttons">
                        <button
                            class="win98-btn"
                            onclick={() => {
                                closeModal();
                                showAvatarCustomizer.set(true);
                            }}
                        >
                            🎨 Customize Avatar
                        </button>
                        <button class="win98-btn" onclick={logoutX}>Log Off</button>
                        <button class="win98-btn primary" onclick={closeModal}>OK</button>
                    </div>
                {:else}
                    <div class="info-row">
                        <div class="key-icon">🔐</div>
                        <div class="info-text">
                            <strong>Social Access Requires 𝕏 Login</strong>
                            <p class="dialog-note">{$authModalReason}</p>
                        </div>
                    </div>

                    <div class="oauth-box">
                        <p class="oauth-explain">
                            Sign in with your official 𝕏 (Twitter) account. You will select and customize your custom Avatar Persona right after connecting!
                        </p>

                        <button
                            type="button"
                            class="win98-btn oauth-btn"
                            onclick={handleOAuthClick}
                            disabled={isSubmitting}
                        >
                            <span class="x-logo">𝕏</span>
                            <span>{isSubmitting ? "Connecting to 𝕏..." : "Sign In with 𝕏 (OAuth 2.0)"}</span>
                        </button>
                    </div>

                    {#if statusMessage}
                        <div class="status-box">
                            <strong>⚠️ Notice:</strong> {statusMessage}
                            <div class="dev-toggle-row">
                                <button
                                    type="button"
                                    class="dev-toggle-btn"
                                    onclick={() => (showDevMode = !showDevMode)}
                                >
                                    {showDevMode ? "Hide Dev Mode" : "Local Development / Testing Mode"}
                                </button>
                            </div>
                        </div>
                    {/if}

                    {#if showDevMode}
                        <fieldset class="win98-fieldset dev-fieldset">
                            <legend>🛠️ Local Dev Sandbox (Offline Bypass)</legend>
                            <form onsubmit={handleDevLogin} class="dev-form">
                                <input
                                    type="text"
                                    class="win98-input"
                                    placeholder="dev_username"
                                    bind:value={devHandle}
                                    required
                                />
                                <button type="submit" class="win98-btn">Connect as Dev</button>
                            </form>
                        </fieldset>
                    {/if}

                    <div class="dialog-footer-buttons">
                        <button type="button" class="win98-btn" onclick={closeModal}>
                            Cancel
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .win98-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
    }

    .win98-dialog {
        width: 100%;
        max-width: 420px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.5);
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
    }

    .title-bar {
        background: #000080;
        color: #ffffff;
        padding: 3px 4px 3px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        font-size: 11px;
    }

    .title-bar-controls button {
        background: #c0c0c0;
        border: 1px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        font-size: 9px;
        font-weight: bold;
        width: 16px;
        height: 14px;
        line-height: 11px;
        padding: 0;
        cursor: pointer;
    }

    .dialog-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 12px;
        color: #000000;
    }

    .info-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 8px;
    }

    .key-icon {
        font-size: 24px;
        line-height: 1;
    }

    .info-text strong {
        font-size: 12px;
        color: #000080;
    }

    .dialog-note {
        margin: 4px 0 0;
        font-size: 11px;
        line-height: 1.4;
        color: #222222;
    }

    .oauth-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
        text-align: center;
    }

    .oauth-explain {
        margin: 0;
        font-size: 11px;
        color: #444444;
    }

    .oauth-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #000000 !important;
        color: #ffffff !important;
        font-size: 13px !important;
        font-weight: bold !important;
        padding: 8px 16px !important;
        border-color: #808080 #000000 #000000 #808080 !important;
        cursor: pointer;
        box-shadow: 1px 1px 0 #ffffff;
    }

    .oauth-btn:hover {
        background: #1a1a1a !important;
    }

    .oauth-btn .x-logo {
        font-size: 16px;
    }

    .win98-fieldset {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 8px;
        margin: 0;
    }

    .win98-fieldset legend {
        font-size: 11px;
        font-weight: bold;
        padding: 0 4px;
    }

    .profile-row {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .profile-avatar {
        width: 52px;
        height: 52px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        background: #ffffff;
        object-fit: contain;
    }

    .profile-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .status-ok {
        font-size: 10px;
        color: #008000;
        font-weight: bold;
    }

    .status-box {
        background: #ffffcc;
        border: 1px solid #808000;
        padding: 6px;
        font-size: 11px;
        line-height: 1.3;
    }

    .dev-toggle-row {
        margin-top: 6px;
    }

    .dev-toggle-btn {
        background: none;
        border: none;
        color: #000080;
        text-decoration: underline;
        font-size: 10px;
        cursor: pointer;
        padding: 0;
    }

    .dev-fieldset {
        background: #dfdfdf;
    }

    .dev-form {
        display: flex;
        gap: 6px;
    }

    .win98-input {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 4px;
        background: #ffffff;
        font-family: monospace;
        font-size: 11px;
        flex: 1;
    }

    .win98-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 4px 12px;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
        font-size: 11px;
        cursor: pointer;
    }

    .win98-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 5px 11px 3px 13px;
    }

    .win98-btn.primary {
        font-weight: bold;
    }

    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 4px;
    }

    .dialog-footer-buttons {
        display: flex;
        justify-content: flex-end;
    }
</style>
