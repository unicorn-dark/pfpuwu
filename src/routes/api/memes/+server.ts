import { json } from "@sveltejs/kit";
import { supabase } from "$lib/supabaseClient";
import { pipeline } from "@xenova/transformers";

export async function GET({ url }) {
  const search = url.searchParams.get("search");
  const type = url.searchParams.get("type") || "photo";
  const sort = url.searchParams.get("sort") || "popular";
  const limit = parseInt(url.searchParams.get("limit") || "30", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  // ==================== NO SEARCH ====================
  if (!search) {
    let query = supabase.from("memes_with_scores").select("*").eq("type", type);

    if (sort === "popular") {
      query = query.order("score", { ascending: false });
    } else if (sort === "newest") {
      query = query.order("created_at", { ascending: false });
    } else if (sort === "oldest") {
      query = query.order("created_at", { ascending: true });
    }

    query = query
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    return json(error ? { error: error.message } : data);
  }

  // ==================== SEARCH ====================
  try {
    // 1. Always do keyword/tag search
    const { data: keywordMatches } = await supabase
      .from("memes_with_scores")
      .select("*")
      .eq("type", type)
      .contains("tags", [search.toLowerCase()]);

    let results: any[] = keywordMatches || [];

    // 2. Only do semantic search for PHOTOS (not for videos)
    if (type === "photo") {
      const extractor = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      );
      const output = await extractor(search, {
        pooling: "mean",
        normalize: true,
      });
      const queryEmbedding = Array.from(output.data);

      const { data: semanticMatches, error } = await supabase.rpc(
        "match_memes",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.15,
          match_count: 100,
        },
      );

      if (error) throw error;

      const validSemantic = (semanticMatches || []).filter(
        (m: any) => m.type === type,
      );
      results = [...results, ...validSemantic];
    }

    // Remove duplicates
    const uniqueResults = Array.from(
      new Map(results.map((item) => [item.id, item])).values(),
    );

    // Apply pagination
    return json(uniqueResults.slice(offset, offset + limit));
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
