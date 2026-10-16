// src/lib/server/twitterOAuth.ts
import crypto from 'node:crypto';

export interface OAuth1Credentials {
    apiKey: string;
    apiSecret: string;
}

export interface OAuth1TokenResponse {
    oauthToken: string;
    oauthTokenSecret: string;
    oauthCallbackConfirmed: boolean;
}

export interface OAuth1AccessTokenResponse {
    oauthToken: string;
    oauthTokenSecret: string;
    userId: string;
    screenName: string;
}

export interface TwitterUser {
    id: string;
    username: string;
    name: string;
    profileImageUrl: string;
}

export function percentEncode(str: string): string {
    return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
}

/**
 * Builds the RFC 5849 OAuth 1.0a Authorization header.
 */
export function buildOAuth1Header(
    method: string,
    url: string,
    params: Record<string, string>,
    consumerSecret: string,
    tokenSecret: string = ''
): string {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
        .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
        .join('&');

    const normalizedUrl = url.split('?')[0];
    const baseString = `${method.toUpperCase()}&${percentEncode(normalizedUrl)}&${percentEncode(paramString)}`;
    const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    const headerParams: Record<string, string> = { ...params, oauth_signature: signature };
    return (
        'OAuth ' +
        Object.keys(headerParams)
            .sort()
            .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
            .join(', ')
    );
}

/**
 * Step 1: Obtains a request token from Twitter.
 */
export async function getOAuth1RequestToken(
    apiKey: string,
    apiSecret: string,
    callbackUrl: string
): Promise<OAuth1TokenResponse> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams: Record<string, string> = {
        oauth_callback: callbackUrl,
        oauth_consumer_key: apiKey,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_version: '1.0'
    };

    const header = buildOAuth1Header('POST', 'https://api.twitter.com/oauth/request_token', oauthParams, apiSecret);

    const res = await fetch('https://api.twitter.com/oauth/request_token', {
        method: 'POST',
        headers: {
            Authorization: header
        }
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to get OAuth request token (${res.status}): ${errText}`);
    }

    const body = await res.text();
    const parsed = new URLSearchParams(body);

    const oauthToken = parsed.get('oauth_token');
    const oauthTokenSecret = parsed.get('oauth_token_secret');
    const oauthCallbackConfirmed = parsed.get('oauth_callback_confirmed') === 'true';

    if (!oauthToken || !oauthTokenSecret) {
        throw new Error('Twitter returned empty request token or secret');
    }

    return {
        oauthToken,
        oauthTokenSecret,
        oauthCallbackConfirmed
    };
}

/**
 * Step 3: Exchanges authorized request token + verifier for user access token.
 */
export async function getOAuth1AccessToken(
    apiKey: string,
    apiSecret: string,
    oauthToken: string,
    oauthVerifier: string,
    oauthTokenSecret: string
): Promise<OAuth1AccessTokenResponse> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams: Record<string, string> = {
        oauth_consumer_key: apiKey,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_token: oauthToken,
        oauth_verifier: oauthVerifier,
        oauth_version: '1.0'
    };

    const header = buildOAuth1Header(
        'POST',
        'https://api.twitter.com/oauth/access_token',
        oauthParams,
        apiSecret,
        oauthTokenSecret
    );

    const res = await fetch('https://api.twitter.com/oauth/access_token', {
        method: 'POST',
        headers: {
            Authorization: header
        }
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to exchange access token (${res.status}): ${errText}`);
    }

    const body = await res.text();
    const parsed = new URLSearchParams(body);

    const userToken = parsed.get('oauth_token');
    const userSecret = parsed.get('oauth_token_secret');
    const userId = parsed.get('user_id');
    const screenName = parsed.get('screen_name');

    if (!userToken || !userId || !screenName) {
        throw new Error(`Twitter access token response missing required fields: ${body}`);
    }

    return {
        oauthToken: userToken,
        oauthTokenSecret: userSecret || '',
        userId,
        screenName
    };
}

/**
 * Fetches user profile using verify_credentials.json with user tokens.
 * Gracefully falls back if rate limited.
 */
export async function getOAuth1UserProfile(
    apiKey: string,
    apiSecret: string,
    userToken: string,
    userTokenSecret: string,
    fallbackUserId: string,
    fallbackScreenName: string
): Promise<TwitterUser> {
    const cleanUsername = fallbackScreenName.replace(/^@/, '').toLowerCase();

    try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = crypto.randomBytes(16).toString('hex');

        const params: Record<string, string> = {
            include_entities: 'false',
            oauth_consumer_key: apiKey,
            oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_token: userToken,
            oauth_version: '1.0',
            skip_status: 'true'
        };

        const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
        const header = buildOAuth1Header('GET', url, params, apiSecret, userTokenSecret);

        const res = await fetch(`${url}?include_entities=false&skip_status=true`, {
            method: 'GET',
            headers: {
                Authorization: header
            }
        });

        if (res.ok) {
            const data = await res.json();
            let rawAvatar = data.profile_image_url_https || data.profile_image_url || '/unicorn.png';
            if (rawAvatar.includes('_normal.')) {
                rawAvatar = rawAvatar.replace('_normal.', '_400x400.');
            }

            return {
                id: String(data.id_str || fallbackUserId),
                username: String(data.screen_name || cleanUsername).toLowerCase(),
                name: String(data.name || cleanUsername),
                profileImageUrl: rawAvatar
            };
        } else {
            console.warn('verify_credentials returned status:', res.status, await res.text().catch(() => ''));
        }
    } catch (err) {
        console.warn('Failed to call verify_credentials, using fallback metadata:', err);
    }

    // High quality fallback using unavatar or default
    return {
        id: fallbackUserId,
        username: cleanUsername,
        name: cleanUsername,
        profileImageUrl: `https://unavatar.io/x/${cleanUsername}`
    };
}
