// src/lib/server/origin.ts
import { env } from '$env/dynamic/private';

/**
 * Robustly resolves the public external origin of the application,
 * taking into account reverse proxies, CDN headers, custom domains (e.g. uwu.meme),
 * and environment variables.
 */
export function resolveAppOrigin(url: URL, request: Request): { origin: string; isHttps: boolean } {
    // 1. Explicit environment variable (ORIGIN, PUBLIC_SITE_URL, SITE_URL)
    const envOrigin = env.ORIGIN || env.PUBLIC_SITE_URL || env.SITE_URL;
    if (envOrigin) {
        const clean = envOrigin.replace(/\/+$/, '');
        return { origin: clean, isHttps: clean.startsWith('https://') };
    }

    // 2. Reverse proxy headers (Cloudflare, Vercel, Nginx, Railway)
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const hostHeader = forwardedHost || request.headers.get('host') || url.host;

    if (hostHeader) {
        const firstHost = hostHeader.split(',')[0].trim();
        const isLocal = firstHost.includes('localhost') || firstHost.includes('127.0.0.1');

        if (!isLocal) {
            const proto = (forwardedProto ? forwardedProto.split(',')[0].trim() : 'https').replace(':', '');
            return { origin: `${proto}://${firstHost}`, isHttps: proto === 'https' };
        }
    }

    // 3. If url.hostname is a live domain
    if (url.hostname && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
        const isHttps = url.protocol === 'https:';
        return { origin: `${url.protocol}//${url.host}`, isHttps };
    }

    // 4. Localhost development fallback
    const isHttps = url.protocol === 'https:';
    return { origin: url.origin, isHttps };
}
