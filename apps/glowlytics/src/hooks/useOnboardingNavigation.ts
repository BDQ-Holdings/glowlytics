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

  const advance = () => {
    const {
      onboardingFlow: currentFlow,
      onboardingFlowIndex: currentIndex,
      setOnboardingFlowIndex: setCurrentIndex,
    } = useStore.getState();
    const nextIndex = currentIndex + 1;
    if (nextIndex >= currentFlow.length) return;
    setCurrentIndex(nextIndex);
    router.push(screenToRoute(currentFlow[nextIndex]));
  };

  const goBack = () => {
    const {
      onboardingFlowIndex: currentIndex,
      setOnboardingFlowIndex: setCurrentIndex,
    } = useStore.getState();
    if (currentIndex <= 0) return;
    const prevIndex = currentIndex - 1;
    setCurrentIndex(prevIndex);
    router.back();
  };

  return {
    advance,
    goBack,
    onboardingFlow,
    onboardingFlowIndex,
  };
}
