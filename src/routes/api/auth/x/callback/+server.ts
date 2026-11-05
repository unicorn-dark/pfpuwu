// src/routes/api/auth/x/callback/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import {
    getOAuth1AccessToken,
    getOAuth1UserProfile,
    getCachedOAuth1TokenSecret,
    verifyStatelessOAuth2StatePayload,
    createOAuth2VerifiedProof,
    verifyOAuth2VerifiedProof,
    resolvePublicXUserByHandle,
    type TwitterUser
} from '$lib/server/twitterOAuth';
import { resolveAppOrigin, resolveCookieDomain } from '$lib/server/origin';

export const GET: RequestHandler = async ({ url, cookies, request, setHeaders }) => {
    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    const { origin, isHttps } = resolveAppOrigin(url, request);
    const cookieDomain = resolveCookieDomain(url, request);
    const redirectUri = `${origin}/api/auth/x/callback`;

    const clearCookieEverywhere = (name: string) => {
        cookies.delete(name, { path: '/' });
        if (cookieDomain) {
            cookies.delete(name, { path: '/', domain: cookieDomain });
        }
    };

    const setCookieWithDomainFallback = (name: string, value: string, maxAge: number) => {
        cookies.set(name, value, {
            path: '/',
            httpOnly: true,
            secure: isHttps,
            sameSite: 'lax',
            maxAge
        });
        if (cookieDomain) {
            cookies.set(name, value, {
                path: '/',
                domain: cookieDomain,
                httpOnly: true,
                secure: isHttps,
                sameSite: 'lax',
                maxAge
            });
        }
    };

    const denied = url.searchParams.get('denied');
    if (denied) {
        throw redirect(302, '/?auth_error=Sign+in+cancelled');
    }

    const oauthToken = url.searchParams.get('oauth_token');
    const oauthVerifier = url.searchParams.get('oauth_verifier');

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauth2ProofParam = url.searchParams.get('oauth2_proof') || cookies.get('x_oauth2_verified') || '';
    const handleParam = url.searchParams.get('handle') || '';
    const errorParam = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (errorParam) {
        console.error('X OAuth callback error:', errorParam, errorDescription);
        throw redirect(302, `/?auth_error=${encodeURIComponent(errorDescription || errorParam)}`);
    }

    let twitterUser: TwitterUser;

    // FLOW A: OAuth 1.0a
    if (oauthToken && oauthVerifier) {
        const apiKey = env.X_API_KEY;
        const apiSecret = env.X_API_SECRET;

        if (!apiKey || !apiSecret) {
            console.error('X_API_KEY or X_API_SECRET is missing in environment');
            throw redirect(302, '/?auth_error=Server+missing+X_API_KEY');
        }

        const cookieSecretKey = `x_secret_${oauthToken}`;
        const oauthTokenSecret =
            cookies.get(cookieSecretKey) ||
            cookies.get('x_oauth1_secret') ||
            getCachedOAuth1TokenSecret(oauthToken) ||
            '';

        try {
            const tokenRes = await getOAuth1AccessToken(
                apiKey,
                apiSecret,
                oauthToken,
                oauthVerifier,
                oauthTokenSecret
            );

            twitterUser = await getOAuth1UserProfile(
                apiKey,
                apiSecret,
                tokenRes.oauthToken,
                tokenRes.oauthTokenSecret,
                tokenRes.userId,
                tokenRes.screenName
            );

            clearCookieEverywhere(cookieSecretKey);
            clearCookieEverywhere('x_oauth1_secret');
        } catch (err: any) {
            console.error('OAuth 1.0a token exchange failed:', err);
            throw redirect(
                302,
                `/?auth_error=${encodeURIComponent(
                    'X OAuth 1.0a session expired. Please use the OAuth 2.0 Sign-In button below (no request token required).'
                )}`
            );
        }
    }
    // FLOW B: OAuth 2.0 PKCE
    else if (code && state) {
        const clientId = env.X_CLIENT_ID;
        const clientSecret = env.X_CLIENT_SECRET;
        const apiSecret = env.X_API_SECRET;

        if (!clientId || !clientSecret) {
            throw redirect(302, '/?auth_error=Server+misconfigured+X_CLIENT_ID');
        }

        const stateSecret = clientSecret || apiSecret || clientId;
        const statelessPayload = verifyStatelessOAuth2StatePayload(state, stateSecret);
        const savedState = cookies.get('x_oauth_state');
        const cookieVerifier = cookies.get('x_oauth_verifier');

        const codeVerifier =
            statelessPayload?.codeVerifier ||
            (savedState && state === savedState ? cookieVerifier : null);
        const handleHint =
            statelessPayload?.handleHint || cookies.get('x_oauth_handle_hint') || '';

        if (!codeVerifier) {
            console.error('X OAuth 2.0 state mismatch or missing verifier');
            throw redirect(302, '/?auth_error=State+mismatch+or+expired+session.+Please+try+again.');
        }

        const tokenParams = new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
        });

        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            },
            body: tokenParams.toString()
        });

        if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            console.error('Failed to exchange X token:', tokenRes.status, errText);
            throw redirect(302, '/?auth_error=Failed+to+exchange+token+with+X');
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        clearCookieEverywhere('x_oauth_state');
        clearCookieEverywhere('x_oauth_verifier');
        clearCookieEverywhere('x_oauth_handle_hint');

        const userRes = await fetch(
            'https://api.x.com/2/users/me?user.fields=profile_image_url,name,username',
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (userRes.ok) {
            const userJson = await userRes.json();
            const xUser = userJson.data;

            twitterUser = {
                id: String(xUser.id),
                username: String(xUser.username).toLowerCase().replace(/^@/, ''),
                name: String(xUser.name || xUser.username),
                profileImageUrl: '/unicorn.png'
            };
        } else {
            const errText = await userRes.text();
            console.warn('X /2/users/me returned status:', userRes.status, errText);

            // IMPORTANT: Do NOT redirect back to OAuth 1.0a (/oauth/authorize) when /2/users/me returns 403!
            // At this point `POST https://api.x.com/2/oauth2/token` SUCCEEDED (200 OK), proving the user
            // authorized our app on x.com/i/oauth2/authorize.
            if (handleHint) {
                const resolved = await resolvePublicXUserByHandle(handleHint);
                const cleanHint = handleHint.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
                twitterUser = resolved || {
                    id: `x_${cleanHint}`,
                    username: cleanHint,
                    name: cleanHint,
                    profileImageUrl: '/unicorn.png'
                };
            } else {
                const proof = createOAuth2VerifiedProof(stateSecret);
                setCookieWithDomainFallback('x_oauth2_verified', proof, 60 * 15);
                throw redirect(302, `/?oauth2_verified=${encodeURIComponent(proof)}`);
            }
        }
    }
    // FLOW C: Completing OAuth 2.0 login with verified proof + @handle
    else if (oauth2ProofParam && handleParam) {
        const stateSecret = env.X_CLIENT_SECRET || env.X_API_SECRET || env.X_CLIENT_ID || '';
        if (!stateSecret || !verifyOAuth2VerifiedProof(oauth2ProofParam, stateSecret)) {
            throw redirect(302, '/?auth_error=OAuth+2.0+verification+expired.+Please+sign+in+again.');
        }

        const cleanHandle = handleParam.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!cleanHandle) {
            throw redirect(302, `/?oauth2_verified=${encodeURIComponent(oauth2ProofParam)}&auth_error=Please+enter+your+valid+X+handle`);
        }

        const resolved = await resolvePublicXUserByHandle(cleanHandle);
        twitterUser = resolved || {
            id: `x_${cleanHandle}`,
            username: cleanHandle,
            name: cleanHandle,
            profileImageUrl: '/unicorn.png'
        };

        clearCookieEverywhere('x_oauth2_verified');
    } else {
        throw redirect(302, '/?auth_error=Invalid+authentication+callback');
    }

    const xUserId = twitterUser.id;
    const xUsername = twitterUser.username;
    const xDisplayName = twitterUser.name;

    const supabaseUrl = env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || 'https://zodyqbsxcihojdqidgjd.supabase.co';
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Missing Supabase Service Role Key');
        throw redirect(302, '/?auth_error=Missing+Supabase+Service+Role+Key');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('x_user_id', xUserId)
        .maybeSingle();

    const syntheticEmail = `x_${xUsername}_${xUserId.slice(-6)}@x.pfpuwu.local`;
    let authUserId: string;

    if (existingProfile?.id) {
        authUserId = existingProfile.id;
    } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            email_confirm: true,
            user_metadata: {
                provider_id: xUserId,
                user_name: xUsername,
                screen_name: xUsername,
                full_name: xDisplayName,
                avatar_url: '/unicorn.png'
            }
        });

        if (createErr || !newUser?.user) {
            const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const matched = userList?.users?.find(
                (u) => u.email === syntheticEmail || u.user_metadata?.provider_id === xUserId
            );
            if (!matched) {
                console.error('Error creating user in Supabase:', createErr);
                throw redirect(302, '/?auth_error=Failed+to+create+user+record');
            }
            authUserId = matched.id;
        } else {
            authUserId = newUser.user.id;
        }
    }

    // Strictly prevent any external X profile image or oversized base64 data URL in the database
    const avatarTraits = existingProfile?.avatar_traits || {};
    const hasCustomTraits = Object.keys(avatarTraits).length > 0;
    const layerOrder = ['body', 'face', 'eyes', 'head', 'costume', 'accessory', 'horn'];
    const encodedTraitUrl = hasCustomTraits
        ? `/unicorn.png?t=${layerOrder.map((l) => (typeof avatarTraits[l] === 'number' && avatarTraits[l] >= 0 ? Math.floor(avatarTraits[l]) : 0)).join('.')}`
        : '/unicorn.png';
    const finalAvatar = encodedTraitUrl;

    await supabaseAdmin.from('profiles').upsert(
        {
            id: authUserId,
            x_user_id: xUserId,
            x_username: xUsername,
            x_display_name: xDisplayName,
            avatar_url: finalAvatar,
            avatar_traits: avatarTraits,
            updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
    );

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: syntheticEmail,
        options: {
            redirectTo: `${origin}/`
        }
    });

    if (linkErr || !linkData?.properties?.action_link) {
        console.error('Failed to generate auth magiclink:', linkErr);
        throw redirect(302, '/?auth_error=Failed+to+authenticate+session');
    }

    let destinationUrl = linkData.properties.action_link;
    try {
        const verifyRes = await fetch(linkData.properties.action_link, {
            method: 'GET',
            redirect: 'manual'
        });

        const location = verifyRes.headers.get('location');
        if (location && location.includes('#access_token=')) {
            const hashIndex = location.indexOf('#');
            if (hashIndex !== -1) {
                const hashPart = location.slice(hashIndex);
                destinationUrl = `${origin}/${hashPart}`;
            }
        } else if (location && location.startsWith('http')) {
            try {
                const parsedLoc = new URL(location);
                if (parsedLoc.hash) {
                    destinationUrl = `${origin}/${parsedLoc.hash}`;
                }
            } catch {}
        }
    } catch (e) {
        console.warn('Server-side verify probe failed, using direct action_link:', e);
    }

    throw redirect(302, destinationUrl);
};
