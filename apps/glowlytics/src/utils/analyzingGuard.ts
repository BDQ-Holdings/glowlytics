// ---------------------------------------------------------------------------
// Pure guard logic for the AnalyzingScreen pipeline.
//
// AnalyzingScreen is too heavy to render in jest (reanimated + svg +
// linear-gradient + the whole skin-analysis service graph), so the two
// decisions that can actually regress live here as pure functions and are
// unit-tested directly.
// ---------------------------------------------------------------------------

/**
 * Guard predicate for every async continuation in the analysis pipeline.
 *
 * The skin-analysis API call can resolve LONG after the user has either been
 * bounced to the timeout/error state (`aborted` — the 45s hard timeout fired)
 * or navigated away from the screen (`!mounted`). Each post-await stage —
 * scheduling the post-API stage timers, calling setState, or
 * `router.replace('/scan/results')` — must consult this first. Otherwise a late
 * resolution teleports the user back into results after they have already left,
 * or schedules timers / setState on an unmounted screen.
 *
 * @returns true when the continuation MUST short-circuit (do nothing).
 */
export const isAnalyzingPipelineStale = (mounted: boolean, aborted: boolean): boolean =>
  !mounted || aborted;

/**
 * Decides whether the 5s "couldn't hydrate" bail-out timer should be armed for
 * the current store-hydration state.
 *
 * The analysis pipeline cannot start until BOTH the signed-in user and their
 * protocol have hydrated from the persisted store. The bug (#23/#24): when a
 * user is present but `protocol` stays null (incomplete onboarding / corrupt
 * data), the main effect bailed silently — arming no timers, not even the 45s
 * hard timeout — so the screen spun forever with the back gesture / Android
 * back blocked. Arming the bail-out whenever the pipeline can't start (missing
 * user OR protocol) routes the user to a recoverable error state instead.
 *
 * @returns true when the bail-out timer should be armed (pipeline can't start).
 */
export const shouldArmHydrationBail = (
  hasStarted: boolean,
  hasUser: boolean,
  hasProtocol: boolean,
): boolean => !hasStarted && !(hasUser && hasProtocol);
