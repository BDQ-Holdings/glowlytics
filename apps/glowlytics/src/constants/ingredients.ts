export type ProductCategory =
  | 'cleanser'
  | 'toner'
  | 'serum_water'
  | 'serum_oil'
  | 'treatment'
  | 'moisturizer'
  | 'spf'
  | 'unknown';

export interface CategoryDef {
  category: ProductCategory;
  patterns: string[];
  /** Application order within AM routine. 0 = not used in AM. */
  amOrder: number;
  /** Application order within PM routine. 0 = not used in PM. */
  pmOrder: number;
  /** Human-readable timing hint shown in UI. */
  timingLabel: string;
  /** Higher value wins when a product matches multiple categories. */
  priority: number;
}

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    category: 'spf',
    patterns: [
      'spf',
      'avobenzone',
      'zinc oxide',
      'titanium dioxide',
      'octisalate',
      'homosalate',
      'octocrylene',
      'sunscreen',
      'uv filter',
    ],
    amOrder: 5,
    pmOrder: 0,
    timingLabel: 'last step',
    priority: 10,
  },
  {
    category: 'cleanser',
    patterns: [
      'surfactant',
      'sodium lauryl',
      'cocamidopropyl',
      'cleanser',
      'face wash',
      'micellar',
    ],
    amOrder: 1,
    pmOrder: 1,
    timingLabel: 'first step',
    priority: 9,
  },
  {
    category: 'treatment',
    patterns: [
      'benzoyl peroxide',
      'salicylic acid',
      'adapalene',
      'azelaic acid',
      'clindamycin',
      'metronidazole',
    ],
    amOrder: 0,
    pmOrder: 4,
    timingLabel: 'on clean skin',
    priority: 8,
  },
  {
    category: 'serum_oil',
    patterns: [
      'retinol',
      'retinal',
      'tretinoin',
      'retinoid',
      'squalane',
      'rosehip',
      'bakuchiol',
      'jojoba oil',
    ],
    amOrder: 0,
    pmOrder: 5,
    timingLabel: 'after treatments',
    priority: 7,
  },
  {
    category: 'serum_water',
    patterns: [
      'hyaluronic acid',
      'vitamin c',
      'ascorbic acid',
      'niacinamide',
      'peptide',
      'centella',
      'snail mucin',
    ],
    amOrder: 3,
    pmOrder: 3,
    timingLabel: 'on damp skin',
    priority: 6,
  },
  {
    category: 'toner',
    patterns: [
      'witch hazel',
      'toner',
      'glycolic acid',
      'lactic acid',
      'mandelic acid',
      'pha',
      'exfoli',
    ],
    amOrder: 2,
    pmOrder: 2,
    timingLabel: 'after cleansing',
    priority: 5,
  },
  {
    category: 'moisturizer',
    patterns: [
      'ceramide',
      'dimethicone',
      'shea butter',
      'moisturizer',
      'cream',
      'lotion',
      'petrolatum',
    ],
    amOrder: 4,
    pmOrder: 6,
    timingLabel: 'seal it in',
    priority: 4,
  },
];

export type IngredientClass =
  | 'retinoid'
  | 'aha_bha'
  | 'vitamin_c'
  | 'benzoyl_peroxide'
  | 'niacinamide';

export const INGREDIENT_CLASS_PATTERNS: Record<IngredientClass, string[]> = {
  retinoid: ['retinol', 'retinal', 'tretinoin', 'retinoid', 'bakuchiol'],
  aha_bha: [
    'glycolic acid',
    'lactic acid',
    'mandelic acid',
    'pha',
    'salicylic acid',
    'exfoli',
  ],
  vitamin_c: ['vitamin c', 'ascorbic acid', 'l-ascorbic acid'],
  benzoyl_peroxide: ['benzoyl peroxide'],
  niacinamide: ['niacinamide'],
};

export interface ConflictRule {
  classA: IngredientClass;
  classB: IngredientClass;
  message: string;
  resolution: string;
  actionable: boolean;
  exemptIngredient?: string;
}

export const CONFLICT_RULES: ConflictRule[] = [
  {
    classA: 'retinoid',
    classB: 'aha_bha',
    message: 'Retinoid + AHA/BHA on the same evening can cause irritation',
    resolution: 'Alternate evenings for best results',
    actionable: true,
  },
  {
    classA: 'vitamin_c',
    classB: 'benzoyl_peroxide',
    message: 'Benzoyl peroxide oxidizes vitamin C',
    resolution: 'Move vitamin C to AM',
    actionable: true,
  },
  {
    classA: 'retinoid',
    classB: 'benzoyl_peroxide',
    message: 'Benzoyl peroxide degrades tretinoin',
    resolution: 'Switch to adapalene or separate AM/PM',
    actionable: false,
    exemptIngredient: 'adapalene',
  },
  {
    classA: 'niacinamide',
    classB: 'vitamin_c',
    message:
      'High-concentration niacinamide + vitamin C may cause flushing',
    resolution: 'Apply 10 minutes apart or separate AM/PM',
    actionable: false,
  },
];
