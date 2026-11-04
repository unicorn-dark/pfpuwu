// src/lib/stores/auth.ts
import { writable, derived, get } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import {
    renderTransparentAvatar,
    getDefaultAvatarTraits,
    encodeAvatarTraitsUrl,
    decodeAvatarTraitsUrl
} from '$lib/utils/avatar';
import { LAYER_ORDER } from '$lib/utils/traits';

export interface UserProfile {
    id: string;
    x_user_id: string;
    x_username: string;
    x_display_name: string;
    avatar_url: string; // In-memory: rendered transparent PNG dataUrl; in DB/network: compact 28-byte `/unicorn.png?t=...`
    avatar_traits?: Record<string, number>; // Custom persona traits (only LAYER_ORDER keys)
    updated_at?: string;
}

export const authLoading = writable<boolean>(true);
export const userProfile = writable<UserProfile | null>(null);
export const showAuthModal = writable<boolean>(false);
export const authError = writable<string>('');
export const oauth2VerifiedProof = writable<string>('');
export const authModalReason = writable<string>(
    'Sign in with X (Twitter) to unlock social features and prevent spam.'
);
export const showAvatarCustomizer = writable<boolean>(false);

export const hasAvatarChosen = derived(
    userProfile,
    ($profile) =>
        Boolean(
            $profile?.avatar_traits &&
            Object.keys($profile.avatar_traits).length > 0 &&
            $profile.avatar_url &&
            $profile.avatar_url !== '/unicorn.png' &&
            !$profile.avatar_url.includes('twimg.com')
        )
);

const LOCAL_PROFILE_STORAGE_KEY = 'pfpuwu_user_profile_v2';

/**
 * Strips any ring or background keys from a traits object so only valid transparent character layers remain
 */
export function sanitizeAvatarTraits(rawTraits?: Record<string, any>): Record<string, number> {
    const clean: Record<string, number> = {};
    if (!rawTraits || typeof rawTraits !== 'object') return clean;
    for (const layer of LAYER_ORDER) {
        if (typeof rawTraits[layer] === 'number' && rawTraits[layer] >= 0) {
            clean[layer] = Math.floor(rawTraits[layer]);
        }
    }
    return clean;
}

/**
 * Ensures a profile in client memory has its 100% transparent character PNG rendered from traits
 */
async function enforceCleanTransparentProfile(profile: UserProfile): Promise<UserProfile> {
    let cleanTraits = sanitizeAvatarTraits(profile.avatar_traits);
    if (Object.keys(cleanTraits).length === 0) {
        const fromUrl = decodeAvatarTraitsUrl(profile.avatar_url);
        if (fromUrl) {
            cleanTraits = sanitizeAvatarTraits(fromUrl);
        }
    }
    const hasTraits = Object.keys(cleanTraits).length > 0;
    const needsRender =
        !profile.avatar_url ||
        profile.avatar_url === '/unicorn.png' ||
        profile.avatar_url.includes('twimg.com') ||
        profile.avatar_url.includes('?t=') ||
        hasTraits;

    if (needsRender) {
        const traitsToRender = hasTraits ? cleanTraits : getDefaultAvatarTraits();
        const { dataUrl } = await renderTransparentAvatar(traitsToRender, 256);
        profile = {
            ...profile,
            avatar_url: dataUrl || '/unicorn.png',
            avatar_traits: cleanTraits
        };
    } else {
        profile = {
            ...profile,
            avatar_traits: cleanTraits
        };
    }
    return profile;
}

function notifyAuthPopupParentIfApplicable(profile: UserProfile | null) {
    if (typeof window === 'undefined' || !profile) return;
    try {
        if (window.opener && window.opener !== window && window.name === 'uwu_x_oauth_popup') {
            window.opener.postMessage(
                { type: 'UWU_X_AUTH_SUCCESS', profile },
                window.location.origin
            );
            setTimeout(() => {
                try {
                    window.close();
                } catch {}
            }, 150);
        }
    } catch {}
}

/**
 * Initialize auth listener & restore session from Supabase / localStorage
 */
