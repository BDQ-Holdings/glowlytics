import type { Metadata } from "next";

import "./dst.css";
import { DriverFlow } from "./driver/DriverFlow";

export const metadata: Metadata = {
  title: "The Driver's-Side Test",
  description:
    "See your sun damage in 60 seconds. One side of your face ages faster from years of UV through the car window — find out by how much. Free, private, photos never leave the page.",
};

/**
 * Standalone "Driver's-Side Test" — the polished claude.ai/design scan tool,
 * ported to Next.js and wired to the UV Mirror backend. Renders the full-bleed
 * phone-stage chrome from the design (dst-app.jsx) around the shared DriverFlow.
 */
export default function UvScanPage() {
  return (
    <div className="dst-page" data-palette="dusk">
      <div className="dst-chrome">
        <div className="dst-wordmark">
          Glowl<em>y</em>tics
        </div>
        <div className="dst-chrome-eyebrow">The Driver&rsquo;s-Side Test</div>
      </div>

      <div className="dst-stage-wrap">
        <div className="dst-stage">
          <DriverFlow tone="dramatic" revealStyle="wipe" scanSpeed="normal" />
        </div>
      </div>
    </div>
  );
}
