import { writable, get } from 'svelte/store';

export interface WindowState {
    id: string;
    appId: string;
    title: string;
    icon?: string;
    isOpen: boolean;
    isMinimized: boolean;
    zIndex: number;
    width: number;
    height: number;
    props?: Record<string, any>;
}

export interface AppDefinition {
    id: string;
    title: string;
    icon: string;
    defaultWidth: number;
    defaultHeight: number;
    minWidth: number;
    minHeight: number;
    route: string;
    badge?: string;
}

export const APP_REGISTRY: AppDefinition[] = [
    {
        id: 'pfp-app',
        title: 'PFP Maker',
        icon: '🎨',
        defaultWidth: 920,
        defaultHeight: 650,
        minWidth: 580,
        minHeight: 420,
        route: '/pfp'
    },
    {
        id: 'chatbox',
        title: 'Global Chat (24h)',
        icon: '💬',
        defaultWidth: 440,
        defaultHeight: 620,
        minWidth: 320,
        minHeight: 400,
        route: '/chat',
        badge: 'LIVE'
    },
    {
        id: 'meme-explorer',
        title: 'Meme Explorer',
        icon: '🦄',
        defaultWidth: 920,
        defaultHeight: 620,
        minWidth: 420,
        minHeight: 360,
        route: '/explorer'
    },
    {
        id: 'jspaint',
        title: 'JS Paint',
        icon: '🖌️',
        defaultWidth: 820,
        defaultHeight: 600,
        minWidth: 320,
        minHeight: 300,
        route: '/paint'
    },
    {
        id: 'minesweeper',
        title: 'Minesweeper',
        icon: '💣',
        defaultWidth: 300,
        defaultHeight: 370,
        minWidth: 260,
        minHeight: 320,
        route: '/minesweeper'
    },
    {
        id: 'privateers-blog',
        title: 'Privateer Blog',
        icon: '🌐',
        defaultWidth: 840,
        defaultHeight: 680,
        minWidth: 320,
        minHeight: 300,
        route: '/blog'
    },
    {
        id: 'roadmap',
        title: 'UwU Roadmap',
        icon: '🗺️',
        defaultWidth: 850,
        defaultHeight: 680,
        minWidth: 340,
        minHeight: 320,
        route: '/roadmap'
    }
];

export const isBooting = writable(true);
export const activeWindows = writable<WindowState[]>([]);
export const highestZIndex = writable(20);
export const isDraggingAnyWindow = writable(false);

// Bottom-Right Docked Chat Drawer State
export const isChatDrawerOpen = writable<boolean>(false);
export function openChatDrawer() {
    isChatDrawerOpen.set(true);
}
export function closeChatDrawer() {
    isChatDrawerOpen.set(false);
}
export function toggleChatDrawer() {
    isChatDrawerOpen.update((v) => !v);
}

export const openWindow = (
    id: string,
    title?: string,
    width?: number,
    height?: number,
    props: Record<string, any> = {}
) => {
    highestZIndex.update((n) => n + 1);
    const newZ = get(highestZIndex);

    const appDef = APP_REGISTRY.find((a) => a.id === id);
    const resolvedTitle = title || appDef?.title || id;
    const resolvedIcon = appDef?.icon || '🗔';
    const resolvedWidth = width || appDef?.defaultWidth || 600;
    const resolvedHeight = height || appDef?.defaultHeight || 450;

    activeWindows.update((windows) => {
        const existing = windows.find((w) => w.id === id);
        if (existing) {
            existing.isOpen = true;
            existing.isMinimized = false;
            existing.zIndex = newZ;
            if (title) existing.title = title;
            if (Object.keys(props).length > 0) {
                existing.props = { ...(existing.props || {}), ...props };
            }
            return [...windows];
        }

        return [
            ...windows,
            {
                id,
                appId: appDef?.id || id,
                title: resolvedTitle,
                icon: resolvedIcon,
                isOpen: true,
                isMinimized: false,
                zIndex: newZ,
                width: resolvedWidth,
                height: resolvedHeight,
                props
            }
        ];
    });
};

/**
 * Convenience helper to open a user's MySpace page from anywhere (Chatbox, Sticky Note, Taskbar)
 */
export const openUserSpace = (_username?: string) => {
    // MySpace is disabled for now per user request
};

export const closeWindow = (id: string) => {
    activeWindows.update((windows) => {
        const win = windows.find((w) => w.id === id);
        if (win) win.isOpen = false;
        return [...windows];
    });
};

export const focusWindow = (id: string) => {
    highestZIndex.update((n) => n + 1);
    const newZ = get(highestZIndex);
    activeWindows.update((windows) => {
        const win = windows.find((w) => w.id === id);
        if (win) {
            win.zIndex = newZ;
        }
        return [...windows];
    });
};

export const minimizeWindow = (id: string) => {
    activeWindows.update((windows) => {
        const win = windows.find((w) => w.id === id);
        if (win) win.isMinimized = true;
        return [...windows];
    });
};

export const restoreWindow = (id: string) => {
    highestZIndex.update((n) => n + 1);
    const newZ = get(highestZIndex);
    activeWindows.update((windows) => {
        const win = windows.find((w) => w.id === id);
        if (win) {
            win.isMinimized = false;
            win.zIndex = newZ;
        }
        return [...windows];
    });
};
