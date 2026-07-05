import { useEffect, useState } from 'react';
import { isArkitAvailable } from '../services/faceMeshCapture';

/**
 * Module-level cache for the TrueDepth capability answer.
 *
 * The native ARKit probe result never changes within an app session, so we
 * probe once and share the answer. `null` = not yet probed; `inFlight` holds
 * the single shared probe so concurrent mounts don't each hit the native module.
 */
let cached: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

function probeTrueDepth(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = isArkitAvailable()
    .then((supported) => {
      cached = supported;
      return supported;
    })
    .catch(() => {
      // Module unlinked / probe failed → treat as non-TrueDepth.
      cached = false;
      return false;
    });
  return inFlight;
}

/**
 * True on a TrueDepth / Face ID device (ARKit FaceAnchor capture available).
 *
 * First render returns `false`; once the native capability probe resolves the
 * hook flips to the real value. The answer is cached at module level, so a
 * second mount reads it synchronously from cache without re-probing. Falls back
 * to `false` whenever the probe rejects or reports the module is unavailable.
 */
export function useTrueDepthSupported(): boolean {
  const [supported, setSupported] = useState<boolean>(cached ?? false);

  useEffect(() => {
    if (cached !== null) {
      // Warm cache — sync local state without re-probing the native module.
      setSupported(cached);
      return;
    }
    let active = true;
    void probeTrueDepth().then((value) => {
      if (active) setSupported(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return supported;
}
