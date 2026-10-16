// src/routes/api/storage/upload/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as Blob | null;
        const bucket = (formData.get('bucket') as string) || 'space-backgrounds';
        const customPath = formData.get('path') as string | null;

        if (!file) {
            return json({ ok: false, error: 'No file provided' }, { status: 400 });
        }

        const supabaseUrl = env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || 'https://zodyqbsxcihojdqidgjd.supabase.co';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            return json({ ok: false, error: 'Storage server not configured' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

        const fileName = customPath || `uploads/bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(fileName, buffer, {
                contentType: file.type || 'image/jpeg',
                upsert: true
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return json({ ok: false, error: uploadError.message }, { status: 500 });
        }

        const { data: pubData } = supabaseAdmin.storage.from(bucket).getPublicUrl(fileName);

        return json({
            ok: true,
            publicUrl: pubData?.publicUrl || ''
        });
    } catch (err: any) {
        console.error('Storage upload route error:', err);
        return json({ ok: false, error: err?.message || 'Upload failed' }, { status: 500 });
    }
};
