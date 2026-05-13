# Glowlytics - Post-Launch Checklist

## Week 1 (Immediate)
- [ ] Monitor Clerk production auth — verify sign-in with Apple/Google/email works
- [ ] **Do NOT re-enable "Client Trust" or MFA on `test@test.com`** — reviewer login will fail (Apple rejected v1.0.1 for exactly this)
- [ ] Confirm MRDP compliance form is saved in ASC → App Information (required for any future resubmission)
- [ ] Monitor RevenueCat — verify paywall presentation, trial activation, subscription purchase
- [ ] Verify RAG responses are returning guideline citations in scan results
- [ ] Check PostHog: set up auth->scan funnel, paywall conversion, retention dashboards
- [ ] Monitor Railway logs for errors (`railway logs`)
- [ ] Respond to any App Review feedback
- [ ] Update `eas.json` `ascAppId` from `6744096507` → `6760600635` (stale; EAS credentials override works but cleaner to fix)

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
- [ ] HealthKit import cleanup: wrap behind Platform.OS check, remove dynamic require hack
- [ ] Additional RAG guideline chunks for new skin conditions
- [ ] ML model retraining with real user scan data
