/**
 * SSRF-hardened fetch for the SEO pipeline.
 *
 * Article/extractor URLs originate from SERP organic results — i.e. external,
 * attacker-influenceable input. A page that ranks for a target keyword can
 * 30x-redirect our fetch toward internal metadata/loopback endpoints
 * (169.254.169.254, 127.0.0.1, RFC1918, etc.) in the CI/cron environment.
 *
 * `safeFetch` enforces, on the initial URL and on every redirect hop:
 *   - scheme is http: or https: only
 *   - the resolved address(es) are not loopback / private / link-local /
 *     unique-local (IPv4 and IPv6, including IPv4-mapped IPv6)
 * Redirects are followed manually (`redirect: "manual"`) so each Location is
 * re-validated before it is fetched. The caller's AbortSignal/timeout is
 * preserved across all hops.
 */
import net from "node:net";
import dns from "node:dns/promises";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** Resolver shape compatible with `dns.lookup(host, { all: true })`. */
export type LookupFn = (
  hostname: string,
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

const MAX_REDIRECTS = 5;

const defaultLookup: LookupFn = (hostname) => dns.lookup(hostname, { all: true });

function ipv4ToBytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

function isBlockedIpv4(bytes: number[]): boolean {
  const [a, b] = bytes;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  return false;
}

/**
 * Expand a (net.isIPv6-valid) IPv6 string to its eight 16-bit hextets,
 * folding any embedded IPv4 tail into the final two hextets.
 */
function ipv6ToHextets(rawIp: string): number[] | null {
  const ip = rawIp.split("%")[0]; // drop zone id (e.g. fe80::1%eth0)

  let normalized = ip;
  const dotIndex = normalized.indexOf(".");
  if (dotIndex !== -1) {
    // Embedded IPv4 tail, e.g. ::ffff:192.168.0.1 — convert to two hextets.
    const lastColon = normalized.lastIndexOf(":");
    const v4 = ipv4ToBytes(normalized.slice(lastColon + 1));
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const doubleColon = normalized.indexOf("::");
  let groups: string[];
  if (doubleColon === -1) {
    groups = normalized.split(":");
  } else {
    const head = normalized.slice(0, doubleColon).split(":").filter(Boolean);
    const tail = normalized.slice(doubleColon + 2).split(":").filter(Boolean);
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...new Array<string>(missing).fill("0"), ...tail];
  }

  if (groups.length !== 8) return null;
  const hextets: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    hextets.push(parseInt(group, 16));
  }
  return hextets;
}

function isBlockedIpv6(hextets: number[]): boolean {
  if (hextets.every((h) => h === 0)) return true; // :: unspecified
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return true; // ::1 loopback
  if ((hextets[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((hextets[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/**
 * True when `ip` is a loopback / private / link-local / unique-local address
 * that must never be reached by pipeline fetches. Fails safe: any address that
 * cannot be parsed is treated as blocked.
 */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const bytes = ipv4ToBytes(ip);
    return bytes ? isBlockedIpv4(bytes) : true;
  }
  if (net.isIPv6(ip)) {
    const hextets = ipv6ToHextets(ip);
    if (!hextets) return true;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — apply IPv4 rules to the mapped octets.
    if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
      const mapped = [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff];
      return isBlockedIpv4(mapped);
    }
    return isBlockedIpv6(hextets);
  }
  return true; // unparseable → block
}

/**
 * Validate a URL's scheme and resolve its host to ensure no resolved address is
 * private/reserved. Returns the parsed URL on success; throws `SsrfError`
 * otherwise. `lookup` is injectable for testing.
 */
export async function assertUrlAllowed(
  rawUrl: string,
  lookup: LookupFn = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Blocked URL scheme "${url.protocol}" (only http/https allowed): ${rawUrl}`);
  }

  const hostname = url.hostname.replace(/^\[/, "").replace(/\]$/, ""); // strip IPv6 brackets

  let addresses: string[];
  if (net.isIP(hostname) !== 0) {
    addresses = [hostname];
  } else {
    let resolved: ReadonlyArray<{ address: string; family: number }>;
    try {
      resolved = await lookup(hostname);
    } catch (err) {
      throw new SsrfError(
        `DNS resolution failed for "${hostname}": ${(err as Error).message}`,
      );
    }
    addresses = resolved.map((entry) => entry.address);
    if (addresses.length === 0) {
      throw new SsrfError(`No addresses resolved for host "${hostname}"`);
    }
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new SsrfError(
        `Blocked request to private/reserved address ${address} (host "${hostname}")`,
      );
    }
  }

  return url;
}

/**
 * SSRF-hardened drop-in for `fetch`. Validates scheme + resolved IP on the
 * initial URL and on every redirect hop (manual redirect handling, up to 5
 * hops). The caller's `signal` (e.g. AbortSignal.timeout) is
 * forwarded to every hop so the overall timeout budget is preserved.
 */
export async function safeFetch(
  rawUrl: string,
  opts: RequestInit = {},
  lookup: LookupFn = defaultLookup,
): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertUrlAllowed(currentUrl, lookup);
    const res = await fetch(url, { ...opts, redirect: "manual" });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      // Free the socket before following the redirect.
      await res.body?.cancel().catch(() => undefined);
      currentUrl = new URL(location, url).toString();
      continue;
    }

    return res;
  }

  throw new SsrfError(`Too many redirects (> ${MAX_REDIRECTS}) starting from ${rawUrl}`);
}
