<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import { supabase } from "$lib/supabaseClient";
    import {
        userProfile,
        requireXLogin,
        hasAvatarChosen,
        showAvatarCustomizer
    } from "$lib/stores/auth";
    import {
        isChatDrawerOpen,
        openChatDrawer,
        closeChatDrawer
    } from "$lib/stores/os";

    interface ChatMessage {
        id: string | number;
        user_id: string;
        x_username: string;
        x_display_name?: string;
        avatar_url: string;
        content: string;
        created_at: string;
    }

    interface OnlineUser {
        id: string;
        x_username: string;
        x_display_name?: string;
        avatar_url: string;
    }

    const TTL_24H_MS = 24 * 60 * 60 * 1000;
    const LOCAL_CHAT_KEY = "pfpuwu_global_chat_24h_v1";

    const EMOJI_PALETTE = [
        "🦄", "✨", "🔥", "💎", "🚀", "👾", "💻", "💿",
        "⚡", "🌈", "😎", "😭", "💀", "🫡", "🤝", "❤️",
        "🎉", "🍕", "🎮", "🎸", "🛸", "🌊", "🍀", "👑"
    ];

    let messages = $state<ChatMessage[]>([]);
    let messageInput = $state("");
    let showEmojiTray = $state(false);
    let showOnlinePanel = $state(false);
    let isLoading = $state(true);
    let isSending = $state(false);
    let errorBanner = $state("");
    let chatScrollContainer: HTMLDivElement | null = $state(null);
    let lastSentTimestamp = 0;

    let onlineUsers = $state<OnlineUser[]>([]);
    let unreadCount = $state(0);
    let realtimeChannel: any = null;
    let presenceChannel: any = null;
    let purgeInterval: ReturnType<typeof setInterval>;

    function filterLast24Hours(list: ChatMessage[]): ChatMessage[] {
        const cutoff = Date.now() - TTL_24H_MS;
        return list.filter((m) => new Date(m.created_at).getTime() > cutoff);
    }

    function loadLocalMessages(): ChatMessage[] {
        if (typeof window === "undefined") return [];
        try {
            const raw = localStorage.getItem(LOCAL_CHAT_KEY);
            if (!raw) return [];
            return filterLast24Hours(JSON.parse(raw));
        } catch {
            return [];
        }
    }

    function saveLocalMessages(list: ChatMessage[]) {
        if (typeof window === "undefined") return;
        try {
            const fresh = filterLast24Hours(list).slice(-150);
            localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(fresh));
        } catch {}
    }

    async function scrollToBottom() {
        await tick();
        if (chatScrollContainer) {
            chatScrollContainer.scrollTop = chatScrollContainer.scrollHeight;
        }
    }

    async function fetchMessages() {
        isLoading = true;
        const cutoffIso = new Date(Date.now() - TTL_24H_MS).toISOString();

        try {
            const { data, error } = await supabase
                .from("chat_messages")
                .select("*")
                .gt("created_at", cutoffIso)
                .order("created_at", { ascending: true })
                .limit(120);

            if (!error && data && data.length > 0) {
                messages = filterLast24Hours(data as ChatMessage[]);
                saveLocalMessages(messages);
            } else {
                messages = loadLocalMessages();
            }
        } catch {
            messages = loadLocalMessages();
        } finally {
            isLoading = false;
            scrollToBottom();
        }
    }

    function subscribeRealtime() {
        try {
            realtimeChannel = supabase
                .channel("global-chat-24h")
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "chat_messages" },
                    (payload) => {
                        const incoming = payload.new as ChatMessage;
                        if (!messages.some((m) => m.id === incoming.id)) {
                            messages = [...filterLast24Hours(messages), incoming];
                            saveLocalMessages(messages);
                            if (!$isChatDrawerOpen) {
                                unreadCount += 1;
                            } else {
                                scrollToBottom();
                            }
                        }
                    }
                )
                .subscribe();
        } catch {}
    }

    function subscribePresence() {
        try {
            presenceChannel = supabase.channel("online_presence_room", {
                config: {
                    presence: {
                        key: $userProfile?.id || `visitor-${Math.random().toString(36).slice(2, 7)}`
                    }
                }
            });

            presenceChannel
                .on("presence", { event: "sync" }, () => {
                    const state = presenceChannel.presenceState();
                    const liveList: OnlineUser[] = [];

                    for (const key in state) {
                        const items = state[key] as any[];
                        if (items && items[0] && items[0].x_username) {
                            if (!liveList.some((u) => u.x_username === items[0].x_username)) {
                                liveList.push({
                                    id: items[0].id || key,
                                    x_username: items[0].x_username,
                                    x_display_name: items[0].x_display_name,
                                    avatar_url: items[0].avatar_url || "/unicorn.png"
                                });
                            }
                        }
                    }

                    // Strict real presence only: No fake generated profiles
                    onlineUsers = liveList;
                })
                .on("presence", { event: "join" }, () => {})
                .on("presence", { event: "leave" }, () => {});

            presenceChannel.subscribe(async (status: string) => {
                if (status === "SUBSCRIBED" && $userProfile) {
                    await presenceChannel.track({
                        id: $userProfile.id,
                        x_username: $userProfile.x_username,
                        x_display_name: $userProfile.x_display_name,
                        avatar_url: $userProfile.avatar_url,
                        online_at: new Date().toISOString()
                    });
                }
            });
        } catch {}
    }

    $effect(() => {
        if ($userProfile && presenceChannel) {
            presenceChannel.track({
                id: $userProfile.id,
                x_username: $userProfile.x_username,
                x_display_name: $userProfile.x_display_name,
                avatar_url: $userProfile.avatar_url,
                online_at: new Date().toISOString()
            });
        }
    });

    $effect(() => {
        if ($isChatDrawerOpen) {
            unreadCount = 0;
            scrollToBottom();
        }
    });

    function sanitizeChatText(str: string): string {
        return str
            .replace(/https?:\/\/\S+/gi, "[link removed]")
            .replace(/[<>]/g, "")
            .trim();
    }

    async function sendMessage(e?: Event) {
        e?.preventDefault();
        errorBanner = "";

        if (!$userProfile) {
            requireXLogin("Login with X (Twitter) to chat in the Global Chatbox.");
            return;
        }

        if (!$hasAvatarChosen) {
            showAvatarCustomizer.set(true);
            return;
        }

        const cleanText = sanitizeChatText(messageInput);
        if (!cleanText) return;

        const now = Date.now();
        if (now - lastSentTimestamp < 1800) {
            errorBanner = "Please wait 2 seconds between messages.";
            return;
        }

        isSending = true;
        lastSentTimestamp = now;

        const newMsg: ChatMessage = {
            id: `local-${now}-${Math.random().toString(36).slice(2, 6)}`,
            user_id: $userProfile.id,
            x_username: $userProfile.x_username,
            x_display_name: $userProfile.x_display_name,
            avatar_url: $userProfile.avatar_url || "/unicorn.png",
            content: cleanText.slice(0, 280),
            created_at: new Date(now).toISOString()
        };

        messages = [...filterLast24Hours(messages), newMsg];
        saveLocalMessages(messages);
        messageInput = "";
        showEmojiTray = false;
        scrollToBottom();

        try {
            await supabase.from("chat_messages").insert({
                user_id: newMsg.user_id,
                x_username: newMsg.x_username,
                x_display_name: newMsg.x_display_name,
                avatar_url: newMsg.avatar_url,
                content: newMsg.content
            });
        } catch {}

        isSending = false;
    }

    function insertEmoji(emoji: string) {
        if (messageInput.length + emoji.length <= 280) {
            messageInput += emoji;
        }
    }

    function formatRelativeTime(iso: string): string {
        const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        return `${diffHr}h ago`;
    }

    function getExpiresIn(iso: string): string {
        const remainingMs = new Date(iso).getTime() + TTL_24H_MS - Date.now();
        if (remainingMs <= 0) return "0h";
        const hrs = Math.ceil(remainingMs / (1000 * 60 * 60));
        return `${hrs}h TTL`;
    }

    function handleTitlebarClick() {
        if (!$isChatDrawerOpen) {
            openChatDrawer();
        }
    }

    onMount(() => {
        fetchMessages();
        subscribeRealtime();
        subscribePresence();
        purgeInterval = setInterval(() => {
            messages = filterLast24Hours(messages);
        }, 30000);
    });

    onDestroy(() => {
        if (realtimeChannel) {
            try {
                supabase.removeChannel(realtimeChannel);
            } catch {}
        }
        if (presenceChannel) {
            try {
                supabase.removeChannel(presenceChannel);
            } catch {}
        }
        if (purgeInterval) clearInterval(purgeInterval);
    });
