// Shared pg-pool resilience.
//
// A pooled client can lose its connection while idle (DB restart, network
// blip, Railway maintenance). node-postgres surfaces this as an 'error' event
// on the Pool itself. With NO listener attached, Node treats it as an
// unhandled 'error' event and crashes the whole process — taking every
// endpoint down for one idle-client drop. Attaching a listener turns that into
// a logged, recoverable event: the pool discards the dead client and hands out
// a fresh one on the next query.
//
// This does NOT change how pools are constructed or passed. The query modules
// still take `pool` as their first argument (test-injectable fake pools), and
// this helper is a no-op on anything lacking `.on`.
function attachPoolErrorHandler(pool, label) {
  if (pool && typeof pool.on === 'function') {
    const tag = label ? `[pg pool:${label}]` : '[pg pool]';
    pool.on('error', (e) => console.error(tag, e?.message ?? e));
  }
  return pool;
}

module.exports = { attachPoolErrorHandler };
