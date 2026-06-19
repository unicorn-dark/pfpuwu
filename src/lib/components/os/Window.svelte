<script lang="ts">
    import { closeWindow, focusWindow, minimizeWindow } from '$lib/stores/os';

    let { 
        id, title, zIndex, isMinimized, 
        initialWidth = 400, initialHeight = 300,
        minWidth = 250, minHeight = 150 
    } = $props();

    let width = $state(initialWidth);
    let height = $state(initialHeight);
    
    let left = $state(window.innerWidth / 2 - (initialWidth / 2)); 
    let top = $state(window.innerHeight / 2 - (initialHeight / 2));

    // --- MAXIMIZE LOGIC ---
    let isMaximized = $state(false);
    let preMaxState = { top: 0, left: 0, width: 0, height: 0 };

    function toggleMaximize() {
        if (!isMaximized) {
            // 1. Save the exact current state before maximizing
            preMaxState = { top, left, width, height };

            // 2. Snap to full screen (accounting for the 35px taskbar)
            top = 0;
            left = 0;
            width = window.innerWidth;
            height = window.innerHeight - 35;
            isMaximized = true;
        } else {
            // 3. Restore down to previous size and position
            top = preMaxState.top;
            left = preMaxState.left;
            width = preMaxState.width;
            height = preMaxState.height;
            isMaximized = false;
        }
    }

    // --- DRAG LOGIC ---
    let isDragging = false;
    let dragStartX: number, dragStartY: number, initialLeft: number, initialTop: number;

    function onDragStart(e: MouseEvent) {
        // Prevent dragging if the window is maximized!
        if (e.button !== 0 || isMaximized) return; 
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialLeft = left;
        initialTop = top;
        
        focusWindow(id);

        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', onDragEnd);
    }

    function onDrag(e: MouseEvent) {
        if (!isDragging) return;
        left = initialLeft + (e.clientX - dragStartX);
        top = initialTop + (e.clientY - dragStartY);
    }

    function onDragEnd() {
        isDragging = false;
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', onDragEnd);
    }

    // --- RESIZE LOGIC ---
    let isResizing = false;
    let resizeStartW: number, resizeStartH: number;

    function onResizeStart(e: MouseEvent) {
        e.stopPropagation();
        // Prevent resizing if the window is maximized!
        if (e.button !== 0 || isMaximized) return;
        
        isResizing = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        resizeStartW = width;
        resizeStartH = height;

        window.addEventListener('mousemove', onResize);
        window.addEventListener('mouseup', onResizeEnd);
    }

    function onResize(e: MouseEvent) {
        if (!isResizing) return;
        width = Math.max(minWidth, resizeStartW + (e.clientX - dragStartX));
        height = Math.max(minHeight, resizeStartH + (e.clientY - dragStartY));
    }

    function onResizeEnd() {
        isResizing = false;
        window.removeEventListener('mousemove', onResize);
        window.removeEventListener('mouseup', onResizeEnd);
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
    <div class="title-bar" onmousedown={onDragStart}>
        <div class="title-bar-text">{title}</div>
        <div class="title-bar-controls">
            <button aria-label="Minimize" onclick={(e) => { e.stopPropagation(); minimizeWindow(id); }}>_</button>
            
            <button aria-label="Maximize" onclick={(e) => { e.stopPropagation(); toggleMaximize(); }}>
                {isMaximized ? '❐' : '☐'}
            </button>
            
            <button aria-label="Close" onclick={() => closeWindow(id)}>X</button>
        </div>
    </div>
    
    <div class="window-body">
        <slot></slot>
    </div>

    <div class="resize-handle" onmousedown={onResizeStart}></div>
</div>

<style>
    .win98-window {
        position: absolute;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        display: flex;
        flex-direction: column;
        /* Adds a subtle classic shadow to floating windows */
        box-shadow: 2px 2px 0 rgba(0,0,0,0.5); 
    }
    .maximized {
        top: 0 !important;
        left: 0 !important;
        
        /* 1. Viewport width MINUS the 320px UwU Sidebar */
        width: calc(100vw - 320px) !important; 
        
        /* 2. Viewport height MINUS the 35px Taskbar */
        height: calc(100dvh - 35px) !important; 
    }

    .title-bar {
        background: #000080;
        color: white;
        padding: 3px 2px 3px 3px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        /* Indicates to the user that this area is grab-able */
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
        /* Classic 98 push-in effect */
        padding: 1px 3px 0 5px; 
    }

    .window-body {
        padding: 10px;
        flex-grow: 1;
        overflow: auto; /* Adds scrollbars if content gets too big */
    }

    .resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 12px;
        height: 12px;
        cursor: nwse-resize; /* The diagonal resize arrow */
        z-index: 10;
        /* A classic ridged texture could be added here later, for now it's an invisible hit-box */
    }
    

    /* =========================================
       MOBILE OVERRIDES (Cleaned up and merged)
       ========================================= */
    @media (max-width: 768px) {
        .win98-window {
            /* Force to absolute bounds of the screen, overriding inline styles */
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            /* Remove the 3D border and shadow since it fills the screen */
            border: none;
            box-shadow: none;
        }

        .resize-handle {
            /* Disable resizing entirely */
            display: none !important;
        }

        .title-bar {
            /* Remove dragging cursor implication & give breathing room */
            cursor: default;
            padding: 6px 4px 6px 6px !important;
        }

        /* Hide the minimize button entirely */
        button[aria-label="Minimize"],
        button[aria-label="Maximize"] {
            display: none !important;
        }

        /* Make the close button a much larger, touch-friendly target */
        button[aria-label="Close"] {
            padding: 4px 16px !important;
            font-size: 1.2rem !important;
        }
        .maximized { 
            width: 100vw !important; 
        }
    }
</style>