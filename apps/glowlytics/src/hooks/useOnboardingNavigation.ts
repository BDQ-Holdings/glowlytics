import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { screenToRoute } from '../services/onboardingFlow';

/**
 * Provides advance/back helpers for onboarding screens.
 * Replaces the 3-line advance/back pattern duplicated across every screen.
 */
export function useOnboardingNavigation() {
  const router = useRouter();
  const onboardingFlow = useStore((s) => s.onboardingFlow);
  const onboardingFlowIndex = useStore((s) => s.onboardingFlowIndex);
  const setOnboardingFlowIndex = useStore((s) => s.setOnboardingFlowIndex);

  const advance = () => {
    const nextIndex = onboardingFlowIndex + 1;
    if (nextIndex >= onboardingFlow.length) return;
    setOnboardingFlowIndex(nextIndex);
    router.push(screenToRoute(onboardingFlow[nextIndex]));
  };

  const goBack = () => {
    if (onboardingFlowIndex <= 0) return;
    const prevIndex = onboardingFlowIndex - 1;
    setOnboardingFlowIndex(prevIndex);
    router.back();
  };

  return {
    advance,
    goBack,
    onboardingFlow,
    onboardingFlowIndex,
  };
}
