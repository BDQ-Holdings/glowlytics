/* global React, FaceMap, Dot, PrimaryBtn, ArrowR */
/* Driver's-Side Test — result screens: Reveal, Breakdown, Email, App Store. */

// count-up hook
function useCountUp(target, run, ms = 900) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    if (!run) return undefined;
    let raf, start;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(() => setV(target), ms + 250); // land even if rAF throttled
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [target, run, ms]);
  return v;
}

// ════════════════════════════════════════════════════════════════════════
// SCREEN 4 — THE REVEAL
// ════════════════════════════════════════════════════════════════════════
function RevealScreen({ cleanURL, damagedURL, asymmetry, sunAge, revealStyle, tone, onNext }) {
  const [seam, setSeam] = React.useState(0);
  const [settled, setSettled] = React.useState(false);
  const touchedRef = React.useRef(false);
  const wrapRef = React.useRef(null);
  const dramatic = tone === 'dramatic';

  // entry sweep (wipe / split only)
  React.useEffect(() => {
    if (revealStyle === 'silhouette') { setSettled(true); return undefined; }
    const rest = revealStyle === 'split' ? 50 : 64;
    let raf, start;
    const dur = 1700;
    const tick = (ts) => {
      if (!start) start = ts;
      if (touchedRef.current) return;
      const p = Math.min(1, (ts - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setSeam(rest * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setSettled(true);
    };
    raf = requestAnimationFrame(tick);
    // Guaranteed settle even if rAF is throttled (backgrounded tab).
    const done = setTimeout(() => { if (!touchedRef.current) setSeam(rest); setSettled(true); }, dur + 250);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [revealStyle]);

  const onPointer = (e) => {
    if (revealStyle === 'split') return;
    touchedRef.current = true; setSettled(true);
    const move = (clientX) => {
      const r = wrapRef.current.getBoundingClientRect();
      setSeam(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
    };
    move(e.clientX);
    const mm = (ev) => move(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mm); window.addEventListener('pointerup', up);
  };

  const asymN = useCountUp(asymmetry, settled, 1000);
  const ageN = useCountUp(sunAge, settled, 1000);

  return (
    <div style={{ height: '100%', background: '#15110f', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6, textAlign: 'center', padding: '20px 0 0' }}>
        <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--accent2)' }}>Your result</div>
      </div>

      {/* stage */}
      <div ref={wrapRef} onPointerDown={onPointer} style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: revealStyle === 'split' ? 'default' : 'ew-resize', touchAction: 'none' }}>
        {revealStyle === 'silhouette' ? (
          <SilhouetteReveal />
        ) : (
          <>
            {/* clean base */}
            {cleanURL && <img src={cleanURL} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            {/* damaged top, clipped to left [0..seam] */}
            {damagedURL && <img src={damagedURL} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: `inset(0 ${100 - seam}% 0 0)` }} />}
            {/* labels */}
            <div style={{ position: 'absolute', top: 56, left: 14 }}>
              <RevealTag tone="hot" title="UV-mapped" sub="driver's side" />
            </div>
            <div style={{ position: 'absolute', top: 56, right: 14 }}>
              <RevealTag title="Visible light" sub="what you see" />
            </div>
            {/* seam handle */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${seam}%`, width: 2, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 16px rgba(0,0,0,0.5)', transform: 'translateX(-1px)' }}>
              {revealStyle !== 'split' && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
                  <span style={{ fontSize: 13, color: '#1a1518', letterSpacing: -1 }}>‹›</span>
                </div>
              )}
            </div>
          </>
        )}
        {/* darken bottom for legibility */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', background: 'linear-gradient(180deg, transparent, rgba(21,17,15,0.92))', pointerEvents: 'none' }} />

        {/* result numbers */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, padding: '0 22px', pointerEvents: 'none' }}>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 19, color: '#fff', lineHeight: 1.2, marginBottom: 12, maxWidth: 280 }}>
            {dramatic ? <>Your driver&rsquo;s side is carrying <span style={{ color: 'var(--accent2)' }}>most of the sun</span>.</> : <>A real, <span style={{ color: 'var(--accent2)' }}>measurable</span> lean to one side.</>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ResultStat big={asymN} unit="/ 100" label="Sun asymmetry" />
            <ResultStat big={`+${ageN}`} unit="yrs" label="Driver's side sun-age" accent />
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '16px 22px 28px', background: '#15110f' }}>
        <PrimaryBtn dark onClick={onNext} style={{ width: '100%' }}>See the breakdown <ArrowR /></PrimaryBtn>
        {revealStyle !== 'split' && <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'Switzer, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>drag the line to compare</div>}
      </div>
    </div>
  );
}

function RevealTag({ title, sub, tone }) {
  const hot = tone === 'hot';
  return (
    <div style={{ background: hot ? 'rgba(217,162,139,0.16)' : 'rgba(255,255,255,0.09)', border: `1px solid ${hot ? 'rgba(217,162,139,0.5)' : 'rgba(255,255,255,0.16)'}`, backdropFilter: 'blur(16px)', borderRadius: 12, padding: '7px 11px' }}>
      <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, fontWeight: 600, color: hot ? 'var(--accent2)' : '#fff' }}>{title}</div>
      <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>{sub}</div>
    </div>
  );
}

function ResultStat({ big, unit, label, accent }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(16px)', borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 34, fontWeight: 400, color: accent ? 'var(--accent2)' : '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{big}</span>
        <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{unit}</span>
      </div>
      <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function SilhouetteReveal() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 38% 42%, #3a2230 0%, #15110f 72%)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '14%' }}>
      <FaceMap size={240} contour="accent2" halo damage={0.85} />
      <div style={{ position: 'absolute', top: '30%', left: 18 }}><RevealTag tone="hot" title="High UV load" sub="driver's side" /></div>
      <div style={{ position: 'absolute', top: '50%', right: 18 }}><RevealTag title="Low UV load" sub="passenger side" /></div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCREEN 5 — ZONE BREAKDOWN
// ════════════════════════════════════════════════════════════════════════
function BreakdownScreen({ asymmetry, sunAge, tone, onNext }) {
  // derive per-zone left/right from asymmetry with a fixed seed for stability
  const base = asymmetry / 100;
  const zones = [
    { name: 'Temple',    v: 1.0 },
    { name: 'Cheek',     v: 0.86 },
    { name: 'Forehead',  v: 0.7 },
    { name: 'Under-eye', v: 0.55 },
    { name: 'Jaw',       v: 0.42 },
  ].map((z, i) => {
    const left = Math.round(40 + base * 52 * z.v);
    const right = Math.round(Math.max(6, left - (8 + base * 40 * z.v) - (i % 2) * 3));
    return { ...z, left, right, gap: left - right };
  });

  return (
    <div style={{ height: '100%', background: 'var(--bg)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ padding: '40px 24px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)' }}>Zone breakdown</div>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 30, color: 'var(--ink)', margin: '6px 0 0', lineHeight: 1 }}>Where the sun landed</h2>
        </div>
      </div>

      {/* face + legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px 4px' }}>
        <FaceMap size={120} contour="ink" damage={base} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <Legend c="var(--accent)" t="Driver's side" />
            <Legend c="var(--glow)" t="Passenger" />
          </div>
          <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Higher UV-exposure index = more cumulative sun. Your two sides differ most at the <em style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', color: 'var(--ink)' }}>temple and cheek</em>.
          </div>
        </div>
      </div>

      {/* zone rows */}
      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {zones.map((z) => (
          <div key={z.name} style={{ background: 'var(--surface)', border: '1px solid var(--glow)', borderRadius: 16, padding: '13px 15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
              <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{z.name}</span>
              <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, fontWeight: 600, color: z.gap > 18 ? 'var(--accent)' : 'var(--muted)' }}>+{z.gap} gap</span>
            </div>
            <ZoneBar label="L" value={z.left} max={95} c="var(--accent)" />
            <div style={{ height: 6 }} />
            <ZoneBar label="R" value={z.right} max={95} c="var(--glow)" dark />
          </div>
        ))}
      </div>

      {/* reassurance */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ background: 'linear-gradient(160deg, var(--surface), var(--bg))', border: '1px solid var(--glow)', borderRadius: 20, padding: '18px 18px' }}>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 19, color: 'var(--ink)', lineHeight: 1.3 }}>
            {tone === 'dramatic'
              ? <>A <span style={{ color: 'var(--accent)' }}>+{sunAge}-year</span> gap is real — and the good news is it&rsquo;s the most reversible kind.</>
              : <>None of this is damage you can&rsquo;t soften. Even exposure, and the gap closes.</>}
          </div>
          <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            Your full report maps all 16 zones, tracks the gap over time, and builds a one-side-first routine.
          </div>
        </div>
      </div>

      <div style={{ padding: '18px 16px 30px' }}>
        <PrimaryBtn onClick={onNext} style={{ width: '100%' }}>Get my full report <ArrowR /></PrimaryBtn>
      </div>
    </div>
  );
}

function Legend({ c, t }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={c} /><span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)' }}>{t}</span></div>;
}

function ZoneBar({ label, value, max, c, dark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--muted)', width: 10 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: c, borderRadius: 999, opacity: dark ? 0.7 : 1 }} />
      </div>
      <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 12, color: 'var(--ink)', width: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCREEN 6 — EMAIL CAPTURE (primary CTA)
// ════════════════════════════════════════════════════════════════════════
function EmailScreen({ asymmetry, sunAge, onSubmit, onSkip }) {
  const [email, setEmail] = React.useState('');
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return (
    <div style={{ height: '100%', background: 'var(--bg)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '42px 26px 0' }}>
        <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)' }}>Your full report</div>
        <h2 style={{ fontFamily: 'Switzer, sans-serif', fontWeight: 400, fontSize: 30, letterSpacing: '-1px', color: 'var(--ink)', margin: '8px 0 0', lineHeight: 1.08 }}>
          Get the <em style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', color: 'var(--accent)' }}>Driver&rsquo;s-Side Report</em>, free.
        </h2>
      </div>

      {/* report preview card */}
      <div style={{ padding: '20px 22px 0' }}>
        <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--glow)', borderRadius: 22, padding: 18, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 150, height: 150, background: 'radial-gradient(circle, var(--glow), transparent 66%)' }} />
          <div style={{ position: 'relative', display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ flexShrink: 0 }}><FaceMap size={70} contour="ink" damage={asymmetry / 100} /></div>
            <div>
              <div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>8-page PDF</div>
              <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                <div><div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 26, color: 'var(--ink)', lineHeight: 1 }}>{asymmetry}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>asymmetry</div></div>
                <div><div style={{ fontFamily: 'Switzer, sans-serif', fontSize: 26, color: 'var(--accent)', lineHeight: 1 }}>+{sunAge}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>sun-age yrs</div></div>
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--glow)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['All 16 zones, mapped side-by-side', 'A one-side-first repair routine', 'A re-scan plan to watch the gap close'].map((x) => (
              <div key={x} style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'Switzer, sans-serif', fontSize: 13, color: 'var(--ink)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>{x}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* form */}
      <div style={{ padding: '20px 22px 0', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: `1px solid ${valid ? 'var(--accent)' : 'var(--glow)'}`, borderRadius: 999, padding: '5px 5px 5px 18px', transition: 'border-color 200ms' }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'Switzer, sans-serif', fontSize: 15, color: 'var(--ink)', padding: '11px 6px' }} />
          <button onClick={valid ? () => onSubmit(email) : undefined} disabled={!valid} style={{
            border: 'none', borderRadius: 999, padding: '11px 18px', fontFamily: 'Switzer, sans-serif', fontSize: 14, fontWeight: 600,
            background: 'var(--ink)', color: 'var(--surface)', cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.4, whiteSpace: 'nowrap' }}>
            Send it
          </button>
        </div>
        <div style={{ textAlign: 'center', fontFamily: 'Switzer, sans-serif', fontSize: 11, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
          One email, the report attached. No list, no spam.<br />Your photo stays on your device.
        </div>
        <div style={{ textAlign: 'center', marginTop: 14, paddingBottom: 26 }}>
          <button onClick={onSkip} style={{ border: 'none', background: 'transparent', fontFamily: 'Switzer, sans-serif', fontSize: 12.5, color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer' }}>
            Skip — just take me to the app
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCREEN 7 — APP STORE CTA (+ confirmation)
// ════════════════════════════════════════════════════════════════════════
function AppStoreScreen({ sent, email, onRestart }) {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '46px 28px 32px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -90, left: -90, width: 320, height: 320, background: 'radial-gradient(circle, var(--glow) 0%, transparent 66%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative' }}>
        {sent && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--glow)', borderRadius: 999, padding: '7px 14px', marginBottom: 20 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>
            <span style={{ fontFamily: 'Switzer, sans-serif', fontSize: 12.5, color: 'var(--ink)' }}>Report on its way to {email || 'your inbox'}</span>
          </div>
        )}
        <h2 style={{ fontFamily: 'Switzer, sans-serif', fontWeight: 400, fontSize: 34, letterSpacing: '-1.2px', color: 'var(--ink)', margin: 0, lineHeight: 1.07 }}>
          Watch the gap <em style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', color: 'var(--accent)' }}>close</em>.
        </h2>
        <p style={{ fontFamily: 'Switzer, sans-serif', fontSize: 15, color: 'var(--muted)', marginTop: 14, lineHeight: 1.55, maxWidth: 330 }}>
          Glowlytics re-scans in seconds and tracks your left-vs-right sun-age week over week — so you can actually see one side catch up.
        </p>
      </div>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center', minHeight: 0 }}>
        <div style={{ position: 'relative', width: 150, height: 150, borderRadius: 40, background: 'linear-gradient(160deg, var(--accent2), var(--glow))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 60px rgba(217,162,139,0.45)' }}>
          <svg width="74" height="74" viewBox="0 0 72 72"><circle cx="36" cy="36" r="27" stroke="var(--ink)" strokeWidth="1.4" fill="none" /><circle cx="36" cy="36" r="27" stroke="var(--accent)" strokeWidth="3.4" fill="none" strokeDasharray="118 200" strokeLinecap="round" transform="rotate(-90 36 36)" /><circle cx="36" cy="36" r="8.5" fill="var(--surface)" /></svg>
          <div style={{ position: 'absolute', bottom: 14, fontFamily: 'Dancing Script, cursive', fontSize: 30, fontWeight: 600, color: 'var(--ink)' }}>G</div>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryBtn style={{ width: '100%' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c.1 1.1-.3 2.2-1 3-.7.8-1.8 1.4-2.9 1.3-.1-1.1.4-2.2 1-2.9.8-.9 2-1.4 2.9-1.4zM19.5 16.7c-.5 1.2-.8 1.7-1.4 2.7-.9 1.4-2.1 3.1-3.7 3.1-1.4 0-1.7-.9-3.6-.9s-2.3.9-3.6.9c-1.6 0-2.8-1.5-3.7-2.9C-.7 15.6-1.2 9.4 1.5 6.5c1-1.1 2.4-1.8 3.9-1.8 1.5 0 2.5.9 3.7.9 1.2 0 1.9-.9 3.7-.9 1.3 0 2.7.7 3.7 1.9-3.2 1.8-2.7 6.4.3 8.1z" transform="translate(3 0)" /></svg>
          Download on the App Store
        </PrimaryBtn>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <button style={{ border: 'none', background: 'transparent', fontFamily: 'Switzer, sans-serif', fontSize: 13, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'underline' }}>Also on Google Play</button>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--glow)' }} />
          <button onClick={onRestart} style={{ border: 'none', background: 'transparent', fontFamily: 'Switzer, sans-serif', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Take it again</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RevealScreen, BreakdownScreen, EmailScreen, AppStoreScreen });
