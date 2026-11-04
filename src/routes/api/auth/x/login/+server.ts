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
    const requestedFlow = url.searchParams.get('flow'); // 'oauth1' | 'oauth2' | 'authorize' | 'force' | 'twitter'
    const rawHandleHint = url.searchParams.get('handle') || '';
    const cleanHandleHint = rawHandleHint.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    const apiKey = env.X_API_KEY;
    const apiSecret = env.X_API_SECRET;
    const clientId = env.X_CLIENT_ID;
    const clientSecret = env.X_CLIENT_SECRET;

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

    if (cleanHandleHint) {
        setCookieWithDomainFallback('x_oauth_handle_hint', cleanHandleHint, 60 * 20);
    }

    // Use OAuth 2.0 PKCE (https://x.com/i/oauth2/authorize) whenever 'oauth2', 'authorize', or 'force'
    // is requested and X_CLIENT_ID is available. OAuth 2.0 PKCE uses X's modern React consent screen
    // and never touches the legacy 2010 /oauth/authorize POST form ("There is no request token for this page").
    const preferOAuth2 =
        Boolean(clientId) &&
        (requestedFlow === 'oauth2' || requestedFlow === 'authorize' || requestedFlow === 'force');

    // 1. OAuth 1.0a flow (same-origin on https://x.com/oauth/authenticate so Step 2 POST to https://x.com/oauth/authorize is same-origin)
    let oauth1Url: string | null = null;
    if (!preferOAuth2 && apiKey && apiSecret) {
        try {
            const { oauthToken, oauthTokenSecret } = await getOAuth1RequestToken(
                apiKey,
                apiSecret,
                redirectUri
            );

            // Store oauth_token_secret in secure cookies (host-only + .uwu.meme domain fallback)
            setCookieWithDomainFallback(`x_secret_${oauthToken}`, oauthTokenSecret, 60 * 15);
            setCookieWithDomainFallback('x_oauth1_secret', oauthTokenSecret, 60 * 15);

            if (requestedFlow === 'twitter') {
                oauth1Url = `https://api.twitter.com/oauth/authenticate?oauth_token=${encodeURIComponent(oauthToken)}`;
            } else if (requestedFlow === 'oauth1_authorize') {
                oauth1Url = `https://x.com/oauth/authorize?oauth_token=${encodeURIComponent(oauthToken)}`;
            } else {
                oauth1Url = `https://x.com/oauth/authenticate?oauth_token=${encodeURIComponent(oauthToken)}`;
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

    // 2. OAuth 2.0 PKCE flow (native https://x.com/i/oauth2/authorize without legacy request tokens)
    if (!clientId) {
        return json({ error: 'X credentials (API Key or Client ID) not configured' }, { status: 500 });
    }

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const stateSecret = clientSecret || apiSecret || clientId;
    const state = createStatelessOAuth2State(codeVerifier, stateSecret, cleanHandleHint);
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
