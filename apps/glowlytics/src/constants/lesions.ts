import type { LesionClass } from '../types';

export interface LesionInfo {
  label: string;
  /** Plain-language subtitle shown below the clinical name */
  subtitle: string;
  description: string;
  severity: 'mild' | 'moderate' | 'severe';
  signalImpact: string;
  color: string;
  /** Which signals this lesion type penalizes */
  affectedSignals: Array<'structure' | 'inflammation' | 'sunDamage'>;
}

export const LESION_INFO: Record<LesionClass, LesionInfo> = {
  acne: {
    label: 'Acne Lesion',
    subtitle: 'detected blemish',
    description: 'Detected acne blemish (pimple, clogged pore, or inflamed bump)',
    severity: 'moderate',
    signalImpact: 'Affects inflammation + structure',
    color: '#FF7A78',
    affectedSignals: ['inflammation', 'structure'],
  },
  comedone: {
    label: 'Comedone',
    subtitle: 'clogged pore',
    description: 'Clogged pore (blackhead or whitehead)',
    severity: 'mild',
    signalImpact: 'Affects structure score',
    color: '#7DE7E1',
    affectedSignals: ['structure'],
  },
  papule: {
    label: 'Papule',
    subtitle: 'inflammatory bump',
    description: 'Small raised inflamed bump',
    severity: 'moderate',
    signalImpact: 'Affects inflammation + structure',
    color: '#FF7A78',
    affectedSignals: ['inflammation', 'structure'],
  },
  pustule: {
    label: 'Pustule',
    subtitle: 'pus-filled bump',
    description: 'Pus-filled inflamed lesion',
    severity: 'moderate',
    signalImpact: 'Affects inflammation + structure',
    color: '#FF5C5C',
    affectedSignals: ['inflammation', 'structure'],
  },
  nodule: {
    label: 'Nodule',
    subtitle: 'deep inflammation',
    description: 'Deep, painful inflammatory lesion',
    severity: 'severe',
    signalImpact: 'Strongly affects inflammation + structure',
    color: '#D14343',
    affectedSignals: ['inflammation', 'structure'],
  },
  macule: {
    label: 'Macule',
    subtitle: 'dark spot',
    description: 'Flat discolored spot (post-inflammatory)',
    severity: 'mild',
    signalImpact: 'Affects sun damage + structure',
    color: '#F2B56A',
    affectedSignals: ['sunDamage', 'structure'],
  },
  patch: {
    label: 'Patch',
    subtitle: 'pigmented area',
    description: 'Larger flat pigmented area',
    severity: 'moderate',
    signalImpact: 'Affects sun damage + structure',
    color: '#C07B2A',
    affectedSignals: ['sunDamage', 'structure'],
  },
};

/** Group lesions by class with count and zones */
export function groupLesionsByType(lesions: Array<{ class: LesionClass; zone: string; confidence: number; tier?: string }>) {
  const groups: Record<string, { count: number; zones: Set<string>; maxConfidence: number; confirmedCount: number }> = {};

  for (const lesion of lesions) {
    if (!groups[lesion.class]) {
      groups[lesion.class] = { count: 0, zones: new Set(), maxConfidence: 0, confirmedCount: 0 };
    }
    groups[lesion.class].count++;
    groups[lesion.class].zones.add(lesion.zone);
    groups[lesion.class].maxConfidence = Math.max(groups[lesion.class].maxConfidence, lesion.confidence);
    if (lesion.tier === 'confirmed') {
      groups[lesion.class].confirmedCount++;
    }
  }

  const FALLBACK_INFO: LesionInfo = {
    label: 'Lesion',
    subtitle: 'detected lesion',
    description: 'Detected skin lesion',
    severity: 'mild',
    signalImpact: 'Under assessment',
    color: '#7DE7E1',
    affectedSignals: [],
  };

  return Object.entries(groups)
    .map(([cls, data]) => ({
      class: cls as LesionClass,
      info: LESION_INFO[cls as LesionClass] ?? FALLBACK_INFO,
      count: data.count,
      confirmedCount: data.confirmedCount,
      zones: [...data.zones],
      maxConfidence: data.maxConfidence,
    }))
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { severe: 0, moderate: 1, mild: 2 };
      return (severityOrder[a.info.severity] ?? 2) - (severityOrder[b.info.severity] ?? 2);
    });
}
