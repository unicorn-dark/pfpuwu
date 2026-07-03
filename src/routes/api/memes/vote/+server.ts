import { json } from "@sveltejs/kit";
import { supabase } from "$lib/supabaseClient";

export async function POST({ request }) {
  try {
    const { meme_id, device_id, vote_value } = await request.json();

    if (![1, -1, 0].includes(vote_value)) {
      return json({ error: "Invalid vote" }, { status: 400 });
    }

    if (vote_value === 0) {
      // Remove the vote
      const { error } = await supabase
        .from("meme_votes")
        .delete()
        .match({ meme_id, device_id });
      if (error) throw error;
    } else {
      // Upsert the vote (Creates new, or changes Up to Down)
      const { error } = await supabase
        .from("meme_votes")
        .upsert(
          { meme_id, device_id, vote_value },
          { onConflict: "meme_id, device_id" },
        );
      if (error) throw error;
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
