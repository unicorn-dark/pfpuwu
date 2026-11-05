// src/lib/utils/avatar.ts
import { LAYER_ORDER, TRAITS, getCachedTraitImage } from './traits';

const renderedAvatarCache = new Map<string, string>();
const pendingRenderPromises = new Map<string, Promise<{ dataUrl: string; blob: Blob | null }>>();

/**
 * Encodes a trait index map into a compact ~28-byte URL (`/unicorn.png?t=0.1.2.1.0.1.1`)
 * so we NEVER store or broadcast 35 KB base64 PNG strings in Supabase DB or Realtime.
 */
export function encodeAvatarTraitsUrl(traits?: Record<string, number> | null): string {
    if (!traits || typeof traits !== 'object' || Object.keys(traits).length === 0) {
        return '/unicorn.png';
    }
    const indices = LAYER_ORDER.map((layer) => {
        const val = traits[layer];
        return typeof val === 'number' && val >= 0 ? Math.floor(val) : layer === 'body' ? 0 : 0;
    });
    return `/unicorn.png?t=${indices.join('.')}`;
}

/**
 * Decodes a compact `/unicorn.png?t=0.1.2.1.0.1.1` URL back into a traits record.
 */
export function decodeAvatarTraitsUrl(url?: string | null): Record<string, number> | null {
    if (!url || typeof url !== 'string') return null;
    const qIdx = url.indexOf('?t=');
    if (qIdx === -1) return null;
    const raw = url.slice(qIdx + 3).split('&')[0];
    const parts = raw.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== LAYER_ORDER.length || parts.some((n) => isNaN(n) || n < 0)) {
        return null;
    }
    const traits: Record<string, number> = {};
    LAYER_ORDER.forEach((layer, idx) => {
        traits[layer] = parts[idx];
    });
    return traits;
}

/**
 * Converts any avatar URL + traits into a compact, database/network-safe URL (< 100 bytes).
 * Strictly strips `data:image/...` base64 strings and external `twimg.com` URLs.
 */
export function toCompactAvatarUrl(
    avatarUrl?: string | null,
    traits?: Record<string, number> | null
): string {
    if (traits && typeof traits === 'object' && Object.keys(traits).length > 0) {
        return encodeAvatarTraitsUrl(traits);
    }
    if (avatarUrl && decodeAvatarTraitsUrl(avatarUrl)) {
        return avatarUrl;
    }
    if (
        avatarUrl &&
        !avatarUrl.startsWith('data:image/') &&
        !avatarUrl.includes('twimg.com') &&
        avatarUrl.length < 240
    ) {
        return avatarUrl;
    }
    return '/unicorn.png';
}

/**
 * Returns the ordered `/traits/...` static image paths for a traits record.
 */
export function getTraitLayerPaths(traits: Record<string, number>): string[] {
    const paths: string[] = [];
    LAYER_ORDER.forEach((layerName) => {
        const selectedIndex = traits[layerName] ?? 0;
        const traitObj = TRAITS[layerName]?.[selectedIndex];
        if (traitObj && traitObj.src) {
            paths.push(traitObj.src);
        }
    });
    return paths;
}

/**
 * Renders the avatar character traits with a 100% transparent background
 * (NO background color and NO ring). Uses an in-memory cache to avoid redundant canvas renders.
 */
export async function renderTransparentAvatar(
    traits: Record<string, number>,
    size = 256,
    needBlob = false
): Promise<{ dataUrl: string; blob: Blob | null }> {
    if (typeof window === 'undefined') {
        return { dataUrl: '/unicorn.png', blob: null };
    }

    const compactKey = `${encodeAvatarTraitsUrl(traits)}@${size}`;
    if (!needBlob) {
        const cached = renderedAvatarCache.get(compactKey);
        if (cached) {
            return { dataUrl: cached, blob: null };
        }
        const inflight = pendingRenderPromises.get(compactKey);
        if (inflight) {
            return inflight;
        }
    }

    const renderJob = (async () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return { dataUrl: '/unicorn.png', blob: null };
        }

        ctx.clearRect(0, 0, size, size);
        const imagePathsToLoad = getTraitLayerPaths(traits);
        const images = await Promise.all(imagePathsToLoad.map(getCachedTraitImage));

        images.forEach((img) => {
            if (img) {
                ctx.drawImage(img, 0, 0, size, size);
            }
        });

        const dataUrl = canvas.toDataURL('image/png');
        renderedAvatarCache.set(compactKey, dataUrl);
        // Also cache under size 256/128 alias if default
        renderedAvatarCache.set(encodeAvatarTraitsUrl(traits), dataUrl);

        const blob = needBlob
            ? await new Promise<Blob | null>((resolve) =>
                  canvas.toBlob((b) => resolve(b), 'image/png')
              )
            : null;

        return { dataUrl, blob };
    })();

    if (!needBlob) {
        pendingRenderPromises.set(compactKey, renderJob);
        renderJob.finally(() => pendingRenderPromises.delete(compactKey));
    }

    return renderJob;
}

/**
 * Synchronously returns a cached rendered `data:image/png` URL for a compact `/unicorn.png?t=...` URL
 * (or kicks off a background render and invokes `onRendered` when ready).
 */
export function resolveClientAvatarSrc(
    avatarUrl?: string | null,
    traits?: Record<string, number> | null,
    onRendered?: (dataUrl: string) => void
): string {
    if (typeof window === 'undefined') return '/unicorn.png';

    const decoded =
        traits && Object.keys(traits).length > 0
            ? traits
            : decodeAvatarTraitsUrl(avatarUrl);

    if (decoded) {
        const key = encodeAvatarTraitsUrl(decoded);
        const cached = renderedAvatarCache.get(key) || renderedAvatarCache.get(`${key}@256`);
        if (cached) return cached;

        renderTransparentAvatar(decoded, 128, false).then(({ dataUrl }) => {
            if (dataUrl && onRendered) onRendered(dataUrl);
        });
        return '/unicorn.png';
    }

    if (!avatarUrl || avatarUrl.includes('twimg.com')) {
        return '/unicorn.png';
    }
    return avatarUrl;
}

/**
 * Action for `<img>` elements (`use:hydrateTraitAvatar={avatarUrl}`) that automatically
 * replaces `/unicorn.png?t=...` compact trait URLs with the rendered transparent PNG.
 */
export function hydrateTraitAvatar(node: HTMLImageElement, initialUrl?: string | null) {
    let currentUrl = initialUrl;

    function update(url?: string | null) {
        currentUrl = url;
        if (url && url.startsWith('data:image/')) {
            node.src = url;
            return;
        }
        const decoded = decodeAvatarTraitsUrl(url) || getDefaultAvatarTraits();
        const key = encodeAvatarTraitsUrl(decoded);
        const cached = renderedAvatarCache.get(key) || renderedAvatarCache.get(`${key}@128`);
        if (cached) {
            node.src = cached;
            return;
        }
        renderTransparentAvatar(decoded, 128, false).then(({ dataUrl }) => {
            if (currentUrl === url && dataUrl) {
                node.src = dataUrl;
            }
        });
    }

    update(initialUrl);

    return {
        update
    };
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
