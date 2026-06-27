/* global React, FaceMap, Chip, Dot, FlowDots */
/* Driver's-Side Test — capture-side screens: Intro, Framing, Scanning. */

// ── shared button ──────────────────────────────────────────────────────
function PrimaryBtn({ children, onClick, dark, disabled, style }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
      padding: '15px 26px', borderRadius: 999, border: 'none',
      fontFamily: 'Switzer, sans-serif', fontSize: 15, fontWeight: 600, letterSpacing: 0.2,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      background: dark ? '#fff' : 'var(--ink)', color: dark ? '#1a1518' : 'var(--surface)',
      transition: 'transform 150ms ease, opacity 200ms ease', ...style,
    }} onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      {children}
    </button>
  );
}
const ArrowR = ({ s = 17 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M14 6l6 6-6 6" /></svg>
);

// ════════════════════════════════════════════════════════════════════════
// SCREEN 1 — INTRO / HOOK
// ════════════════════════════════════════════════════════════════════════
function IntroScreen({ tone, onStart }) {
  const dramatic = tone === 'dramatic';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '46px 30px 34px', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -90, right: -90, width: 320, height: 320,
        background: 'radial-gradient(circle, var(--glow) 0%, transparent 66%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
          The Driver&rsquo;s-Side Test
        </div>
        <h1 style={{ fontFamily: 'Switzer, sans-serif', fontWeight: 400, fontSize: 'clamp(33px, 8.5vw, 44px)',
          lineHeight: 1.05, letterSpacing: '-1.5px', color: 'var(--ink)', margin: '16px 0 0', textWrap: 'balance' }}>
          {dramatic ? (
            <>One side of your face is <em style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', color: 'var(--accent)', letterSpacing: '-0.5px' }}>aging faster</em>.</>
          ) : (
            <>See how the sun reads <em style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', color: 'var(--accent)', letterSpacing: '-0.5px' }}>across your face</em>.</>
          )}
        </h1>
        <p style={{ fontFamily: 'Switzer, sans-serif', fontSize: 15, lineHeight: 1.55, color: 'var(--muted)', marginTop: 16, maxWidth: 360, textWrap: 'pretty' }}>
          Years of driving, sitting by the same window, walking the same way to work — UV lands on one side
          more than the other. {dramatic ? 'Most people are stunned by the gap.' : 'The difference is usually quiet, and easy to even out.'}
        </p>
      </div>

      {/* premise visual */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0, margin: '8px 0' }}>
        <div style={{ position: 'relative' }}>
          <FaceMap size={188} contour="ink" damage={0.7} halo />
          <div style={{ position: 'absolute', top: '34%', left: -8, transform: 'translateX(-100%)', textAlign: 'right' }}>
            <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 }}>Driver&rsquo;s side</div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 14, color: 'var(--ink)' }}>more sun</div>
          </div>
          <div style={{ position: 'absolute', top: '52%', right: -8, transform: 'translateX(100%)' }}>
            <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>Passenger</div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 14, color: 'var(--ink)' }}>shielded</div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <PrimaryBtn onClick={onStart} style={{ width: '100%' }}>
          Take the test <ArrowR />
        </PrimaryBtn>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
          {['60 seconds', 'Uses your camera', 'Photos never leave this page'].map((x, i) => (
            <div key={x} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Switzer, sans-serif', fontSize: 11, color: 'var(--muted)' }}>
              {i > 0 && <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--glow)' }} />}
              {x}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCREEN 2 — FRAMING + CAPTURE (live lighting warnings)
// ════════════════════════════════════════════════════════════════════════
function FramingScreen({ videoRef, status, light, onCapture, onBack }) {
  const live = status === 'live';
  const blocked = status === 'denied' || status === 'unavailable';
  const connecting = status === 'idle' || status === 'requesting';
  const ls = blocked ? 'good' : connecting ? 'connecting' : light.state; // demo path treats as good
  const canShoot = blocked || (live && ls === 'good');

  const LIGHT_COPY = {
    connecting: { tone: 'neutral', text: 'Connecting to your camera…' },
    waiting: { tone: 'neutral', text: 'Reading your light…' },
    good:    { tone: 'good',    text: 'Even light · good to go' },
    dim:     { tone: 'warn',    text: 'Too dim — find more light' },
    bright:  { tone: 'warn',    text: 'Too bright — ease off direct light' },
    uneven:  { tone: 'warn',    text: 'Uneven light — face your window squarely' },
  }[ls] || { tone: 'neutral', text: 'Reading…' };

  return (
    <div style={{ height: '100%', background: '#15110f', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 0' }}>
        <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 16, cursor: 'pointer', backdropFilter: 'blur(16px)' }}>‹</button>
        <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>Find your face</div>
        <div style={{ width: 32 }} />
      </div>

      {/* viewport */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!blocked ? (
          <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', background: '#15110f' }} />
        ) : (
          <SamplePlaceholder />
        )}
        {/* warm vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 42%, transparent 38%, rgba(21,17,15,0.66) 100%)', pointerEvents: 'none' }} />

        {/* face guide oval (hidden until the feed resolves) */}
        {!connecting && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <svg width="64%" viewBox="0 0 200 268" style={{ maxHeight: '72%' }}>
              <ellipse cx="100" cy="134" rx="78" ry="110" fill="none"
                stroke={canShoot ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.45)'} strokeWidth="1.4" strokeDasharray="5 7" />
              {/* center seam hint (the test axis) */}
              <line x1="100" y1="28" x2="100" y2="240" stroke="rgba(217,162,139,0.45)" strokeWidth="1" strokeDasharray="2 5" />
            </svg>
          </div>
        )}

        {/* connecting state */}
        {connecting && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.18)', borderTopColor: 'var(--accent2)', animation: 'dst-spin 0.9s linear infinite' }} />
            <Chip>Waiting for camera permission…</Chip>
          </div>
        )}

        {/* corner readouts */}
        <div style={{ position: 'absolute', top: 64, left: 16 }}>
          <Chip tone={live ? 'good' : 'neutral'}><Dot c={live ? '#4ade80' : '#d9a28b'} />{live ? 'Camera live' : blocked ? 'Demo mode' : 'Connecting'}</Chip>
        </div>
        <div style={{ position: 'absolute', top: 64, right: 16 }}>
          <Chip>{blocked ? 'Sample face' : 'Hold still'}</Chip>
        </div>

        {/* uneven-light emphasis banner */}
        {ls === 'uneven' && (
          <div style={{ position: 'absolute', bottom: 88, left: 16, right: 16, display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(245,176,82,0.16)', border: '1px solid rgba(245,176,82,0.5)', backdropFilter: 'blur(16px)',
              borderRadius: 14, padding: '10px 14px', maxWidth: 280, textAlign: 'center' }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 15, color: '#ffd9a3' }}>Your light is uneven.</div>
              <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, color: 'rgba(255,217,163,0.85)', marginTop: 2 }}>That alone can fake an imbalance — turn to face your light source evenly.</div>
            </div>
          </div>
        )}

        {/* lighting status pill (bottom center) */}
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <Chip tone={LIGHT_COPY.tone}>
            <Dot c={LIGHT_COPY.tone === 'good' ? '#4ade80' : LIGHT_COPY.tone === 'warn' ? '#f5b052' : '#d9a28b'} />
            {LIGHT_COPY.text}
          </Chip>
        </div>
      </div>

      {/* shutter zone */}
      <div style={{ padding: '18px 0 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: '#15110f' }}>
        <button onClick={canShoot ? onCapture : undefined} disabled={!canShoot} aria-label="Capture" style={{
          width: 70, height: 70, borderRadius: '50%', cursor: canShoot ? 'pointer' : 'not-allowed',
          background: canShoot ? '#fff' : 'rgba(255,255,255,0.25)',
          border: `4px solid ${canShoot ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'}`,
          boxShadow: canShoot ? '0 0 0 2px #fff, 0 0 44px rgba(217,162,139,0.6)' : 'none',
          transition: 'all 240ms ease', animation: canShoot ? 'dst-pulse 2.4s ease-in-out infinite' : 'none',
        }} />
        <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11.5, color: canShoot ? 'rgba(255,255,255,0.6)' : connecting ? 'rgba(255,255,255,0.5)' : 'rgba(245,176,82,0.85)', height: 14 }}>
          {canShoot ? 'Tap to capture' : connecting ? 'Allow camera access to begin' : 'Even out your lighting to continue'}
        </div>
      </div>
    </div>
  );
}

