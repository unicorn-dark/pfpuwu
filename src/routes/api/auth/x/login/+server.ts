// src/routes/api/auth/x/login/+server.ts
import { redirect, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { getOAuth1RequestToken } from '$lib/server/twitterOAuth';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const origin = url.origin;
    const redirectUri = `${origin}/api/auth/x/callback`;
    const isProd = url.protocol === 'https:';

    const apiKey = env.X_API_KEY;
    const apiSecret = env.X_API_SECRET;

    // 1. Prefer OAuth 1.0a ("Sign in with Twitter") — 100% Free Tier compatible!
    let oauth1Url: string | null = null;
    if (apiKey && apiSecret) {
        try {
            const { oauthToken, oauthTokenSecret } = await getOAuth1RequestToken(
                apiKey,
                apiSecret,
                redirectUri
            );

            // Store oauth_token_secret in a secure cookie (both keyed and general fallback)
            cookies.set(`x_secret_${oauthToken}`, oauthTokenSecret, {
                path: '/',
                httpOnly: true,
                secure: isProd,
                sameSite: 'lax',
                maxAge: 60 * 15 // 15 mins
            });
            cookies.set('x_oauth1_secret', oauthTokenSecret, {
                path: '/',
                httpOnly: true,
                secure: isProd,
                sameSite: 'lax',
                maxAge: 60 * 15
            });

            oauth1Url = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`;
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

    // 2. Fallback to OAuth 2.0 PKCE flow
    const clientId = env.X_CLIENT_ID;
    if (!clientId) {
        return json({ error: 'X credentials (API Key or Client ID) not configured' }, { status: 500 });
    }

    const state = crypto.randomBytes(24).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

    cookies.set('x_oauth_state', state, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 60 * 10
    });

    cookies.set('x_oauth_verifier', codeVerifier, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 60 * 10
    });

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
