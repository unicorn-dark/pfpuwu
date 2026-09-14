// src/routes/[[path]]/+page.ts
import type { EntryGenerator } from './$types';

export const entries: EntryGenerator = () => [
    { path: '' },
    { path: 'memeguide' },
    { path: 'pfp' },
    { path: 'explorer' },
    { path: 'roadmap' },
    { path: 'blog' },
    { path: 'pumpit' },
    { path: 'paint' },
    { path: 'minesweeper' },
    { path: 'notepad' },
];
