import { json } from "@sveltejs/kit";
import { supabase } from "$lib/supabaseClient";
import { pipeline } from "@xenova/transformers";
import {
  MEME_PUBLIC_COLUMNS,
  getCachedMemeQuery,
  setCachedMemeQuery,
} from "$lib/server/memeCache";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=600",
};

// Module-level singleton to prevent re-instantiating the ~90MB ONNX pipeline on warm lambdas
let extractorPromise: Promise<any> | null = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
  }
  return extractorPromise;
}

export async function GET({ url }) {
  const searchParam = url.searchParams.get("search");
  const search = searchParam ? searchParam.trim() : "";
  const type = url.searchParams.get("type") || "photo";
  const sort = url.searchParams.get("sort") || "random";
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

  const seed = parseInt(url.searchParams.get("seed") || `${Date.now()}`, 10);

  // ==================== NO SEARCH ====================
  if (!search) {
    // NEVER select `*` on `memes_with_scores` because `embedding` (vector(384)) is 4,690 bytes per row (90% of row size!)
    let query = supabase
      .from("memes_with_scores")
      .select(MEME_PUBLIC_COLUMNS)
      .eq("type", type);

    if (sort === "random") {
      const approxTotal = type === "photo" ? 4225 : 646;
      const P = Math.max(1, Math.ceil(approxTotal / limit));
      const pageIndex = Math.floor(offset / limit);

      function gcd(x: number, y: number): number {
        return y === 0 ? x : gcd(y, x % y);
      }
      let a = (Math.abs(seed) % Math.max(1, P - 1)) + 1;
      while (gcd(a, P) !== 1) {
        a = (a + 1) % P;
        if (a === 0) a = 1;
      }
      const c = (Math.abs(seed) * 31 + 17) % P;
      const targetPage = (a * pageIndex + c) % P;
      const targetOffset = targetPage * limit;

      const cacheKey = `memes:${type}:random_page:${targetOffset}:${limit}`;
      let pageRows = getCachedMemeQuery(cacheKey);

      if (!pageRows) {
        query = query
          .order("id", { ascending: false })
          .range(targetOffset, targetOffset + limit - 1);

        const { data, error } = await query;
        if (error) {
          return json({ error: error.message }, { status: 500 });
        }
        pageRows = data || [];
        setCachedMemeQuery(cacheKey, pageRows);
      }

      const shuffled = [...pageRows];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      return json(shuffled, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    const sortedCacheKey = `memes:${type}:${sort}:${offset}:${limit}`;
    const cachedSorted = getCachedMemeQuery(sortedCacheKey);
    if (cachedSorted) {
      return json(cachedSorted, { headers: CACHE_HEADERS });
    }

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
    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    setCachedMemeQuery(sortedCacheKey, data || []);
    return json(data, { headers: CACHE_HEADERS });
  }

  // ==================== SEARCH ====================
  try {
    const searchCacheKey = `memes:search:${type}:${search.toLowerCase()}`;
    let uniqueResults = getCachedMemeQuery(searchCacheKey);

    if (!uniqueResults) {
      // 1. Always do keyword/tag search (excluding the 4.7KB `embedding` vector column!)
      const { data: keywordMatches } = await supabase
        .from("memes_with_scores")
        .select(MEME_PUBLIC_COLUMNS)
        .eq("type", type)
        .contains("tags", [search.toLowerCase()]);

      let results: any[] = keywordMatches || [];

      // 2. Only do semantic search for PHOTOS (not for videos) and if query has at least 2 chars
      if (type === "photo" && search.length >= 2) {
        const extractor = await getExtractor();
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

        const validSemantic = (semanticMatches || [])
          .filter((m: any) => m.type === type)
          .map(({ embedding, ...rest }: any) => rest);
        results = [...results, ...validSemantic];
      }

      // Remove duplicates
      uniqueResults = Array.from(
        new Map(results.map((item) => [item.id, item])).values(),
      );
      setCachedMemeQuery(searchCacheKey, uniqueResults);
    }

    // Apply pagination
    return json(uniqueResults.slice(offset, offset + limit), {
      headers: CACHE_HEADERS,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
