import { json } from "@sveltejs/kit";
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { createClient } from "@supabase/supabase-js";

export async function POST({ request, cookies }) {
  // 1. Verify Admin Authentication
  const token = cookies.get("uwu_editor_token");
  if (token !== privateEnv.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meme_id } = await request.json();
    if (!meme_id) return json({ error: "Missing meme_id" }, { status: 400 });

    // 2. Initialize Supabase (Use Service Role to bypass RLS for deletion)
    const supabase = createClient(
      publicEnv.PUBLIC_SUPABASE_URL,
      privateEnv.SUPABASE_SERVICE_ROLE_KEY,
    );

    // 3. Fetch the meme to get the URL for the log
    const { data: meme, error: fetchErr } = await supabase
      .from("memes")
      .select("url")
      .eq("id", meme_id)
      .single();

    if (fetchErr || !meme) {
      return json({ error: "Meme not found" }, { status: 404 });
    }

    // 4. Delete from Supabase Database ONLY
    const { error: delErr } = await supabase
      .from("memes")
      .delete()
      .eq("id", meme_id);

    if (delErr) throw delErr;

    // 5. Log the action
    await supabase.from("admin_logs").insert({
      action_type: "DELETE_MEME_DB_ONLY",
      target_id: meme_id,
      target_url: meme.url,
    });

    return json({ success: true });
  } catch (err: any) {
    console.error("Deletion error:", err);
    return json({ error: err.message || "Failed to delete" }, { status: 500 });
  }
}
