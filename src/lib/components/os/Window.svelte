<script lang="ts">
    import {
        closeWindow,
        focusWindow,
        minimizeWindow,
        highestZIndex,
        isDraggingAnyWindow
    } from "$lib/stores/os";

    let {
        id,
        title,
        icon = "",
        zIndex,
        isMinimized,
        initialWidth = 400,
        initialHeight = 300,
        minWidth = 250,
        minHeight = 150,
        children
    } = $props();

    const isBrowser = typeof window !== "undefined";
    const vw = isBrowser ? window.innerWidth : 1024;
    const vh = isBrowser ? window.innerHeight : 768;

    let width = $state(Math.min(initialWidth, vw));
    let height = $state(Math.min(initialHeight, vh - 35));

    const stagger = ((zIndex % 5) - 2) * 16;
    let left = $state(Math.max(0, Math.floor(vw / 2 - width / 2 + stagger)));
    let top = $state(Math.max(0, Math.floor((vh - 35) / 2 - height / 2 + stagger)));

    // --- MAXIMIZE LOGIC ---
    let isMaximized = $state(false);
    let preMaxState = { top: 0, left: 0, width: 0, height: 0 };

    function toggleMaximize() {
        if (!isMaximized) {
            preMaxState = { top, left, width, height };
            top = 0;
            left = 0;
            width = window.innerWidth;
            height = window.innerHeight - 35;
            isMaximized = true;
        } else {
            top = preMaxState.top;
            left = preMaxState.left;
            width = preMaxState.width;
            height = preMaxState.height;
            isMaximized = false;
        }
    }

    // --- DRAG LOGIC ---
    let isDragging = false;
    let dragStartX: number,
        dragStartY: number,
        initialLeft: number,
        initialTop: number;

    function onDragStart(e: MouseEvent) {
        if (e.button !== 0 || isMaximized || window.innerWidth <= 768) return;

        isDragging = true;
        isDraggingAnyWindow.set(true);
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialLeft = left;
        initialTop = top;

        focusWindow(id);

        window.addEventListener("mousemove", onDrag);
        window.addEventListener("mouseup", onDragEnd);
    }

    function onDrag(e: MouseEvent) {
        if (!isDragging) return;
        left = initialLeft + (e.clientX - dragStartX);
        top = Math.max(0, initialTop + (e.clientY - dragStartY));
    }

    function onDragEnd() {
        isDragging = false;
        isDraggingAnyWindow.set(false);
        window.removeEventListener("mousemove", onDrag);
        window.removeEventListener("mouseup", onDragEnd);
    }

    // --- OMNI-RESIZE LOGIC ---
    let isResizing = false;
    let activeHandle = "";
    let resizeStartW: number, resizeStartH: number;
    let resizeStartLeft: number, resizeStartTop: number;

    function onResizeStart(e: MouseEvent, handle: string) {
        e.stopPropagation();
        if (e.button !== 0 || isMaximized || window.innerWidth <= 768) return;

        isResizing = true;
        isDraggingAnyWindow.set(true);
        activeHandle = handle;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        resizeStartW = width;
        resizeStartH = height;
        resizeStartLeft = left;
        resizeStartTop = top;

        focusWindow(id);

        window.addEventListener("mousemove", onResize);
        window.addEventListener("mouseup", onResizeEnd);
    }

    function onResize(e: MouseEvent) {
        if (!isResizing) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        if (activeHandle.includes("e")) {
            width = Math.max(minWidth, resizeStartW + deltaX);
        }
        if (activeHandle.includes("s")) {
            height = Math.max(minHeight, resizeStartH + deltaY);
        }
        if (activeHandle.includes("w")) {
            const newWidth = Math.max(minWidth, resizeStartW - deltaX);
            if (newWidth > minWidth) {
                left = resizeStartLeft + deltaX;
                width = newWidth;
            } else {
                left = resizeStartLeft + (resizeStartW - minWidth);
                width = minWidth;
            }
        }
        if (activeHandle.includes("n")) {
            const newHeight = Math.max(minHeight, resizeStartH - deltaY);
            if (newHeight > minHeight) {
                top = resizeStartTop + deltaY;
                height = newHeight;
            } else {
                top = resizeStartTop + (resizeStartH - minHeight);
                height = minHeight;
            }
        }
    }

    function onResizeEnd() {
        isResizing = false;
        isDraggingAnyWindow.set(false);
        activeHandle = "";
        window.removeEventListener("mousemove", onResize);
        window.removeEventListener("mouseup", onResizeEnd);
    }

    const isFocused = $derived(zIndex === $highestZIndex);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="win98-window"
    class:maximized={isMaximized}
    style="
        display: {isMinimized ? 'none' : 'flex'};
        z-index: {zIndex};
        top: {top}px;
        left: {left}px;
        width: {width}px;
        height: {height}px;
    "
    onmousedown={() => focusWindow(id)}