</script>

<div
    class="bottom-right-chat-drawer {$isChatDrawerOpen ? 'drawer-open' : 'drawer-collapsed'}"
>
    <!-- Single Sleek Blue Bar (Windows 98 Active Titlebar) -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="drawer-titlebar"
        onclick={handleTitlebarClick}
        title={$isChatDrawerOpen ? "Global Chat - Click ▼ to collapse" : "Global Chat - Click to expand (▲)"}
        role="toolbar"
        tabindex="0"
    >
        <div class="titlebar-left">
            <span class="titlebar-icon">💬</span>
            <span class="titlebar-title">Global Chat</span>
            <span class="titlebar-online" title="{onlineUsers.length} users online">
                <span class="online-dot">🟢</span>
                <span class="online-num"><strong>{onlineUsers.length}</strong></span>
                <span class="online-label">Online</span>
            </span>
        </div>

        <div class="titlebar-right">
            {#if !$isChatDrawerOpen && unreadCount > 0}
                <span class="unread-pill" title="{unreadCount} new message{unreadCount > 1 ? 's' : ''}">
                    🔔 {unreadCount} new
                </span>
            {/if}

            {#if $isChatDrawerOpen}
                <button
                    type="button"
                    class="drawer-arrow-btn"
                    onclick={(e) => {
                        e.stopPropagation();
                        closeChatDrawer();
                    }}
                    title="Minimize chatbox (▼)"
                    aria-label="Minimize"
                >
                    ▼
                </button>
            {:else}
                <button
                    type="button"
                    class="drawer-arrow-btn"
                    onclick={(e) => {
                        e.stopPropagation();
                        openChatDrawer();
                    }}
                    title="Expand chatbox (▲)"
                    aria-label="Expand"
                >
                    ▲
                </button>
            {/if}
        </div>
    </div>

    <!-- Drawer Interior / Body -->
    <div class="drawer-body">
        <!-- Sub-bar with Room Info & Member Count Toggle -->
        <div class="chat-status-bar">
            <div class="room-title">
                <span><strong>#pfpuwu-global</strong></span>
                <span class="history-tag">24h History</span>
            </div>

            <button
                type="button"
                class="online-badge-btn {showOnlinePanel ? 'active' : ''}"
                onclick={() => (showOnlinePanel = !showOnlinePanel)}
                title="View active users in room"
            >
                <span>Members ({onlineUsers.length})</span>
                <span class="toggle-icon">{showOnlinePanel ? "▲" : "▼"}</span>
            </button>
        </div>

        <!-- Collapsible Online Members Panel -->
        {#if showOnlinePanel}
            <div class="online-members-panel win98-inset">
                <div class="online-panel-header">
                    <span>Active Users ({onlineUsers.length})</span>
                    <span class="online-hint">Active right now</span>
                </div>
                <div class="online-avatars-row">
                    {#each onlineUsers as user (user.x_username)}
                        <div class="online-user-chip" title="@{user.x_username} is active">
                            <img
                                src={user.avatar_url || "/unicorn.png"}
                                alt={user.x_username}
                                class="online-chip-avatar"
                                onerror={(e: any) => (e.currentTarget.src = "/unicorn.png")}
                            />
                            <span class="online-chip-handle">@{user.x_username}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Chat Messages Feed -->
        <div class="chat-feed win98-inset" bind:this={chatScrollContainer}>
            {#if isLoading}
                <div class="chat-empty">⌛ Connecting to chat server...</div>
            {:else if messages.length === 0}
                <div class="chat-empty">No messages in the last 24 hours. Be the first to say hi!</div>
            {:else}
                {#each messages as msg (msg.id)}
                    <div class="chat-line">
                        <div class="avatar-box" title="@{msg.x_username}">
                            <img
                                src={msg.avatar_url || "/unicorn.png"}
                                alt={msg.x_username}
                                class="chat-avatar"
                                onerror={(e: any) => (e.currentTarget.src = "/unicorn.png")}
                            />
                        </div>
                        <div class="line-body">
                            <div class="line-header">
                                <span class="handle-display">
                                    &lt;@{msg.x_username}&gt;
                                </span>
                                <span class="timestamp">
                                    [{formatRelativeTime(msg.created_at)} | {getExpiresIn(msg.created_at)}]
                                </span>
                            </div>
                            <div class="line-text">{msg.content}</div>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>

        {#if errorBanner}
            <div class="error-strip">{errorBanner}</div>
        {/if}

        {#if showEmojiTray}
            <div class="emoji-grid win98-inset">
                {#each EMOJI_PALETTE as emoji}
                    <button
                        type="button"
                        class="win98-btn emoji-cell"
                        onclick={() => insertEmoji(emoji)}
                    >
                        {emoji}
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Chat Controls / Prominent Security Gating -->
        <div class="chat-controls">
            {#if $userProfile && $hasAvatarChosen}
                <!-- Authenticated with Avatar Persona -->
                <form class="composer-row" onsubmit={sendMessage}>
                    <button
                        type="button"
                        class="win98-btn emoji-toggle-btn"
                        onclick={() => (showEmojiTray = !showEmojiTray)}
                        title="Insert Emoji"
                    >
                        😊
                    </button>
                    <div class="avatar-tag-indicator" title="Posting as @{$userProfile.x_username}">
                        <img
                            src={$userProfile.avatar_url || "/unicorn.png"}
                            alt="My Avatar"
                            class="composer-avatar"
                        />
                    </div>
                    <input
                        type="text"
                        class="win98-input msg-input"
                        placeholder="Type message (24h auto-delete)..."
                        maxlength="280"
                        bind:value={messageInput}
                    />
                    <button
                        type="submit"
                        class="win98-btn primary send-btn"
                        disabled={isSending || !messageInput.trim()}
                    >
                        Send
                    </button>
                </form>
            {:else if $userProfile && !$hasAvatarChosen}
                <!-- Authenticated with X, but no avatar chosen yet -->
                <div class="gate-box avatar-gate-box">
                    <div class="gate-left">
                        <span class="gate-icon">🎨</span>
                        <div>
                            <strong>Avatar Persona Required:</strong>
                            <p class="gate-sub">Choose your character traits to chat.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        class="win98-btn primary pulse-btn"
                        onclick={() => showAvatarCustomizer.set(true)}
                    >
                        🦄 Choose Avatar
                    </button>
                </div>
            {:else}
                <!-- Not logged in: Prominent X Login Barrier -->
                <div class="gate-box x-gate-box">
                    <div class="gate-left">
                        <span class="gate-icon">🔐</span>
                        <div>
                            <strong>𝕏 Sign In Required</strong>
                            <p class="gate-sub">Global chat is locked. Sign in with 𝕏 to join.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        class="win98-btn primary x-login-btn"
                        onclick={() => requireXLogin("Sign in with X (Twitter) to post messages in Global Chat.")}
                    >
                        𝕏 Sign In
                    </button>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .bottom-right-chat-drawer {
        position: fixed;
        right: 16px;
        bottom: 35px; /* Above 35px taskbar */
        width: 380px;
        max-width: calc(100vw - 24px);
        height: 520px;
        max-height: calc(100vh - 75px);
        background: #c0c0c0;
        border: 2px solid;
        border-color: #dfdfdf #404040 #404040 #dfdfdf;
        box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        z-index: 9990;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease;
        overflow: hidden;
        box-sizing: border-box;
    }

    .bottom-right-chat-drawer.drawer-collapsed {
        transform: translateY(calc(100% - 32px));
        box-shadow: 1px 1px 6px rgba(0, 0, 0, 0.3);
    }

    .bottom-right-chat-drawer.drawer-open {
        transform: translateY(0);
    }

    .drawer-titlebar {
        height: 32px;
        min-height: 32px;
        background: linear-gradient(90deg, #000080 0%, #1084d0 100%);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 4px 0 8px;
        user-select: none;
        cursor: pointer;
        font-size: 11.5px;
        font-weight: bold;
        box-sizing: border-box;
        border-bottom: 1px solid #000050;
    }

    .bottom-right-chat-drawer.drawer-collapsed:hover .drawer-titlebar {
        background: linear-gradient(90deg, #0000a0 0%, #1a94e8 100%);
    }

    .titlebar-left {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .titlebar-icon {
        font-size: 13px;
    }

    .titlebar-title {
        white-space: nowrap;
        font-weight: bold;
        letter-spacing: 0.3px;
    }

    .titlebar-online {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.35);
        padding: 1px 5px;
        border-radius: 2px;
        font-size: 9.5px;
        font-weight: normal;
        color: #e0f2fe;
    }

    .online-dot {
        font-size: 8px;
        line-height: 1;
    }

    .online-num {
        font-weight: bold;
        color: #ffffff;
    }

    .online-label {
        opacity: 0.9;
    }

    .titlebar-right {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .unread-pill {
        background: #ff0055;
        color: #ffffff;
        font-size: 10px;
        font-weight: bold;
        padding: 1px 6px;
        border-radius: 3px;
        border: 1px solid #ffffff;
        box-shadow: 0 0 6px rgba(255, 0, 85, 0.85);
        display: inline-flex;
        align-items: center;
        gap: 3px;
        animation: unreadPulse 1.2s infinite alternate;
    }

    @keyframes unreadPulse {
        from {
            transform: scale(1);
            filter: brightness(1);
        }
        to {
            transform: scale(1.05);
            filter: brightness(1.2);
        }
    }

    .drawer-arrow-btn {
        width: 20px;
        height: 20px;
        background: #c0c0c0;
        color: #000000;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: bold;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        outline: none;
    }

    .drawer-arrow-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 1px 0 0 1px;
    }

    .drawer-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding: 4px;
        gap: 4px;
        background: #c0c0c0;
        box-sizing: border-box;
    }

    .bottom-right-chat-drawer.drawer-collapsed .drawer-body {
        pointer-events: none;
    }

    .chat-status-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #ffffe1;
        border: 1px solid #808080;
        padding: 4px 6px;
        font-size: 11px;
        color: #000000;
        flex-shrink: 0;
    }

    .room-title {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .history-tag {
        font-size: 9px;
        color: #666666;
        background: rgba(0, 0, 0, 0.05);
        padding: 1px 4px;
        border-radius: 2px;
    }

    .online-badge-btn {
        background: #ffffff;
        border: 1px solid #808080;
        padding: 2px 6px;
        font-family: inherit;
        font-size: 10.5px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .online-badge-btn:hover {
        background: #f0f0f0;
    }

    .online-badge-btn.active {
        background: #000080;
        color: #ffffff;
        border-color: #000040;
    }

    .toggle-icon {
        font-size: 8px;
        opacity: 0.7;
    }

    /* Online Members Panel */
    .online-members-panel {
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 6px;
        flex-shrink: 0;
        max-height: 110px;
        overflow-y: auto;
    }

    .online-panel-header {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        font-weight: bold;
        color: #000080;
        margin-bottom: 4px;
        border-bottom: 1px dotted #c0c0c0;
        padding-bottom: 2px;
    }

    .online-hint {
        font-weight: normal;
        color: #666666;
    }

    .online-avatars-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .online-user-chip {
        display: flex;
        align-items: center;
        gap: 4px;
        background: #f4f4f4;
        border: 1px solid #c0c0c0;
        padding: 2px 6px 2px 2px;
        font-family: inherit;
        font-size: 10px;
        border-radius: 3px;
        user-select: none;
    }

    .online-chip-avatar {
        width: 18px;
        height: 18px;
        object-fit: contain;
        background: transparent;
        border-radius: 2px;
    }

    .online-chip-handle {
        font-weight: bold;
        color: #000080;
    }

    .chat-feed {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 6px;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .chat-empty {
        margin: auto;
        color: #808080;
        font-size: 11.5px;
        text-align: center;
        padding: 20px;
    }

    .chat-line {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding-bottom: 4px;
        border-bottom: 1px dotted #e0e0e0;
    }

    .avatar-box {
        background: #ffffff;
        border: 1px solid #c0c0c0;
        padding: 1px;
        flex-shrink: 0;
        border-radius: 2px;
    }

    .chat-avatar {
        width: 28px;
        height: 28px;
        display: block;
        object-fit: contain;
        background: transparent;
    }

    .line-body {
        flex: 1;
        min-width: 0;
    }

    .line-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 6px;
    }

    .handle-display {
        font-family: inherit;
        font-size: 11.5px;
        font-weight: bold;
        color: #000080;
    }

    .timestamp {
        font-size: 9.5px;
        color: #808080;
    }

    .line-text {
        font-size: 12px;
        color: #000000;
        word-break: break-word;
        margin-top: 1px;
        user-select: text;
    }

    .error-strip {
        background: #ffffe1;
        border: 1px solid #800000;
        color: #800000;
        font-size: 11px;
        padding: 3px 6px;
    }

    .emoji-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        padding: 4px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
    }

    .emoji-cell {
        padding: 2px 5px;
        font-size: 14px;
    }

    .chat-controls {
        flex-shrink: 0;
    }

    .composer-row {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .avatar-tag-indicator {
        width: 24px;
        height: 24px;
        border: 1px solid #808080;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .composer-avatar {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .msg-input {
        flex: 1;
        min-width: 0;
        height: 26px;
        box-sizing: border-box;
    }

    .send-btn {
        height: 26px;
        line-height: 1;
        padding: 0 12px;
    }

    /* Gating Boxes */
    .gate-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        gap: 8px;
    }

    .x-gate-box {
        background: #f2f2f2;
    }

    .avatar-gate-box {
        background: #ffffcc;
    }

    .gate-left {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
    }

    .gate-icon {
        font-size: 20px;
    }

    .gate-sub {
        margin: 2px 0 0;
        font-size: 10px;
        color: #555555;
    }

    .x-login-btn {
        background: #000000 !important;
        color: #ffffff !important;
        font-weight: bold;
        white-space: nowrap;
    }

    .pulse-btn {
        background: #000080 !important;
        color: #ffffff !important;
        font-weight: bold;
        white-space: nowrap;
    }

    .win98-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 3px 8px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
    }

    .win98-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 4px 7px 2px 9px;
    }

    .win98-btn.primary {
        font-weight: bold;
    }

    .win98-input {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 4px;
        background: #ffffff;
        font-family: inherit;
        font-size: 11px;
    }

    @media (max-width: 600px) {
        .bottom-right-chat-drawer {
            right: 4px;
            left: 4px;
            width: auto;
            max-width: none;
            height: 75vh;
        }
    }
</style>