export async function initAuth() {
    if (typeof window === 'undefined') return;
    authLoading.set(true);

    // Listen for popup completion messages or localStorage sync from popup window
    window.addEventListener('message', async (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return;
        if (ev.data?.type === 'UWU_X_AUTH_SUCCESS' && ev.data?.profile) {
            const clean = await enforceCleanTransparentProfile(ev.data.profile as UserProfile);
            userProfile.set(clean);
            localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(clean));
            authError.set('');
            oauth2VerifiedProof.set('');
            showAuthModal.set(false);
            if (!clean.avatar_traits || Object.keys(clean.avatar_traits).length === 0) {
                showAvatarCustomizer.set(true);
            }
        } else if (ev.data?.type === 'UWU_X_OAUTH2_VERIFIED' && ev.data?.proof) {
            oauth2VerifiedProof.set(String(ev.data.proof));
            showAuthModal.set(true);
        }
    });

    window.addEventListener('storage', async (ev: StorageEvent) => {
        if (ev.key === LOCAL_PROFILE_STORAGE_KEY && ev.newValue) {
            try {
                const parsed = JSON.parse(ev.newValue) as UserProfile;
                const clean = await enforceCleanTransparentProfile(parsed);
                userProfile.set(clean);
                authError.set('');
                oauth2VerifiedProof.set('');
                showAuthModal.set(false);
            } catch {}
        }
    });

    try {
        // 0. Check if redirected back with ?oauth2_verified=... or ?auth_error=...
        const urlParams = new URLSearchParams(window.location.search);
        const verifiedProofFromUrl = urlParams.get('oauth2_verified');
        const errFromUrl = urlParams.get('auth_error');
        if (verifiedProofFromUrl || errFromUrl) {
            if (verifiedProofFromUrl) {
                oauth2VerifiedProof.set(verifiedProofFromUrl);
                urlParams.delete('oauth2_verified');
                if (window.opener && window.opener !== window && window.name === 'uwu_x_oauth_popup') {
                    try {
                        window.opener.postMessage(
                            { type: 'UWU_X_OAUTH2_VERIFIED', proof: verifiedProofFromUrl },
                            window.location.origin
                        );
                        setTimeout(() => {
                            try {
                                window.close();
                            } catch {}
                        }, 120);
                    } catch {}
                }
            }
            if (errFromUrl) {
                authError.set(errFromUrl);
                urlParams.delete('auth_error');
            }
            showAuthModal.set(true);
            const newQuery = urlParams.toString();
            const cleanUrl =
                window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
            window.history.replaceState({}, '', cleanUrl);
        }

        // 1. Check cached profile first for instant UI hydration
        const cached = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached) as UserProfile;
                const clean = await enforceCleanTransparentProfile(parsed);
                userProfile.set(clean);
            } catch {}
        }

        // 2. Check Supabase Auth session
        const {
            data: { session }
        } = await supabase.auth.getSession();
        if (session?.user) {
            await syncSupabaseUserProfile(session.user);
            authError.set('');
            notifyAuthPopupParentIfApplicable(get(userProfile));
        }

        // 3. Listen for OAuth redirects / auth changes
        supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                await syncSupabaseUserProfile(session.user);
                authError.set('');
                showAuthModal.set(false);
                notifyAuthPopupParentIfApplicable(get(userProfile));
            } else if (_event === 'SIGNED_OUT') {
                userProfile.set(null);
                localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
            }
        });
    } catch (err) {
        console.warn('Auth initialization warning:', err);
    } finally {
        authLoading.set(false);
    }
}

