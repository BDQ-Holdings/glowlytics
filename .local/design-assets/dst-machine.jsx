/* global React, useCamera, useLighting, captureFrame, makeDamageMap, compositeReveal,
   makeSamplePhoto, IntroScreen, FramingScreen, ScanningScreen,
   RevealScreen, BreakdownScreen, EmailScreen, AppStoreScreen */
/* Driver's-Side Test — shared flow orchestrator. Used by the standalone page
   (with a Tweaks panel) and embedded on the landing page (fixed config). */

function DriverFlow({ tone = 'dramatic', revealStyle = 'wipe', scanSpeed = 'normal', asymmetry = 62 }) {
  const [step, setStep] = React.useState('intro');
  const [cleanURL, setCleanURL] = React.useState(null);
  const [damagedURL, setDamagedURL] = React.useState(null);
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const photoRef = React.useRef(null);

  const sunAge = Math.max(2, Math.round(asymmetry / 9));

  const { videoRef, status } = useCamera(step === 'framing');
  const light = useLighting(videoRef, status === 'live');

  const doCapture = React.useCallback(() => {
    let photo;
    if (status === 'live' && videoRef.current && videoRef.current.videoWidth) {
      photo = captureFrame(videoRef.current);
    } else {
      photo = makeSamplePhoto(560, 740);
    }
    photoRef.current = photo;
    setCleanURL(photo.toDataURL('image/jpeg', 0.92));
    setStep('scanning');
  }, [status, videoRef]);

  React.useEffect(() => {
    const photo = photoRef.current;
    if (!photo) return;
    const dmg = makeDamageMap(photo.width, photo.height, asymmetry / 100, 7);
    const comp = compositeReveal(photo, dmg);
    setDamagedURL(comp.toDataURL('image/jpeg', 0.92));
  }, [cleanURL, asymmetry]);

  const restart = () => {
    photoRef.current = null;
    setCleanURL(null); setDamagedURL(null); setEmail(''); setSent(false);
    setStep('intro');
  };

  let screen;
  if (step === 'intro') screen = <IntroScreen tone={tone} onStart={() => setStep('framing')} />;
  else if (step === 'framing') screen = <FramingScreen videoRef={videoRef} status={status} light={light} onCapture={doCapture} onBack={() => setStep('intro')} />;
  else if (step === 'scanning') screen = <ScanningScreen photoURL={cleanURL} asymmetry={asymmetry / 100} scanSpeed={scanSpeed} onDone={() => setStep('reveal')} />;
  else if (step === 'reveal') screen = <RevealScreen cleanURL={cleanURL} damagedURL={damagedURL} asymmetry={asymmetry} sunAge={sunAge} revealStyle={revealStyle} tone={tone} onNext={() => setStep('breakdown')} />;
  else if (step === 'breakdown') screen = <BreakdownScreen asymmetry={asymmetry} sunAge={sunAge} tone={tone} onNext={() => setStep('email')} />;
  else if (step === 'email') screen = <EmailScreen asymmetry={asymmetry} sunAge={sunAge} onSubmit={(e) => { setEmail(e); setSent(true); setStep('appstore'); }} onSkip={() => setStep('appstore')} />;
  else screen = <AppStoreScreen sent={sent} email={email} onRestart={restart} />;

  return <div className="dst-screen" key={step}>{screen}</div>;
}

Object.assign(window, { DriverFlow });
