<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    const ROWS = 9;
    const COLS = 9;
    const MINES = 10;

    let board: any[] = $state([]);
    let gameOver = $state(false);
    let gameWon = $state(false);
    let flagsLeft = $state(MINES);
    let time = $state(0);
    let timerInterval: any = null;
    let firstClick = $state(true);

    // Color map for the classic numbers
    const numColors = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];

    function initGame() {
        gameOver = false;
        gameWon = false;
        flagsLeft = MINES;
        time = 0;
        firstClick = true;
        if (timerInterval) clearInterval(timerInterval);

        let newBoard = [];
        for (let r = 0; r < ROWS; r++) {
            let row = [];
            for (let c = 0; c < COLS; c++) {
                row.push({ r, c, isMine: false, isRevealed: false, isFlagged: false, neighbors: 0 });
            }
            newBoard.push(row);
        }
        board = newBoard;
    }

    function placeMines(excludeR: number, excludeC: number) {
        let minesPlaced = 0;
        while (minesPlaced < MINES) {
            let r = Math.floor(Math.random() * ROWS);
            let c = Math.floor(Math.random() * COLS);
            // Ensure we don't put a mine on the first click
            if (!board[r][c].isMine && !(r === excludeR && c === excludeC)) {
                board[r][c].isMine = true;
                minesPlaced++;
            }
        }
        
        // Calculate neighbor numbers
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!board[r][c].isMine) {
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            let nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].isMine) {
                                count++;
                            }
                        }
                    }
                    board[r][c].neighbors = count;
                }
            }
        }
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (time < 999) time++;
        }, 1000);
    }

    function revealCell(r: number, c: number) {
        if (gameOver || gameWon || board[r][c].isFlagged || board[r][c].isRevealed) return;

        if (firstClick) {
            placeMines(r, c);
            startTimer();
            firstClick = false;
        }

        board[r][c].isRevealed = true;

        if (board[r][c].isMine) {
            gameOver = true;
            clearInterval(timerInterval);
            revealAllMines();
            return;
        }

        // Flood fill empty neighbors
        if (board[r][c].neighbors === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    let nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        revealCell(nr, nc);
                    }
                }
            }
        }

        checkWin();
    }

    function toggleFlag(r: number, c: number, event: MouseEvent) {
        event.preventDefault();
        if (gameOver || gameWon || board[r][c].isRevealed) return;

        if (!board[r][c].isFlagged && flagsLeft > 0) {
            board[r][c].isFlagged = true;
            flagsLeft--;
        } else if (board[r][c].isFlagged) {
            board[r][c].isFlagged = false;
            flagsLeft++;
        }
        checkWin();
    }

    function revealAllMines() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (board[r][c].isMine) {
                    board[r][c].isRevealed = true;
                }
            }
        }
    }

    function checkWin() {
        let hiddenSafeCells = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!board[r][c].isRevealed && !board[r][c].isMine) hiddenSafeCells++;
            }
        }
        if (hiddenSafeCells === 0) {
            gameWon = true;
            clearInterval(timerInterval);
            flagsLeft = 0; // Visually flag remaining mines
        }
    }

    onMount(() => { initGame(); });
    onDestroy(() => { if (timerInterval) clearInterval(timerInterval); });

    function formatNumber(num: number) {
        return num.toString().padStart(3, '0');
    }
</script>

<div class="minesweeper-wrapper">
    <div class="ms-header">
        <div class="lcd">{formatNumber(flagsLeft)}</div>
        <button class="smiley-btn" onclick={initGame}>
            {#if gameOver}😵{:else if gameWon}😎{:else}🙂{/if}
        </button>
        <div class="lcd">{formatNumber(time)}</div>
    </div>

    <div class="ms-board">
        {#each board as row}
            <div class="ms-row">
                {#each row as cell}
                    <div 
                        class="ms-cell {cell.isRevealed ? 'revealed' : ''} {cell.isMine && gameOver && !cell.isFlagged ? 'exploded' : ''}"
                        onclick={() => revealCell(cell.r, cell.c)}
                        oncontextmenu={(e) => toggleFlag(cell.r, cell.c, e)}
                    >
                        {#if cell.isRevealed}
                            {#if cell.isMine}
                                💣
                            {:else if cell.neighbors > 0}
                                <span style="color: {numColors[cell.neighbors]}">{cell.neighbors}</span>
                            {/if}
                        {:else if cell.isFlagged}
                            <span style="color: red;">🚩</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</div>

<style>
    .minesweeper-wrapper {
        background: #c0c0c0;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        height: 100%;
        box-sizing: border-box;
    }

    .ms-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 6px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080; /* Inset */
    }

    .lcd {
        background: black;
        color: red;
        font-family: 'Courier New', Courier, monospace;
        font-weight: bold;
        font-size: 1.5rem;
        padding: 2px 4px;
        line-height: 1;
        border: 1px solid #808080;
    }

    .smiley-btn {
        font-size: 1.2rem;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        cursor: pointer;
        padding: 2px 4px;
    }

    .smiley-btn:active {
        border-color: #808080 #ffffff #ffffff #808080;
    }

    .ms-board {
        border: 3px solid;
        border-color: #808080 #ffffff #ffffff #808080; /* Inset */
        background: #c0c0c0;
        display: inline-block;
        margin: 0 auto;
    }

    .ms-row {
        display: flex;
    }

    .ms-cell {
        width: 24px;
        height: 24px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff; /* Outset */
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: Arial, sans-serif;
        font-weight: 900;
        font-size: 16px;
        cursor: default;
        user-select: none;
        box-sizing: border-box;
    }

    .ms-cell.revealed {
        border: 1px solid #808080; /* Flat inset line */
        border-right: 1px solid #c0c0c0;
        border-bottom: 1px solid #c0c0c0;
        background: #c0c0c0;
    }

    .ms-cell.exploded {
        background: red;
    }
    /* =========================================
       MOBILE OVERRIDES (Edge-to-Edge Grid)
       ========================================= */
    @media (max-width: 768px) {
        .minesweeper-wrapper {
            padding: 4px;
            /* Push the board up slightly so it centers better */
            justify-content: flex-start; 
        }

        .ms-header {
            margin-bottom: 20px; /* Add breathing room below the LCDs */
            padding: 8px 10px;
        }

        .lcd {
            font-size: 2rem; /* Make the counters much easier to read */
        }

        .smiley-btn {
            font-size: 2rem; /* Make the reset button a huge, easy target */
        }

        .ms-board {
            width: 100%;
            box-sizing: border-box;
            border-width: 4px;
        }

        .ms-row {
            width: 100%;
        }

        .ms-cell {
            /* 1. Remove the hardcoded 24px limit */
            width: auto; 
            height: auto;
            
            /* 2. Tell the 9 cells to share the screen width equally */
            flex: 1; 
            
            /* 3. Magically force every cell to remain a perfect square */
            aspect-ratio: 1; 
            
            /* 4. Scale up the numbers and bombs so they fit the new giant cells */
            font-size: 6vw; 
            
            /* Thicker 3D borders so it doesn't look flat when stretched */
            border-width: 3px; 
        }

        .ms-cell.revealed {
            border-width: 1px;
            border-right: 1px solid #c0c0c0;
            border-bottom: 1px solid #c0c0c0;
        }
    }
</style>