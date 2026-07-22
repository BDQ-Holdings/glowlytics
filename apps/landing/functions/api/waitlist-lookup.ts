interface Env {
  WAITLIST_DB: D1Database;
  WAITLIST_LOOKUP_TOKEN?: string;
}

interface WaitlistLead {
  posthog_distinct_id: string | null;
  acquisition_source: string | null;
  acquisition_medium: string | null;
  attribution_model: string | null;
  attribution_quality: string | null;
  historical_backfill: number | null;
  form_placement: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  google_click_id_present: number | null;
  referrer_host: string | null;
  landing_path: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WAITLIST_LOOKUP_SQL = `
  SELECT posthog_distinct_id,
         acquisition_source,
         acquisition_medium,
         attribution_model,
         attribution_quality,
         historical_backfill,
         form_placement,
         utm_source,
         utm_medium,
         utm_campaign,
         utm_term,
         utm_content,
         google_click_id_present,
         referrer_host,
         landing_path
    FROM waitlist
   WHERE email = ?
   LIMIT 1`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const expectedToken = env.WAITLIST_LOOKUP_TOKEN;
  if (!expectedToken) return json(503, { error: "unavailable" });

  const authorization = request.headers.get("Authorization") || "";
  const providedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!(await tokensMatch(providedToken, expectedToken))) {
    return json(403, { error: "forbidden" });
  }

  let payload: { email?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown };
  } catch {
    return json(400, { error: "invalid json" });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json(400, { error: "invalid email" });
  }

  try {
    const lead = await env.WAITLIST_DB.prepare(WAITLIST_LOOKUP_SQL)
      .bind(email)
      .first<WaitlistLead>();
    return lead ? json(200, { matched: true, lead }) : json(200, { matched: false });
  } catch (error) {
    console.error("waitlist lookup failed", error);
    return json(503, { error: "unavailable" });
  }
};
