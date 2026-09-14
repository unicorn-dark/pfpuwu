import { json } from "@sveltejs/kit";
import { supabase } from "$lib/supabaseClient";

export async function GET() {
  try {
    const { count: photoCount } = await supabase
      .from("memes")
      .select("*", { count: "exact", head: true })
      .eq("type", "photo");

    const { count: videoCount } = await supabase
      .from("memes")
      .select("*", { count: "exact", head: true })
      .eq("type", "video");

    return json(
      {
        photo: photoCount || 0,
        video: videoCount || 0,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
