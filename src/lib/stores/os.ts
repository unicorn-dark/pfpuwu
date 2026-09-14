import { writable, get } from 'svelte/store';

export interface WindowState {
    id: string;
    title: string;
    isOpen: boolean;
    isMinimized: boolean;
    zIndex: number;
    width: number;
    height: number;
}

export const isBooting = writable(true);
export const activeWindows = writable<WindowState[]>([]);
export const highestZIndex = writable(10);

export const openWindow = (id: string, title: string, width = 400, height = 300) => {
    highestZIndex.update(n => n + 1);
    const newZ = get(highestZIndex);
    
    activeWindows.update(windows => {
        const existing = windows.find(w => w.id === id);
        if (existing) {
            existing.isOpen = true;
            existing.isMinimized = false; // Restore if it was minimized
            existing.zIndex = newZ;
            return [...windows];
        }
        
        return [...windows, { id, title, isOpen: true, isMinimized: false, zIndex: newZ, width, height }];
    });
};

export const closeWindow = (id: string) => {
    activeWindows.update(windows => {
        const win = windows.find(w => w.id === id);
        if (win) win.isOpen = false;
        return [...windows];
    });
};

export const focusWindow = (id: string) => {
    highestZIndex.update(n => n + 1);
    const newZ = get(highestZIndex);
    activeWindows.update(windows => {
        const win = windows.find(w => w.id === id);
        if (win) {
            win.zIndex = newZ;
        }
        return [...windows];
    });
};

export const minimizeWindow = (id: string) => {
    activeWindows.update(windows => {
        const win = windows.find(w => w.id === id);
        if (win) win.isMinimized = true;
        return [...windows];
    });
};

export const restoreWindow = (id: string) => {
    highestZIndex.update(n => n + 1);
    const newZ = get(highestZIndex);
    activeWindows.update(windows => {
        const win = windows.find(w => w.id === id);
        if (win) {
            win.isMinimized = false;
            win.zIndex = newZ;
        }
        return [...windows];
    });
};
