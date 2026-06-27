# Glowlytics - Post-Launch Checklist

## Week 1 (Immediate)
- [ ] Monitor Clerk production auth — verify sign-in with Apple/Google/email works
- [ ] **Do NOT re-enable "Client Trust" or MFA on `test@test.com`** — reviewer login will fail (Apple rejected v1.0.1 for exactly this)
- [ ] **Clerk Dashboard → Sessions: maximize session longevity (the only token lever not in the binary).** Set **Maximum lifetime** to the longest acceptable value (production max-lifetime customization needs a paid plan; default is 7 days) and **disable Inactivity timeout** (or set it long) so an active user is never silently logged out. The app binary already does its half: official-style `tokenCache` keychain access (`AFTER_FIRST_UNLOCK`), `__experimental_resourceCache` for offline/cold-start token survival, `skipCache` forced refresh on 401, and backend `clockTolerance: 30s`. Note: Chrome caps cookies at 400 days regardless — irrelevant for the native app, relevant only for the web build.
- [ ] Confirm MRDP compliance form is saved in ASC → App Information (required for any future resubmission)
- [ ] Monitor RevenueCat — verify paywall presentation, trial activation, subscription purchase
- [ ] Verify RAG responses are returning guideline citations in scan results
- [ ] Check PostHog: set up auth->scan funnel, paywall conversion, retention dashboards
- [ ] Monitor Railway logs for errors (`railway logs`)
- [ ] Respond to any App Review feedback
- [x] Update `eas.json` `ascAppId` from `6744096507` → `6760600635` (done: also aligned stale `appleTeamId` NQ684Q9258 → D86BX62AKF in root eas.json to match apps/glowlytics/eas.json)

## Week 2-4 (Stabilization)
- [ ] Run ML evaluation notebook (target: MAE < 10, Pearson r > 0.7)
- [ ] RevenueCat paywall template — iterate on copy/design based on conversion data
- [ ] Review PostHog funnels — identify drop-off points
- [ ] Address any crash reports (Xcode Organizer / PostHog error tracking)

## Month 2+ (Growth)
- [ ] Pattern Engine: refine correlation thresholds based on real user data
- [ ] HealthKit: validate sync reliability across iOS versions
- [ ] Routine builder: expand ingredient conflict rules based on user feedback
- [ ] A/B test onboarding flow variants
- [ ] Explore Android launch (Expo supports both platforms)
- [ ] Content rating review if adding new features

## Nice-to-Have (Backlog)
- [ ] RevenueCat screen redesigns (post-release polish)
- [ ] useStore.ts slice refactor (~740 lines, approaching upper bound)
- [x] HealthKit import cleanup: wrap behind Platform.OS check, remove dynamic require hack (done: `healthSync.ts` lazy-loads the native module behind its iOS guards so the module is import-safe on Android/Jest; removed the `require()` hack in `useStore.ts` for a normal import. Also fixes a latent Android crash from `analyzing.tsx`'s eager `buildHealthkitRollup` import. Note: `healthPermissions.ts` is loaded only via deferred in-handler `require()` on the iOS connect path, so it carries no eager-import risk and was left as-is.)
- [ ] Additional RAG guideline chunks for new skin conditions
- [ ] ML model retraining with real user scan data
