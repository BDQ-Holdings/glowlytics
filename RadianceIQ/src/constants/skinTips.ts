import type { PrimaryGoal } from '../types';

// ─── Personalized skin tips ──────────────────────────────────────────────
// Semi-personalized notification copy keyed to the user's primary goal.
// These rotate through the daily scan reminder so each nudge carries a small,
// goal-relevant piece of advice ("don't pick", "clean your sheets", etc.)
// rather than the same generic line every day.

export interface SkinTip {
  id: string;
  title: string;
  body: string;
}

// Tips shown when we don't yet know the user's goal (no protocol set).
export const GENERIC_TIPS: SkinTip[] = [
  { id: 'gen_scan', title: 'Time for your skin scan', body: 'Take 30 seconds to track your progress.' },
  { id: 'gen_water', title: 'Hydration check', body: 'A glass of water now helps your skin barrier hold moisture all day.' },
  { id: 'gen_spf', title: "Don't skip SPF", body: 'UV is the #1 driver of visible aging — even indoors near windows.' },
  { id: 'gen_sleep', title: 'Sleep is skincare', body: 'Your skin repairs itself overnight. A consistent bedtime shows up on your scans.' },
  { id: 'gen_consistency', title: 'Small steps, real results', body: 'A quick daily scan is how you catch what is working.' },
];

export const SKIN_TIPS: Record<PrimaryGoal, SkinTip[]> = {
  acne: [
    { id: 'acne_pick', title: 'Hands off today', body: 'Resist picking — it can extend healing by weeks and lead to scarring or dark marks.' },
    { id: 'acne_pillow', title: 'Fresh pillowcase', body: 'Swap your pillowcase every 2–3 days. Oil and bacteria build up fast and rub back onto your skin.' },
    { id: 'acne_towel', title: 'One-use face towels', body: 'Pat dry with a clean or single-use towel — a damp shared towel reintroduces bacteria.' },
    { id: 'acne_phone', title: 'Wipe your phone', body: 'Your screen touches your cheek all day. A quick wipe cuts down on breakout-causing grime.' },
    { id: 'acne_double_cleanse', title: "Don't over-wash", body: 'Cleansing more than twice a day strips your barrier and can make breakouts worse, not better.' },
    { id: 'acne_noncomedogenic', title: 'Check your labels', body: 'Look for "non-comedogenic" on moisturizers and sunscreen so pores stay clear.' },
    { id: 'acne_hairproducts', title: 'Mind your hairline', body: 'Oily hair products can trigger breakouts along the forehead and temples. Keep them off your skin.' },
    { id: 'acne_consistency', title: 'Give actives time', body: 'Acne treatments need 4–6 weeks. Your daily scans are how you see the trend before your eyes do.' },
  ],
  sun_damage: [
    { id: 'sun_daily_spf', title: 'SPF every morning', body: 'Daily sunscreen is the single most effective way to prevent new sun damage. Apply before you leave.' },
    { id: 'sun_reapply', title: 'Reapply at midday', body: 'Sunscreen wears off. A reapply around lunch keeps protection up through the afternoon.' },
    { id: 'sun_shade', title: 'Seek the shade', body: 'UV peaks 10am–4pm. A hat or shade now prevents the pigmentation you are tracking.' },
    { id: 'sun_windows', title: 'UVA passes through glass', body: 'Driving or by a window? UVA still reaches you. Sunscreen indoors matters more than people think.' },
    { id: 'sun_vitc', title: 'Vitamin C in the AM', body: 'Antioxidants like vitamin C boost your sunscreen and help fade existing dark spots over time.' },
    { id: 'sun_lips_eyes', title: "Don't forget edges", body: 'Ears, lips, and around the eyes are easy to miss and common spots for sun damage.' },
    { id: 'sun_patience', title: 'Fading takes months', body: 'Pigmentation fades slowly. Daily scans reveal the gradual progress your mirror hides.' },
  ],
  skin_age: [
    { id: 'age_spf', title: 'Sunscreen is anti-aging', body: 'Up to 80% of visible aging is UV-driven. Daily SPF is the highest-impact habit you have.' },
    { id: 'age_retinoid', title: 'Consider a retinoid', body: 'Retinoids are the most evidence-backed ingredient for texture and fine lines. Start low and slow.' },
    { id: 'age_hydrate', title: 'Moisture plumps lines', body: 'A well-hydrated barrier makes fine lines look softer. Moisturize on slightly damp skin to lock it in.' },
    { id: 'age_sleep', title: 'Protect your sleep', body: 'Deep sleep drives collagen repair. Consistent rest shows up in your elasticity scores.' },
    { id: 'age_gentle', title: 'Be gentle', body: 'Aggressive scrubbing and tugging stress the skin. A light touch preserves elasticity.' },
    { id: 'age_antioxidants', title: 'Eat the rainbow', body: 'Colorful produce supplies antioxidants that help your skin defend against daily oxidative stress.' },
    { id: 'age_trend', title: 'Watch the long game', body: 'Aging changes are slow. Your scan history is the clearest way to see what is working.' },
  ],
};

/**
 * Returns the ordered tip pool for a goal, falling back to generic tips when
 * no goal is known.
 */
export function getTipsForGoal(goal: PrimaryGoal | null | undefined): SkinTip[] {
  if (goal && SKIN_TIPS[goal]) return SKIN_TIPS[goal];
  return GENERIC_TIPS;
}
