import type { PrimaryGoal, ProductEntry } from '../types';

export type IngredientCategory =
  | 'retinoid'
  | 'aha'
  | 'bha'
  | 'antioxidant'
  | 'humectant'
  | 'emollient'
  | 'sunscreen_active'
  | 'peptide'
  | 'surfactant'
  | 'preservative'
  | 'fragrance'
  | 'other';

export type IngredientRating =
  | 'highly_beneficial'
  | 'beneficial'
  | 'neutral'
  | 'potentially_concerning'
  | 'concerning';

export interface IngredientProfile {
  canonicalName: string;
  aliases: string[];
  category: IngredientCategory;
  rating: IngredientRating;
  clinicalEfficacy: number;
  sideEffectRisk: number;
  goalRelevance: { acne: number; sun_damage: number; skin_age: number };
  signalRelevance: {
    structure: number;
    hydration: number;
    inflammation: number;
    sunDamage: number;
    elasticity: number;
  };
  description: string;
  evidence: string;
}

export interface ProductEffectivenessResult {
  score: number;
  level: 'excellent' | 'good' | 'moderate' | 'low';
  matchedIngredients: Array<{
    name: string;
    profile: IngredientProfile;
  }>;
  topContributors: string[];
  concerns: string[];
}

const INGREDIENT_DB: IngredientProfile[] = [
  // Retinoids
  {
    canonicalName: 'Retinol',
    aliases: ['retinol', 'vitamin a'],
    category: 'retinoid',
    rating: 'highly_beneficial',
    clinicalEfficacy: 88,
    sideEffectRisk: 35,
    goalRelevance: { acne: 30, sun_damage: 20, skin_age: 45 },
    signalRelevance: { structure: 35, hydration: -10, inflammation: -15, sunDamage: 15, elasticity: 40 },
    description: 'Gold-standard anti-aging active that accelerates cell turnover and stimulates collagen.',
    evidence: 'Mukherjee et al., Clinical Interventions in Aging, 2006',
  },
  {
    canonicalName: 'Adapalene',
    aliases: ['adapalene', 'differin'],
    category: 'retinoid',
    rating: 'highly_beneficial',
    clinicalEfficacy: 85,
    sideEffectRisk: 30,
    goalRelevance: { acne: 45, sun_damage: 10, skin_age: 25 },
    signalRelevance: { structure: 25, hydration: -8, inflammation: -10, sunDamage: 10, elasticity: 20 },
    description: 'Third-generation retinoid with strong comedolytic and anti-inflammatory action.',
    evidence: 'Thiboutot et al., JAAD, 2008',
  },
  {
    canonicalName: 'Tretinoin',
    aliases: ['tretinoin', 'retin-a', 'retinoic acid'],
    category: 'retinoid',
    rating: 'highly_beneficial',
    clinicalEfficacy: 95,
    sideEffectRisk: 45,
    goalRelevance: { acne: 40, sun_damage: 25, skin_age: 50 },
    signalRelevance: { structure: 40, hydration: -15, inflammation: -20, sunDamage: 20, elasticity: 45 },
    description: 'Prescription-strength retinoid with the most clinical evidence for photoaging reversal.',
    evidence: 'Kang et al., NEJM, 2005',
  },
  {
    canonicalName: 'Bakuchiol',
    aliases: ['bakuchiol'],
    category: 'retinoid',
    rating: 'beneficial',
    clinicalEfficacy: 55,
    sideEffectRisk: 8,
    goalRelevance: { acne: 10, sun_damage: 10, skin_age: 25 },
    signalRelevance: { structure: 15, hydration: 5, inflammation: 5, sunDamage: 10, elasticity: 20 },
    description: 'Plant-based retinol alternative with lower irritation potential.',
    evidence: 'Dhaliwal et al., Br J Dermatol, 2019',
  },
  // AHAs
  {
    canonicalName: 'Glycolic Acid',
    aliases: ['glycolic acid', 'glycolic'],
    category: 'aha',
    rating: 'highly_beneficial',
    clinicalEfficacy: 78,
    sideEffectRisk: 25,
    goalRelevance: { acne: 20, sun_damage: 25, skin_age: 35 },
    signalRelevance: { structure: 30, hydration: 10, inflammation: -5, sunDamage: 20, elasticity: 25 },
    description: 'Smallest AHA molecule with deepest penetration for exfoliation and collagen stimulation.',
    evidence: 'Bernstein et al., Dermatol Surg, 2001',
  },
  {
    canonicalName: 'Lactic Acid',
    aliases: ['lactic acid'],
    category: 'aha',
    rating: 'beneficial',
    clinicalEfficacy: 65,
    sideEffectRisk: 15,
    goalRelevance: { acne: 15, sun_damage: 15, skin_age: 25 },
    signalRelevance: { structure: 20, hydration: 20, inflammation: 0, sunDamage: 15, elasticity: 15 },
    description: 'Gentle AHA that exfoliates while supporting hydration via humectant properties.',
    evidence: 'Smith, Dermatol Surg, 1996',
  },
  // BHAs
  {
    canonicalName: 'Salicylic Acid',
    aliases: ['salicylic acid', 'bha', 'beta hydroxy acid'],
    category: 'bha',
    rating: 'highly_beneficial',
    clinicalEfficacy: 80,
    sideEffectRisk: 18,
    goalRelevance: { acne: 45, sun_damage: 5, skin_age: 10 },
    signalRelevance: { structure: 15, hydration: -5, inflammation: 25, sunDamage: 5, elasticity: 5 },
    description: 'Oil-soluble exfoliant that penetrates pores to clear congestion and reduce inflammation.',
    evidence: 'Arif, Clin Cosmet Investig Dermatol, 2015',
  },
  {
    canonicalName: 'Azelaic Acid',
    aliases: ['azelaic acid'],
    category: 'other',
    rating: 'highly_beneficial',
    clinicalEfficacy: 75,
    sideEffectRisk: 12,
    goalRelevance: { acne: 35, sun_damage: 20, skin_age: 10 },
    signalRelevance: { structure: 10, hydration: 0, inflammation: 30, sunDamage: 15, elasticity: 5 },
    description: 'Anti-inflammatory and anti-bacterial acid that also inhibits melanin production.',
    evidence: 'Fitton & Goa, Drugs, 1991',
  },
  // Antioxidants
  {
    canonicalName: 'Vitamin C',
    aliases: ['vitamin c', 'ascorbic acid', 'l-ascorbic acid', 'ascorbyl glucoside', 'sodium ascorbyl phosphate'],
    category: 'antioxidant',
    rating: 'highly_beneficial',
    clinicalEfficacy: 82,
    sideEffectRisk: 15,
    goalRelevance: { acne: 5, sun_damage: 35, skin_age: 30 },
    signalRelevance: { structure: 25, hydration: 5, inflammation: 10, sunDamage: 35, elasticity: 25 },
    description: 'Potent antioxidant that brightens, protects against UV, and stimulates collagen.',
    evidence: 'Pullar et al., Nutrients, 2017',
  },
  {
    canonicalName: 'Vitamin E',
    aliases: ['vitamin e', 'tocopherol', 'tocopheryl acetate'],
    category: 'antioxidant',
    rating: 'beneficial',
    clinicalEfficacy: 60,
    sideEffectRisk: 8,
    goalRelevance: { acne: -5, sun_damage: 25, skin_age: 20 },
    signalRelevance: { structure: 10, hydration: 15, inflammation: 10, sunDamage: 25, elasticity: 15 },
    description: 'Fat-soluble antioxidant that protects cell membranes and enhances sunscreen efficacy.',
    evidence: 'Thiele et al., J Mol Med, 2005',
  },
  {
    canonicalName: 'Niacinamide',
    aliases: ['niacinamide', 'nicotinamide', 'vitamin b3'],
    category: 'antioxidant',
    rating: 'highly_beneficial',
    clinicalEfficacy: 78,
    sideEffectRisk: 5,
    goalRelevance: { acne: 25, sun_damage: 20, skin_age: 20 },
    signalRelevance: { structure: 20, hydration: 25, inflammation: 20, sunDamage: 15, elasticity: 15 },
    description: 'Versatile active that strengthens barrier, reduces pores, and evens tone.',
    evidence: 'Wohlrab & Kreft, Skin Pharmacol Physiol, 2014',
  },
  {
    canonicalName: 'Green Tea Extract',
    aliases: ['green tea', 'green tea extract', 'camellia sinensis', 'epigallocatechin'],
    category: 'antioxidant',
    rating: 'beneficial',
    clinicalEfficacy: 55,
    sideEffectRisk: 3,
    goalRelevance: { acne: 10, sun_damage: 20, skin_age: 15 },
    signalRelevance: { structure: 10, hydration: 5, inflammation: 15, sunDamage: 20, elasticity: 10 },
    description: 'Polyphenol-rich botanical with photoprotective and anti-inflammatory properties.',
    evidence: 'Katiyar & Mukhtar, Int J Oncol, 2001',
  },
  // Humectants
  {
    canonicalName: 'Hyaluronic Acid',
    aliases: ['hyaluronic acid', 'sodium hyaluronate', 'hyaluronic'],
    category: 'humectant',
    rating: 'highly_beneficial',
    clinicalEfficacy: 72,
    sideEffectRisk: 2,
    goalRelevance: { acne: 0, sun_damage: 5, skin_age: 25 },
    signalRelevance: { structure: 15, hydration: 45, inflammation: 5, sunDamage: 5, elasticity: 20 },
    description: 'Powerful humectant that holds 1000x its weight in water, plumping fine lines.',
    evidence: 'Papakonstantinou et al., Dermatoendocrinol, 2012',
  },
  {
    canonicalName: 'Glycerin',
    aliases: ['glycerin', 'glycerol', 'vegetable glycerin'],
    category: 'humectant',
    rating: 'beneficial',
    clinicalEfficacy: 65,
    sideEffectRisk: 2,
    goalRelevance: { acne: 0, sun_damage: 0, skin_age: 10 },
    signalRelevance: { structure: 5, hydration: 35, inflammation: 5, sunDamage: 0, elasticity: 10 },
    description: 'Time-tested humectant that draws moisture to skin and supports barrier function.',
    evidence: 'Fluhr et al., Br J Dermatol, 2008',
  },
  {
    canonicalName: 'Panthenol',
    aliases: ['panthenol', 'provitamin b5', 'dexpanthenol'],
    category: 'humectant',
    rating: 'beneficial',
    clinicalEfficacy: 58,
    sideEffectRisk: 2,
    goalRelevance: { acne: 0, sun_damage: 5, skin_age: 10 },
    signalRelevance: { structure: 10, hydration: 30, inflammation: 10, sunDamage: 5, elasticity: 10 },
    description: 'Soothing humectant that supports wound healing and barrier repair.',
    evidence: 'Ebner et al., Am J Clin Dermatol, 2002',
  },
  // Emollients
  {
    canonicalName: 'Ceramides',
    aliases: ['ceramides', 'ceramide np', 'ceramide ap', 'ceramide eop'],
    category: 'emollient',
    rating: 'highly_beneficial',
    clinicalEfficacy: 75,
    sideEffectRisk: 2,
    goalRelevance: { acne: 5, sun_damage: 10, skin_age: 20 },
    signalRelevance: { structure: 30, hydration: 35, inflammation: 15, sunDamage: 10, elasticity: 20 },
    description: 'Essential lipids that restore the skin barrier and prevent moisture loss.',
    evidence: 'Coderch et al., Am J Clin Dermatol, 2003',
  },
  {
    canonicalName: 'Squalane',
    aliases: ['squalane', 'squalene'],
    category: 'emollient',
    rating: 'beneficial',
    clinicalEfficacy: 55,
    sideEffectRisk: 3,
    goalRelevance: { acne: -5, sun_damage: 5, skin_age: 15 },
    signalRelevance: { structure: 10, hydration: 25, inflammation: 5, sunDamage: 5, elasticity: 15 },
    description: 'Lightweight emollient that mimics natural skin oils without clogging pores.',
    evidence: 'Huang et al., Molecules, 2009',
  },
  {
    canonicalName: 'Dimethicone',
    aliases: ['dimethicone', 'silicone'],
    category: 'emollient',
    rating: 'neutral',
    clinicalEfficacy: 40,
    sideEffectRisk: 5,
    goalRelevance: { acne: -10, sun_damage: 0, skin_age: 5 },
    signalRelevance: { structure: 5, hydration: 15, inflammation: 0, sunDamage: 0, elasticity: 5 },
    description: 'Occlusive silicone that creates a smooth film and reduces trans-epidermal water loss.',
    evidence: 'Menon & Kligman, Skin Pharmacol, 1992',
  },
  {
    canonicalName: 'Petrolatum',
    aliases: ['petrolatum', 'petroleum jelly', 'vaseline'],
    category: 'emollient',
    rating: 'beneficial',
    clinicalEfficacy: 60,
    sideEffectRisk: 5,
    goalRelevance: { acne: -15, sun_damage: 0, skin_age: 10 },
    signalRelevance: { structure: 5, hydration: 30, inflammation: 5, sunDamage: 0, elasticity: 5 },
    description: 'Most effective occlusive, reducing TEWL by over 98% to support barrier recovery.',
    evidence: 'Ghadially et al., J Clin Invest, 1992',
  },
  // Sunscreen actives
  {
    canonicalName: 'Zinc Oxide',
    aliases: ['zinc oxide'],
    category: 'sunscreen_active',
    rating: 'highly_beneficial',
    clinicalEfficacy: 85,
    sideEffectRisk: 3,
    goalRelevance: { acne: 5, sun_damage: 50, skin_age: 30 },
    signalRelevance: { structure: 10, hydration: 0, inflammation: 10, sunDamage: 50, elasticity: 15 },
    description: 'Mineral UV filter providing broad-spectrum UVA/UVB protection with anti-inflammatory properties.',
    evidence: 'Smijs & Pavel, Nanotechnol Sci Appl, 2011',
  },
  {
    canonicalName: 'Titanium Dioxide',
    aliases: ['titanium dioxide'],
    category: 'sunscreen_active',
    rating: 'highly_beneficial',
    clinicalEfficacy: 80,
    sideEffectRisk: 3,
    goalRelevance: { acne: 0, sun_damage: 45, skin_age: 25 },
    signalRelevance: { structure: 5, hydration: 0, inflammation: 5, sunDamage: 45, elasticity: 10 },
    description: 'Mineral UV filter with strong UVB and short-wave UVA protection.',
    evidence: 'Smijs & Pavel, Nanotechnol Sci Appl, 2011',
  },
  {
    canonicalName: 'Avobenzone',
    aliases: ['avobenzone', 'butyl methoxydibenzoylmethane'],
    category: 'sunscreen_active',
    rating: 'beneficial',
    clinicalEfficacy: 75,
    sideEffectRisk: 12,
    goalRelevance: { acne: 0, sun_damage: 40, skin_age: 20 },
    signalRelevance: { structure: 5, hydration: 0, inflammation: 0, sunDamage: 40, elasticity: 10 },
    description: 'Chemical UV filter with broad UVA protection, best stabilized with octocrylene.',
    evidence: 'Mancebo & Wang, Dermatol Ther, 2014',
  },
  {
    canonicalName: 'Homosalate',
    aliases: ['homosalate'],
    category: 'sunscreen_active',
    rating: 'neutral',
    clinicalEfficacy: 55,
    sideEffectRisk: 18,
    goalRelevance: { acne: 0, sun_damage: 25, skin_age: 10 },
    signalRelevance: { structure: 0, hydration: 0, inflammation: -5, sunDamage: 25, elasticity: 5 },
    description: 'UVB filter often combined with other filters; potential endocrine disruption concerns.',
    evidence: 'Krause et al., Int J Androl, 2012',
  },
  // Peptides
  {
    canonicalName: 'Matrixyl',
    aliases: ['matrixyl', 'palmitoyl pentapeptide', 'palmitoyl tripeptide'],
    category: 'peptide',
    rating: 'beneficial',
    clinicalEfficacy: 65,
    sideEffectRisk: 3,
    goalRelevance: { acne: 0, sun_damage: 5, skin_age: 35 },
    signalRelevance: { structure: 30, hydration: 10, inflammation: 0, sunDamage: 5, elasticity: 35 },
    description: 'Signal peptide that stimulates collagen and elastin synthesis.',
    evidence: 'Robinson et al., Int J Cosmet Sci, 2005',
  },
  {
    canonicalName: 'Copper Peptides',
    aliases: ['copper peptide', 'copper peptides', 'ghk-cu'],
    category: 'peptide',
    rating: 'beneficial',
    clinicalEfficacy: 62,
    sideEffectRisk: 8,
    goalRelevance: { acne: 5, sun_damage: 10, skin_age: 30 },
    signalRelevance: { structure: 25, hydration: 10, inflammation: 10, sunDamage: 10, elasticity: 30 },
    description: 'Wound-healing peptide that promotes tissue remodeling and collagen synthesis.',
    evidence: 'Pickart et al., Int J Mol Sci, 2012',
  },
  // Other beneficial
  {
    canonicalName: 'Benzoyl Peroxide',
    aliases: ['benzoyl peroxide', 'bp'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 78,
    sideEffectRisk: 30,
    goalRelevance: { acne: 45, sun_damage: 0, skin_age: 0 },
    signalRelevance: { structure: 0, hydration: -15, inflammation: 20, sunDamage: 0, elasticity: -5 },
    description: 'Antimicrobial agent that kills C. acnes bacteria and reduces comedones.',
    evidence: 'Sagransky et al., JAAD, 2009',
  },
  {
    canonicalName: 'Zinc PCA',
    aliases: ['zinc pca', 'zinc'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 50,
    sideEffectRisk: 3,
    goalRelevance: { acne: 20, sun_damage: 0, skin_age: 5 },
    signalRelevance: { structure: 5, hydration: 10, inflammation: 15, sunDamage: 0, elasticity: 5 },
    description: 'Sebum-regulating zinc salt with mild antimicrobial and anti-inflammatory effects.',
    evidence: 'Sardana & Garg, Dermatol Res Pract, 2010',
  },
  {
    canonicalName: 'Allantoin',
    aliases: ['allantoin'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 45,
    sideEffectRisk: 1,
    goalRelevance: { acne: 5, sun_damage: 5, skin_age: 10 },
    signalRelevance: { structure: 10, hydration: 15, inflammation: 10, sunDamage: 5, elasticity: 10 },
    description: 'Gentle skin protectant that promotes cell regeneration and soothes irritation.',
    evidence: 'Araujo et al., An Bras Dermatol, 2010',
  },
  {
    canonicalName: 'Centella Asiatica',
    aliases: ['centella asiatica', 'cica', 'madecassoside', 'asiaticoside'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 60,
    sideEffectRisk: 3,
    goalRelevance: { acne: 10, sun_damage: 5, skin_age: 15 },
    signalRelevance: { structure: 20, hydration: 10, inflammation: 20, sunDamage: 5, elasticity: 15 },
    description: 'Herbal extract that accelerates wound healing and reduces inflammation.',
    evidence: 'Bylka et al., Postepy Dermatol Alergol, 2013',
  },
  {
    canonicalName: 'Jojoba Oil',
    aliases: ['jojoba oil', 'jojoba'],
    category: 'emollient',
    rating: 'neutral',
    clinicalEfficacy: 40,
    sideEffectRisk: 5,
    goalRelevance: { acne: -5, sun_damage: 0, skin_age: 5 },
    signalRelevance: { structure: 5, hydration: 15, inflammation: 5, sunDamage: 0, elasticity: 5 },
    description: 'Plant wax ester that closely mimics sebum, providing lightweight moisturization.',
    evidence: 'Pazyar et al., G Ital Dermatol Venereol, 2013',
  },
  // Concerning ingredients
  {
    canonicalName: 'Fragrance',
    aliases: ['fragrance', 'parfum', 'perfume', 'aroma'],
    category: 'fragrance',
    rating: 'potentially_concerning',
    clinicalEfficacy: 0,
    sideEffectRisk: 45,
    goalRelevance: { acne: -10, sun_damage: -5, skin_age: -5 },
    signalRelevance: { structure: -5, hydration: -5, inflammation: -20, sunDamage: -5, elasticity: -5 },
    description: 'Umbrella term for undisclosed scent chemicals; top cause of cosmetic contact dermatitis.',
    evidence: 'de Groot & Frosch, Contact Dermatitis, 1997',
  },
  {
    canonicalName: 'Sodium Lauryl Sulfate',
    aliases: ['sodium lauryl sulfate', 'sls'],
    category: 'surfactant',
    rating: 'concerning',
    clinicalEfficacy: 0,
    sideEffectRisk: 55,
    goalRelevance: { acne: -15, sun_damage: -5, skin_age: -10 },
    signalRelevance: { structure: -15, hydration: -30, inflammation: -25, sunDamage: -5, elasticity: -10 },
    description: 'Harsh surfactant that strips natural oils and can compromise skin barrier.',
    evidence: 'Agner, Acta Derm Venereol, 1991',
  },
  {
    canonicalName: 'Denatured Alcohol',
    aliases: ['denatured alcohol', 'alcohol denat', 'sd alcohol', 'isopropyl alcohol'],
    category: 'other',
    rating: 'potentially_concerning',
    clinicalEfficacy: 0,
    sideEffectRisk: 40,
    goalRelevance: { acne: -10, sun_damage: -5, skin_age: -10 },
    signalRelevance: { structure: -10, hydration: -25, inflammation: -15, sunDamage: -5, elasticity: -10 },
    description: 'Drying alcohol that can disrupt barrier lipids and increase TEWL with prolonged use.',
    evidence: 'Lachenmeier, Int J Environ Res Public Health, 2008',
  },
  {
    canonicalName: 'Essential Oils',
    aliases: ['essential oil', 'essential oils', 'lavender oil', 'tea tree oil', 'eucalyptus oil', 'peppermint oil'],
    category: 'fragrance',
    rating: 'potentially_concerning',
    clinicalEfficacy: 15,
    sideEffectRisk: 35,
    goalRelevance: { acne: -5, sun_damage: -5, skin_age: -5 },
    signalRelevance: { structure: -5, hydration: -5, inflammation: -15, sunDamage: -5, elasticity: -5 },
    description: 'Concentrated plant volatiles that can sensitize skin despite antibacterial benefits.',
    evidence: 'de Groot & Schmidt, Contact Dermatitis, 2016',
  },
  {
    canonicalName: 'Coconut Oil',
    aliases: ['coconut oil', 'cocos nucifera'],
    category: 'emollient',
    rating: 'potentially_concerning',
    clinicalEfficacy: 35,
    sideEffectRisk: 30,
    goalRelevance: { acne: -25, sun_damage: 0, skin_age: 5 },
    signalRelevance: { structure: 5, hydration: 15, inflammation: -10, sunDamage: 0, elasticity: 5 },
    description: 'Highly comedogenic oil that moisturizes but frequently triggers acne breakouts.',
    evidence: 'Kligman, J Soc Cosmet Chem, 1972',
  },
  {
    canonicalName: 'Parabens',
    aliases: ['paraben', 'methylparaben', 'propylparaben', 'butylparaben'],
    category: 'preservative',
    rating: 'neutral',
    clinicalEfficacy: 0,
    sideEffectRisk: 15,
    goalRelevance: { acne: 0, sun_damage: 0, skin_age: 0 },
    signalRelevance: { structure: 0, hydration: 0, inflammation: -5, sunDamage: 0, elasticity: 0 },
    description: 'Common preservatives with low irritation risk; safety debated but generally well-tolerated.',
    evidence: 'Soni et al., Crit Rev Toxicol, 2005',
  },
  {
    canonicalName: 'Propylene Glycol',
    aliases: ['propylene glycol'],
    category: 'humectant',
    rating: 'neutral',
    clinicalEfficacy: 40,
    sideEffectRisk: 10,
    goalRelevance: { acne: 0, sun_damage: 0, skin_age: 5 },
    signalRelevance: { structure: 0, hydration: 15, inflammation: -5, sunDamage: 0, elasticity: 0 },
    description: 'Penetration enhancer and humectant; may irritate sensitive skin at high concentrations.',
    evidence: 'Lessmann et al., Contact Dermatitis, 2005',
  },
  {
    canonicalName: 'Carbomer',
    aliases: ['carbomer', 'carbopol'],
    category: 'other',
    rating: 'neutral',
    clinicalEfficacy: 0,
    sideEffectRisk: 2,
    goalRelevance: { acne: 0, sun_damage: 0, skin_age: 0 },
    signalRelevance: { structure: 0, hydration: 0, inflammation: 0, sunDamage: 0, elasticity: 0 },
    description: 'Thickening polymer used to create gel textures; inert and non-irritating.',
    evidence: 'CIR Expert Panel, Int J Toxicol, 2002',
  },
  // SPF-related
  {
    canonicalName: 'SPF',
    aliases: ['spf', 'spf 30', 'spf 50', 'spf 15', 'sunscreen', 'sun protection'],
    category: 'sunscreen_active',
    rating: 'highly_beneficial',
    clinicalEfficacy: 90,
    sideEffectRisk: 5,
    goalRelevance: { acne: 0, sun_damage: 50, skin_age: 30 },
    signalRelevance: { structure: 10, hydration: 0, inflammation: 5, sunDamage: 50, elasticity: 15 },
    description: 'Sun Protection Factor indication; essential for preventing UV-induced damage.',
    evidence: 'Hughes et al., Ann Intern Med, 2013',
  },
  // Brightening / Hyperpigmentation
  {
    canonicalName: 'Tranexamic Acid',
    aliases: ['tranexamic acid'],
    category: 'other',
    rating: 'highly_beneficial',
    clinicalEfficacy: 72,
    sideEffectRisk: 5,
    goalRelevance: { acne: 5, sun_damage: 35, skin_age: 15 },
    signalRelevance: { structure: 5, hydration: 0, inflammation: 15, sunDamage: 30, elasticity: 5 },
    description: 'Synthetic amino acid that inhibits melanin transfer, reducing dark spots and melasma.',
    evidence: 'Ebrahimi & Naeini, J Res Med Sci, 2014',
  },
  {
    canonicalName: 'Alpha-Arbutin',
    aliases: ['alpha-arbutin', 'arbutin', 'alpha arbutin'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 62,
    sideEffectRisk: 3,
    goalRelevance: { acne: 0, sun_damage: 30, skin_age: 10 },
    signalRelevance: { structure: 5, hydration: 0, inflammation: 5, sunDamage: 25, elasticity: 5 },
    description: 'Tyrosinase inhibitor that blocks melanin production for gradual brightening.',
    evidence: 'Sugimoto et al., Biol Pharm Bull, 2004',
  },
  {
    canonicalName: 'Kojic Acid',
    aliases: ['kojic acid'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 58,
    sideEffectRisk: 15,
    goalRelevance: { acne: 0, sun_damage: 25, skin_age: 10 },
    signalRelevance: { structure: 0, hydration: -5, inflammation: -5, sunDamage: 25, elasticity: 0 },
    description: 'Fungal metabolite that chelates copper to inhibit tyrosinase and lighten skin.',
    evidence: 'Lajis et al., Molecules, 2012',
  },
  // Hydration / Repair
  {
    canonicalName: 'Snail Mucin',
    aliases: ['snail mucin', 'snail secretion filtrate', 'snail extract'],
    category: 'humectant',
    rating: 'beneficial',
    clinicalEfficacy: 55,
    sideEffectRisk: 3,
    goalRelevance: { acne: 5, sun_damage: 10, skin_age: 20 },
    signalRelevance: { structure: 15, hydration: 30, inflammation: 10, sunDamage: 5, elasticity: 15 },
    description: 'Glycoprotein-rich extract that hydrates, repairs micro-damage, and supports collagen.',
    evidence: 'Fabi & Grossman, J Drugs Dermatol, 2013',
  },
  {
    canonicalName: 'Aloe Vera',
    aliases: ['aloe vera', 'aloe barbadensis', 'aloe barbadensis leaf juice', 'aloe extract'],
    category: 'humectant',
    rating: 'beneficial',
    clinicalEfficacy: 50,
    sideEffectRisk: 3,
    goalRelevance: { acne: 5, sun_damage: 10, skin_age: 10 },
    signalRelevance: { structure: 5, hydration: 20, inflammation: 15, sunDamage: 10, elasticity: 5 },
    description: 'Soothing botanical gel with anti-inflammatory and wound-healing polysaccharides.',
    evidence: 'Surjushe et al., Indian J Dermatol, 2008',
  },
  // Targeted actives
  {
    canonicalName: 'Caffeine',
    aliases: ['caffeine', 'coffee extract', 'coffea arabica'],
    category: 'antioxidant',
    rating: 'beneficial',
    clinicalEfficacy: 45,
    sideEffectRisk: 3,
    goalRelevance: { acne: 0, sun_damage: 10, skin_age: 15 },
    signalRelevance: { structure: 5, hydration: -5, inflammation: 10, sunDamage: 10, elasticity: 10 },
    description: 'Vasoconstrictor and antioxidant that reduces puffiness and protects against UV damage.',
    evidence: 'Herman & Herman, Skin Pharmacol Physiol, 2013',
  },
  {
    canonicalName: 'Shea Butter',
    aliases: ['shea butter', 'butyrospermum parkii', 'butyrospermum parkii butter'],
    category: 'emollient',
    rating: 'beneficial',
    clinicalEfficacy: 55,
    sideEffectRisk: 5,
    goalRelevance: { acne: -10, sun_damage: 5, skin_age: 15 },
    signalRelevance: { structure: 10, hydration: 25, inflammation: 10, sunDamage: 5, elasticity: 15 },
    description: 'Triglyceride-rich butter with anti-inflammatory cinnamic acid esters.',
    evidence: 'Akihisa et al., J Oleo Sci, 2010',
  },
  {
    canonicalName: 'Urea',
    aliases: ['urea', 'carbamide'],
    category: 'humectant',
    rating: 'beneficial',
    clinicalEfficacy: 65,
    sideEffectRisk: 10,
    goalRelevance: { acne: 5, sun_damage: 5, skin_age: 15 },
    signalRelevance: { structure: 15, hydration: 30, inflammation: 5, sunDamage: 5, elasticity: 10 },
    description: 'Natural moisturizing factor component; keratolytic at high concentrations, humectant at low.',
    evidence: 'Pan et al., J Clin Med, 2013',
  },
  {
    canonicalName: 'Mandelic Acid',
    aliases: ['mandelic acid'],
    category: 'aha',
    rating: 'beneficial',
    clinicalEfficacy: 60,
    sideEffectRisk: 12,
    goalRelevance: { acne: 25, sun_damage: 15, skin_age: 20 },
    signalRelevance: { structure: 20, hydration: 5, inflammation: 5, sunDamage: 15, elasticity: 15 },
    description: 'Large-molecule AHA with antibacterial properties; gentler than glycolic for sensitive skin.',
    evidence: 'Taylor, Dermatol Surg, 1999',
  },
  {
    canonicalName: 'Camphor',
    aliases: ['camphor'],
    category: 'other',
    rating: 'neutral',
    clinicalEfficacy: 30,
    sideEffectRisk: 20,
    goalRelevance: { acne: 5, sun_damage: 0, skin_age: 0 },
    signalRelevance: { structure: 0, hydration: -5, inflammation: 5, sunDamage: 0, elasticity: 0 },
    description: 'Topical analgesic and mild antiseptic commonly used in lip balms and cold sore treatments.',
    evidence: 'CIR Expert Panel, Int J Toxicol, 2001',
  },
  {
    canonicalName: 'Colloidal Oatmeal',
    aliases: ['colloidal oatmeal', 'avena sativa', 'oat extract', 'oat kernel'],
    category: 'other',
    rating: 'beneficial',
    clinicalEfficacy: 55,
    sideEffectRisk: 2,
    goalRelevance: { acne: 5, sun_damage: 5, skin_age: 10 },
    signalRelevance: { structure: 10, hydration: 20, inflammation: 20, sunDamage: 5, elasticity: 10 },
    description: 'FDA-recognized skin protectant with anti-inflammatory avenanthramides and beta-glucan.',
    evidence: 'Fowler, J Drugs Dermatol, 2014',
  },
];

const normalizeString = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');

export function matchIngredient(rawName: string): IngredientProfile | null {
  const normalized = normalizeString(rawName);
  if (!normalized) return null;

  // Exact/alias match
  for (const profile of INGREDIENT_DB) {
    if (normalizeString(profile.canonicalName) === normalized) return profile;
    for (const alias of profile.aliases) {
      if (normalizeString(alias) === normalized) return profile;
    }
  }

  // Substring match
  for (const profile of INGREDIENT_DB) {
    for (const alias of profile.aliases) {
      const normalAlias = normalizeString(alias);
      if (normalized.includes(normalAlias) || normalAlias.includes(normalized)) {
        return profile;
      }
    }
  }

  return null;
}

export function computeProductEffectiveness(
  product: ProductEntry,
  primaryGoal: PrimaryGoal,
  currentSignals?: { structure: number; hydration: number; inflammation: number; sunDamage: number; elasticity: number },
): ProductEffectivenessResult {
  const matched: ProductEffectivenessResult['matchedIngredients'] = [];
  const seen = new Set<string>();

  for (const raw of product.ingredients_list) {
    const profile = matchIngredient(raw);
    if (profile && !seen.has(profile.canonicalName)) {
      seen.add(profile.canonicalName);
      matched.push({ name: raw, profile });
    }
  }

  // Also match product name keywords
  const nameProfile = matchIngredient(product.product_name);
  if (nameProfile && !seen.has(nameProfile.canonicalName)) {
    seen.add(nameProfile.canonicalName);
    matched.push({ name: product.product_name, profile: nameProfile });
  }

  let score = 50;
  const contributors: string[] = [];
  const concerns: string[] = [];
  let goalRelevantCount = 0;

  for (const { profile } of matched) {
    // Goal-weighted efficacy contribution
    const goalRel = profile.goalRelevance[primaryGoal];
    const contribution = (profile.clinicalEfficacy * goalRel) / 500;
    score += contribution;

    // Side effect penalty
    if (profile.sideEffectRisk > 20) {
      score -= profile.sideEffectRisk * 0.08;
    }

    // Personalization based on current signals
    if (currentSignals) {
      const signalKeys = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'] as const;
      for (const key of signalKeys) {
        const relevance = profile.signalRelevance[key];
        const signalValue = currentSignals[key];
        if (relevance > 0 && signalValue < 50) {
          score += 3; // Bonus for helping a struggling signal
        }
        if (relevance < 0 && signalValue < 50) {
          score -= 3; // Extra penalty for hurting a struggling signal
        }
      }
    }

    if (goalRel > 10) {
      goalRelevantCount++;
      contributors.push(profile.canonicalName);
    }

    if (profile.rating === 'concerning' || profile.rating === 'potentially_concerning') {
      concerns.push(profile.canonicalName);
    }

    // Fragrance penalty
    if (profile.category === 'fragrance') {
      score -= 5;
    }
  }

  // Goal alignment bonus
  if (goalRelevantCount >= 2) {
    score += 8;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const level: ProductEffectivenessResult['level'] =
    score >= 75 ? 'excellent' : score >= 55 ? 'good' : score >= 35 ? 'moderate' : 'low';

  return {
    score,
    level,
    matchedIngredients: matched,
    topContributors: contributors.slice(0, 3),
    concerns,
  };
}

export function generateProductBlurb(
  product: ProductEntry,
  effectiveness: ProductEffectivenessResult,
  primaryGoal: PrimaryGoal,
): string {
  const goalLabel = primaryGoal === 'acne' ? 'acne management' : primaryGoal === 'sun_damage' ? 'sun protection' : 'skin age management';

  if (effectiveness.score >= 75) {
    const top = effectiveness.topContributors.slice(0, 2).join(' and ');
    return `${product.product_name} is a strong match for your ${goalLabel} goal. ${top ? `Key actives like ${top} directly target your primary concern.` : 'Its ingredient profile aligns well with your skin needs.'} Continue using as directed.`;
  }

  if (effectiveness.score >= 55) {
    return `${product.product_name} provides moderate support for ${goalLabel}. ${effectiveness.topContributors.length > 0 ? `${effectiveness.topContributors[0]} contributes positively.` : 'Its formulation offers general skin benefits.'} Consider pairing with targeted actives for stronger results.`;
  }

  if (effectiveness.score >= 35) {
    const concern = effectiveness.concerns.length > 0 ? ` Watch for ${effectiveness.concerns[0]}, which may counteract benefits.` : '';
    return `${product.product_name} has limited alignment with your ${goalLabel} goal.${concern} It may still serve a supporting role in your routine.`;
  }

  return `${product.product_name} shows low alignment with your ${goalLabel} goal. ${effectiveness.concerns.length > 0 ? `Ingredients like ${effectiveness.concerns[0]} may work against your target.` : 'Consider replacing with a product containing goal-specific actives.'} Review with your dermatologist if unsure.`;
}

export function getUsageTips(matchedIngredients: ProductEffectivenessResult['matchedIngredients']): string[] {
  const tips: string[] = [];
  const categories = new Set(matchedIngredients.map((m) => m.profile.category));

  if (categories.has('retinoid')) {
    tips.push('Apply retinoids at night only. Start 2-3 times per week and increase gradually.');
  }
  if (categories.has('sunscreen_active')) {
    tips.push('Reapply sunscreen every 2 hours during sun exposure.');
  }
  if (categories.has('aha') || categories.has('bha')) {
    tips.push('Introduce acid exfoliants gradually to avoid over-exfoliation.');
  }
  if (categories.has('antioxidant')) {
    tips.push('Apply antioxidant serums in the morning before sunscreen for maximum protection.');
  }
  if (categories.has('humectant')) {
    tips.push('Apply humectants to damp skin to maximize water absorption.');
  }

  return tips;
}

export { INGREDIENT_DB };