async function syncSupabaseUserProfile(user: any) {
    const meta = user.user_metadata || {};
    const rawUsername =
        meta.user_name ||
        meta.preferred_username ||
        meta.screen_name ||
        user.email?.split('@')[0] ||
        `uwu_${user.id.slice(0, 6)}`;
    const cleanUsername = rawUsername.replace(/^@/, '').toLowerCase();
    const displayName = meta.full_name || meta.name || cleanUsername;

    try {
        const { data: existing } = await supabase
            .from('profiles')
            .select('id, x_user_id, x_username, x_display_name, avatar_url, avatar_traits, updated_at')
            .eq('id', user.id)
            .maybeSingle();

        if (existing) {
            let profile = existing as UserProfile;
            const hadLegacyOrBloatedUrl =
                profile.avatar_url?.includes('twimg.com') ||
                profile.avatar_url?.startsWith('data:image/');
            const cleanTraits = sanitizeAvatarTraits(profile.avatar_traits);

            // Scrub any 35KB base64 data:image string from Supabase DB immediately
            if (hadLegacyOrBloatedUrl) {
                const compactUrl = encodeAvatarTraitsUrl(cleanTraits);
                await supabase
                    .from('profiles')
                    .update({
                        avatar_url: compactUrl,
                        avatar_traits: cleanTraits,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', user.id);
                profile.avatar_url = compactUrl;
            }

            profile = await enforceCleanTransparentProfile(profile);
            userProfile.set(profile);
            localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));

            if (!profile.avatar_traits || Object.keys(profile.avatar_traits).length === 0) {
                showAvatarCustomizer.set(true);
            }
            return;
        }

        const newProfile: UserProfile = {
            id: user.id,
            x_user_id: meta.provider_id || meta.sub || user.id,
            x_username: cleanUsername,
            x_display_name: displayName,
            avatar_url: '/unicorn.png',
            avatar_traits: {},
            updated_at: new Date().toISOString()
        };

        const { data: inserted, error } = await supabase
            .from('profiles')
            .upsert(newProfile)
            .select('id, x_user_id, x_username, x_display_name, avatar_url, avatar_traits, updated_at')
            .single();

        let finalProfile = !error && inserted ? (inserted as UserProfile) : newProfile;
        finalProfile = await enforceCleanTransparentProfile(finalProfile);
        userProfile.set(finalProfile);
        localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(finalProfile));

        showAvatarCustomizer.set(true);
    } catch {
        const fallbackProfile: UserProfile = {
            id: user.id,
            x_user_id: user.id,
            x_username: cleanUsername,
            x_display_name: displayName,
            avatar_url: '/unicorn.png',
            avatar_traits: {}
        };
        userProfile.set(fallbackProfile);
        localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(fallbackProfile));
        showAvatarCustomizer.set(true);
    }
}

export function requireXLogin(
    reason = 'Log in with X (Twitter) to access social features and prevent bot spam.'
): boolean {
    const current = get(userProfile);
    if (current) return true;
    authModalReason.set(reason);
    showAuthModal.set(true);
    return false;
}

export function requireSocialAccess(
    reason = 'Sign in with X and choose your Persona Avatar to participate.'
): boolean {
    if (!requireXLogin(reason)) return false;
    const current = get(userProfile);
    if (!current?.avatar_traits || Object.keys(current.avatar_traits).length === 0) {
        showAvatarCustomizer.set(true);
        return false;
    }
    return true;
}

export async function loginWithX(
    flow: 'oauth1' | 'authorize' | 'force' | 'twitter' | 'oauth2' = 'oauth1',
    usePopup = false,
    handleHint = ''
): Promise<{ ok: boolean; error?: string }> {
    try {
        authError.set('');
        if (typeof window !== 'undefined') {
            const cleanHandle = handleHint.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            const params = new URLSearchParams({
                _t: String(Date.now()),
                flow
            });
            if (cleanHandle) {
                params.set('handle', cleanHandle);
            }
            const targetUrl = `/api/auth/x/login?${params.toString()}`;

            if (usePopup && window.innerWidth >= 700) {
                const w = 540;
                const h = 660;
                const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
                const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
                const popup = window.open(
                    targetUrl,
                    'uwu_x_oauth_popup',
                    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
                );
                if (popup) {
                    popup.focus();
                    return { ok: true };
                }
            }

            window.location.href = targetUrl;
        }
        return { ok: true };
    } catch (err: any) {
        return {
            ok: false,
            error: err?.message || 'Failed to initiate X login'
        };
    }
}

