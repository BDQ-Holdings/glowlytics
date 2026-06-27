/* global React */
/* Driver's-Side Test — engine: webcam, live lighting analysis, UV damage-map
   generation, and shared visual atoms. Exported to window for the other files. */

const { useState, useEffect, useRef, useCallback } = React;

// Fixed heat-map ink (independent of brand palette so the "UV truth" reads clinical)
const HEAT = {
  uv:    [92, 44, 74],    // purple UV haze
  spot:  [74, 42, 22],    // sienna pigmentation
  deep:  [48, 28, 16],    // deep freckle
};

// ── read a brand CSS var as hex (for canvas use) ───────────────────────────
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

// ── useCamera ───────────────────────────────────────────────────────────────
// status: idle | requesting | live | denied | unavailable
function useCamera(active) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setStatus('requesting');
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { setStatus('unavailable'); return undefined; }
    md.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
      audio: false,
    }).then((stream) => {
      clearTimeout(to);
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; v.play().catch(() => {}); }
      setStatus('live');
    }).catch((err) => {
      clearTimeout(to);
      if (cancelled) return;
      setStatus(err && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'denied' : 'unavailable');
    });
    // Some embedded/sandboxed contexts never settle the permission prompt —
    // fall back to demo mode so the flow is never stuck "Requesting…".
    const to = setTimeout(() => { if (!cancelled) setStatus((s) => (s === 'requesting' ? 'unavailable' : s)); }, 4200);
    return () => {
      cancelled = true; clearTimeout(to);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
  }, [active]);

  return { videoRef, status };
}

// ── useLighting ───────────────────────────────────────────────────────────
// Real per-frame luminance sampling. Returns {brightness, uneven, state}.
// state: good | dim | bright | uneven | waiting
function useLighting(videoRef, live) {
  const [light, setLight] = useState({ brightness: 0.5, uneven: 0, state: 'waiting' });
  const rafRef = useRef(0);
  const canvRef = useRef(null);

  useEffect(() => {
    // Fallback / demo: no live feed → settle to a clean "good" reading.
    if (!live) {
      const t = setTimeout(() => setLight({ brightness: 0.58, uneven: 0.05, state: 'good' }), 1100);
      return () => clearTimeout(t);
    }
    if (!canvRef.current) canvRef.current = document.createElement('canvas');
    const cv = canvRef.current; cv.width = 64; cv.height = 48;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let last = 0;
    const tick = (ts) => {
      rafRef.current = requestAnimationFrame(tick);
      if (ts - last < 180) return; // ~5.5fps
      last = ts;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      try {
        ctx.drawImage(v, 0, 0, 64, 48);
        const d = ctx.getImageData(0, 0, 64, 48).data;
        let sum = 0, lSum = 0, rSum = 0, lN = 0, rN = 0;
        for (let y = 0; y < 48; y++) {
          for (let x = 0; x < 64; x++) {
            const i = (y * 64 + x) * 4;
            const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            sum += lum;
            if (x < 28) { lSum += lum; lN++; } else if (x > 36) { rSum += lum; rN++; }
          }
        }
        const brightness = sum / (64 * 48);
        const lAvg = lSum / lN, rAvg = rSum / rN;
        const uneven = Math.abs(lAvg - rAvg);
        let state = 'good';
        if (brightness < 0.26) state = 'dim';
        else if (brightness > 0.82) state = 'bright';
        else if (uneven > 0.17) state = 'uneven';
        setLight({ brightness, uneven, state });
      } catch (e) { /* not ready */ }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef, live]);

  return light;
}

// ── captureFrame ───────────────────────────────────────────────────────────
// Mirrors to match the on-screen selfie preview. Returns a canvas (cap 720w).
function captureFrame(video) {
  const vw = video.videoWidth || 720, vh = video.videoHeight || 960;
  const scale = Math.min(1, 720 / vw);
  const w = Math.round(vw * scale), h = Math.round(vh * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.translate(w, 0); ctx.scale(-1, 1); // mirror
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  return cv;
}

// ── sampleAsymmetry ──────────────────────────────────────────────────────
// Reads left vs right warmth/darkness off the captured frame to seed a
// "real-ish" base, then the tweak biases the headline. 0..1 (higher = more uneven)
function sampleAsymmetry(canvas) {
  try {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, w, h).data;
    let lWarm = 0, rWarm = 0, lN = 0, rN = 0;
    for (let y = Math.floor(h * 0.2); y < h * 0.85; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        const warm = (d[i] - d[i + 2]); // R - B  → sun/redness proxy
        if (x < w * 0.42) { lWarm += warm; lN++; }
        else if (x > w * 0.58) { rWarm += warm; rN++; }
      }
    }
    const diff = Math.abs((lWarm / lN) - (rWarm / rN)) / 255;
    return Math.max(0, Math.min(1, diff * 3));
  } catch (e) { return 0.4; }
}

