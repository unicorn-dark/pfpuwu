// src/routes/api/proxy/+server.ts
import { json } from "@sveltejs/kit";

export async function GET({ url }) {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) return json({ error: "Missing url" }, { status: 400 });

  // Fetch from R2 on the server-side (Bypasses CORS!)
  const response = await fetch(targetUrl);

  // Create a new response with the correct headers
  return new Response(response.body, {
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
