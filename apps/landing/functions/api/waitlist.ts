/**
 * Cloudflare Pages Function — waitlist signup.
 *
 * POST /api/waitlist
 *   body: { email: string, source?: string }
 *   200  { ok: true, alreadyOnList: boolean }
 *   400  { error: "invalid email" }
 *   500  { error: "internal" }
 *
 * GET /api/waitlist
 *   200  { count: number }
 *
 * Storage: Cloudflare D1 (binding `WAITLIST_DB`). Table created via the
 * companion migration in functions/api/_schema.sql.
 */

export interface Env {
  WAITLIST_DB: D1Database;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: { email?: unknown; source?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json(400, { error: "invalid json" });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json(400, { error: "invalid email" });
  }

  const source =
    typeof payload.source === "string" && payload.source.length <= 64
      ? payload.source
      : "landing";

  try {
    const existing = await env.WAITLIST_DB.prepare(
      "SELECT 1 FROM waitlist WHERE email = ? LIMIT 1",
    )
      .bind(email)
      .first();

    if (existing) {
      return json(200, { ok: true, alreadyOnList: true });
    }

    await env.WAITLIST_DB.prepare(
      "INSERT INTO waitlist (email, source, created_at) VALUES (?, ?, ?)",
    )
      .bind(email, source, new Date().toISOString())
      .run();

    return json(200, { ok: true, alreadyOnList: false });
  } catch (err) {
    console.error("waitlist insert failed", err);
    return json(500, { error: "internal" });
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.WAITLIST_DB.prepare(
      "SELECT COUNT(*) AS count FROM waitlist",
    ).first<{ count: number }>();
    return json(200, { count: result?.count ?? 0 });
  } catch (err) {
    console.error("waitlist count failed", err);
    return json(200, { count: 0 });
  }
};
