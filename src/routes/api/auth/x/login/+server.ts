// src/routes/api/auth/x/login/+server.ts
import { redirect, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { getOAuth1RequestToken, createStatelessOAuth2State } from '$lib/server/twitterOAuth';
import { resolveAppOrigin, resolveCookieDomain } from '$lib/server/origin';

export const GET: RequestHandler = async ({ url, cookies, request, setHeaders }) => {
    // Prevent browsers, mobile WebViews, and proxies from ever caching a 302 redirect with a used token
    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    const { origin, isHttps } = resolveAppOrigin(url, request);
    const cookieDomain = resolveCookieDomain(url, request);
    const redirectUri = `${origin}/api/auth/x/callback`;
    const isProd = isHttps;
    const requestedFlow = url.searchParams.get('flow'); // 'oauth1' | 'authorize' | 'force' | 'oauth2'

    const apiKey = env.X_API_KEY;
    const apiSecret = env.X_API_SECRET;

    const setCookieWithDomainFallback = (name: string, value: string, maxAge: number) => {
        cookies.set(name, value, {
            path: '/',
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            maxAge
        });
        if (cookieDomain) {
            cookies.set(name, value, {
                path: '/',
                domain: cookieDomain,
                httpOnly: true,
                secure: isProd,
                sameSite: 'lax',
                maxAge
            });
        }
    };

    // 1. Prefer OAuth 1.0a on api.x.com (works with Standalone App 33541174 without requiring an X v2 Project)
    let oauth1Url: string | null = null;
    if (requestedFlow !== 'oauth2' && apiKey && apiSecret) {
        try {
            const { oauthToken, oauthTokenSecret } = await getOAuth1RequestToken(
                apiKey,
                apiSecret,
                redirectUri
            );

            // Store oauth_token_secret in secure cookies (host-only + .uwu.meme domain fallback)
            setCookieWithDomainFallback(`x_secret_${oauthToken}`, oauthTokenSecret, 60 * 15);
            setCookieWithDomainFallback('x_oauth1_secret', oauthTokenSecret, 60 * 15);

            // IMPORTANT: Always redirect OAuth 1.0a to https://api.x.com/oauth/... (NOT https://x.com/oauth/...)!
            // Why:
            // 1. X's session cookies (auth_token, twid) are scoped to Domain=.x.com, so api.x.com receives the user's active login!
            // 2. Root https://x.com registers X's PWA Service Worker (sw.js), which intercepts POST /oauth/authenticate form submissions
            //    and turns them into GET /oauth/authenticate without the POST body — causing "There is no request token for this page"!
            // 3. api.x.com is outside https://x.com's Service Worker scope, so POST form submissions always preserve oauth_token.
            if (requestedFlow === 'twitter') {
                oauth1Url = `https://api.twitter.com/oauth/authenticate?oauth_token=${encodeURIComponent(oauthToken)}`;
            } else if (requestedFlow === 'authorize' || requestedFlow === 'force') {
                oauth1Url = `https://api.x.com/oauth/authorize?oauth_token=${encodeURIComponent(oauthToken)}`;
            } else {
                oauth1Url = `https://api.x.com/oauth/authenticate?oauth_token=${encodeURIComponent(oauthToken)}`;
            }
        } catch (err: any) {
            console.error('OAuth 1.0a initiation failed, falling back to OAuth 2.0:', err);
        }
    }

    if (oauth1Url) {
        if (url.searchParams.get('format') === 'json') {
            return json({ url: oauth1Url });
        }
        throw redirect(302, oauth1Url);
    }

    // 2. OAuth 2.0 PKCE flow (native x.com/i/oauth2/authorize without legacy request tokens)
    const clientId = env.X_CLIENT_ID;
    const clientSecret = env.X_CLIENT_SECRET;
    if (!clientId) {
        return json({ error: 'X credentials (API Key or Client ID) not configured' }, { status: 500 });
    }

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const stateSecret = clientSecret || apiSecret || clientId;
    const state = createStatelessOAuth2State(codeVerifier, stateSecret);
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

    setCookieWithDomainFallback('x_oauth_state', state, 60 * 15);
    setCookieWithDomainFallback('x_oauth_verifier', codeVerifier, 60 * 15);

    const scope = 'users.read tweet.read';
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });

    const authUrl = `https://x.com/i/oauth2/authorize?${params.toString().replace(/\+/g, '%20')}`;

    if (url.searchParams.get('format') === 'json') {
        return json({ url: authUrl });
    }

    throw redirect(302, authUrl);
};
