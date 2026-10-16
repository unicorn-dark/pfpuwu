// src/lib/utils/avatar.ts
import { LAYER_ORDER, TRAITS, getCachedTraitImage } from './traits';

/**
 * Renders the avatar character traits with a 100% transparent background
 * (NO background color and NO ring).
 *
 * @param traits Record of layer name to selected trait index
 * @param size Target canvas width and height in pixels (default 256)
 * @returns Promise resolving to a base64 PNG data URL
 */
export async function renderTransparentAvatar(
    traits: Record<string, number>,
    size = 256
): Promise<{ dataUrl: string; blob: Blob | null }> {
    if (typeof window === 'undefined') {
        return { dataUrl: '/unicorn.png', blob: null };
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { dataUrl: '/unicorn.png', blob: null };
    }

    // Explicitly clear canvas for crisp transparency
    ctx.clearRect(0, 0, size, size);

    const imagePathsToLoad: string[] = [];

    LAYER_ORDER.forEach((layerName) => {
        const selectedIndex = traits[layerName] ?? (layerName === 'body' ? 0 : 0);
        const traitObj = TRAITS[layerName]?.[selectedIndex];

        if (traitObj && traitObj.src) {
            imagePathsToLoad.push(traitObj.src);
        }
    });

    const images = await Promise.all(imagePathsToLoad.map(getCachedTraitImage));

    images.forEach((img) => {
        if (img) {
            ctx.drawImage(img, 0, 0, size, size);
        }
    });

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
    );

    return { dataUrl, blob };
}

/**
 * Returns default initial traits for a brand new persona
 */
export function getDefaultAvatarTraits(): Record<string, number> {
    const traits: Record<string, number> = {};
    LAYER_ORDER.forEach((layer) => {
        traits[layer] = layer === 'body' ? 0 : 1;
    });
    return traits;
}
