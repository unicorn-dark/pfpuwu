import { json } from "@sveltejs/kit";
import { supabase } from "$lib/supabaseClient";
import { getCachedMemeStats, setCachedMemeStats } from "$lib/server/memeCache";

export async function GET() {
  try {
    const cached = getCachedMemeStats();
    if (cached) {
      return json(cached, {
        headers: {
          "Cache-Control":
            "public, max-age=300, s-maxage=600, stale-while-revalidate=1200",
        },
      });
    }

    const [{ count: photoCount }, { count: videoCount }] = await Promise.all([
      supabase
        .from("memes")
        .select("id", { count: "exact", head: true })
        .eq("type", "photo"),
      supabase
        .from("memes")
        .select("id", { count: "exact", head: true })
        .eq("type", "video"),
    ]);

    const result = {
      photo: photoCount || 4225,
      video: videoCount || 646,
    };

    setCachedMemeStats(result);

    return json(result, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=600, stale-while-revalidate=1200",
      },
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
