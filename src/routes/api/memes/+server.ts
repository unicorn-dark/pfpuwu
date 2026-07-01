import { json } from "@sveltejs/kit";
import { supabase } from "$lib/supabaseClient";
import { pipeline } from "@xenova/transformers";

export async function GET({ url }) {
  const search = url.searchParams.get("search");
  const type = url.searchParams.get("type") || "photo";

  const limit = parseInt(url.searchParams.get("limit") || "30", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  if (!search) {
    const { data, error } = await supabase
      .from("memes")
      .select("*")
      .eq("type", type)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return json(error ? { error: error.message } : data);
  }

  try {
    const { data: keywordMatches } = await supabase
      .from("memes")
      .select("*")
      .eq("type", type)
      .contains("tags", [search.toLowerCase()]);

    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
    const output = await extractor(search, {
      pooling: "mean",
      normalize: true,
    });
    const queryEmbedding = Array.from(output.data);

    const { data: semanticMatches, error } = await supabase.rpc("match_memes", {
      query_embedding: queryEmbedding,
      match_threshold: 0.15,
      match_count: 100,
    });

    if (error) throw error;

    const validSemantic = (semanticMatches || []).filter(
      (m: any) => m.type === type,
    );
    const allResults = [...(keywordMatches || []), ...validSemantic];
    const uniqueResults = Array.from(
      new Map(allResults.map((item) => [item.id, item])).values(),
    );

    return json(uniqueResults.slice(offset, offset + limit));
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
