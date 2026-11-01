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

// In-memory fallback cache for OAuth 1.0a token secrets (protects against strict mobile WebView cookie stripping)
const tokenSecretCache = new Map<string, { secret: string; expiresAt: number }>();

function pruneTokenSecretCache() {
    const now = Date.now();
    for (const [key, entry] of tokenSecretCache.entries()) {
        if (entry.expiresAt <= now) {
            tokenSecretCache.delete(key);
        }
    }
}

export function cacheOAuth1TokenSecret(oauthToken: string, oauthTokenSecret: string): void {
    pruneTokenSecretCache();
    tokenSecretCache.set(oauthToken, {
        secret: oauthTokenSecret,
        expiresAt: Date.now() + 15 * 60 * 1000
    });
}

export function getCachedOAuth1TokenSecret(oauthToken: string): string | null {
    pruneTokenSecretCache();
    const entry = tokenSecretCache.get(oauthToken);
    return entry ? entry.secret : null;
}

/**
 * Encodes OAuth 2.0 PKCE codeVerifier inside a self-verifying encrypted state token
 * so OAuth 2.0 callbacks succeed even when third-party / cross-subdomain cookies are blocked.
 */
export function createStatelessOAuth2State(codeVerifier: string, secretKey: string): string {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const payload = JSON.stringify({
        v: codeVerifier,
        t: Date.now()
    });
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function verifyStatelessOAuth2State(stateToken: string, secretKey: string): string | null {
    try {
        const parts = stateToken.split('.');
        if (parts.length !== 3) return null;
        const [ivB64, tagB64, dataB64] = parts;
        const key = crypto.createHash('sha256').update(secretKey).digest();
        const iv = Buffer.from(ivB64, 'base64url');
        const tag = Buffer.from(tagB64, 'base64url');
        const encrypted = Buffer.from(dataB64, 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        const parsed = JSON.parse(decrypted) as { v?: string; t?: number };
        if (!parsed.v || !parsed.t) return null;
        if (Date.now() - parsed.t > 20 * 60 * 1000) return null; // 20 min expiry
        return parsed.v;
    } catch {
        return null;
    }
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

const OAUTH1_HOSTS = ['https://api.x.com', 'https://api.twitter.com'] as const;

/**
 * Step 1: Obtains a request token from X (tries api.x.com first, falls back to api.twitter.com).
 */
export async function getOAuth1RequestToken(
    apiKey: string,
    apiSecret: string,
    callbackUrl: string
): Promise<OAuth1TokenResponse> {
    let lastError: Error | null = null;

    for (const baseHost of OAUTH1_HOSTS) {
        try {
            const timestamp = String(Math.floor(Date.now() / 1000));
            const nonce = crypto.randomBytes(16).toString('hex');
            const endpoint = `${baseHost}/oauth/request_token`;

            const oauthParams: Record<string, string> = {
                oauth_callback: callbackUrl,
                oauth_consumer_key: apiKey,
                oauth_nonce: nonce,
                oauth_signature_method: 'HMAC-SHA1',
                oauth_timestamp: timestamp,
                oauth_version: '1.0'
            };

            const header = buildOAuth1Header('POST', endpoint, oauthParams, apiSecret);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: header
                }
            });

            if (!res.ok) {
                const errText = await res.text();
                lastError = new Error(`Failed to get OAuth request token from ${baseHost} (${res.status}): ${errText}`);
                continue;
            }

            const body = await res.text();
            const parsed = new URLSearchParams(body);

            const oauthToken = parsed.get('oauth_token');
            const oauthTokenSecret = parsed.get('oauth_token_secret');
            const oauthCallbackConfirmed = parsed.get('oauth_callback_confirmed') === 'true';

            if (!oauthToken || !oauthTokenSecret) {
                lastError = new Error(`X (${baseHost}) returned empty request token or secret`);
                continue;
            }

            cacheOAuth1TokenSecret(oauthToken, oauthTokenSecret);

            return {
                oauthToken,
                oauthTokenSecret,
                oauthCallbackConfirmed
            };
        } catch (err: any) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error('Failed to get OAuth request token from X');
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
    let lastError: Error | null = null;

    for (const baseHost of OAUTH1_HOSTS) {
        try {
            const timestamp = String(Math.floor(Date.now() / 1000));
            const nonce = crypto.randomBytes(16).toString('hex');
            const endpoint = `${baseHost}/oauth/access_token`;

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
                endpoint,
                oauthParams,
                apiSecret,
                oauthTokenSecret
            );

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: header
                }
            });

            if (!res.ok) {
                const errText = await res.text();
                lastError = new Error(`Failed to exchange access token on ${baseHost} (${res.status}): ${errText}`);
                continue;
            }

            const body = await res.text();
            const parsed = new URLSearchParams(body);

            const userToken = parsed.get('oauth_token');
            const userSecret = parsed.get('oauth_token_secret');
            const userId = parsed.get('user_id');
            const screenName = parsed.get('screen_name');

            if (!userToken || !userId || !screenName) {
                lastError = new Error(`X access token response missing required fields: ${body}`);
                continue;
            }

            tokenSecretCache.delete(oauthToken);

            return {
                oauthToken: userToken,
                oauthTokenSecret: userSecret || '',
                userId,
                screenName
            };
        } catch (err: any) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error('Failed to exchange OAuth access token with X');
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