export function completeOAuth2WithHandle(handle: string, proofOverride?: string): void {
    if (typeof window === 'undefined') return;
    const cleanHandle = handle.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const proof = proofOverride || get(oauth2VerifiedProof);
    if (!cleanHandle || !proof) return;

    const params = new URLSearchParams({
        oauth2_proof: proof,
        handle: cleanHandle,
        _t: String(Date.now())
    });
    window.location.href = `/api/auth/x/callback?${params.toString()}`;
}

export async function logoutX() {
    try {
        await supabase.auth.signOut();
    } catch {}
    userProfile.set(null);
    localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
}

/**
 * Save the user's transparent Avatar persona (strictly traits without ring and without background).
 * Stores a compact 28-byte `/unicorn.png?t=...` URL in Supabase DB while keeping the rendered PNG in local state!
 */
export async function savePersonaAvatar(
    traits: Record<string, number>
): Promise<{ ok: boolean; avatarUrl: string }> {
    const current = get(userProfile);
    if (!current) {
        requireXLogin('Sign in with X to save your Persona Avatar!');
        return { ok: false, avatarUrl: '' };
    }

    const cleanTraits = sanitizeAvatarTraits(traits);

    // 1. Render 100% transparent PNG composite for immediate local UI display
    const { dataUrl } = await renderTransparentAvatar(cleanTraits, 256, false);
    // 2. Encode compact 28-byte trait URL (`/unicorn.png?t=0.1.2.1.0.1.1`) for Supabase DB & Realtime (0 base64 bloat!)
    const compactDbAvatarUrl = encodeAvatarTraitsUrl(cleanTraits);

    const updatedLocalProfile: UserProfile = {
        ...current,
        avatar_url: dataUrl || compactDbAvatarUrl,
        avatar_traits: cleanTraits,
        updated_at: new Date().toISOString()
    };

    try {
        await supabase.from('profiles').upsert(
            {
                id: current.id,
                x_user_id: current.x_user_id,
                x_username: current.x_username,
                x_display_name: current.x_display_name,
                avatar_url: compactDbAvatarUrl,
                avatar_traits: cleanTraits,
                updated_at: updatedLocalProfile.updated_at
            },
            { onConflict: 'id' }
        );
    } catch {}

    try {
        await supabase
            .from('uwu_world_players')
            .update({
                avatar_url: compactDbAvatarUrl,
                updated_at: updatedLocalProfile.updated_at
            })
            .eq('user_id', current.id);
    } catch {}

    userProfile.set(updatedLocalProfile);
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(updatedLocalProfile));
    showAvatarCustomizer.set(false);

    try {
        const rawSpaces = localStorage.getItem('pfpuwu_spaces_v1');
        const spacesMap = rawSpaces ? JSON.parse(rawSpaces) : {};
        if (spacesMap[current.x_username]) {
            spacesMap[current.x_username].avatar_url = dataUrl || compactDbAvatarUrl;
            localStorage.setItem('pfpuwu_spaces_v1', JSON.stringify(spacesMap));
        }
    } catch {}

    return { ok: true, avatarUrl: dataUrl || compactDbAvatarUrl };
}

/**
 * Updates the logged-in user's Display Name across the auth store, localStorage,
 * Supabase `public.profiles`, and `public.uwu_world_players`.
 */
export async function updateUserDisplayName(newDisplayName: string): Promise<boolean> {
    const current = get(userProfile);
    if (!current) return false;
    const cleaned = newDisplayName.trim().slice(0, 28) || current.x_username;

    const updatedProfile: UserProfile = {
        ...current,
        x_display_name: cleaned,
        updated_at: new Date().toISOString()
    };

    userProfile.set(updatedProfile);
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(updatedProfile));
        } catch {}
    }

    try {
        await supabase
            .from('profiles')
            .update({
                x_display_name: cleaned,
                updated_at: updatedProfile.updated_at
            })
            .eq('id', current.id);
    } catch {}

    try {
        await supabase
            .from('uwu_world_players')
            .update({
                display_name: cleaned,
                updated_at: updatedProfile.updated_at
            })
            .eq('user_id', current.id);
    } catch {}

    return true;
}
