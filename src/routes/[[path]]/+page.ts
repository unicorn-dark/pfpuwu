// src/routes/[[path]]/+page.ts
import type { EntryGenerator } from './$types';

export const entries: EntryGenerator = () => [
    { path: '' },
    { path: 'pfp' },
    { path: 'chat' },
    { path: 'explorer' },
    { path: 'roadmap' },
    { path: 'blog' },
    { path: 'paint' },
    { path: 'minesweeper' }
];
