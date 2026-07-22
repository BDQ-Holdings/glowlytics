#!/usr/bin/env node
/**
 * Enrich backend/curated-products.js entries with product image URLs from
 * Open Beauty Facts / Open Food Facts.
 *
 * Strategy per entry (skips entries that already have image_url):
 *   1. Exact barcode lookup (OBF then OFF) when the entry has a barcode.
 *   2. Strict name search: candidate brand must contain our brand and >= 70%
 *      of the significant name tokens must appear in the candidate name.
 *      A wrong product image is worse than none, so no fuzzy acceptance.
 *   3. Every accepted URL is HEAD-validated (200 + image/* content-type).
 *
 * Writes `image_url: '<url>',` directly after the matching `name:` line in
 * curated-products.js. Idempotent: already-enriched entries are skipped.
 *
 * Usage: node backend/scripts/enrich-curated-images.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'curated-products.js');
const { CURATED_PRODUCTS } = require(CATALOG_PATH);

const UA = { headers: { 'User-Agent': 'Glowlytics-CatalogEnrich/1.0 (contact: dev@glowlytics.ai)' } };
const HOSTS = ['world.openbeautyfacts.org', 'world.openfoodfacts.org'];
const STOP = new Set(['the', 'and', 'for', 'with', 'spf']);

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const pickImage = (p) => {
  for (const k of ['image_front_url', 'image_url', 'image_small_url']) {
    if (typeof p?.[k] === 'string' && p[k].trim()) return p[k];
  }
  return null;
};
const sigTokens = (name, brand) => {
  const b = new Set(norm(brand).split(' '));
  return norm(name).split(' ').filter((t) => t.length >= 3 && !b.has(t) && !STOP.has(t));
};

async function byBarcode(barcode) {
  for (const host of HOSTS) {
    try {
      const r = await fetch(`https://${host}/api/v0/product/${barcode}.json`, { ...UA, signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.status === 1 && j.product) {
        const img = pickImage(j.product);
        if (img) return img;
      }
    } catch { /* next host */ }
  }
  return null;
}

async function byName(entry) {
  const q = `${entry.brand} ${entry.name}`;
  for (const host of HOSTS) {
    try {
      const url = `https://${host}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=8&fields=product_name,brands,image_front_url,image_url,image_small_url`;
      const r = await fetch(url, { ...UA, signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const cands = (await r.json()).products || [];
      const ourBrand = norm(entry.brand);
      for (const c of cands) {
        if (ourBrand && !norm(c.brands || '').includes(ourBrand)) continue;
        const toks = sigTokens(entry.name, entry.brand);
        if (!toks.length) continue;
        const candName = norm(c.product_name || '');
        const hit = toks.filter((t) => candName.includes(t)).length;
        if (hit / toks.length < 0.7) continue;
        const img = pickImage(c);
        if (img) return img;
      }
    } catch { /* next host */ }
  }
  return null;
}

async function isLiveImage(url) {
  try {
    const r = await fetch(url, { ...UA, method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return r.ok && (r.headers.get('content-type') || '').startsWith('image/');
  } catch {
    return false;
  }
}

const pending = CURATED_PRODUCTS.filter((p) => !p.image_url);
console.log(`Catalog: ${CURATED_PRODUCTS.length} entries, ${pending.length} without image_url`);

const found = new Map();
let cursor = 0;
async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= pending.length) return;
    const p = pending[i];
    const img = (p.barcode && (await byBarcode(p.barcode))) || (await byName(p));
    if (img && (await isLiveImage(img))) found.set(p.name, img);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`Resolved ${found.size}/${pending.length} images`);
if (!found.size) process.exit(0);

const unq = (raw) => raw.replace(/\\'/g, "'").replace(/\\"/g, '"');
const lines = readFileSync(CATALOG_PATH, 'utf8').split('\n');
const out = [];
let inserted = 0;
for (const line of lines) {
  out.push(line);
  const m = line.match(/^(\s*)name: (['"])(.*)\2,\s*$/);
  if (m && found.has(unq(m[3]))) {
    out.push(`${m[1]}image_url: '${found.get(unq(m[3]))}',`);
    inserted++;
  }
}
if (inserted !== found.size) {
  console.error(`Insertion mismatch: found ${found.size}, inserted ${inserted}. Aborting without write.`);
  process.exit(1);
}
writeFileSync(CATALOG_PATH, out.join('\n'));
console.log(`Wrote ${inserted} image_url fields to curated-products.js`);
