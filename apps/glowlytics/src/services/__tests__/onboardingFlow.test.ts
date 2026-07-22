import {
  buildOnboardingFlow,
  screenToRoute,
  getNextScreen,
  getPreviousScreen,
} from '../onboardingFlow';

describe('onboardingFlow', () => {
  describe('buildOnboardingFlow', () => {
    it('builds base flow with essential screens including health-permission', () => {
      const flow = buildOnboardingFlow();
      expect(flow).toContain('welcome');
      expect(flow).toContain('how-it-works');
      expect(flow).toContain('name');
      expect(flow).toContain('age-range');
      expect(flow).toContain('sex');
      expect(flow).toContain('skin-goal');
      expect(flow).toContain('products');
      expect(flow).toContain('privacy');
      expect(flow).not.toContain('camera-permission');
      expect(flow).toContain('health-permission');
      expect(flow).toContain('preview');
      expect(flow).toContain('paywall');
      expect(flow).toContain('done');
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('does not include deferred screens', () => {
      const flow = buildOnboardingFlow();
      expect(flow).not.toContain('location');
      expect(flow).not.toContain('supplements');
      expect(flow).not.toContain('exercise');
      expect(flow).not.toContain('shower-frequency');
      expect(flow).not.toContain('hand-washing');
      expect(flow).toContain('scan-reminder');
      expect(flow).not.toContain('ready');
    });

    it('walks the hand-off order up to health-permission', () => {
      const flow = buildOnboardingFlow();
      expect(flow.slice(0, 9)).toEqual([
        'welcome',
        'how-it-works',
        'name',
        'age-range',
        'sex',
        'skin-goal',
        'products',
        'privacy',
        'health-permission',
      ]);
    });

    it('omits camera-permission from every flow variant', () => {
      const flows = [
        buildOnboardingFlow(),
        buildOnboardingFlow('male'),
        buildOnboardingFlow('female'),
        buildOnboardingFlow('female', 'regular'),
        buildOnboardingFlow('female', 'irregular'),
        buildOnboardingFlow('female', 'no'),
        buildOnboardingFlow('female', 'prefer_not'),
        buildOnboardingFlow('female', 'regular', true),
        buildOnboardingFlow('other'),
        buildOnboardingFlow('prefer_not'),
      ];

      for (const flow of flows) {
        expect(flow).not.toContain('camera-permission');
      }
    });

    it('builds male flow without menstrual screens', () => {
      const flow = buildOnboardingFlow('male');
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('inserts menstrual screen for female users after health-permission', () => {
      const flow = buildOnboardingFlow('female');
      expect(flow).toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
      const healthIndex = flow.indexOf('health-permission');
      const menstrualIndex = flow.indexOf('menstrual');
      expect(menstrualIndex).toBe(healthIndex + 1);
    });

    it('inserts cycle-details for female with regular cycle', () => {
      const flow = buildOnboardingFlow('female', 'regular');
      expect(flow).toContain('menstrual');
      expect(flow).toContain('cycle-details');
      const menstrualIndex = flow.indexOf('menstrual');
      const cycleIndex = flow.indexOf('cycle-details');
      expect(cycleIndex).toBe(menstrualIndex + 1);
    });

    it('inserts cycle-details for female with irregular cycle', () => {
      const flow = buildOnboardingFlow('female', 'irregular');
      expect(flow).toContain('cycle-details');
    });

    it('does not insert cycle-details when menstrual status is no', () => {
      const flow = buildOnboardingFlow('female', 'no');
      expect(flow).toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('does not insert cycle-details for prefer_not', () => {
      const flow = buildOnboardingFlow('female', 'prefer_not');
      expect(flow).toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('does not insert menstrual screens for other sex', () => {
      const flow = buildOnboardingFlow('other');
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('always starts with welcome and ends with paywall → done', () => {
      const flows = [
        buildOnboardingFlow(),
        buildOnboardingFlow('male'),
        buildOnboardingFlow('female'),
        buildOnboardingFlow('female', 'regular'),
        buildOnboardingFlow('female', 'regular', true),
      ];
      for (const flow of flows) {
        expect(flow[0]).toBe('welcome');
        expect(flow[flow.length - 2]).toBe('paywall');
        expect(flow[flow.length - 1]).toBe('done');
      }
    });

    it('has correct length for each path', () => {
      expect(buildOnboardingFlow().length).toBe(13);
      expect(buildOnboardingFlow('male').length).toBe(13);
      expect(buildOnboardingFlow('female').length).toBe(14);
      expect(buildOnboardingFlow('female', 'regular').length).toBe(15);
      expect(buildOnboardingFlow('female', 'irregular').length).toBe(15);
      expect(buildOnboardingFlow('female', 'no').length).toBe(14);
    });

    it('keeps the longest possible flow as the stable progress denominator', () => {
      const longestPossibleFlowLength = buildOnboardingFlow('female', 'regular').length;
      expect(longestPossibleFlowLength).toBe(15);
      expect(buildOnboardingFlow('female', 'irregular').length).toBe(longestPossibleFlowLength);
      expect(buildOnboardingFlow().length).toBeLessThan(longestPossibleFlowLength);
      expect(buildOnboardingFlow('male').length).toBeLessThan(longestPossibleFlowLength);
    });

    it('skips menstrual + cycle-details for female when HealthKit cycle detected', () => {
      const flow = buildOnboardingFlow('female', 'regular', true);
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
      expect(flow).toContain('health-permission');
    });

    it('skips menstrual for female with no menstrualStatus when HealthKit cycle detected', () => {
      const flow = buildOnboardingFlow('female', undefined, true);
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('keeps menstrual for female when healthSyncedCycleDetected is false', () => {
      const flow = buildOnboardingFlow('female', 'regular', false);
      expect(flow).toContain('menstrual');
      expect(flow).toContain('cycle-details');
    });

    it('keeps menstrual for female when healthSyncedCycleDetected is undefined (default)', () => {
      const flow = buildOnboardingFlow('female', 'regular', undefined);
      expect(flow).toContain('menstrual');
      expect(flow).toContain('cycle-details');
    });

    it('ignores healthSyncedCycleDetected for male users', () => {
      const flow = buildOnboardingFlow('male', undefined, true);
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
      expect(flow.length).toBe(13);
    });

    it('has correct length when HealthKit skips menstrual', () => {
      expect(buildOnboardingFlow('female', 'regular', true).length).toBe(13);
      expect(buildOnboardingFlow('female', 'irregular', true).length).toBe(13);
    });
  });

  describe('screenToRoute', () => {
    it('converts screen name to route path', () => {
      expect(screenToRoute('welcome')).toBe('/onboarding/welcome');
      expect(screenToRoute('how-it-works')).toBe('/onboarding/how-it-works');
      expect(screenToRoute('name')).toBe('/onboarding/name');
      expect(screenToRoute('privacy')).toBe('/onboarding/privacy');
      expect(screenToRoute('age-range')).toBe('/onboarding/age-range');
      expect(screenToRoute('health-permission')).toBe('/onboarding/health-permission');
      expect(screenToRoute('preview')).toBe('/onboarding/preview');
      expect(screenToRoute('paywall')).toBe('/onboarding/paywall');
      expect(screenToRoute('done')).toBe('/onboarding/done');
    });
  });

  describe('getNextScreen', () => {
    it('returns next screen in flow', () => {
      const flow = buildOnboardingFlow();
      expect(getNextScreen(flow, 0)).toBe('how-it-works');
      expect(getNextScreen(flow, 1)).toBe('name');
    });

    it('returns null at end of flow', () => {
      const flow = buildOnboardingFlow();
      expect(getNextScreen(flow, flow.length - 1)).toBeNull();
    });
  });

  describe('getPreviousScreen', () => {
    it('returns previous screen in flow', () => {
      const flow = buildOnboardingFlow();
      expect(getPreviousScreen(flow, 1)).toBe('welcome');
      expect(getPreviousScreen(flow, 2)).toBe('how-it-works');
    });

    it('returns null at start of flow', () => {
      const flow = buildOnboardingFlow();
      expect(getPreviousScreen(flow, 0)).toBeNull();
    });
  });
});
