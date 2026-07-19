// src/routes/api/music/+server.ts
import { json } from '@sveltejs/kit';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
// We now import the EXACT variable names matching your image
import { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } from '$env/static/private';

// Initialize the S3 client for Cloudflare R2
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

export async function GET() {
    try {
        const command = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME, // Using the variable directly from your .env
            Prefix: 'music/',
        });

        const response = await s3.send(command);

        const files = response.Contents
            ?.filter(item => item.Key && item.Key !== 'music/')
            ?.map(item => `https://cdn.uwu.meme/${item.Key}`) || [];

        return json(files);
    } catch (error) {
        console.error("R2 Listing Error:", error);
        return json([], { status: 500 });
    }
}