// ── makeDamageMap ──────────────────────────────────────────────────────────
// Builds an RGBA overlay canvas (transparent except the damage). Weighted to
// the LEFT (driver's side). intensity 0..1.
function makeDamageMap(w, h, intensity, seedBase) {
  const o = document.createElement('canvas');
  o.width = w; o.height = h;
  const c = o.getContext('2d');
  let seed = (seedBase || 9973) >>> 0;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const k = Math.max(0.15, Math.min(1, intensity));

  // 1) broad UV haze, strongest at far left
  const grad = c.createLinearGradient(0, 0, w, 0);
  const [ur, ug, ub] = HEAT.uv;
  grad.addColorStop(0,    `rgba(${ur},${ug},${ub},${0.30 * k})`);
  grad.addColorStop(0.45, `rgba(${ur},${ug},${ub},${0.07 * k})`);
  grad.addColorStop(0.7,  `rgba(${ur},${ug},${ub},0)`);
  grad.addColorStop(1,    'rgba(0,0,0,0)');
  c.fillStyle = grad; c.fillRect(0, 0, w, h);

  // 2) pigmentation blotches — count & size scale with intensity, x biased left
  const n = Math.round(70 * k) + 30;
  const [sr, sg, sb] = HEAT.spot;
  for (let i = 0; i < n; i++) {
    const x = w * Math.pow(rand(), 1.7) * 0.66;       // mostly left two-thirds
    const y = h * (0.16 + rand() * 0.68);
    const r = 2 + rand() * 13 * k;
    const a = 0.10 + rand() * 0.30 * k;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${sr},${sg},${sb},${a})`);
    rg.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // 3) a scatter of deeper freckles, far-left only
  const [dr, dg, db] = HEAT.deep;
  const m = Math.round(18 * k) + 6;
  for (let i = 0; i < m; i++) {
    const x = w * Math.pow(rand(), 2.4) * 0.4;
    const y = h * (0.2 + rand() * 0.6);
    const r = 1.2 + rand() * 3.5;
    const a = 0.25 + rand() * 0.4 * k;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${dr},${dg},${db},${a})`);
    rg.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  return o;
}

