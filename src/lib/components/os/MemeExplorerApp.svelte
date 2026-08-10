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
        score?: number;
        upvotes?: number;
        downvotes?: number;
    };

    // State
    let memes = $state<Meme[]>([]);
    let selectedMeme = $state<Meme | null>(null);
    let isLoading = $state(true);
    let isLoadingMore = $state(false);
    let isMediaLoading = $state(false);
    let searchQuery = $state("");
    let filterType = $state<"photo" | "video">("photo");
    let sortBy = $state("popular");
    let errorMessage = $state("");
    let clipboardMessage = $state("");
    let hasMore = $state(true);

    // Export state
    let isExporting = $state(false);
    let exportProgress = $state(0);
    let exportStatusText = $state("");
    let totalExportCount = $state(0);

    let photoCount = $state(0);
    let videoCount = $state(0);
    let localVotes = $state<Record<string, number>>({});
    let deviceId = "";

    // Tagging System
    let isEditorAuthenticated = $state(false);
    let editingTagIndex = $state<number | null>(null);
    let editingTagValue = $state("");
    let tagInputRef: HTMLInputElement | null = $state(null);

    const pageSize = 30;
    const pageCache = new Map<string, Meme[]>();
    let searchTimeout: ReturnType<typeof setTimeout>;
    let clipboardTimeout: ReturnType<typeof setTimeout>;
    let activeFetchId = 0;
    let mediaGrid: HTMLDivElement;

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
    ];

    // === Bulk Export ===
    async function triggerBulkExport() {
        if (isExporting) return;

        isExporting = true;
        exportProgress = 0;
        exportStatusText = "Fetching list...";
        totalExportCount = 0;

        const btn = document.querySelector(".menu-btn");
        if (btn) btn.innerHTML = `<u>F</u>ile ▸ Zipping...`;

        try {
            const { downloadZip } = await import("client-zip");

            const allMemes: Meme[] = [];
            let offset = 0;
            const batchSize = 1000;

            while (true) {
                const url = `/api/memes?type=${filterType}&limit=${batchSize}&offset=${offset}`;
                const res = await fetch(url);
                if (!res.ok)
                    throw new Error(
                        `Failed to fetch batch at offset ${offset}`,
                    );

                const batch: Meme[] = await res.json();
                if (batch.length === 0) break;

                allMemes.push(...batch);
                offset += batch.length;
                exportStatusText = `Fetching list... (${allMemes.length} loaded)`;
            }

            totalExportCount = allMemes.length;
            exportStatusText = `Starting export of ${totalExportCount} files...`;

            if (totalExportCount === 0) {
                alert("No files to export.");
                return;
            }

            let processed = 0;

            async function* getFiles() {
                for (const meme of allMemes) {
                    processed++;
                    exportProgress = Math.round(
                        (processed / totalExportCount) * 100,
                    );
                    exportStatusText = `Downloading ${processed}/${totalExportCount}`;

                    try {
                        const proxyUrl = `/api/proxy?url=${encodeURIComponent(meme.url)}`;
                        const response = await fetch(proxyUrl);
                        if (!response.ok) continue;

                        yield {
                            name: `${meme.id}.${meme.type === "photo" ? "jpg" : "mp4"}`,
                            input: response,
                        };
                    } catch (e) {
                        console.warn("Skipped:", meme.url);
                    }
                }
            }

            exportStatusText = "Zipping files...";
            const zipResponse = downloadZip(getFiles());
            const blob = await zipResponse.blob();

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `uwu_${filterType}_archive.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(link.href);

            exportStatusText = "Done!";
            exportProgress = 100;
            await new Promise((r) => setTimeout(r, 1200));
        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed. Check console.");
        } finally {
            isExporting = false;
            exportProgress = 0;
            exportStatusText = "";
            totalExportCount = 0;
            if (btn) {
                btn.innerHTML = `<u>F</u>ile ▸ Export All ${filterType === "photo" ? "Photos" : "Videos"}`;
            }
        }
    }

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
        return `${filterType}:${sortBy}:${searchQuery.trim().toLowerCase()}:${offset}`;
    }

    async function fetchStats() {
        try {
            const res = await fetch("/api/memes/stats");
            if (res.ok) {
                const data = await res.json();
                photoCount = data.photo;
                videoCount = data.video;
            }
        } catch (err) {}
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
                let url = `/api/memes?type=${filterType}&sort=${sortBy}&limit=${pageSize}&offset=${offset}`;
                if (searchQuery.trim()) {
                    url += `&search=${encodeURIComponent(searchQuery.trim())}`;
                }

                const res = await fetch(url);
                if (!res.ok) throw new Error(`Request failed (${res.status})`);

                nextBatch = await res.json();
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

    function surpriseMe() {
        searchQuery =
            surpriseConcepts[
                Math.floor(Math.random() * surpriseConcepts.length)
            ];
        clearTimeout(searchTimeout);
        fetchMemes();
    }

    function setFilter(type: "photo" | "video") {
        if (filterType === type) return;
        filterType = type;
        searchQuery = ""; // Clear search when switching tabs
        memes = [];
        pageCache.clear();
        fetchMemes();
    }

    function onSortChange() {
        memes = [];
        pageCache.clear();
        fetchMemes();
    }

    function selectMeme(meme: Meme) {
        if (selectedMeme?.id === meme.id) return;
        isMediaLoading = true;
        meme.tags = meme.tags || [];
        selectedMeme = meme;
        editingTagIndex = null;

        requestAnimationFrame(() => {
            mediaGrid
                ?.querySelector(`[data-meme-id="${meme.id}"]`)
                ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
    }

    // === Tagging Logic ===
    async function authenticateEditor() {
        if (isEditorAuthenticated) return true;
        const pwd = prompt("Enter the Editor Password to modify tags:");
        if (!pwd) return false;

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pwd }),
            });
            if (res.ok) {
                isEditorAuthenticated = true;
                localStorage.setItem("uwu_editor_authed", "true");
                return true;
            } else {
                alert("Incorrect Password.");
                return false;
            }
        } catch (err) {
            alert("Authentication failed.");
            return false;
        }
    }

    async function startTagEdit(index: number) {
        const authed = await authenticateEditor();
        if (!authed || !selectedMeme) return;

        editingTagIndex = index;
        editingTagValue = selectedMeme.tags?.[index] || "";
        setTimeout(() => tagInputRef?.focus(), 10);
    }

    async function addBlankTag() {
        const authed = await authenticateEditor();
        if (!authed || !selectedMeme) return;

        selectedMeme.tags = selectedMeme.tags || [];
        selectedMeme.tags.push("");
        editingTagIndex = selectedMeme.tags.length - 1;
        editingTagValue = "";
        setTimeout(() => tagInputRef?.focus(), 10);
    }

    async function saveTag() {
        if (editingTagIndex === null || !selectedMeme) return;

        const updatedTags = [...(selectedMeme.tags || [])];
        const trimmedVal = editingTagValue.trim();

        if (trimmedVal === "") {
            updatedTags.splice(editingTagIndex, 1);
        } else {
            updatedTags[editingTagIndex] = trimmedVal;
        }

        selectedMeme.tags = updatedTags;
        editingTagIndex = null;

        try {
            await fetch("/api/memes/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meme_id: selectedMeme.id,
                    tags: updatedTags,
                }),
            });
        } catch (err) {
            console.error("Failed to save tags");
        }
    }
    async function deleteMeme() {
        const authed = await authenticateEditor();
        if (!authed || !selectedMeme) return;

        if (
            !confirm(
                "⚠️ WARNING: This will permanently delete this media from the Database. Are you absolutely sure?",
            )
        ) {
            return;
        }

        const idToDelete = selectedMeme.id;
        const btn = document.querySelector(".admin-delete-btn");
        if (btn) btn.innerHTML = "⏳";

        try {
            const res = await fetch("/api/memes/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meme_id: idToDelete }),
            });

            // Handle Ghost Sessions (401 Unauthorized)
            if (res.status === 401) {
                isEditorAuthenticated = false;
                localStorage.removeItem("uwu_editor_authed");
                alert(
                    "Session expired or missing secure cookie. Please click delete again to log in.",
                );
                if (btn) btn.innerHTML = "🗑️";
                return;
            }

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Unknown error");
            }

            // Remove from local grid without needing a page refresh
            memes = memes.filter((m) => m.id !== idToDelete);
            selectedMeme = memes.length > 0 ? memes[0] : null;

            if (filterType === "photo") photoCount--;
            else videoCount--;

            // Fix: Reset the button back to the dustbin on SUCCESS
            if (btn) btn.innerHTML = "🗑️";
        } catch (err: any) {
            alert("Failed to delete: " + err.message);
            if (btn) btn.innerHTML = "🗑️";
        }
    }

    async function deleteTag(index: number) {
        const authed = await authenticateEditor();
        if (!authed || !selectedMeme || !selectedMeme.tags) return;

        const updatedTags = [...selectedMeme.tags];
        updatedTags.splice(index, 1);
        selectedMeme.tags = updatedTags;
        editingTagIndex = null;

        try {
            await fetch("/api/memes/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meme_id: selectedMeme.id,
                    tags: updatedTags,
                }),
            });
        } catch (err) {
            console.error("Failed to delete tag");
        }
    }

    function handleTagKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") saveTag();
        if (e.key === "Escape") {
            if (selectedMeme?.tags?.[editingTagIndex!] === "") {
                selectedMeme.tags.splice(editingTagIndex!, 1);
            }
            editingTagIndex = null;
        }
    }

    // === Voting ===
    async function castVote(value: number) {
        if (!selectedMeme) return;

        const memeId = selectedMeme.id;
        if (!deviceId) {
            deviceId = crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2);
            localStorage.setItem("uwu_device_id", deviceId);
        }

        const isRemoving = localVotes[memeId] === value;
        const finalValue = isRemoving ? 0 : value;
        const previousVote = localVotes[memeId] || 0;

        localVotes[memeId] = finalValue;
        localStorage.setItem("uwu_votes", JSON.stringify(localVotes));

        if (previousVote === 1)
            selectedMeme.upvotes = Math.max(0, (selectedMeme.upvotes || 1) - 1);
        if (previousVote === -1)
            selectedMeme.downvotes = Math.max(
                0,
                (selectedMeme.downvotes || 1) - 1,
            );
        if (finalValue === 1)
            selectedMeme.upvotes = (selectedMeme.upvotes || 0) + 1;
        if (finalValue === -1)
            selectedMeme.downvotes = (selectedMeme.downvotes || 0) + 1;

        selectedMeme.score =
            (selectedMeme.upvotes || 0) - (selectedMeme.downvotes || 0);

        try {
            await fetch("/api/memes/vote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meme_id: memeId,
                    device_id: deviceId,
                    vote_value: finalValue,
                }),
            });
        } catch (err) {}
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
            const [randomMeme] = await res.json();
            if (randomMeme) {
                if (!memes.some((m) => m.id === randomMeme.id))
                    memes = [randomMeme, ...memes];
                selectMeme(randomMeme);
            }
        } catch (err) {
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
            link.href = blobUrl;
            link.download = `file_${selectedMeme.id.substring(0, 6)}.${selectedMeme.type === "photo" ? "png" : "mp4"}`;
            link.click();
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            window.open(selectedMeme.url, "_blank");
        } finally {
            if (btn) btn.innerText = "Download";
        }
    }

    async function copyToClipboard() {
        if (!selectedMeme) return;

        if (selectedMeme.type === "photo") {
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
            } else {
                // Handle Video Type
                try {
                    await navigator.clipboard.writeText(selectedMeme.url);
                    setClipboardMessage("Video link copied!");
                } catch (err) {
                    setClipboardMessage("Failed to copy link");
                }
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
                        pngBlob ? resolve(pngBlob) : reject(new Error("Err")),
                    "image/png",
                );
            };
            img.onerror = () => reject(new Error("Err"));
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
        if (distanceFromBottom < 160) fetchMemes({ append: true });
    }

    async function moveSelection(direction: 1 | -1) {
        if (memes.length === 0 || editingTagIndex !== null) return;

        const currentIndex = selectedIndex === -1 ? 0 : selectedIndex;
        const nextIndex = currentIndex + direction;

        if (nextIndex >= 0 && nextIndex < memes.length) {
            selectMeme(memes[nextIndex]);
            return;
        }

        if (direction === 1 && hasMore && !isLoadingMore) {
            const previousLength = memes.length;
            await fetchMemes({ append: true });
            if (memes.length > previousLength)
                selectMeme(memes[previousLength]);
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (editingTagIndex !== null) return;

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
        deviceId = localStorage.getItem("uwu_device_id") || "";
        const storedVotes = localStorage.getItem("uwu_votes");
        if (storedVotes) localVotes = JSON.parse(storedVotes);
        isEditorAuthenticated =
            localStorage.getItem("uwu_editor_authed") === "true";

        fetchStats();
        fetchMemes();
    });

    onDestroy(() => {
        clearTimeout(searchTimeout);
        clearTimeout(clipboardTimeout);
    });
</script>

<div class="app-container">
    <!-- Menubar -->
    <div class="win98-menubar">
        <button
            class="menu-btn"
            onclick={triggerBulkExport}
            disabled={isExporting}
        >
            <u>F</u>ile ▸ {isExporting
                ? "Zipping..."
                : `Export All ${filterType === "photo" ? "Photos" : "Videos"}`}
        </button>

        {#if isExporting}
            <div class="win98-progress-container">
                <div class="win98-progress">
                    <div
                        class="win98-progress-fill"
                        style="width: {exportProgress}%"
                    ></div>
                    <div
                        class="win98-progress-text"
                        class:white-text={exportProgress > 55}
                    >
                        {exportStatusText} ({exportProgress}%)
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <div class="explorer-layout">
        <!-- Gallery Pane -->
        <div class="gallery-pane win-panel">
            <div class="toolbar">
                <div class="tab-group">
                    <button
                        class="win-btn tab-btn {filterType === 'photo'
                            ? 'active'
                            : ''}"
                        onclick={() => setFilter("photo")}
                    >
                        Photos ({formatCount(photoCount)})
                    </button>
                    <button
                        class="win-btn tab-btn {filterType === 'video'
                            ? 'active'
                            : ''}"
                        onclick={() => setFilter("video")}
                    >
                        Videos ({formatCount(videoCount)})
                    </button>
                </div>
                <select
                    class="win-input sort-dropdown"
                    bind:value={sortBy}
                    onchange={onSortChange}
                >
                    <option value="popular">⭐ Popular</option>
                    <option value="newest">🕒 Newest</option>
                    <option value="oldest">🕰️ Oldest</option>
                </select>
            </div>

            <div
                class="media-grid win-inset"
                bind:this={mediaGrid}
                tabindex="0"
                role="listbox"
                onscroll={handleGridScroll}
                onkeydown={handleKeydown}
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
                                <video
                                    src={`${meme.url}#t=0.001`}
                                    muted
                                    preload="metadata"
                                    playsinline
                                    webkit-playsinline
                                />
                            {/if}
                            {#if meme.score && meme.score > 0}
                                <div class="mini-score">⭐ {meme.score}</div>
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

            <!-- Search Bar (Now available for both Photos and Videos) -->
            <div class="search-container">
                <div class="search-header">
                    <span class="search-label">
                        {filterType === "photo" ? "Search:" : "Search tags:"}
                    </span>

                    {#if filterType === "photo"}
                        <button
                            class="win-btn surprise-btn"
                            onclick={surpriseMe}
                            title="Auto-fill a random idea"
                        >
                            🎲 Random Idea
                        </button>
                    {/if}
                </div>

                <input
                    type="text"
                    class="win-input"
                    placeholder={filterType === "photo"
                        ? "e.g. funny cat wearing glasses..."
                        : "Search by tag (e.g. cat, funny, meme)"}
                    bind:value={searchQuery}
                    oninput={handleSearch}
                />
            </div>
        </div>

        <!-- Preview Pane -->
        <div
            class="preview-pane win-panel {selectedMeme ? 'has-selection' : ''}"
        >
            <div class="preview-display win-inset">
                {#if selectedMeme}
                    <button
                        class="admin-delete-btn"
                        title="Delete Meme (Admin Only)"
                        onclick={deleteMeme}
                    >
                        🗑️
                    </button>
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

                    <div
                        class="tags-overlay"
                        title="Meme Tags: Click a tag to edit, or click '+' to add a new one."
                    >
                        {#each selectedMeme.tags || [] as tag, i}
                            {#if editingTagIndex === i}
                                <input
                                    bind:this={tagInputRef}
                                    type="text"
                                    class="tag-input"
                                    bind:value={editingTagValue}
                                    onblur={saveTag}
                                    onkeydown={handleTagKeydown}
                                />
                            {:else}
                                <div class="tag-group">
                                    <button
                                        class="tag-badge"
                                        onclick={() => startTagEdit(i)}
                                        title="Click to edit: {tag}"
                                    >
                                        {tag}
                                    </button>
                                    <button
                                        class="tag-delete"
                                        onclick={() => deleteTag(i)}
                                        title="Delete tag">×</button
                                    >
                                </div>
                            {/if}
                        {/each}

                        {#if editingTagIndex !== (selectedMeme.tags?.length || 0)}
                            <button
                                class="tag-add-btn"
                                onclick={addBlankTag}
                                title="Add new tag">+</button
                            >
                        {/if}
                    </div>
                {:else}
                    <div class="loading-state">Select a file to preview</div>
                {/if}

                {#if clipboardMessage}
                    <span class="clipboard-status" in:fade
                        >{clipboardMessage}</span
                    >
                {/if}
            </div>

            <div class="action-bar">
                <div class="vote-controls">
                    <button
                        class="win-btn vote-btn {selectedMeme &&
                        localVotes[selectedMeme.id] === 1
                            ? 'active-up'
                            : ''}"
                        disabled={!selectedMeme}
                        onclick={() => castVote(1)}
                        title="Upvote"
                    >
                        ▲ {selectedMeme?.upvotes || 0}
                    </button>
                    <button
                        class="win-btn vote-btn {selectedMeme &&
                        localVotes[selectedMeme.id] === -1
                            ? 'active-down'
                            : ''}"
                        disabled={!selectedMeme}
                        onclick={() => castVote(-1)}
                        title="Downvote"
                    >
                        ▼ {selectedMeme?.downvotes || 0}
                    </button>
                </div>

                <button
                    id="download-btn"
                    class="win-btn action-btn"
                    disabled={!selectedMeme}
                    onclick={downloadMeme}
                >
                    Download
                </button>


                    <button
                        class="win-btn action-btn primary-action"
                        disabled={!selectedMeme}
                        onclick={copyToClipboard}
                    >
                        Copy Url
                    </button>

            </div>
        </div>
    </div>
</div>

<style>
    /* === Windows 98 Progress Bar === */
    .win98-progress-container {
        display: flex;
        align-items: center;
        margin-left: 12px;
        flex: 1;
        max-width: 280px;
    }

    .win98-progress {
        position: relative;
        width: 100%;
        max-width: 260px;
        height: 18px;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        box-shadow: inset 1px 1px #dfdfdf;
        overflow: hidden;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
    }

    .win98-progress-fill {
        height: 100%;
        background: #000080;
        transition: width 120ms linear;
        box-shadow: inset 0 0 0 1px #4040a0;
    }

    .win98-progress-text {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        color: #000000;
        text-shadow: 1px 1px #ffffff;
        pointer-events: none;
        white-space: nowrap;
        padding: 0 4px;
        transition: color 150ms ease;
    }

    .win98-progress-text.white-text {
        color: #ffffff;
        text-shadow: 1px 1px #000000;
        mix-blend-mode: difference;
    }

    .win98-progress::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        box-shadow: inset -1px -1px #c0c0c0;
        pointer-events: none;
    }

    /* Classic Windows 98 Layout */
    .app-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: #c0c0c0;
    }

    .win98-menubar {
        display: flex;
        padding: 2px 4px;
        border-bottom: 1px solid #808080;
        box-shadow: 0 1px 0 #ffffff;
    }

    .menu-btn {
        background: transparent;
        border: none;
        padding: 2px 6px;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
        font-size: 11px;
        cursor: pointer;
        color: #000000;
    }

    .menu-btn:hover:not(:disabled) {
        background: #000080;
        color: #ffffff;
    }

    .menu-btn:disabled {
        color: #808080;
        cursor: wait;
    }

    .explorer-layout {
        display: flex;
        flex-direction: row;
        flex: 1;
        width: 100%;
        gap: 10px;
        padding: 8px;
        box-sizing: border-box;
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
        gap: 6px;
    }

    .tab-group {
        display: flex;
        gap: 4px;
        flex: 1;
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

    .sort-dropdown {
        width: auto;
        padding: 0 4px;
        height: 25px;
        font-size: 11px;
        cursor: pointer;
        background: #ffffff;
    }

    .action-bar {
        display: flex;
        width: 100%;
        gap: 6px;
        padding: 4px 0 0;
    }

    .vote-controls {
        display: flex;
        gap: 4px;
        margin-right: auto;
    }

    .vote-btn {
        font-size: 11px;
        padding: 6px 10px;
        font-weight: bold;
    }

    .vote-btn.active-up {
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 1px 1px #808080;
        background: #dfdfdf;
        color: #008000;
        padding: 7px 9px 5px 11px;
    }

    .vote-btn.active-down {
        border-color: #000000 #ffffff #ffffff #000000;
        box-shadow: inset 1px 1px #808080;
        background: #dfdfdf;
        color: #b22222;
        padding: 7px 9px 5px 11px;
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

    .mini-score {
        position: absolute;
        top: 2px;
        right: 2px;
        background: rgba(0, 0, 0, 0.6);
        color: yellow;
        font-size: 9px;
        padding: 1px 4px;
        font-weight: bold;
    }

    .search-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 4px;
    }

    .search-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
    }

    .search-label {
        font-size: 12px;
        padding-bottom: 2px;
    }

    .surprise-btn {
        padding: 2px 6px;
        font-size: 10px;
        font-weight: normal;
        min-height: 20px;
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

    .loading-state {
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

    /* Tags Overlay */
    .tags-overlay {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        pointer-events: auto;
    }

    .tag-group {
        display: flex;
        opacity: 0.65;
        transition: opacity 0.15s ease;
        box-shadow: 1px 1px 0px rgba(0, 0, 0, 0.5);
    }

    .tag-group:hover {
        opacity: 1;
    }

    .tag-badge {
        background: #ffffcc;
        border: 1px solid #808000;
        border-right: none;
        color: #000000;
        font-family: monospace;
        font-size: 11px;
        padding: 2px 6px;
        cursor: pointer;
        transition: background 0.1s;
    }

    .tag-badge:hover {
        background: #000080;
        color: #ffffff;
        border-color: #ffffff;
        border-right: none;
    }

    .tag-delete {
        background: #ffffcc;
        border: 1px solid #808000;
        color: #000000;
        font-family: monospace;
        font-size: 12px;
        font-weight: bold;
        padding: 0 4px;
        cursor: pointer;
        transition: background 0.1s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tag-delete:hover {
        background: #cc0000;
        color: #ffffff;
        border-color: #ffffff;
    }

    .tag-add-btn {
        background: #c0c0c0;
        border: 1px solid #ffffff;
        border-right-color: #000000;
        border-bottom-color: #000000;
        font-weight: bold;
        padding: 0 6px;
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.15s ease;
    }

    .tag-add-btn:hover {
        opacity: 1;
    }

    .tag-add-btn:active {
        border: 1px solid #000000;
        border-right-color: #ffffff;
        border-bottom-color: #ffffff;
    }

    .tag-input {
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        font-family: monospace;
        font-size: 11px;
        padding: 1px 4px;
        width: 80px;
        outline: none;
    }
    /* Admin Dustbin Button */
    .admin-delete-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 20;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
        padding: 4px;
        font-size: 16px;
        opacity: 0.5;
        transition:
            opacity 0.2s,
            background 0.2s;
    }

    .admin-delete-btn:hover {
        opacity: 1;
        background: #dfdfdf;
    }

    .admin-delete-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 5px 3px 3px 5px; /* Creates the hardware 'pushed down' effect */
    }

    /* Mobile Overrides */
    @media (max-width: 768px) {
        .win98-menubar {
            display: none !important;
        }
        .tags-overlay {
            display: none !important;
        }
        .explorer-layout {
            flex-direction: column !important;
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
            flex-wrap: wrap;
        }
        .action-btn {
            flex: 1;
            min-width: 0;
        }
    }
</style>