function SamplePlaceholder() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #2a1d24, #15110f)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: 0.9 }}>
        <FaceMap size={220} contour="accent2" halo damage={0.15} />
      </div>
      <div style={{ position: 'absolute', bottom: 96, left: 0, right: 0, textAlign: 'center',
        fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)' }}>
        CAMERA BLOCKED · RUNNING ON A SAMPLE FACE
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCREEN 3 — SCANNING (UV sweep, left vs right tally)
// ════════════════════════════════════════════════════════════════════════
function ScanningScreen({ photoURL, asymmetry, scanSpeed, onDone }) {
  const [pct, setPct] = React.useState(0);
  const [lTally, setLTally] = React.useState(0);
  const [rTally, setRTally] = React.useState(0);
  const dur = ({ slow: 4200, normal: 2800, fast: 1600 }[scanSpeed]) || 2800;
  const lTarget = Math.round(38 + asymmetry * 50);   // driver's side accumulates more
  const rTarget = Math.round(10 + asymmetry * 16);

  React.useEffect(() => {
    let raf, start;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
      setPct(p * 100);
      setLTally(Math.round(lTarget * e));
      setRTally(Math.round(rTarget * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Guaranteed advance even if rAF is throttled (backgrounded tab).
    const done = setTimeout(() => { setPct(100); setLTally(lTarget); setRTally(rTarget); onDone(); }, dur + 450);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [dur]);

  const stages = ['Capturing', 'Mapping zones', 'Comparing sides', 'Scoring'];
  const stageIdx = Math.min(3, Math.floor((pct / 100) * 4));

  return (
    <div style={{ height: '100%', background: '#15110f', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, textAlign: 'center', padding: '22px 0 0' }}>
        <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--accent2)' }}>Reading UV exposure</div>
      </div>

      {/* photo + sweep */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {photoURL && <img src={photoURL} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7) saturate(0.85)' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(21,17,15,0.35)' }} />

        {/* center axis */}
        <div style={{ position: 'absolute', top: '8%', bottom: '8%', left: '50%', width: 1, background: 'rgba(217,162,139,0.4)', transform: 'translateX(-0.5px)' }} />

        {/* sweep line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: `${pct}%`, height: 64, transform: 'translateY(-50%)',
          background: 'linear-gradient(180deg, transparent, rgba(217,162,139,0.55), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '6%', right: '6%', top: `${pct}%`, height: 2, background: 'var(--accent2)', boxShadow: '0 0 18px rgba(217,162,139,0.9)' }} />

        {/* side tallies */}
        <div style={{ position: 'absolute', bottom: 20, left: 16 }}>
          <SideTally label="Driver's side" value={lTally} max={88} hot />
        </div>
        <div style={{ position: 'absolute', bottom: 20, right: 16 }}>
          <SideTally label="Passenger" value={rTally} max={88} />
        </div>
      </div>

      {/* stage strip */}
      <div style={{ padding: '20px 26px 30px', background: '#15110f' }}>
        <div style={{ textAlign: 'center', fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 24, color: '#fff', lineHeight: 1.2 }}>{stages[stageIdx]}…</div>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 16 }}>
          {stages.map((s, i) => (
            <div key={s} style={{ padding: '5px 11px', borderRadius: 999, fontFamily: 'Switzer, sans-serif', fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
              background: i < stageIdx ? 'rgba(217,162,139,0.16)' : i === stageIdx ? 'var(--accent2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${i <= stageIdx ? 'rgba(217,162,139,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: i === stageIdx ? '#1a1518' : i < stageIdx ? 'var(--accent2)' : 'rgba(255,255,255,0.4)' }}>{s}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SideTally({ label, value, max, hot }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${hot ? 'rgba(217,162,139,0.4)' : 'rgba(255,255,255,0.12)'}`, backdropFilter: 'blur(16px)',
      borderRadius: 14, padding: '10px 14px', minWidth: 104 }}>
      <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: hot ? 'var(--accent2)' : 'rgba(255,255,255,0.55)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 28, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>UV idx</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 999, marginTop: 7, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: hot ? 'var(--accent2)' : 'rgba(255,255,255,0.5)', borderRadius: 999 }} />
      </div>
    </div>
  );
}

Object.assign(window, { IntroScreen, FramingScreen, ScanningScreen, PrimaryBtn, ArrowR });
