/* global React, ReactDOM, DriverFlow,
   useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakRadio */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "asymmetry": 62,
  "tone": "dramatic",
  "revealStyle": "wipe",
  "scanSpeed": "normal",
  "palette": "dusk"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // palette → <html data-palette>
  React.useEffect(() => { document.documentElement.dataset.palette = t.palette; }, [t.palette]);

  return (
    <div className="dst-page">
      <div className="dst-chrome">
        <div className="dst-wordmark">Glowl<em>y</em>tics</div>
        <div className="dst-chrome-eyebrow">The Driver&rsquo;s-Side Test</div>
      </div>

      <div className="dst-stage-wrap">
        <div className="dst-stage">
          <DriverFlow tone={t.tone} revealStyle={t.revealStyle} scanSpeed={t.scanSpeed} asymmetry={t.asymmetry} />
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Result" />
        <TweakSlider label="Sun asymmetry" value={t.asymmetry} min={8} max={94} unit=" / 100" onChange={(v) => setTweak('asymmetry', v)} />
        <TweakRadio label="Tone" value={t.tone} options={['calm', 'dramatic']} onChange={(v) => setTweak('tone', v)} />
        <TweakSection label="Reveal" />
        <TweakRadio label="Reveal style" value={t.revealStyle} options={['wipe', 'split', 'silhouette']} onChange={(v) => setTweak('revealStyle', v)} />
        <TweakRadio label="Scan speed" value={t.scanSpeed} options={['slow', 'normal', 'fast']} onChange={(v) => setTweak('scanSpeed', v)} />
        <TweakSection label="Theme" />
        <TweakRadio label="Palette" value={t.palette} options={['dusk', 'meadow', 'rose']} onChange={(v) => setTweak('palette', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