>
    {#if !isMaximized}
        <div class="resize-handle n" onmousedown={(e) => onResizeStart(e, "n")}></div>
        <div class="resize-handle s" onmousedown={(e) => onResizeStart(e, "s")}></div>
        <div class="resize-handle e" onmousedown={(e) => onResizeStart(e, "e")}></div>
        <div class="resize-handle w" onmousedown={(e) => onResizeStart(e, "w")}></div>
        <div class="resize-handle ne" onmousedown={(e) => onResizeStart(e, "ne")}></div>
        <div class="resize-handle nw" onmousedown={(e) => onResizeStart(e, "nw")}></div>
        <div class="resize-handle se" onmousedown={(e) => onResizeStart(e, "se")}></div>
        <div class="resize-handle sw" onmousedown={(e) => onResizeStart(e, "sw")}></div>
    {/if}

    <div
        class="title-bar"
        class:inactive={!isFocused}
        onmousedown={onDragStart}
        ondblclick={toggleMaximize}
    >
        <div class="title-bar-text">{title}</div>
        <div class="title-bar-controls">
            <button
                aria-label="Minimize"
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => {
                    e.stopPropagation();
                    minimizeWindow(id);
                }}>_</button
            >

            <button
                aria-label="Maximize"
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => {
                    e.stopPropagation();
                    toggleMaximize();
                }}
            >
                {isMaximized ? "❐" : "☐"}
            </button>

            <button
                aria-label="Close"
                onmousedown={(e) => e.stopPropagation()}
                onclick={() => closeWindow(id)}>X</button
            >
        </div>
    </div>

    <div class="window-body" class:iframe-shield={$isDraggingAnyWindow}>
        {@render children?.()}
    </div>
</div>

<style>
    .win98-window {
        position: absolute;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        display: flex;
        flex-direction: column;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
    }

    .maximized {
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: calc(100dvh - 35px) !important;
    }

    /* === RESIZE HANDLES === */
    .resize-handle {
        position: absolute;
        z-index: 100;
        background: transparent;
    }
    .resize-handle.n { top: -4px; left: 4px; right: 4px; height: 8px; cursor: n-resize; }
    .resize-handle.s { bottom: -4px; left: 4px; right: 4px; height: 8px; cursor: s-resize; }
    .resize-handle.e { top: 4px; bottom: 4px; right: -4px; width: 8px; cursor: e-resize; }
    .resize-handle.w { top: 4px; bottom: 4px; left: -4px; width: 8px; cursor: w-resize; }
    .resize-handle.ne { top: -4px; right: -4px; width: 12px; height: 12px; cursor: ne-resize; }
    .resize-handle.nw { top: -4px; left: -4px; width: 12px; height: 12px; cursor: nw-resize; }
    .resize-handle.se { bottom: -4px; right: -4px; width: 12px; height: 12px; cursor: se-resize; }
    .resize-handle.sw { bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: sw-resize; }

    .title-bar {
        background: #000080;
        color: white;
        padding: 3px 2px 3px 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        cursor: default;
        flex-shrink: 0;
    }

    .title-bar.inactive {
        background: #808080;
        color: #d4d0c8;
    }

    .title-bar-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .title-bar-controls {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    .title-bar-controls button {
        background: #c0c0c0;
        border: 1px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        font-weight: bold;
        cursor: pointer;
        padding: 0 4px;
        font-size: 0.8rem;
        color: #000000;
    }

    .title-bar-controls button:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 1px 3px 0 5px;
    }

    .window-body {
        padding: 4px;
        flex-grow: 1;
        min-height: 0;
        overflow: auto;
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
    }

    .window-body.iframe-shield :global(iframe) {
        pointer-events: none !important;
    }

    /* =========================================
       MOBILE OVERRIDES
       ========================================= */
    @media (max-width: 768px) {
        .win98-window {
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: calc(100dvh - 35px) !important;
            border: none;
            box-shadow: none;
        }

        .resize-handle {
            display: none !important;
        }

        .title-bar {
            cursor: default;
            padding: 6px 4px 6px 6px !important;
        }

        button[aria-label="Maximize"] {
            display: none !important;
        }

        button[aria-label="Minimize"] {
            padding: 4px 10px !important;
            font-size: 1rem !important;
        }

        button[aria-label="Close"] {
            padding: 4px 14px !important;
            font-size: 1rem !important;
        }

        .maximized {
            width: 100vw !important;
        }
    }
</style>
