<script lang="ts">
    import { closeWindow, focusWindow, minimizeWindow } from "$lib/stores/os";

    let {
        id,
        title,
        zIndex,
        isMinimized,
        initialWidth = 400,
        initialHeight = 300,
        minWidth = 250,
        minHeight = 150,
    } = $props();

    let width = $state(initialWidth);
    let height = $state(initialHeight);

    const isDesktop = window.innerWidth > 768;
    const availableWidth = isDesktop
        ? window.innerWidth - 320
        : window.innerWidth;

    let left = $state(availableWidth / 2 - initialWidth / 2);
    let top = $state(window.innerHeight / 2 - initialHeight / 2);

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
        if (e.button !== 0 || isMaximized) return;

        isDragging = true;
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
        top = initialTop + (e.clientY - dragStartY);
    }

    function onDragEnd() {
        isDragging = false;
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
        if (e.button !== 0 || isMaximized) return;

        isResizing = true;
        activeHandle = handle;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        // Capture initial dimensions AND positions
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

        // RIGHT edge (East)
        if (activeHandle.includes("e")) {
            width = Math.max(minWidth, resizeStartW + deltaX);
        }

        // BOTTOM edge (South)
        if (activeHandle.includes("s")) {
            height = Math.max(minHeight, resizeStartH + deltaY);
        }

        // LEFT edge (West) -> Affects both Width AND X-Coordinate
        if (activeHandle.includes("w")) {
            const newWidth = Math.max(minWidth, resizeStartW - deltaX);
            if (newWidth > minWidth) {
                left = resizeStartLeft + deltaX;
                width = newWidth;
            } else {
                // Lock coordinate if minimum width is hit
                left = resizeStartLeft + (resizeStartW - minWidth);
                width = minWidth;
            }
        }

        // TOP edge (North) -> Affects both Height AND Y-Coordinate
        if (activeHandle.includes("n")) {
            const newHeight = Math.max(minHeight, resizeStartH - deltaY);
            if (newHeight > minHeight) {
                top = resizeStartTop + deltaY;
                height = newHeight;
            } else {
                // Lock coordinate if minimum height is hit
                top = resizeStartTop + (resizeStartH - minHeight);
                height = minHeight;
            }
        }
    }

    function onResizeEnd() {
        isResizing = false;
        activeHandle = "";
        window.removeEventListener("mousemove", onResize);
        window.removeEventListener("mouseup", onResizeEnd);
    }
</script>

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
        <div
            class="resize-handle n"
            onmousedown={(e) => onResizeStart(e, "n")}
        ></div>
        <div
            class="resize-handle s"
            onmousedown={(e) => onResizeStart(e, "s")}
        ></div>
        <div
            class="resize-handle e"
            onmousedown={(e) => onResizeStart(e, "e")}
        ></div>
        <div
            class="resize-handle w"
            onmousedown={(e) => onResizeStart(e, "w")}
        ></div>

        <div
            class="resize-handle ne"
            onmousedown={(e) => onResizeStart(e, "ne")}
        ></div>
        <div
            class="resize-handle nw"
            onmousedown={(e) => onResizeStart(e, "nw")}
        ></div>
        <div
            class="resize-handle se"
            onmousedown={(e) => onResizeStart(e, "se")}
        ></div>
        <div
            class="resize-handle sw"
            onmousedown={(e) => onResizeStart(e, "sw")}
        ></div>
    {/if}

    <div class="title-bar" onmousedown={onDragStart}>
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

    <div class="window-body">
        <slot></slot>
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
        width: calc(100vw - var(--sidebar-width, 320px)) !important;
        height: calc(100dvh - 35px) !important;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* === RESIZE HANDLES === */
    .resize-handle {
        position: absolute;
        z-index: 100;
        /* Background is transparent so you only see the cursors */
        background: transparent;
    }
    /* Edges */
    .resize-handle.n {
        top: -4px;
        left: 4px;
        right: 4px;
        height: 8px;
        cursor: n-resize;
    }
    .resize-handle.s {
        bottom: -4px;
        left: 4px;
        right: 4px;
        height: 8px;
        cursor: s-resize;
    }
    .resize-handle.e {
        top: 4px;
        bottom: 4px;
        right: -4px;
        width: 8px;
        cursor: e-resize;
    }
    .resize-handle.w {
        top: 4px;
        bottom: 4px;
        left: -4px;
        width: 8px;
        cursor: w-resize;
    }

    /* Corners */
    .resize-handle.ne {
        top: -4px;
        right: -4px;
        width: 12px;
        height: 12px;
        cursor: ne-resize;
    }
    .resize-handle.nw {
        top: -4px;
        left: -4px;
        width: 12px;
        height: 12px;
        cursor: nw-resize;
    }
    .resize-handle.se {
        bottom: -4px;
        right: -4px;
        width: 12px;
        height: 12px;
        cursor: se-resize;
    }
    .resize-handle.sw {
        bottom: -4px;
        left: -4px;
        width: 12px;
        height: 12px;
        cursor: sw-resize;
    }

    .title-bar {
        background: #000080;
        color: white;
        padding: 3px 2px 3px 3px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        cursor: default;
    }

    .title-bar-controls {
        display: flex;
        gap: 2px;
    }

    .title-bar-controls button {
        background: #c0c0c0;
        border: 1px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        font-weight: bold;
        cursor: pointer;
        padding: 0 4px;
        font-size: 0.8rem;
    }

    .title-bar-controls button:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 1px 3px 0 5px;
    }

    .window-body {
        padding: 10px;
        flex-grow: 1;
        overflow: auto;
        /* Ensure the body doesn't cover up our custom edge borders */
        position: relative;
        z-index: 1;
    }

    /* =========================================
       MOBILE OVERRIDES
       ========================================= */
    @media (max-width: 768px) {
        .win98-window {
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
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

        button[aria-label="Minimize"],
        button[aria-label="Maximize"] {
            display: none !important;
        }

        button[aria-label="Close"] {
            padding: 4px 16px !important;
            font-size: 1.2rem !important;
        }
        .maximized {
            width: 100vw !important;
        }
    }
</style>
