import { json } from "@sveltejs/kit";
// Import BOTH private and public environments
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { createClient } from "@supabase/supabase-js";

// 1. Grab the URL from public, and the keys/passwords from private
const supabaseUrl = privateEnv.SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
const adminPassword = privateEnv.ADMIN_PASSWORD;

// 2. Safety Check to prevent crashes
if (!supabaseUrl) {
  throw new Error("Missing PUBLIC_SUPABASE_URL in your .env file!");
}
if (!supabaseServiceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in your .env file!");
}

// 3. Initialize the Admin Client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST({ request, cookies }) {
  // 1. Verify the device has the secure cookie
  const token = cookies.get("uwu_editor_token");
  if (token !== adminPassword) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Update the tags
  const { meme_id, tags } = await request.json();

  const { error } = await supabaseAdmin
    .from("memes")
    .update({ tags: tags })
    .eq("id", meme_id);

  if (error) return json({ error: error.message }, { status: 500 });

  return json({ success: true });
}
