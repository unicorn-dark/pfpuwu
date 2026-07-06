import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

export async function POST({ request, cookies }) {
  const { password } = await request.json();

  if (password === env.ADMIN_PASSWORD) {
    // Secure, HTTP-only cookie so JS can't read it, but the browser sends it automatically
    cookies.set("uwu_editor_token", env.ADMIN_PASSWORD, {
      path: "/",
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 365, // 1 Year
    });
    return json({ success: true });
  }

  return json({ error: "Invalid password" }, { status: 401 });
}
