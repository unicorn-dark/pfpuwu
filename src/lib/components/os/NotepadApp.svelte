<script lang="ts">
    import { onMount } from 'svelte';

    let content = $state('');
    let fileMenuOpen = $state(false);

    // 1. Load notes from LocalStorage when the app opens
    onMount(() => {
        const savedNotes = localStorage.getItem('win98-notepad');
        if (savedNotes) {
            content = savedNotes;
        }
    });

    // 2. Auto-save to LocalStorage automatically whenever 'content' changes
    $effect(() => {
        localStorage.setItem('win98-notepad', content);
    });

    // 3. Logic to generate and download a .txt file
    const downloadTxt = () => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'untitled.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        fileMenuOpen = false; // Close menu after clicking
    };

    const clearNotepad = () => {
        if (confirm('Are you sure you want to completely clear your notes?')) {
            content = '';
        }
        fileMenuOpen = false;
    };

    const toggleFileMenu = (e: MouseEvent) => {
        e.stopPropagation();
        fileMenuOpen = !fileMenuOpen;
    };
</script>

<div class="notepad-wrapper" onclick={() => fileMenuOpen = false}>
    
    <div class="menu-bar">
        <div class="menu-item-container">
            <button class="menu-btn {fileMenuOpen ? 'active' : ''}" onclick={toggleFileMenu}>
                <u>F</u>ile
            </button>
            
            {#if fileMenuOpen}
                <div class="dropdown-menu">
                    <button onclick={downloadTxt}>Save As... (.txt)</button>
                    <div class="menu-divider"></div>
                    <button onclick={clearNotepad}>New / Clear</button>
                </div>
            {/if}
        </div>
        <button class="menu-btn" disabled><u>E</u>dit</button>
        <button class="menu-btn" disabled><u>S</u>earch</button>
        <button class="menu-btn" disabled><u>H</u>elp</button>
    </div>

    <div class="textarea-container">
        <textarea 
            bind:value={content} 
            spellcheck="false"
            placeholder="Type your notes here..."
        ></textarea>
    </div>
</div>

<style>
    .notepad-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #c0c0c0;
        font-family: Arial, sans-serif;
    }

    /* Classic Menu Bar */
    .menu-bar {
        display: flex;
        gap: 2px;
        padding: 2px;
        background: #c0c0c0;
        border-bottom: 1px solid #ffffff; /* Creates a slight bevel under the menu */
        box-shadow: 0 1px 0 #808080;
    }

    .menu-item-container {
        position: relative;
    }

    .menu-btn {
        background: transparent;
        border: none;
        padding: 4px 6px;
        font-family: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        color: #000;
    }

    .menu-btn:hover, .menu-btn.active {
        background: #000080;
        color: white;
    }

    .menu-btn[disabled] {
        color: #808080;
        cursor: default;
    }

    .menu-btn[disabled]:hover {
        background: transparent;
    }

    /* Dropdown Menu */
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff; /* Outset border */
        display: flex;
        flex-direction: column;
        min-width: 150px;
        z-index: 100;
        padding: 2px;
        box-shadow: 2px 2px 5px rgba(0,0,0,0.5);
    }

    .dropdown-menu button {
        background: transparent;
        border: none;
        text-align: left;
        padding: 4px 8px;
        font-family: inherit;
        font-size: 0.9rem;
        cursor: pointer;
    }

    .dropdown-menu button:hover {
        background: #000080;
        color: white;
    }

    .menu-divider {
        height: 1px;
        background: #808080;
        border-bottom: 1px solid #ffffff;
        margin: 2px 4px;
    }

    /* Text Area */
    .textarea-container {
        flex-grow: 1;
        padding: 4px;
        background: #c0c0c0;
        display: flex;
    }

    textarea {
        flex-grow: 1;
        width: 100%;
        resize: none;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080; /* Classic sunken text box */
        background: #ffffff;
        padding: 4px;
        font-family: 'Courier New', Courier, monospace; /* Classic Notepad fixed-width font */
        font-size: 1rem;
        outline: none;
    }
</style>