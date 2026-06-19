<script lang="ts">
    // No advanced logic needed, just a clean wrapper for the iframe
</script>

<div class="ie-wrapper">
    <div class="ie-toolbar">
        <div class="ie-buttons">
            <button disabled>⬅ Back</button>
            <button disabled>➡ Forward</button>
            <button disabled>✖ Stop</button>
            <button disabled>↻ Refresh</button>
            <button disabled>🏠 Home</button>
        </div>
        <div class="ie-address-row">
            <span class="ie-label">Address</span>
            <div class="ie-url-box">
                <img src="https://www.google.com/s2/favicons?domain=privateersa.com&sz=16" alt="icon" class="favicon" onerror={(e: any) => e.target.style.display = 'none'}>
                https://privateersa.com/
            </div>
        </div>
    </div>

    <div class="ie-viewport">
        <iframe 
            src="https://privateersa.com/" 
            title="Privateer SA Blog" 
            sandbox="allow-scripts allow-same-origin allow-popups"
        ></iframe>
    </div>
</div>

<style>
    .ie-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #c0c0c0;
        box-sizing: border-box;
    }

    /* Toolbar Styling */
    .ie-toolbar {
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-bottom: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080; /* Inset line */
    }

    .ie-buttons {
        display: flex;
        gap: 4px;
    }

    .ie-buttons button {
        background: transparent;
        border: 1px solid transparent;
        padding: 4px 8px;
        color: #808080; /* Disabled look */
        cursor: default;
    }

    .ie-address-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ie-label {
        font-family: inherit;
        font-size: 0.9rem;
        color: #000;
    }

    .ie-url-box {
        flex-grow: 1;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080; /* Inset text box */
        padding: 3px 6px;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: Arial, sans-serif;
        font-size: 0.9rem;
        color: #000;
    }

    .favicon {
        width: 16px;
        height: 16px;
    }

    /* Viewport Styling */
    /* Viewport Styling */
    .ie-viewport {
        flex-grow: 1;
        position: relative; /* 1. Creates an inescapable anchor box */
        width: 100%;
        
        /* 2. Allow scrolling INSIDE the window if the blog overflows */
        overflow: auto; 
        -webkit-overflow-scrolling: touch; 
        
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080; 
        background: #ffffff;
    }

    iframe {
        /* 3. Rip the iframe out of the layout flow and nail it to the corners */
        position: absolute; 
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        display: block;
    }
</style>