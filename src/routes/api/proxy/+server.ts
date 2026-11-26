// src/routes/api/proxy/+server.ts
import { json } from "@sveltejs/kit";

const ALLOWED_HOST_SUFFIXES = [
  "r2.dev",
  "cloudflarestorage.com",
  "supabase.co",
  "supabase.in",
  "twimg.com",
  "pfpuwu.com",
];

function isAllowedProxyTarget(target: URL, requestHostname: string): boolean {
  if (target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase();
  if (host === requestHostname.toLowerCase()) return true;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export async function GET({ url }) {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) return json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isAllowedProxyTarget(parsed, url.hostname)) {
    return json({ error: "Host not allowed" }, { status: 403 });
  }

  // Fetch from R2 on the server-side (Bypasses CORS!)
  const response = await fetch(parsed.toString());
  if (!response.ok) {
    return json({ error: `Upstream failed (${response.status})` }, { status: 502 });
  }

  // Create a new response with the correct headers
  return new Response(response.body, {
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
