// src/lib/stores/auth.ts
import { writable, derived, get } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { renderTransparentAvatar, getDefaultAvatarTraits } from '$lib/utils/avatar';
import { LAYER_ORDER } from '$lib/utils/traits';

export interface UserProfile {
    id: string;
    x_user_id: string;
    x_username: string;
    x_display_name: string;
    avatar_url: string; // Strictly transparent PNG of avatar persona WITHOUT ring and WITHOUT background
    avatar_traits?: Record<string, number>; // Custom persona traits (only LAYER_ORDER keys)
    updated_at?: string;
}

export const authLoading = writable<boolean>(true);
export const userProfile = writable<UserProfile | null>(null);
export const showAuthModal = writable<boolean>(false);
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
 * Ensures a profile never uses an external Twitter PFP or a ring/background image
 */
async function enforceCleanTransparentProfile(profile: UserProfile): Promise<UserProfile> {
    const cleanTraits = sanitizeAvatarTraits(profile.avatar_traits);
    const hasTraits = Object.keys(cleanTraits).length > 0;
    const isExternalOrLegacyUrl =
        !profile.avatar_url ||
        profile.avatar_url.includes('twimg.com') ||
        (!hasTraits && profile.avatar_url !== '/unicorn.png');

    if (isExternalOrLegacyUrl) {
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

/**
 * Initialize auth listener & restore session from Supabase / localStorage
 */
export async function initAuth() {
    if (typeof window === 'undefined') return;
    authLoading.set(true);

    try {
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
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            await syncSupabaseUserProfile(session.user);
        }

        // 3. Listen for OAuth redirects / auth changes
        supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                await syncSupabaseUserProfile(session.user);
                showAuthModal.set(false);
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
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (existing) {
            let profile = existing as UserProfile;
            const hadBadUrl = profile.avatar_url?.includes('twimg.com');
            profile = await enforceCleanTransparentProfile(profile);
            userProfile.set(profile);
            localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));

            if (hadBadUrl) {
                await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
            }

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
            .select()
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

export async function loginWithX(): Promise<{ ok: boolean; error?: string }> {
    try {
        if (typeof window !== 'undefined') {
            window.location.href = '/api/auth/x/login';
        }
        return { ok: true };
    } catch (err: any) {
        return {
            ok: false,
            error: err?.message || 'Failed to initiate X login'
        };
    }
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

    // Generate 100% transparent PNG composite (no ring, no background)
    const { dataUrl, blob } = await renderTransparentAvatar(cleanTraits, 256);
    let finalAvatarUrl = dataUrl;

    if (blob) {
        try {
            const filePath = `${current.id}/avatar_transparent_${Date.now()}.png`;
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, blob, {
                    contentType: 'image/png',
                    upsert: true
                });

            if (!uploadError) {
                const { data: pubData } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(filePath);
                if (pubData?.publicUrl) {
                    finalAvatarUrl = pubData.publicUrl;
                }
            }
        } catch {}
    }

    const updatedProfile: UserProfile = {
        ...current,
        avatar_url: finalAvatarUrl,
        avatar_traits: cleanTraits,
        updated_at: new Date().toISOString()
    };

    try {
        await supabase
            .from('profiles')
            .upsert(updatedProfile, { onConflict: 'id' });
    } catch {}

    userProfile.set(updatedProfile);
    localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(updatedProfile));
    showAvatarCustomizer.set(false);

    try {
        const rawSpaces = localStorage.getItem('pfpuwu_spaces_v1');
        const spacesMap = rawSpaces ? JSON.parse(rawSpaces) : {};
        if (spacesMap[current.x_username]) {
            spacesMap[current.x_username].avatar_url = finalAvatarUrl;
            localStorage.setItem('pfpuwu_spaces_v1', JSON.stringify(spacesMap));
        }
    } catch {}

    return { ok: true, avatarUrl: finalAvatarUrl };
}
