/**
 * Loops.so lifecycle-email client.
 *
 * Thin, best-effort wrapper around the two Loops endpoints the UV Mirror flow
 * needs (confirmed in the feature plan):
 *   - POST /events/send      { email, eventName, eventProperties?, contactProperties? }
 *   - POST /contacts/update  { email, ...props }
 *
 * Design rules:
 *   - Gated on LOOPS_API_KEY. With no key the module is a silent no-op
 *     (`{ skipped: true }`) so dev/test/CI without credentials never hit the
 *     network — mirrors the CLERK_SECRET_KEY gating in app.js.
 *   - Callers fire these from user-facing flows (lead capture, signup) where a
 *     marketing-email side effect must NEVER break the request, so every error
 *     (transport, abort/timeout, non-2xx) is swallowed and returned as data:
 *     `{ ok: false, error, status? }`. Nothing throws.
 *   - Uses the global `fetch` (Node 18+), same as the Clerk calls in app.js,
 *     with an AbortController timeout matching the third-party fetch convention.
 *
 * Env is read at call time (not cached) so the gate flips correctly across
 * process lifetimes and tests.
 */

const LOOPS_DEFAULT_BASE = 'https://app.loops.so/api/v1';
const TIMEOUT_MS = 6000;

function loopsEnabled() {
  return !!process.env.LOOPS_API_KEY;
}

function baseUrl() {
  return process.env.LOOPS_API_BASE || LOOPS_DEFAULT_BASE;
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length > 0 && email.includes('@');
}

// Single best-effort POST. Returns `{ ok, status }` on success, `{ ok:false,
// error, status? }` on any failure. Never throws.
async function post(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Loops responded ${res.status}`, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire a Loops event (auto-creates the contact + triggers the dashboard loop).
 * @returns {Promise<{skipped:true}|{ok:true,status:number}|{ok:false,error:string,status?:number}>}
 */
async function sendEvent(email, eventName, { eventProperties, contactProperties } = {}) {
  if (!loopsEnabled()) return { skipped: true };
  if (!isValidEmail(email)) return { ok: false, error: 'invalid email' };

  const body = { email, eventName };
  if (eventProperties !== undefined) body.eventProperties = eventProperties;
  if (contactProperties !== undefined) body.contactProperties = contactProperties;

  return post('events/send', body);
}

/**
 * Upsert contact properties on a Loops contact.
 * @returns {Promise<{skipped:true}|{ok:true,status:number}|{ok:false,error:string,status?:number}>}
 */
async function updateContact(email, props = {}) {
  if (!loopsEnabled()) return { skipped: true };
  if (!isValidEmail(email)) return { ok: false, error: 'invalid email' };

  return post('contacts/update', { email, ...props });
}

module.exports = { loopsEnabled, sendEvent, updateContact };
