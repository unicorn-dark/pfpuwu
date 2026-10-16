// src/routes/api/auth/x/callback/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import {
    getOAuth1AccessToken,
    getOAuth1UserProfile,
    type TwitterUser
} from '$lib/server/twitterOAuth';
import { resolveAppOrigin } from '$lib/server/origin';

export const GET: RequestHandler = async ({ url, cookies, request }) => {
    const { origin } = resolveAppOrigin(url, request);
    const redirectUri = `${origin}/api/auth/x/callback`;

    // Check if user cancelled authorization
    const denied = url.searchParams.get('denied');
    if (denied) {
        throw redirect(302, '/?auth_error=Sign+in+cancelled');
    }

    const oauthToken = url.searchParams.get('oauth_token');
    const oauthVerifier = url.searchParams.get('oauth_verifier');

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (errorParam) {
        console.error('X OAuth callback error:', errorParam, errorDescription);
        throw redirect(302, `/?auth_error=${encodeURIComponent(errorDescription || errorParam)}`);
    }

    let twitterUser: TwitterUser;

    // =========================================================================
    // FLOW A: OAuth 1.0a (Primary, 100% Free Tier Compatible)
    // =========================================================================
    if (oauthToken && oauthVerifier) {
        const apiKey = env.X_API_KEY;
        const apiSecret = env.X_API_SECRET;

        if (!apiKey || !apiSecret) {
            console.error('X_API_KEY or X_API_SECRET is missing in environment');
            throw redirect(302, '/?auth_error=Server+missing+X_API_KEY');
        }

        const cookieSecretKey = `x_secret_${oauthToken}`;
        const oauthTokenSecret = cookies.get(cookieSecretKey) || cookies.get('x_oauth1_secret');

        if (!oauthTokenSecret) {
            console.error('Missing OAuth 1.0a token secret cookie');
            throw redirect(302, '/?auth_error=Session+expired.+Please+try+signing+in+again.');
        }

        try {
            // Exchange for user access token
            const tokenRes = await getOAuth1AccessToken(
                apiKey,
                apiSecret,
                oauthToken,
                oauthVerifier,
                oauthTokenSecret
            );

            // Fetch user profile (or fallback smoothly)
            twitterUser = await getOAuth1UserProfile(
                apiKey,
                apiSecret,
                tokenRes.oauthToken,
                tokenRes.oauthTokenSecret,
                tokenRes.userId,
                tokenRes.screenName
            );

            // Clean up cookies
            cookies.delete(cookieSecretKey, { path: '/' });
            cookies.delete('x_oauth1_secret', { path: '/' });
        } catch (err: any) {
            console.error('OAuth 1.0a token exchange failed:', err);
            throw redirect(302, `/?auth_error=${encodeURIComponent(err?.message || 'Failed to authenticate with X')}`);
        }
    }
    // =========================================================================
    // FLOW B: OAuth 2.0 PKCE (Fallback)
    // =========================================================================
    else if (code && state) {
        const savedState = cookies.get('x_oauth_state');
        const codeVerifier = cookies.get('x_oauth_verifier');

        if (!savedState || state !== savedState || !codeVerifier) {
            console.error('X OAuth 2.0 state mismatch or missing verifier');
            throw redirect(302, '/?auth_error=State+mismatch+or+expired+session');
        }

        const clientId = env.X_CLIENT_ID;
        const clientSecret = env.X_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw redirect(302, '/?auth_error=Server+misconfigured+X_CLIENT_ID');
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

        const userRes = await fetch(
            'https://api.x.com/2/users/me?user.fields=profile_image_url,name,username',
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (!userRes.ok) {
            const errText = await userRes.text();
            console.error('Failed to fetch X user profile:', userRes.status, errText);
            const cleanErr = errText.slice(0, 150).replace(/[^\w\s-]/g, ' ');
            throw redirect(302, `/?auth_error=X+Profile+Error+${userRes.status}+${encodeURIComponent(cleanErr)}`);
        }

        const userJson = await userRes.json();
        const xUser = userJson.data;

        let rawAvatar = xUser.profile_image_url || '/unicorn.png';
        if (rawAvatar.includes('_normal.')) {
            rawAvatar = rawAvatar.replace('_normal.', '_400x400.');
        }

        twitterUser = {
            id: String(xUser.id),
            username: String(xUser.username).toLowerCase().replace(/^@/, ''),
            name: String(xUser.name || xUser.username),
            profileImageUrl: rawAvatar
        };

        cookies.delete('x_oauth_state', { path: '/' });
        cookies.delete('x_oauth_verifier', { path: '/' });
    } else {
        throw redirect(302, '/?auth_error=Invalid+authentication+callback');
    }

    // =========================================================================
    // SUPABASE INTEGRATION: Upsert Profile & Issue Session via Magiclink
    // =========================================================================
    const xUserId = twitterUser.id;
    const xUsername = twitterUser.username;
    const xDisplayName = twitterUser.name;
    const rawAvatar = twitterUser.profileImageUrl;

    const supabaseUrl = env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || 'https://zodyqbsxcihojdqidgjd.supabase.co';
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Missing Supabase Service Role Key');
        throw redirect(302, '/?auth_error=Missing+Supabase+Service+Role+Key');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user already exists in profiles
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
        // Create user in auth.users
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            email_confirm: true,
            user_metadata: {
                provider_id: xUserId,
                user_name: xUsername,
                screen_name: xUsername,
                full_name: xDisplayName,
                avatar_url: rawAvatar
            }
        });

        if (createErr || !newUser?.user) {
            // If user already exists in auth.users, find their id
            const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
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

    // Upsert into public.profiles
    const avatarTraits = existingProfile?.avatar_traits || {};
    const finalAvatar = existingProfile?.avatar_url || rawAvatar;

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

    // Generate Magiclink to log the user in client-side
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

    // Exchange the action_link server-side to guarantee redirect directly to origin/#access_token=...
    // This protects against Supabase falling back to localhost:3000 if the domain is not yet whitelisted in Supabase dashboard
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
