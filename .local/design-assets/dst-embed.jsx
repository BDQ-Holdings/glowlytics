/* global React, ReactDOM, DriverFlow */
/* Landing-page embed: mounts the Driver's-Side Test flow into a contained
   stage with fixed config (dusk theme is set on <html> by the landing page).
   No Tweaks panel here — the landing owns its own controls. */

(function mountDriversTest() {
  const root = document.getElementById('drivers-test-root');
  if (!root || !window.DriverFlow) return;
  ReactDOM.createRoot(root).render(
    <div className="dst-stage dst-stage--embed">
      <DriverFlow tone="dramatic" revealStyle="wipe" scanSpeed="normal" asymmetry={62} />
    </div>,
  );
})();