// ── compositeReveal ──────────────────────────────────────────────────────
// photo canvas + damage overlay → a "damaged" canvas (multiply look). Returns canvas.
function compositeReveal(photo, damage) {
  const w = photo.width, h = photo.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.drawImage(photo, 0, 0);
  // slight contrast/desat on the damaged read
  c.globalCompositeOperation = 'multiply';
  c.drawImage(damage, 0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  return cv;
}

// ── makeSamplePhoto ─────────────────────────────────────────────────────
// Fallback "photo" when no camera: an honest striped placeholder portrait in
// warm tones with a faint face contour, so the reveal concept still lands.
function makeSamplePhoto(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  // warm base wash
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e9cdbb'); g.addColorStop(1, '#d9ad97');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // diagonal placeholder stripes
  c.save(); c.globalAlpha = 0.06; c.strokeStyle = '#3a2630'; c.lineWidth = 2;
  for (let x = -h; x < w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke(); }
  c.restore();
  // soft vignette
  const rg = c.createRadialGradient(w / 2, h * 0.42, h * 0.2, w / 2, h * 0.5, h * 0.7);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(40,20,30,0.28)');
  c.fillStyle = rg; c.fillRect(0, 0, w, h);
  // faint face contour
  c.strokeStyle = 'rgba(58,38,48,0.35)'; c.lineWidth = 2;
  c.beginPath();
  const cx = w / 2, cy = h * 0.46, rx = w * 0.26, ry = h * 0.34;
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  // monospace tag
  c.fillStyle = 'rgba(58,38,48,0.6)';
  c.font = `${Math.round(h * 0.022)}px ui-monospace, monospace`;
  c.textAlign = 'center';
  c.fillText('CAMERA OFF · SAMPLE FACE', w / 2, h * 0.93);
  return cv;
}

// ── FaceMap (silhouette + asymmetric zones) ────────────────────────────────
const FACE_PATH = 'M 100 28 C 58 28, 28 60, 28 112 C 28 178, 56 228, 100 240 C 144 228, 172 178, 172 112 C 172 60, 142 28, 100 28 Z';
const ZONE_PATHS = {
  forehead: 'M 56 70 C 70 50, 130 50, 144 70 L 144 92 C 130 86, 70 86, 56 92 Z',
  cheekL:   'M 50 120 C 38 120, 36 168, 60 175 C 78 175, 84 145, 80 130 Z',
  cheekR:   'M 150 120 C 162 120, 164 168, 140 175 C 122 175, 116 145, 120 130 Z',
  templeL:  'M 40 92 C 32 100, 32 124, 44 130 C 52 122, 52 104, 50 96 Z',
  templeR:  'M 160 92 C 168 100, 168 124, 156 130 C 148 122, 148 104, 150 96 Z',
  jaw:      'M 60 192 C 80 230, 120 230, 140 192 C 130 215, 110 225, 100 225 C 90 225, 70 215, 60 192 Z',
};

function FaceMap({ size = 200, contour = 'ink', damage = 0, halo = false }) {
  const k = Math.max(0, Math.min(1, damage));
  const leftZones = ['templeL', 'cheekL', 'forehead'];
  const stroke = contour === 'ink' ? cssVar('--ink') : contour === 'soft' ? cssVar('--glow') : cssVar('--accent2');
  return (
    <svg viewBox="0 0 200 268" width={size} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={`fm-clip-${size}`}><path d={FACE_PATH} /></clipPath>
        <radialGradient id={`fm-halo-${size}`} cx="38%" cy="40%" r="62%">
          <stop offset="0%" stopColor="rgba(150,60,90,0.55)" />
          <stop offset="100%" stopColor="rgba(150,60,90,0)" />
        </radialGradient>
      </defs>
      {halo && <ellipse cx="78" cy="120" rx="96" ry="120" fill={`url(#fm-halo-${size})`} />}
      <path d={FACE_PATH} fill="none" stroke={stroke} strokeWidth="1.3" />
      <g clipPath={`url(#fm-clip-${size})`}>
        {leftZones.map((z, i) => (
          <path key={z} d={ZONE_PATHS[z]}
            fill={`rgba(120,48,78,${(0.22 + i * 0.06) * k})`}
            stroke={`rgba(150,60,90,${0.5 * k})`} strokeWidth="0.8" />
        ))}
        {/* faint right-side zones for contrast */}
        {['templeR', 'cheekR'].map((z) => (
          <path key={z} d={ZONE_PATHS[z]} fill={`rgba(120,48,78,${0.05 * k})`} />
        ))}
        {k > 0.2 && Array.from({ length: Math.round(40 * k) }).map((_, i) => {
          const x = 30 + (i * 53 % 70); const y = 70 + (i * 37 % 150);
          return <circle key={i} cx={x} cy={y} r={0.8 + (i % 3) * 0.5} fill={`rgba(74,42,22,${0.5 * k})`} />;
        })}
      </g>
      <g stroke={cssVar('--muted')} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M 60 100 Q 72 96, 84 100" />
        <path d="M 116 100 Q 128 96, 140 100" />
        <path d="M 100 110 L 100 145 Q 100 152, 95 154" />
        <path d="M 84 175 Q 100 182, 116 175" />
      </g>
    </svg>
  );
}

// ── small atoms ─────────────────────────────────────────────────────────
const Dot = ({ c }) => <span style={{ width: 6, height: 6, borderRadius: 999, background: c, display: 'inline-block', flexShrink: 0 }} />;

function Chip({ children, tone = 'neutral' }) {
  const map = {
    neutral: { bg: 'rgba(255,255,255,0.09)', bd: 'rgba(255,255,255,0.14)', fg: 'rgba(255,255,255,0.92)' },
    good:    { bg: 'rgba(74,222,128,0.14)',  bd: 'rgba(74,222,128,0.4)',   fg: '#bff0cd' },
    warn:    { bg: 'rgba(245,176,82,0.16)',  bd: 'rgba(245,176,82,0.5)',   fg: '#ffd9a3' },
  }[tone];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
      fontFamily: 'Switzer, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: 0.2,
      background: map.bg, border: `1px solid ${map.bd}`, color: map.fg,
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    }}>{children}</div>
  );
}

// progress dots for the flow
function FlowDots({ step, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i === step ? 18 : 6, height: 6, borderRadius: 999,
          background: i === step ? 'var(--accent)' : i < step ? 'var(--accent2)' : 'var(--glow)',
          transition: 'all 240ms cubic-bezier(.2,.8,.2,1)',
        }} />
      ))}
    </div>
  );
}

Object.assign(window, {
  useCamera, useLighting, captureFrame, sampleAsymmetry,
  makeDamageMap, compositeReveal, makeSamplePhoto, cssVar,
  FaceMap, Dot, Chip, FlowDots,
});
