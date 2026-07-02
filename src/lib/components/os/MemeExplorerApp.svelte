<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { blur, fade } from "svelte/transition";

    type Meme = {
        id: string;
        url: string;
        type: "photo" | "video";
        caption?: string | null;
        tags?: string[] | null;
        created_at?: string;
    };

    let memes = $state<Meme[]>([]);
    let selectedMeme = $state<Meme | null>(null);
    let isLoading = $state(true);
    let isLoadingMore = $state(false);
    let isMediaLoading = $state(false);
    let searchQuery = $state("");
    let filterType = $state<"photo" | "video">("photo");
    let errorMessage = $state("");
    let clipboardMessage = $state("");
    let hasMore = $state(true);

    let photoCount = $state(0);
    let videoCount = $state(0);

    const pageSize = 30;
    const pageCache = new Map<string, Meme[]>();
    let searchTimeout: ReturnType<typeof setTimeout>;
    let clipboardTimeout: ReturnType<typeof setTimeout>;
    let activeFetchId = 0;
    let mediaGrid: HTMLDivElement;

    // A massive pool of concepts to feed the semantic AI
    const surpriseConcepts = [
        "majestic animal",
        "dangerous weapon",
        "crying and sad",
        "eating food",
        "funny text",
        "chaotic energy",
        "floating in space",
        "wearing sunglasses",
        "angry glaring",
        "deep fried meme",
        "laser eyes",
        "holding a gun",
        "drinking coffee",
        "driving a car",
        "glitchy matrix",
        "pixel art style",
        "screaming loudly",
        "confused math lady",
        "this is fine dog",
        "pepe the frog vibes",
        "chad energy",
        "doomer vibes",
        "nostalgic 90s",
        "vaporwave aesthetic",
        "creepy cursed image",
        "blurry cryptid",
        "glowing aura",
        "holding a sword",
        "riding a skateboard",
        "doing a kickflip",
        "in a bubble",
        "wearing a hat",
        "smoking a cigar",
        "boss music playing",
        "anime betrayal",
        "epic handshake",
        "spider-man pointing",
        "cat sitting on keyboard",
        "doge stare",
        "stonks going up",
        "panik kalm",
        "brain expanding",
        "hiding in the bushes",
        "looking through window",
        "pointing at screen",
        "sweating nervously",
        "galaxy brain",
        "sigma male grindset",
        "typing fast",
        "hacker man",
        "sleeping peacefully",
        "waking up in a cold sweat",
        "disgusted face",
        "smug grin",
        "t-posing to assert dominance",
        "running away",
        "chasing someone",
        "explosion in the background",
        "wearing medieval armor",
        "cyberpunk neon city",
        "wizard casting a spell",
        "goth aesthetic",
        "cottagecore vibes",
        "money flying everywhere",
        "police lights",
        "alien invasion",
        "romantic sunset",
        "rainy day window",
        "dancing aggressively",
        "playing a guitar",
        "reading a book",
        "stuck in a box",
    ];

    const selectedIndex = $derived(
        selectedMeme
            ? memes.findIndex((meme) => meme.id === selectedMeme?.id)
            : -1,
    );

    function formatCount(num: number) {
        if (num === 0) return "...";
        return num > 999 ? (num / 1000).toFixed(1) + "k" : num.toString();
    }

    function getCacheKey(offset: number) {
        return `${filterType}:${searchQuery.trim().toLowerCase()}:${offset}`;
    }

    async function fetchStats() {
        try {
            const res = await fetch("/api/memes/stats");
            if (res.ok) {
                const data = await res.json();
                photoCount = data.photo;
                videoCount = data.video;
            }
        } catch (err) {
            console.error("Failed to load stats", err);
        }
    }

    async function fetchMemes({ append = false } = {}) {
        const fetchId = ++activeFetchId;
        const offset = append ? memes.length : 0;
        const cacheKey = getCacheKey(offset);

        if (append) {
            if (isLoadingMore || !hasMore) return;
            isLoadingMore = true;
        } else {
            isLoading = true;
            hasMore = true;
        }
        errorMessage = "";

        try {
            let nextBatch = pageCache.get(cacheKey);

            if (!nextBatch) {
                let url = `/api/memes?type=${filterType}&limit=${pageSize}&offset=${offset}`;
                if (searchQuery.trim()) {
                    url += `&search=${encodeURIComponent(searchQuery.trim())}`;
                }

                const res = await fetch(url);
                if (!res.ok) throw new Error(`Request failed (${res.status})`);

                const rawData = await res.json();
                if (!Array.isArray(rawData)) {
                    const weirdDataString = JSON.stringify(rawData);
                    throw new Error(
                        rawData?.error ??
                            `API sent bad data: ${weirdDataString}`,
                    );
                }

                nextBatch = rawData;
                pageCache.set(cacheKey, nextBatch);
            }

            if (fetchId !== activeFetchId) return;

            const newItems = nextBatch.filter(
                (newItem) =>
                    !memes.some((existing) => existing.id === newItem.id),
            );

            if (append) {
                if (newItems.length === 0) hasMore = false;
                else memes = [...memes, ...newItems];
            } else {
                memes = nextBatch;
            }

            hasMore =
                nextBatch.length === pageSize &&
                (append ? newItems.length > 0 : true);

            if (
                memes.length > 0 &&
                (!selectedMeme ||
                    selectedMeme.type !== filterType ||
                    !memes.some((meme) => meme.id === selectedMeme?.id))
            ) {
                selectMeme(memes[0]);
            } else if (memes.length === 0) {
                selectedMeme = null;
            }
        } catch (err) {
            if (fetchId !== activeFetchId) return;
            console.error("[MemeExplorer] Error:", err);
            memes = [];
            selectedMeme = null;
            errorMessage =
                err instanceof Error ? err.message : "Could not load data.";
        } finally {
            if (fetchId === activeFetchId) {
                isLoading = false;
                isLoadingMore = false;
            }
        }
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => fetchMemes(), 350);
    }

    // Instantly selects a random vibe and searches it
    function surpriseMe() {
        const randomConcept =
            surpriseConcepts[
                Math.floor(Math.random() * surpriseConcepts.length)
            ];
        searchQuery = randomConcept;
        clearTimeout(searchTimeout); // Bypass the debounce delay
        fetchMemes();
    }

    function setFilter(type: "photo" | "video") {
        if (filterType === type) return;

        filterType = type;

        if (type === "video") {
            searchQuery = "";
        }

        fetchMemes();
    }

    function selectMeme(meme: Meme) {
        if (selectedMeme?.id === meme.id) return;
        isMediaLoading = true;
        selectedMeme = meme;
        requestAnimationFrame(() => {
            mediaGrid
                ?.querySelector(`[data-meme-id="${meme.id}"]`)
                ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
    }

    async function pickRandom() {
        const total = filterType === "photo" ? photoCount : videoCount;
        if (total === 0) return;

        isMediaLoading = true;
        const randomOffset = Math.floor(Math.random() * total);

        const btn = document.getElementById("random-btn");
        if (btn) btn.innerText = "Rolling...";

        try {
            const url = `/api/memes?type=${filterType}&limit=1&offset=${randomOffset}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Random fetch failed");

            const [randomMeme] = await res.json();

            if (randomMeme) {
                if (!memes.some((m) => m.id === randomMeme.id)) {
                    memes = [randomMeme, ...memes];
                }
                selectMeme(randomMeme);
            }
        } catch (err) {
            console.error("[MemeExplorer] Random pick failed:", err);
        } finally {
            if (btn) btn.innerText = "Random";
        }
    }

    async function downloadMeme() {
        if (!selectedMeme) return;
        const btn = document.getElementById("download-btn");
        if (btn) btn.innerText = "Downloading...";

        try {
            const res = await fetch(selectedMeme.url);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.style.display = "none";
            link.href = blobUrl;
            const ext = selectedMeme.type === "photo" ? "png" : "mp4";
            link.download = `file_${selectedMeme.id.substring(0, 6)}.${ext}`;

            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            window.open(selectedMeme.url, "_blank");
        } finally {
            if (btn) btn.innerText = "Download";
        }
    }

    async function copyToClipboard() {
        if (!selectedMeme || selectedMeme.type !== "photo") return;
        try {
            const response = await fetch(selectedMeme.url);
            const blob = await response.blob();
            const imageBlob =
                blob.type === "image/png"
                    ? blob
                    : await convertImageToPng(blob);

            await navigator.clipboard.write([
                new ClipboardItem({ [imageBlob.type]: imageBlob }),
            ]);
            setClipboardMessage("Image copied!");
        } catch (err) {
            await navigator.clipboard.writeText(selectedMeme.url);
            setClipboardMessage("Link copied instead");
        }
    }

    function convertImageToPng(blob: Blob) {
        return new Promise<Blob>((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);

            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext("2d")?.drawImage(img, 0, 0);
                URL.revokeObjectURL(objectUrl);
                canvas.toBlob(
                    (pngBlob) =>
                        pngBlob
                            ? resolve(pngBlob)
                            : reject(new Error("Could not prepare image.")),
                    "image/png",
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Could not load image."));
            };
            img.src = objectUrl;
        });
    }

    function setClipboardMessage(message: string) {
        clipboardMessage = message;
        clearTimeout(clipboardTimeout);
        clipboardTimeout = setTimeout(() => {
            clipboardMessage = "";
        }, 1800);
    }

    function handleGridScroll() {
        if (!mediaGrid || isLoading || isLoadingMore || !hasMore) return;
        const distanceFromBottom =
            mediaGrid.scrollHeight -
            mediaGrid.scrollTop -
            mediaGrid.clientHeight;
        if (distanceFromBottom < 160) {
            fetchMemes({ append: true });
        }
    }

    async function moveSelection(direction: 1 | -1) {
        if (memes.length === 0) return;
        const currentIndex = selectedIndex === -1 ? 0 : selectedIndex;
        const nextIndex = currentIndex + direction;

        if (nextIndex >= 0 && nextIndex < memes.length) {
            selectMeme(memes[nextIndex]);
            return;
        }

        if (direction === 1 && hasMore && !isLoadingMore) {
            const previousLength = memes.length;
            await fetchMemes({ append: true });
            if (memes.length > previousLength) {
                selectMeme(memes[previousLength]);
            }
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        const keyMap: Record<string, 1 | -1> = {
            ArrowRight: 1,
            ArrowDown: 1,
            ArrowLeft: -1,
            ArrowUp: -1,
        };
        const direction = keyMap[event.key];
        if (!direction) return;

        event.preventDefault();
        moveSelection(direction);
    }

    onMount(() => {
        fetchStats();
        fetchMemes();
    });

    onDestroy(() => {
        clearTimeout(searchTimeout);
        clearTimeout(clipboardTimeout);
    });
</script>

<div class="explorer-layout">
    <div class="gallery-pane win-panel">
        <div class="toolbar">
            <button
                class="win-btn tab-btn {filterType === 'photo' ? 'active' : ''}"
                onclick={() => setFilter("photo")}
                >Photos ({formatCount(photoCount)})</button
            >
            <button
                class="win-btn tab-btn {filterType === 'video' ? 'active' : ''}"
                onclick={() => setFilter("video")}
                >Videos ({formatCount(videoCount)})</button
            >
        </div>

        <div
            class="media-grid win-inset"
            bind:this={mediaGrid}
            tabindex="0"
            role="listbox"
            onscroll={handleGridScroll}
            onkeydown={handleKeydown}
            aria-label="Media files"
            aria-activedescendant={selectedMeme?.id}
        >
            {#if isLoading}
                <div class="loading-state" in:fade>Loading...</div>
            {:else if errorMessage}
                <div class="loading-state">{errorMessage}</div>
            {:else if memes.length === 0}
                <div class="loading-state">No files found.</div>
            {:else}
                {#each memes as meme (meme.id)}
                    <button
                        type="button"
                        class="grid-item {selectedMeme?.id === meme.id
                            ? 'selected'
                            : ''}"
                        onclick={() => selectMeme(meme)}
                    >
                        {#if meme.type === "photo"}
                            <img src={meme.url} alt="Thumbnail" />
                        {:else}
                            <video src={meme.url} muted preload="metadata" />
                        {/if}
                    </button>
                {/each}
                {#if isLoadingMore}
                    <div class="loading-more">Loading more...</div>
                {:else if !hasMore}
                    <div class="loading-more">End of folder</div>
                {/if}
            {/if}
        </div>
        {#if filterType === "photo"}
            <div class="search-container">
                <span class="search-label">Search:</span>
                <input
                    type="text"
                    class="win-input"
                    placeholder="e.g. funny cat wearing glasses..."
                    bind:value={searchQuery}
                    oninput={handleSearch}
                />
                <button class="win-btn surprise-btn" onclick={surpriseMe}
                    >✨ Surprise Me!</button
                >
            </div>
        {/if}
    </div>

    <div class="preview-pane win-panel {selectedMeme ? 'has-selection' : ''}">
        <div class="preview-display win-inset">
            {#if selectedMeme}
                <div class="media-wrapper">
                    {#if selectedMeme.type === "photo"}
                        <img
                            class:is-blur={isMediaLoading}
                            src={selectedMeme.url}
                            alt="Selected media"
                            onload={() => (isMediaLoading = false)}
                        />
                    {:else}
                        <video
                            class:is-blur={isMediaLoading}
                            src={selectedMeme.url}
                            controls
                            autoplay
                            loop
                            onloadeddata={() => (isMediaLoading = false)}
                        ></video>
                    {/if}
                </div>
            {:else}
                <div class="loading-state">Select a file to preview</div>
            {/if}

            {#if clipboardMessage}
                <span class="clipboard-status" in:fade>{clipboardMessage}</span>
            {/if}
        </div>

        <div class="action-bar">
            <button
                id="download-btn"
                class="win-btn action-btn"
                disabled={!selectedMeme}
                onclick={downloadMeme}>Download</button
            >

            {#if filterType === "photo"}
                <button
                    id="random-btn"
                    class="win-btn action-btn"
                    disabled={memes.length === 0}
                    onclick={pickRandom}>Random</button
                >
            {/if}

            {#if selectedMeme?.type === "photo"}
                <button
                    class="win-btn action-btn primary-action"
                    disabled={!selectedMeme}
                    onclick={copyToClipboard}>Copy Image</button
                >
            {/if}
        </div>
    </div>
</div>

<style>
    /* Classic Windows 98 Layout */
    .explorer-layout {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
        gap: 10px;
        padding: 8px;
        box-sizing: border-box;
        background: #c0c0c0;
        overflow: hidden;
    }

    .win-panel {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
    }

    .gallery-pane {
        flex: 0 0 34%;
        min-width: 250px;
    }

    .preview-pane {
        flex: 1;
        border: 2px solid transparent;
        box-sizing: border-box;
        padding: 2px;
        transition:
            background 120ms ease,
            border-color 120ms ease;
    }

    .preview-pane.has-selection {
        border-color: #000080 #ffffff #ffffff #000080;
        background: #d7d7d7;
    }

    .win-inset {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        background: #ffffff;
    }

    .win-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 4px 12px;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
        font-size: 12px;
        cursor: pointer;
        box-shadow:
            inset 1px 1px #dfdfdf,
            inset -1px -1px #808080;
    }

    .win-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 1px 1px #808080;
        padding: 5px 11px 3px 13px;
        background: #dfdfdf;
    }

    .win-btn:disabled {
        color: #808080;
        text-shadow: 1px 1px #ffffff;
        cursor: not-allowed;
    }

    .win-input {
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 6px;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
        width: 100%;
        box-sizing: border-box;
    }

    .toolbar {
        display: flex;
        width: 100%;
        gap: 4px;
    }

    .tab-btn {
        flex: 1;
        font-weight: bold;
    }

    .tab-btn.active {
        background: #000080;
        color: white;
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 2px 2px #000040;
    }

    .action-bar {
        display: flex;
        width: 100%;
        gap: 6px;
        padding: 4px 0 0;
    }

    .action-btn {
        flex: 1;
        min-width: 0;
        min-height: 34px;
        font-size: 13px;
        font-weight: bold;
        padding: 7px 14px;
        white-space: nowrap;
    }

    .primary-action {
        background: #000080;
        border-color: #9ea7ff #000000 #000000 #9ea7ff;
        color: #ffffff;
        text-shadow: 1px 1px #000000;
    }

    .primary-action:disabled {
        background: #c0c0c0;
        color: #808080;
        text-shadow: 1px 1px #ffffff;
    }

    .clipboard-status {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 10;
        background: #ffffcc;
        border: 1px solid #808000;
        color: #000000;
        font-size: 11px;
        padding: 4px 8px;
        box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);
    }

    .media-grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
        grid-auto-rows: 88px;
        align-content: start;
        gap: 8px;
        padding: 8px;
        overflow-y: auto;
        min-height: 0;
        outline: none;
    }

    .grid-item {
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        height: 88px;
        width: 100%;
        background: #e0e0e0;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        padding: 0;
        box-shadow: inset 1px 1px #f4f4f4;
    }

    .grid-item.selected {
        background: #000080;
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow:
            inset 1px 1px #000040,
            0 0 0 2px #ffff00;
    }

    .grid-item img,
    .grid-item video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
    }

    .grid-item.selected img {
        opacity: 0.76;
    }

    .video-icon {
        font-size: 12px;
        font-weight: bold;
        color: #333;
        display: grid;
        height: 100%;
        place-items: center;
    }

    .grid-item.selected .video-icon {
        color: white;
    }

    .search-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .search-label {
        font-size: 12px;
    }

    .surprise-btn {
        margin-top: 4px;
        font-weight: bold;
        padding: 6px;
    }

    .preview-display {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #000000;
        min-height: 0;
    }

    .media-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .media-wrapper img,
    .media-wrapper video {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        transition:
            filter 0.4s ease-out,
            opacity 0.4s ease-out;
    }
    .is-blur {
        filter: blur(15px);
        opacity: 0.4;
    }
    .loading-state,
    .loading-overlay {
        position: absolute;
        color: #808080;
        font-size: 14px;
    }

    .loading-more {
        grid-column: 1 / -1;
        color: #404040;
        font-size: 12px;
        padding: 6px;
        text-align: center;
    }

    .loading-overlay {
        background: rgba(255, 255, 255, 0.7);
        padding: 4px 8px;
        border: 1px solid #000;
        color: #000;
    }

    @media (max-width: 768px) {
        .explorer-layout {
            flex-direction: column;
            height: calc(100dvh - 35px);
            padding-bottom: 35px;
            overflow: hidden;
            box-sizing: border-box;
        }

        .gallery-pane {
            flex: none;
            height: 45%;
            min-height: 200px;
        }

        .preview-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .preview-display {
            flex: 1;
            min-height: 0;
        }

        .action-bar {
            flex-shrink: 0;
            justify-content: stretch;
            padding-bottom: 4px;
        }

        .action-btn {
            flex: 1;
            min-width: 0;
        }
    }
</style>
