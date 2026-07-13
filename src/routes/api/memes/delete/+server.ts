import { json } from "@sveltejs/kit";
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { createClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function POST({ request, cookies }) {
  // 1. Verify Admin Authentication
  const token = cookies.get("uwu_editor_token");
  if (token !== privateEnv.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meme_id } = await request.json();
    if (!meme_id) return json({ error: "Missing meme_id" }, { status: 400 });

    // 2. Initialize Supabase (Combine public URL and private Service Key)
    const supabase = createClient(
      publicEnv.PUBLIC_SUPABASE_URL,
      privateEnv.SUPABASE_SERVICE_ROLE_KEY,
    );

    // 3. Fetch the meme to get the URL
    const { data: meme, error: fetchErr } = await supabase
      .from("memes")
      .select("url")
      .eq("id", meme_id)
      .single();

    if (fetchErr || !meme) {
      return json({ error: "Meme not found" }, { status: 404 });
    }

    // 4. Extract the exact R2 Key from your custom domain URL
    const urlObj = new URL(meme.url);
    const r2Key = urlObj.pathname.substring(1);

    // Sanitize the Account ID just in case there are hidden spaces or quotes in .env
    const accountId = privateEnv.R2_ACCOUNT_ID.replace(/['"]/g, "").trim();
    const bucketName = privateEnv.R2_BUCKET_NAME.replace(/['"]/g, "").trim();
    const endpointUrl = `https://${accountId}.r2.cloudflarestorage.com`;

    const s3 = new S3Client({
      region: "auto",
      endpoint: endpointUrl,
      forcePathStyle: true, // MUST be at the top level here!
      credentials: {
        accessKeyId: privateEnv.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: privateEnv.R2_SECRET_ACCESS_KEY.trim(),
      },
    });

    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
      }),
    );

    // 6. Delete from Supabase
    const { error: delErr } = await supabase
      .from("memes")
      .delete()
      .eq("id", meme_id);

    if (delErr) throw delErr;

    // 7. Log the action
    await supabase.from("admin_logs").insert({
      action_type: "DELETE_MEME",
      target_id: meme_id,
      target_url: meme.url,
    });

    return json({ success: true });
  } catch (err: any) {
    console.error("Deletion error:", err);
    return json({ error: err.message || "Failed to delete" }, { status: 500 });
  }
}
