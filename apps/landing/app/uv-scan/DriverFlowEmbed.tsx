"use client";

import "./dst.css";
import { DriverFlow } from "./driver/DriverFlow";

/**
 * Landing-page embed of the Driver's-Side Test (mirrors the design's
 * "dst-embed.jsx"). Drop this into the landing "The test" section inside a
 * sized, phone-tall host box — it carries the palette tokens (.dst-page) and
 * fills its parent (.dst-stage--embed). No full-screen chrome, no tweaks panel.
 */
export default function DriverFlowEmbed() {
  return (
    <div
      className="dst-page"
      data-palette="dusk"
      style={{ minHeight: 0, height: "100%", display: "block", background: "none" }}
    >
      <div className="dst-stage dst-stage--embed">
        <DriverFlow tone="dramatic" revealStyle="wipe" scanSpeed="normal" />
      </div>
    </div>
  );
}
