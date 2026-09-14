// src/lib/utils/traits.ts

export const LAYER_ORDER = [
    "body",
    "face",
    "eyes",
    "head",
    "costume",
    "accessory",
    "horn",
];

export const BACKGROUND_OPTIONS = [
    { name: "Pitch Black", hex: "#000000" },
    { name: "Midnight Blue", hex: "#000033" },
    { name: "Deep Navy", hex: "#000080" },
    { name: "Dark Crimson", hex: "#4A0404" },
    { name: "Bordeaux", hex: "#660033" },
    { name: "Deep Eggplant", hex: "#301934" },
    { name: "Indigo", hex: "#4B0082" },
    { name: "Plum", hex: "#483248" },
    { name: "Void Purple", hex: "#2E0854" },
];

export interface TraitItem {
    name: string;
    src: string | null;
}

export interface RingOption {
    name: string;
    id: string | null;
}

import traitFiles from './traitFiles.json';

export const ALL_TRAIT_SRC_PATHS: string[] = traitFiles;
export const TRAITS: Record<string, TraitItem[]> = {};
export const RING_OPTIONS: RingOption[] = [{ name: "None", id: null }];

LAYER_ORDER.forEach((layer) => {
    TRAITS[layer] = layer === "body" ? [] : [{ name: "None", src: null }];
});

traitFiles.forEach((publicUrl) => {
    const parts = publicUrl.split("/");
    const fileName = parts.pop() as string;
    const folderName = parts.pop() as string;

    if (folderName === "background") return;

    let cleanName = fileName.replace(".png", "").replace(/[-_]/g, " ");
    cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

    if (folderName === "ring") {
        if (fileName.startsWith("top-ring")) {
            const colorId = fileName
                .replace("top-ring-", "")
                .replace(".png", "");
            RING_OPTIONS.push({ name: `Color ${colorId}`, id: colorId });
        }
    } else if (TRAITS[folderName]) {
        TRAITS[folderName].push({ name: cleanName, src: publicUrl });
    }
});

RING_OPTIONS.sort((a, b) => {
    if (!a.id) return -1;
    if (!b.id) return 1;
    return parseInt(a.id) - parseInt(b.id);
});

// Global in-memory image cache shared between BIOS loader and PFP Maker
export const traitImageCache = new Map<string, HTMLImageElement>();

export function getCachedTraitImage(src: string): Promise<HTMLImageElement | null> {
    if (!src) return Promise.resolve(null);
    const cached = traitImageCache.get(src);
    if (cached) return Promise.resolve(cached);

    if (typeof window === "undefined") return Promise.resolve(null);

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            traitImageCache.set(src, img);
            resolve(img);
        };
        img.onerror = () => {
            console.warn(`Failed to load: ${src}`);
            resolve(null);
        };
        img.src = src;
    });
}
