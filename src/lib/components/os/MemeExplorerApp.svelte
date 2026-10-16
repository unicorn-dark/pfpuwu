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
    let sortBy = $state("random");
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

    // Reels & View State
    let isMobile = $state(false);
    let viewMode = $state<"split" | "grid" | "reels">("split");
    let sessionSeed = $state(Math.floor(Math.random() * 1000000));
    let activeReelIndex = $state(0);
    let isMuted = $state(true);
    let showReelsSearch = $state(false);
    let downloadingId = $state<string | null>(null);
    let doubleTapAnimation = $state<{ id: string; x: number; y: number } | null>(null);

    let reelsContainer: HTMLDivElement | null = $state(null);
    const videoElements = new Map<string, HTMLVideoElement>();
    let reelsObserver: IntersectionObserver | null = null;

    // Gesture detection
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;
    let tapTimeout: ReturnType<typeof setTimeout> | null = null;

    // Tagging System
    let isEditorAuthenticated = $state(false);
    let editingTagIndex = $state<number | null>(null);
    let editingTagValue = $state("");
    let tagInputRef: HTMLInputElement | null = $state(null);

    const pageSize = 40;
    const pageCache = new Map<string, Meme[]>();
    let searchTimeout: ReturnType<typeof setTimeout>;
    let clipboardTimeout: ReturnType<typeof setTimeout>;
    let activeFetchId = 0;
    let mediaGrid = $state<HTMLDivElement | null>(null);

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

    // === Bulk Export (Optimized 6-Worker Sliding Concurrency) ===
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
                exportStatusText = `Listing files (${allMemes.length})...`;
            }

            totalExportCount = allMemes.length;
            if (totalExportCount === 0) {
                alert("No files to export.");
                return;
            }

            exportStatusText = `Archiving 0/${totalExportCount}...`;

            // Sliding window concurrent downloader (concurrency: 6)
            async function* getConcurrentFiles(items: Meme[], concurrency = 6) {
                let nextIdx = 0;
                let completed = 0;

                async function fetchItem(meme: Meme) {
                    let response: Response;
                    try {
                        response = await fetch(meme.url);
                        if (!response.ok) throw new Error("Direct fetch failed");
                    } catch {
                        const proxyUrl = `/api/proxy?url=${encodeURIComponent(meme.url)}`;
                        response = await fetch(proxyUrl);
                    }
                    if (!response.ok) throw new Error("Failed to fetch");
                    return {
                        name: `${meme.id}.${meme.type === "photo" ? "jpg" : "mp4"}`,
                        input: response,
                    };
                }

                const executing = new Map<number, Promise<any>>();

                while (nextIdx < items.length || executing.size > 0) {
                    while (executing.size < concurrency && nextIdx < items.length) {
                        const current = nextIdx++;
                        const meme = items[current];
                        const p = fetchItem(meme).catch((err) => {
                            console.warn("Skipped:", meme.url, err);
                            return null;
                        });
                        executing.set(current, p);
                    }

                    const oldestIdx = Math.min(...executing.keys());
                    const result = await executing.get(oldestIdx)!;
                    executing.delete(oldestIdx);

                    completed++;
                    exportProgress = Math.round(
                        (completed / totalExportCount) * 100,
                    );
                    exportStatusText = `Downloading ${completed}/${totalExportCount}`;

                    if (result) {
                        yield result;
                    }
                }
            }

            exportStatusText = "Zipping files...";
            const zipResponse = downloadZip(getConcurrentFiles(allMemes, 6));
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
        return `${filterType}:${sortBy}:${sortBy === "random" ? sessionSeed : ""}:${searchQuery.trim().toLowerCase()}:${offset}`;
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
            let nextBatch: Meme[] | undefined = pageCache.get(cacheKey);

            if (!nextBatch) {
                let url = `/api/memes?type=${filterType}&sort=${sortBy}&limit=${pageSize}&offset=${offset}`;
                if (sortBy === "random") {
                    url += `&seed=${sessionSeed}`;
                }
                if (searchQuery.trim()) {
                    url += `&search=${encodeURIComponent(searchQuery.trim())}`;
                }

                const res = await fetch(url);
                if (!res.ok) throw new Error(`Request failed (${res.status})`);

                const fetched: Meme[] = await res.json();
                nextBatch = fetched;
                pageCache.set(cacheKey, fetched);
            }

            if (fetchId !== activeFetchId || !nextBatch) return;

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
                checkGridAutoFill();
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
        if (sortBy === "random") {
            sessionSeed = Math.floor(Math.random() * 1000000);
        }
        memes = [];
        activeReelIndex = 0;
        fetchMemes();
        if (reelsContainer) {
            reelsContainer.scrollTop = 0;
        }
    }

    function onSortChange() {
        if (sortBy === "random") {
            sessionSeed = Math.floor(Math.random() * 1000000);
        }
        memes = [];
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
    async function castVote(value: number, targetMeme: Meme | null = selectedMeme) {
        if (!targetMeme) return;

        const memeId = targetMeme.id;
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
            targetMeme.upvotes = Math.max(0, (targetMeme.upvotes || 1) - 1);
        if (previousVote === -1)
            targetMeme.downvotes = Math.max(
                0,
                (targetMeme.downvotes || 1) - 1,
            );
        if (finalValue === 1)
            targetMeme.upvotes = (targetMeme.upvotes || 0) + 1;
        if (finalValue === -1)
            targetMeme.downvotes = (targetMeme.downvotes || 0) + 1;

        targetMeme.score =
            (targetMeme.upvotes || 0) - (targetMeme.downvotes || 0);

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
                const newIdx = memes.findIndex((m) => m.id === randomMeme.id);
                if (newIdx !== -1) {
                    activeReelIndex = newIdx;
                    requestAnimationFrame(() => {
                        const card = reelsContainer?.querySelector(`[data-index="${newIdx}"]`);
                        card?.scrollIntoView({ behavior: "smooth", block: "center" });
                        handleVideoPlayback(newIdx);
                    });
                }
            }
        } catch (err) {
        } finally {
            if (btn) btn.innerText = "Random";
        }
    }

    async function downloadMeme(targetMeme: Meme | null = selectedMeme) {
        if (!targetMeme) return;
        downloadingId = targetMeme.id;
        const btn = document.getElementById("download-btn");
        if (btn && targetMeme.id === selectedMeme?.id) btn.innerText = "Downloading...";

        try {
            const res = await fetch(targetMeme.url);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = `uwu_${targetMeme.id.substring(0, 8)}.${targetMeme.type === "photo" ? "png" : "mp4"}`;
            link.click();
            window.URL.revokeObjectURL(blobUrl);
            setClipboardMessage("Saved to downloads!");
        } catch (err) {
            window.open(targetMeme.url, "_blank");
        } finally {
            downloadingId = null;
            if (btn && targetMeme.id === selectedMeme?.id) btn.innerText = "Download";
        }
    }

    async function shareMeme(meme: Meme) {
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({
                    title: "Check out this meme on pfpuwu",
                    text: meme.caption || "Meme on pfpuwu",
                    url: meme.url,
                });
                return;
            } catch (err) {
                // Cancelled or unsupported; fallback to copy
            }
        }
        await copyToClipboard(meme);
    }

    async function copyToClipboard(targetMeme: Meme | null = selectedMeme) {
        if (!targetMeme) return;

        if (targetMeme.type === "photo") {
            try {
                const response = await fetch(targetMeme.url);
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
                await navigator.clipboard.writeText(targetMeme.url);
                setClipboardMessage("Link copied instead");
            }
        } else {
            // Handle Video Type
            try {
                await navigator.clipboard.writeText(targetMeme.url);
                setClipboardMessage("Video link copied!");
            } catch (err) {
                setClipboardMessage("Failed to copy link");
            }
        }
    }

    // === Reels Gestures & Pre-buffering Handlers ===
    function handleTouchStart(e: TouchEvent) {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }

    function handleTouchEnd(e: TouchEvent) {
        if (e.changedTouches.length !== 1) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;

        // Horizontal swipe: Swipe right -> video, swipe left -> photo
        if (
            Math.abs(deltaX) > 50 &&
            Math.abs(deltaX) > Math.abs(deltaY) * 1.4 &&
            deltaTime < 600
        ) {
            if (deltaX > 50) {
                // Swiped right -> go to video
                if (filterType !== "video") {
                    setFilter("video");
                }
            } else if (deltaX < -50) {
                // Swiped left -> go to picture
                if (filterType !== "photo") {
                    setFilter("photo");
                }
            }
        }
    }

    function handleMediaTap(meme: Meme, e: MouseEvent | TouchEvent) {
        const now = Date.now();
        if (now - lastTapTime < 320) {
            // Double tap: Upvote with star burst animation
            if (tapTimeout) {
                clearTimeout(tapTimeout);
                tapTimeout = null;
            }
            let clientX = window.innerWidth / 2;
            let clientY = window.innerHeight / 2;
            if ("clientX" in e && typeof e.clientX === "number") {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if ("changedTouches" in e && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            }

            doubleTapAnimation = { id: meme.id, x: clientX, y: clientY };
            setTimeout(() => {
                if (doubleTapAnimation?.id === meme.id) {
                    doubleTapAnimation = null;
                }
            }, 800);

            if (localVotes[meme.id] !== 1) {
                castVote(1, meme);
            }
            lastTapTime = 0;
            return;
        }

        lastTapTime = now;
        if (meme.type === "video") {
            tapTimeout = setTimeout(() => {
                toggleAudio();
                tapTimeout = null;
            }, 320);
        }
    }

    function toggleAudio() {
        isMuted = !isMuted;
        const currentVideo = selectedMeme ? videoElements.get(selectedMeme.id) : null;
        if (currentVideo) {
            currentVideo.muted = isMuted;
            if (!isMuted) {
                currentVideo.play().catch(() => {});
            }
        }
    }

    function handleVideoPlayback(activeIndex: number) {
        videoElements.forEach((video, id) => {
            const memeIndex = memes.findIndex((m) => m.id === id);
            if (memeIndex === activeIndex) {
                video.muted = isMuted;
                video.play().catch(() => {
                    video.muted = true;
                    isMuted = true;
                    video.play().catch(() => {});
                });
            } else {
                video.pause();
                if (Math.abs(memeIndex - activeIndex) > 2) {
                    video.currentTime = 0;
                }
            }
        });
    }

    function observeReel(node: HTMLElement, index: number) {
        if (!reelsObserver && typeof IntersectionObserver !== "undefined") {
            reelsObserver = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (entry.isIntersecting) {
                            const idx = Number(entry.target.getAttribute("data-index"));
                            if (!isNaN(idx)) {
                                activeReelIndex = idx;
                                if (memes[idx]) {
                                    selectedMeme = memes[idx];
                                }
                                handleVideoPlayback(idx);

                                if (idx >= memes.length - 4 && hasMore && !isLoadingMore) {
                                    fetchMemes({ append: true });
                                }
                            }
                        }
                    }
                },
                { threshold: 0.6 }
            );
        }

        node.setAttribute("data-index", index.toString());
        reelsObserver?.observe(node);

        return {
            update(newIndex: number) {
                node.setAttribute("data-index", newIndex.toString());
            },
            destroy() {
                reelsObserver?.unobserve(node);
            }
        };
    }

    function registerVideoElement(node: HTMLVideoElement, memeId: string) {
        videoElements.set(memeId, node);
        const idx = memes.findIndex((m) => m.id === memeId);
        if (idx === activeReelIndex) {
            node.muted = isMuted;
            node.play().catch(() => {});
        }
        return {
            destroy() {
                videoElements.delete(memeId);
            }
        };
    }

    function openInReels(meme: Meme, index: number) {
        selectedMeme = meme;
        activeReelIndex = index;
        viewMode = "reels";
        requestAnimationFrame(() => {
            const card = reelsContainer?.querySelector(`[data-index="${index}"]`);
            card?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "center" });
            handleVideoPlayback(index);
        });
    }

    let gridObserver: IntersectionObserver | null = null;

    function checkGridAutoFill() {
        if (viewMode === "reels") return;
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (!mediaGrid || isLoading || isLoadingMore || !hasMore) return;
                if (mediaGrid.scrollHeight <= mediaGrid.clientHeight + 80) {
                    fetchMemes({ append: true });
                }
            }, 60);
        });
    }

    function observeGridSentinel(node: HTMLElement) {
        if (typeof IntersectionObserver !== "undefined") {
            if (!gridObserver) {
                gridObserver = new IntersectionObserver(
                    (entries) => {
                        for (const entry of entries) {
                            if (entry.isIntersecting) {
                                if (hasMore && !isLoading && !isLoadingMore) {
                                    fetchMemes({ append: true });
                                }
                            }
                        }
                    },
                    { rootMargin: "250px" }
                );
            }
            gridObserver.observe(node);
        }

        return {
            destroy() {
                gridObserver?.unobserve(node);
            }
        };
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

    function checkMobile() {
        if (typeof window !== "undefined") {
            const wasMobile = isMobile;
            isMobile = window.innerWidth <= 768;
            if (isMobile && !wasMobile && viewMode === "split") {
                viewMode = "reels";
            }
        }
    }

    onMount(() => {
        deviceId = localStorage.getItem("uwu_device_id") || "";
        const storedVotes = localStorage.getItem("uwu_votes");
        if (storedVotes) localVotes = JSON.parse(storedVotes);
        isEditorAuthenticated =
            localStorage.getItem("uwu_editor_authed") === "true";

        if (typeof window !== "undefined") {
            isMobile = window.innerWidth <= 768;
        }

        if (isMobile) {
            viewMode = "reels";
        } else {
            viewMode = "split";
        }
        sortBy = "random";

        window.addEventListener("resize", checkMobile);

        fetchStats();
        fetchMemes();
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("resize", checkMobile);
        }
        clearTimeout(searchTimeout);
        clearTimeout(clipboardTimeout);
        if (tapTimeout) clearTimeout(tapTimeout);
        reelsObserver?.disconnect();
        gridObserver?.disconnect();
        gridObserver = null;
        videoElements.clear();
    });
