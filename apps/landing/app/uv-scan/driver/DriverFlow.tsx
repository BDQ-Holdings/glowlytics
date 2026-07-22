"use client";

/**
 * Driver's-Side Test — shared flow orchestrator. Ported from the claude.ai/design
 * project ("dst-machine.jsx") and re-wired to the REAL UV Mirror backend: the
 * design's synthetic `makeDamageMap(asymmetry)` is gone. On capture we POST the
 * photo to /api/uv/analyze, composite the returned per-pixel heatmap onto the
 * shot (compositeHeatmap), and drive the reveal/breakdown from the real
 * overall / regions / asymmetry. Email capture POSTs /api/uv/lead → Loops.
 *
 * Used by the standalone page (page.tsx) and the landing embed (DriverFlowEmbed).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCurrentFirstTouch,
  getCurrentPostHogSessionId,
} from "@/components/PostHogAttribution";

import {
  SOURCE,
  postAnalyze,
  postLead,
  stripDataUrl,
  UnusableImageError,
  type AnalyzeResponse,
  type ScreenCheck,
} from "../lib";
import {
  captureFrame,
  compositeHeatmap,
  makeSamplePhoto,
  useCamera,
  useLighting,
} from "./engine";
import { FramingScreen, IntroScreen, ScanningScreen } from "./CaptureScreens";
import {
  AppStoreScreen,
  BreakdownScreen,
  EmailScreen,
  RevealScreen,
} from "./ResultScreens";

type Step = "intro" | "framing" | "scanning" | "reveal" | "breakdown" | "email" | "appstore";
type Tone = "calm" | "dramatic";
type RevealStyle = "wipe" | "split" | "silhouette";
type ScanSpeed = "slow" | "normal" | "fast";

export interface DriverFlowProps {
  tone?: Tone;
  revealStyle?: RevealStyle;
  scanSpeed?: ScanSpeed;
}

export function DriverFlow({
  tone = "dramatic",
  revealStyle = "wipe",
  scanSpeed = "normal",
}: DriverFlowProps) {
  const [step, setStep] = useState<Step>("intro");
  const [cleanURL, setCleanURL] = useState<string | null>(null);
  const [damagedURL, setDamagedURL] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<ScreenCheck[] | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  const photoRef = useRef<HTMLCanvasElement | null>(null);
  // The scan animation and the /analyze round-trip race; we advance to the
  // reveal only when BOTH have finished. Refs avoid stale-closure reads.
  const animDoneRef = useRef(false);
  const resultReadyRef = useRef(false);

  const { videoRef, status } = useCamera(step === "framing");
  const light = useLighting(videoRef, status === "live");

  const asymmetryScore = result ? Math.round(result.asymmetry.score) : 0;
  const sunAge = Math.max(2, Math.round(asymmetryScore / 9));

  const tryAdvance = useCallback(() => {
    if (animDoneRef.current && resultReadyRef.current) setStep("reveal");
  }, []);

  const doCapture = useCallback(() => {
    const live = status === "live" && videoRef.current && videoRef.current.videoWidth > 0;
    const photo = live ? captureFrame(videoRef.current as HTMLVideoElement) : makeSamplePhoto(560, 740);
    photoRef.current = photo;
    const dataUrl = photo.toDataURL("image/jpeg", 0.92);

    setCleanURL(dataUrl);
    setDamagedURL(null);
    setResult(null);
    setClaimToken(null);
    setNotice(undefined);
    animDoneRef.current = false;
    resultReadyRef.current = false;
    setStep("scanning");

    postAnalyze(stripDataUrl(dataUrl))
      .then((res) => {
        setResult(res);
        setClaimToken(res.claim_token);
        let composited = dataUrl;
        try {
          composited = compositeHeatmap(photo, res.heatmap).toDataURL("image/jpeg", 0.92);
        } catch {
          /* fall back to the clean shot if compositing fails */
        }
        setDamagedURL(composited);
        resultReadyRef.current = true;
        tryAdvance();
      })
      .catch((err) => {
        if (err instanceof UnusableImageError) {
          setNotice(err.checks);
        } else {
          setNotice([
            {
              id: "network",
              label: "Connection",
              pass: false,
              value: 0,
              message: "We couldn't reach the scanner. Check your connection and try again.",
            },
          ]);
        }
        setStep("framing");
      });
  }, [status, videoRef, tryAdvance]);

  const onScanDone = useCallback(() => {
    animDoneRef.current = true;
    tryAdvance();
  }, [tryAdvance]);

  const submitEmail = useCallback(
    async (e: string) => {
      if (!result) return;
      setSubmitting(true);
      setLeadError(null);
      try {
        const token = await postLead(e, result.scan_id, claimToken ?? result.claim_token, {
          firstTouch: getCurrentFirstTouch(),
          formPlacement: SOURCE,
          posthogSessionId: getCurrentPostHogSessionId(),
        });
        setEmail(e);
        setReportToken(token);
        setSent(true);
        setStep("appstore");
      } catch (err) {
        setLeadError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [result, claimToken],
  );

  const restart = useCallback(() => {
    photoRef.current = null;
    animDoneRef.current = false;
    resultReadyRef.current = false;
    setCleanURL(null);
    setDamagedURL(null);
    setResult(null);
    setClaimToken(null);
    setNotice(undefined);
    setEmail("");
    setSent(false);
    setReportToken(null);
    setLeadError(null);
    setSubmitting(false);
    setStep("intro");
  }, []);

  // Belt-and-suspenders: if the result arrives after the animation already
  // finished (or a re-render swallowed the inline call), still advance.
  useEffect(() => {
    if (step === "scanning") tryAdvance();
  }, [step, damagedURL, tryAdvance]);

  let screen: React.ReactNode;
  if (step === "intro") {
    screen = <IntroScreen tone={tone} onStart={() => setStep("framing")} />;
  } else if (step === "framing") {
    screen = (
      <FramingScreen
        videoRef={videoRef}
        status={status}
        light={light}
        onCapture={doCapture}
        onBack={() => setStep("intro")}
        notice={notice}
      />
    );
  } else if (step === "scanning") {
    screen = (
      <ScanningScreen
        photoURL={cleanURL}
        asymmetry={(result ? result.asymmetry.score : 62) / 100}
        scanSpeed={scanSpeed}
        onDone={onScanDone}
      />
    );
  } else if (step === "reveal") {
    screen = (
      <RevealScreen
        cleanURL={cleanURL}
        damagedURL={damagedURL}
        asymmetry={asymmetryScore}
        sunAge={sunAge}
        revealStyle={revealStyle}
        tone={tone}
        onNext={() => setStep("breakdown")}
      />
    );
  } else if (step === "breakdown") {
    screen = result ? (
      <BreakdownScreen
        asymmetry={asymmetryScore}
        sunAge={sunAge}
        tone={tone}
        onNext={() => setStep("email")}
        overall={result.overall}
        regions={result.regions}
      />
    ) : null;
  } else if (step === "email") {
    screen = (
      <EmailScreen
        asymmetry={asymmetryScore}
        sunAge={sunAge}
        onSubmit={submitEmail}
        onSkip={() => setStep("appstore")}
        submitting={submitting}
        error={leadError}
      />
    );
  } else {
    screen = <AppStoreScreen sent={sent} email={email} onRestart={restart} reportToken={reportToken} />;
  }

  return (
    <div className="dst-screen" key={step}>
      {screen}
    </div>
  );
}