</script>

{#if viewMode === "reels"}
    <!-- ==============================================
         INSTAGRAM REELS-STYLE VIEW
         ============================================== -->
    <div
        class="reels-view"
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
    >
        <!-- Top Floating Header -->
        <div class="reels-top-header">
            <!-- Photos vs Videos tabs -->
            <div class="reels-tabs">
                <button
                    type="button"
                    class="reels-tab {filterType === 'photo' ? 'active' : ''}"
                    onclick={() => setFilter("photo")}
                >
                    Photos ({formatCount(photoCount)})
                </button>
                <button
                    type="button"
                    class="reels-tab {filterType === 'video' ? 'active' : ''}"
                    onclick={() => setFilter("video")}
                >
                    Videos ({formatCount(videoCount)})
                </button>
            </div>

            <!-- Top Actions: Search, Random, Gallery switch -->
            <div class="reels-top-actions">
                <button
                    type="button"
                    class="reels-icon-btn {showReelsSearch ? 'active' : ''}"
                    onclick={() => (showReelsSearch = !showReelsSearch)}
                    title="Search"
                >
                    🔍
                </button>

                <button
                    type="button"
                    class="reels-icon-btn"
                    onclick={pickRandom}
                    title="Random Meme"
                >
                    🎲
                </button>

                {#if !isMobile}
                    <button
                        type="button"
                        class="reels-mode-pill"
                        onclick={() => (viewMode = "split")}
                        title="Switch to Desktop Split View"
                    >
                        🪟 Split
                    </button>
                {/if}

                <button
                    type="button"
                    class="reels-mode-pill"
                    onclick={() => {
                        viewMode = "grid";
                        checkGridAutoFill();
                    }}
                    title="Switch to Gallery Grid"
                >
                    🗂️ Grid
                </button>
            </div>
        </div>

        <!-- Export Progress Banner (if active) -->
        {#if isExporting}
            <div class="reels-export-banner">
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

        <!-- Search Drawer Overlay -->
        {#if showReelsSearch}
            <div class="reels-search-drawer" in:fade={{ duration: 150 }}>
                <input
                    type="text"
                    class="win-input reels-search-input"
                    placeholder={filterType === "photo"
                        ? "Search photos or ideas..."
                        : "Search tags (e.g. cat, chad)..."}
                    bind:value={searchQuery}
                    oninput={handleSearch}
                />
                {#if filterType === "photo"}
                    <button type="button" class="win-btn surprise-btn" onclick={surpriseMe}>
                        🎲 Idea
                    </button>
                {/if}
                <button
                    type="button"
                    class="win-btn close-search-btn"
                    onclick={() => {
                        searchQuery = "";
                        handleSearch();
                        showReelsSearch = false;
                    }}
                >
                    ✕
                </button>
            </div>
        {/if}

        <!-- Status Toast -->
        {#if clipboardMessage}
            <div class="reels-toast" in:fade>{clipboardMessage}</div>
        {/if}

        <!-- Double Tap Star Burst Animation -->
        {#if doubleTapAnimation}
            <div
                class="double-tap-burst"
                style="left: {doubleTapAnimation.x}px; top: {doubleTapAnimation.y}px;"
            >
                ⭐
            </div>
        {/if}

        <!-- Vertical Reels Snap Container -->
        <div
            class="reels-feed-container"
            bind:this={reelsContainer}
        >
            {#if isLoading && memes.length === 0}
                <div class="reels-loading">
                    <div class="win98-spinner">⌛ Loading memes...</div>
                </div>
            {:else if errorMessage}
                <div class="reels-loading">
                    <div>{errorMessage}</div>
                    <button type="button" class="win-btn" onclick={() => fetchMemes()}>Retry</button>
                </div>
            {:else if memes.length === 0}
                <div class="reels-loading">
                    <div>No memes found.</div>
                    {#if searchQuery}
                        <button type="button" class="win-btn" onclick={() => { searchQuery = ""; fetchMemes(); }}>
                            Clear Search
                        </button>
                    {/if}
                </div>
            {:else}
                {#each memes as meme, i (meme.id)}
                    <div
                        class="reel-card"
                        use:observeReel={i}
                    >
                        <!-- Media Container -->
                        <div
                            class="reel-media-wrapper"
                            onclick={(e) => handleMediaTap(meme, e)}
                            role="presentation"
                        >
                            {#if meme.type === "photo"}
                                <img
                                    src={meme.url}
                                    alt="Meme"
                                    class="reel-media-img"
                                    loading={Math.abs(i - activeReelIndex) <= 2 ? "eager" : "lazy"}
                                    decoding="async"
                                />
                            {:else}
                                <video
                                    use:registerVideoElement={meme.id}
                                    src={meme.url}
                                    class="reel-media-video"
                                    playsinline
                                    loop
                                    preload={Math.abs(i - activeReelIndex) <= 1 ? "auto" : "none"}
                                    muted={isMuted}
                                >
                                    <track kind="captions" />
                                </video>
                            {/if}
                        </div>

                        <!-- Right Side Action Rail (Instagram Reels Style) -->
                        <div class="reels-action-rail">
                            <!-- Upvote Button -->
                            <button
                                type="button"
                                class="reel-action-btn {localVotes[meme.id] === 1 ? 'voted-up' : ''}"
                                onclick={() => castVote(1, meme)}
                                title="Upvote"
                            >
                                <span class="action-icon">▲</span>
                                <span class="action-count">{formatCount(meme.upvotes || 0)}</span>
                            </button>

                            <!-- Downvote Button -->
                            <button
                                type="button"
                                class="reel-action-btn {localVotes[meme.id] === -1 ? 'voted-down' : ''}"
                                onclick={() => castVote(-1, meme)}
                                title="Downvote"
                            >
                                <span class="action-icon">▼</span>
                                <span class="action-count">{formatCount(meme.downvotes || 0)}</span>
                            </button>

                            <!-- Audio Toggle (for videos) -->
                            {#if meme.type === "video"}
                                <button
                                    type="button"
                                    class="reel-action-btn sound-btn"
                                    onclick={toggleAudio}
                                    title={isMuted ? "Unmute sound" : "Mute sound"}
                                >
                                    <span class="action-icon">{isMuted ? "🔇" : "🔊"}</span>
                                    <span class="action-count">{isMuted ? "Muted" : "Sound"}</span>
                                </button>
                            {/if}

                            <!-- Download Button -->
                            <button
                                type="button"
                                class="reel-action-btn"
                                disabled={downloadingId === meme.id}
                                onclick={() => downloadMeme(meme)}
                                title="Download"
                            >
                                <span class="action-icon">{downloadingId === meme.id ? "⏳" : "💾"}</span>
                                <span class="action-count">Save</span>
                            </button>

                            <!-- Share / Copy Button -->
                            <button
                                type="button"
                                class="reel-action-btn"
                                onclick={() => shareMeme(meme)}
                                title="Share"
                            >
                                <span class="action-icon">🔗</span>
                                <span class="action-count">Share</span>
                            </button>

                            <!-- Switch to Gallery Mode -->
                            <button
                                type="button"
                                class="reel-action-btn gallery-btn"
                                onclick={() => {
                                    viewMode = "grid";
                                    checkGridAutoFill();
                                }}
                                title="View in Gallery Grid"
                            >
                                <span class="action-icon">🗂️</span>
                                <span class="action-count">Grid</span>
                            </button>

                            <!-- Admin Delete Button -->
                            {#if isEditorAuthenticated}
                                <button
                                    type="button"
                                    class="reel-action-btn admin-btn"
                                    onclick={() => deleteMeme()}
                                    title="Delete Meme (Admin)"
                                >
                                    <span class="action-icon">🗑️</span>
                                    <span class="action-count">Del</span>
                                </button>
                            {/if}
                        </div>

                        <!-- Bottom Info Overlay -->
                        <div class="reel-bottom-info">
                            {#if meme.score && meme.score > 0}
                                <span class="reel-score-pill">⭐ {meme.score} points</span>
                            {/if}
                            {#if meme.caption}
                                <p class="reel-caption">{meme.caption}</p>
                            {/if}
                            {#if meme.tags && meme.tags.length > 0}
                                <div class="reel-tags-list">
                                    {#each meme.tags as tag}
                                        <button
                                            type="button"
                                            class="reel-tag-pill"
                                            onclick={() => {
                                                searchQuery = tag;
                                                fetchMemes();
                                            }}
                                        >
                                            #{tag}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}

                {#if isLoadingMore}
                    <div class="reel-card-loading">Loading more memes...</div>
                {/if}
            {/if}
        </div>
    </div>
{:else if viewMode === "grid"}
    <!-- ==============================================
         FULL-WINDOW GALLERY GRID MODE
         ============================================== -->
    <div class="mobile-gallery-view gallery-grid-view">
        <div class="mobile-gallery-top-bar gallery-grid-top-bar">
            {#if !isMobile}
                <button
                    type="button"
                    class="win-btn switch-to-split-btn"
                    onclick={() => (viewMode = "split")}
                >
                    🪟 Switch to Split View
                </button>
            {/if}
            <button
                type="button"
                class="win-btn switch-to-reels-btn"
                onclick={() => (viewMode = "reels")}
            >
                📱 Switch to Reels Mode
            </button>
            <button
                type="button"
                class="win-btn export-btn"
                onclick={triggerBulkExport}
                disabled={isExporting}
            >
                💾 {isExporting ? `${exportProgress}%` : `Export All`}
            </button>
        </div>

        {#if isExporting}
            <div class="win98-progress-container mobile-export-progress">
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

        <div class="toolbar mobile-gallery-toolbar">
            <div class="tab-group">
                <button
                    type="button"
                    class="win-btn tab-btn {filterType === 'photo' ? 'active' : ''}"
                    onclick={() => setFilter("photo")}
                >
                    Photos ({formatCount(photoCount)})
                </button>
                <button
                    type="button"
                    class="win-btn tab-btn {filterType === 'video' ? 'active' : ''}"
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
                <option value="random">🎲 Random</option>
                <option value="popular">⭐ Popular</option>
                <option value="newest">🕒 Newest</option>
                <option value="oldest">🕰️ Oldest</option>
            </select>
        </div>

        <div class="search-container mobile-gallery-search">
            <div class="search-header">
                <span class="search-label">
                    {filterType === "photo" ? "Search:" : "Search tags:"}
                </span>
                {#if filterType === "photo"}
                    <button type="button" class="win-btn surprise-btn" onclick={surpriseMe}>
                        🎲 Random Idea
                    </button>
                {/if}
            </div>
            <input
                type="text"
                class="win-input"
                placeholder={filterType === "photo"
                    ? "e.g. funny cat wearing glasses..."
                    : "Search by tag (e.g. cat, funny)"}
                bind:value={searchQuery}
                oninput={handleSearch}
            />
        </div>

        <div
            class="media-grid win-inset mobile-media-grid full-media-grid"
            bind:this={mediaGrid}
            tabindex="0"
            role="listbox"
            onscroll={handleGridScroll}
            onkeydown={handleKeydown}
        >
            {#if isLoading && memes.length === 0}
                <div class="loading-state">Loading...</div>
            {:else if errorMessage}
                <div class="loading-state">{errorMessage}</div>
            {:else if memes.length === 0}
                <div class="loading-state">No files found.</div>
            {:else}
                {#each memes as meme, i (meme.id)}
                    <button
                        type="button"
                        class="grid-item {selectedMeme?.id === meme.id ? 'selected' : ''}"
                        onclick={() => openInReels(meme, i)}
                    >
                        {#if meme.type === "photo"}
                            <img
                                src={meme.url}
                                alt="Thumbnail"
                                loading="lazy"
                                decoding="async"
                            />
                        {:else}
                            <video
                                src={`${meme.url}#t=0.001`}
                                muted
                                preload="metadata"
                                playsinline
                            >
                                <track kind="captions" />
                            </video>
                        {/if}
                        {#if meme.score && meme.score > 0}
                            <div class="mini-score">⭐ {meme.score}</div>
                        {/if}
                    </button>
                {/each}

                <!-- Sentinel for auto-loading next batch -->
                <div class="grid-sentinel" use:observeGridSentinel></div>

                {#if isLoadingMore}
                    <div class="loading-more">Loading more memes...</div>
                {:else if hasMore}
                    <div class="load-more-row">
                        <button
                            type="button"
                            class="win-btn load-more-btn"
                            onclick={() => fetchMemes({ append: true })}
                        >
                            ⬇️ Load More Memes
                        </button>
                    </div>
                {:else}
                    <div class="loading-more">End of folder ({memes.length} memes)</div>
                {/if}
            {/if}
        </div>
    </div>
{:else}
    <!-- ==============================================
         DESKTOP CLASSIC WINDOWS 98 VIEW
         ============================================== -->
    <div class="app-container">
        <!-- Menubar -->
        <div class="win98-menubar">
            <button
                type="button"
                class="menu-btn"
                onclick={triggerBulkExport}
                disabled={isExporting}
            >
                <u>F</u>ile ▸ {isExporting
                    ? "Zipping..."
                    : `Export All ${filterType === "photo" ? "Photos" : "Videos"}`}
            </button>
            <button
                type="button"
                class="menu-btn"
                onclick={() => {
                    viewMode = "grid";
                    checkGridAutoFill();
                }}
            >
                🗂️ <u>G</u>rid View
            </button>
            <button
                type="button"
                class="menu-btn"
                onclick={() => {
                    viewMode = "reels";
                }}
            >
                📱 <u>R</u>eels Mode
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
                            type="button"
                            class="win-btn tab-btn {filterType === 'photo'
                                ? 'active'
                                : ''}"
                            onclick={() => setFilter("photo")}
                        >
                            Photos ({formatCount(photoCount)})
                        </button>
                        <button
                            type="button"
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
                        <option value="random">🎲 Random</option>
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
                    {#if isLoading && memes.length === 0}
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
                                    <img
                                        src={meme.url}
                                        alt="Thumbnail"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                {:else}
                                    <video
                                        src={`${meme.url}#t=0.001`}
                                        muted
                                        preload="metadata"
                                        playsinline
                                    >
                                        <track kind="captions" />
                                    </video>
                                {/if}
                                {#if meme.score && meme.score > 0}
                                    <div class="mini-score">⭐ {meme.score}</div>
                                {/if}
                            </button>
                        {/each}

                        <!-- Sentinel for auto-loading next batch -->
                        <div class="grid-sentinel" use:observeGridSentinel></div>

                        {#if isLoadingMore}
                            <div class="loading-more">Loading more memes...</div>
                        {:else if hasMore}
                            <div class="load-more-row">
                                <button
                                    type="button"
                                    class="win-btn load-more-btn"
                                    onclick={() => fetchMemes({ append: true })}
                                >
                                    ⬇️ Load More Memes
                                </button>
                            </div>
                        {:else}
                            <div class="loading-more">End of folder</div>
                        {/if}
                    {/if}
                </div>

                <!-- Search Bar -->
                <div class="search-container">
                    <div class="search-header">
                        <span class="search-label">
                            {filterType === "photo" ? "Search:" : "Search tags:"}
                        </span>

                        {#if filterType === "photo"}
                            <button
                                type="button"
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
                            type="button"
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
                                >
                                    <track kind="captions" />
                                </video>
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
                                            type="button"
                                            class="tag-badge"
                                            onclick={() => startTagEdit(i)}
                                            title="Click to edit: {tag}"
                                        >
                                            {tag}
                                        </button>
                                        <button
                                            type="button"
                                            class="tag-delete"
                                            onclick={() => deleteTag(i)}
                                            title="Delete tag">×</button
                                        >
                                    </div>
                                {/if}
                            {/each}

                            {#if editingTagIndex !== (selectedMeme.tags?.length || 0)}
                                <button
                                    type="button"
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
                            type="button"
                            class="win-btn vote-btn {selectedMeme &&
                            localVotes[selectedMeme.id] === 1
                                ? 'active-up'
                                : ''}"
                            disabled={!selectedMeme}
                            onclick={() => castVote(1, selectedMeme)}
                            title="Upvote"
                        >
                            ▲ {selectedMeme?.upvotes || 0}
                        </button>
                        <button
                            type="button"
                            class="win-btn vote-btn {selectedMeme &&
                            localVotes[selectedMeme.id] === -1
                                ? 'active-down'
                                : ''}"
                            disabled={!selectedMeme}
                            onclick={() => castVote(-1, selectedMeme)}
                            title="Downvote"
                        >
                            ▼ {selectedMeme?.downvotes || 0}
                        </button>
                    </div>

                    <button
                        type="button"
                        id="download-btn"
                        class="win-btn action-btn"
                        disabled={!selectedMeme}
                        onclick={() => downloadMeme(selectedMeme)}
                    >
                        Download
                    </button>

                    <button
                        type="button"
                        class="win-btn action-btn primary-action"
                        disabled={!selectedMeme}
                        onclick={() => copyToClipboard(selectedMeme)}
                    >
                        Copy Url
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

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
        gap: 6px;
        padding: 4px;
        box-sizing: border-box;
        overflow: hidden;
    }

    .win-panel {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 0;
    }

    .gallery-pane {
        flex: 0 0 36%;
        min-width: 240px;
    }

    .preview-pane {
        flex: 1;
        box-sizing: border-box;
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
        color: #000000;
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
        background: #ffffff;
        color: #000000;
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

    /* =========================================
       REELS MOBILE VIEW (INSTAGRAM / TIKTOK STYLE)
       ========================================= */
    .reels-view {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000000;
        display: flex;
        flex-direction: column;
        user-select: none;
        -webkit-user-select: none;
    }

    .reels-top-header {
        position: absolute;
        top: 8px;
        left: 8px;
        right: 8px;
        z-index: 40;
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: auto;
        gap: 6px;
    }

    .reels-tabs {
        display: flex;
        gap: 4px;
        background: rgba(20, 20, 25, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 3px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .reels-tab {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
    }

    .reels-tab.active {
        background: #000080;
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(0, 0, 128, 0.5);
    }

    .reels-top-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .reels-icon-btn {
        background: rgba(20, 20, 25, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        transition: background 0.15s ease;
    }

    .reels-icon-btn.active {
        background: #000080;
        border-color: #0080ff;
    }

    .reels-mode-pill {
        background: rgba(20, 20, 25, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: #ffffff;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
        font-size: 11px;
        font-weight: bold;
        padding: 5px 10px;
        border-radius: 16px;
        cursor: pointer;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .reels-search-drawer {
        position: absolute;
        top: 48px;
        left: 8px;
        right: 8px;
        z-index: 45;
        display: flex;
        gap: 4px;
        background: rgba(15, 15, 20, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 6px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    }

    .reels-search-input {
        flex: 1;
        font-size: 12px;
        padding: 4px 8px;
    }

    .close-search-btn {
        padding: 2px 8px;
        font-weight: bold;
    }

    .reels-export-banner {
        position: absolute;
        top: 48px;
        left: 12px;
        right: 12px;
        z-index: 50;
    }

    .reels-toast {
        position: absolute;
        top: 52px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 60;
        background: rgba(0, 0, 0, 0.85);
        color: #ffffaa;
        border: 1px solid #ffffaa;
        padding: 5px 14px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border-radius: 16px;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    }

    .double-tap-burst {
        position: fixed;
        pointer-events: none;
        z-index: 100;
        font-size: 64px;
        transform: translate(-50%, -50%);
        animation: popBurst 0.8s ease-out forwards;
        filter: drop-shadow(0 0 16px rgba(255, 215, 0, 0.9));
    }

    @keyframes popBurst {
        0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
    }

    .reels-feed-container {
        width: 100%;
        height: 100%;
        overflow-y: scroll;
        scroll-snap-type: y mandatory;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
        background: #000000;
    }

    .reel-card {
        width: 100%;
        height: 100%;
        scroll-snap-align: start;
        scroll-snap-stop: always;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #050505;
    }

    .reel-media-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: pointer;
    }

    .reel-media-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .reel-media-video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000000;
    }

    .reels-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 12px;
        color: #ffffff;
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
    }

    .reel-card-loading {
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #888888;
        font-size: 12px;
    }

    /* Side Action Rail (Instagram Reels Style) */
    .reels-action-rail {
        position: absolute;
        right: 10px;
        bottom: 24px;
        z-index: 30;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        pointer-events: auto;
    }

    .reel-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(25, 25, 30, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 50%;
        width: 44px;
        height: 44px;
        color: #ffffff;
        cursor: pointer;
        padding: 0;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
        transition: transform 0.15s ease, background 0.15s ease;
    }

    .reel-action-btn:active {
        transform: scale(0.9);
    }

    .reel-action-btn.voted-up {
        background: rgba(0, 180, 80, 0.8);
        border-color: #00ff88;
        box-shadow: 0 0 12px rgba(0, 255, 136, 0.6);
    }

    .reel-action-btn.voted-down {
        background: rgba(220, 40, 40, 0.8);
        border-color: #ff4d4d;
        box-shadow: 0 0 12px rgba(255, 77, 77, 0.6);
    }

    .reel-action-btn .action-icon {
        font-size: 16px;
        line-height: 1;
    }

    .reel-action-btn .action-count {
        font-size: 9px;
        font-weight: bold;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        margin-top: 1px;
        color: #ffffff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    }

    /* Bottom Info Overlay */
    .reel-bottom-info {
        position: absolute;
        bottom: 16px;
        left: 12px;
        right: 68px;
        z-index: 25;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
    }

    .reel-score-pill {
        display: inline-flex;
        align-self: flex-start;
        background: rgba(0, 0, 0, 0.6);
        color: #ffe600;
        font-size: 11px;
        font-weight: bold;
        padding: 2px 8px;
        border-radius: 12px;
        border: 1px solid rgba(255, 230, 0, 0.3);
        backdrop-filter: blur(4px);
    }

    .reel-caption {
        margin: 0;
        font-size: 13px;
        color: #ffffff;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .reel-tags-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .reel-tag-pill {
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #ffffff;
        font-size: 11px;
        font-family: monospace;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        transition: background 0.15s ease;
    }

    .reel-tag-pill:hover,
    .reel-tag-pill:active {
        background: #000080;
        border-color: #ffffff;
    }

    /* =========================================
       MOBILE GALLERY VIEW
       ========================================= */
    .mobile-gallery-view {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: #c0c0c0;
        padding: 4px;
        box-sizing: border-box;
        overflow: hidden;
        gap: 6px;
    }

    .mobile-gallery-top-bar {
        display: flex;
        gap: 6px;
    }

    .switch-to-reels-btn {
        flex: 1;
        background: #000080;
        color: #ffffff;
        border-color: #9ea7ff #000000 #000000 #9ea7ff;
        font-weight: bold;
        font-size: 12px;
        padding: 6px 10px;
    }

    .export-btn {
        font-size: 11px;
        padding: 4px 8px;
    }

    .mobile-gallery-toolbar {
        margin-top: 0;
    }

    .mobile-gallery-search {
        padding-top: 0;
    }

    .mobile-media-grid {
        flex: 1;
        min-height: 0;
    }

    .mobile-export-progress {
        margin-left: 0;
        max-width: 100%;
    }

    .switch-to-split-btn {
        background: #c0c0c0;
        font-weight: bold;
        font-size: 12px;
        padding: 6px 10px;
    }

    .grid-sentinel {
        grid-column: 1 / -1;
        height: 16px;
        pointer-events: none;
        visibility: hidden;
    }

    .load-more-row {
        grid-column: 1 / -1;
        display: flex;
        justify-content: center;
        padding: 8px 0 12px;
    }

    .load-more-btn {
        font-size: 11px;
        font-weight: bold;
        padding: 6px 14px;
        cursor: pointer;
    }

    .full-media-grid {
        flex: 1;
        min-height: 0;
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
            height: 100%;
            overflow: hidden;
            box-sizing: border-box;
        }
        .gallery-pane {
            flex: none;
            height: 46%;
            min-height: 180px;
            border-right: none;
            border-bottom: 1px solid var(--os-border-color, #9e9b90);
            padding: 8px;
        }
        .preview-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            padding: 8px;
        }
        .preview-display {
            flex: 1;
            min-height: 0;
        }
        .action-bar {
            flex-shrink: 0;
            justify-content: stretch;
            padding-bottom: 2px;
            flex-wrap: wrap;
        }
        .action-btn {
            flex: 1;
            min-width: 0;
        }
    }
</style>
