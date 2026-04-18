const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

// ==================== CLIENTS ====================

const openai = new OpenAI({
  apiKey: (process.env.OPENAI_API_KEY || '').replace(/\s+/g, ''),
});

let pineconeIndex = null;

function getPineconeIndex() {
  if (pineconeIndex) return pineconeIndex;

  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY not configured');
  }

  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const indexName = process.env.PINECONE_INDEX_NAME || 'glowlytics-guidelines';
  pineconeIndex = pc.index(indexName);
  return pineconeIndex;
}

// ==================== EMBEDDING ====================

/**
 * Generate an embedding vector for the given text using OpenAI text-embedding-3-small.
 * Returns a 1536-dimensional float array.
 */
async function embedText(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// ==================== GUIDELINE DATA ====================

/**
 * Curated clinical guideline chunks for RAG-grounded insights.
 *
 * Each chunk includes:
 *   - id: unique identifier
 *   - text: guideline content (sourced from AAD, EADV, BAD, NICE, ACOG, Cochrane, WHO)
 *   - category: topical category for display grouping
 *   - signal: which of the 5 skin signals this is most relevant to (or 'general')
 *   - evidence_level: 'A' (strong RCT evidence), 'B' (moderate), 'C' (expert opinion/consensus)
 *   - fitzpatrick_range: 'all', 'I-III', or 'IV-VI'
 */
const GUIDELINE_CHUNKS = [
  // ==================== ACNE MANAGEMENT (8 chunks) ====================
  {
    id: 'aad-acne-mgmt-01',
    text: 'AAD Acne Management: For mild acne (comedonal), topical retinoids are first-line therapy. Adapalene 0.1% gel is available OTC and is well-tolerated. Apply a pea-sized amount to clean, dry skin at night. Expect initial purging for 4-6 weeks before improvement becomes visible. Benzoyl peroxide 2.5% is equally effective as higher concentrations with less irritation.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'aad-acne-mgmt-02',
    text: 'AAD Acne Management: For moderate inflammatory acne, combination therapy with a topical retinoid plus benzoyl peroxide is recommended. Oral antibiotics (doxycycline 50-100mg) should be limited to 3 months to reduce antibiotic resistance. Always pair oral antibiotics with a topical retinoid for maintenance after the antibiotic course ends.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'aad-acne-mgmt-03',
    text: 'AAD Severe Acne: Nodulocystic acne (nodules, cysts >5mm) warrants aggressive treatment to prevent scarring. Isotretinoin (0.5-1mg/kg/day for 4-6 months) is the only therapy that induces long-term remission in 85% of patients. Requires pregnancy prevention, baseline labs, and monthly monitoring. Intralesional corticosteroid injections (triamcinolone 2.5-5mg/mL) can rapidly reduce individual cysts within 48 hours.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'eadv-acne-01',
    text: 'EADV Acne Guidelines: Fixed-dose adapalene 0.1%/benzoyl peroxide 2.5% combination is recommended as first-line for mild-to-moderate acne (Grade A). Topical antibiotics should never be used as monotherapy due to resistance. For maintenance after clearing, continue retinoid 3x/week indefinitely. Acne takes a minimum of 8-12 weeks to respond to treatment -- premature switching worsens outcomes.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'bad-acne-01',
    text: 'BAD Acne Guidelines: Comedonal acne (non-inflammatory) responds best to topical retinoids alone. Inflammatory acne requires combination therapy. For adult female acne, consider hormonal evaluation if acne is predominantly on lower face, flares premenstrually, or is resistant to standard therapy. Co-existing polycystic ovary syndrome (PCOS) should be screened for when appropriate.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'acne-scarring-01',
    text: 'Acne Scar Prevention: The single most important factor in preventing acne scars is early, aggressive treatment of inflammatory acne. Picking, squeezing, or popping lesions dramatically increases scar risk. Post-inflammatory hyperpigmentation (PIH) is not true scarring and fades with sun protection and time (3-12 months). True atrophic scars (ice pick, boxcar, rolling) require professional intervention once acne is controlled.',
    category: 'acne_management',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'acne-diet-01',
    text: 'Diet and Acne Evidence: High glycemic index foods (white bread, sugary drinks, processed snacks) are associated with increased acne severity in multiple RCTs. Dairy consumption, particularly skim milk, shows a modest positive association with acne. A low-glycemic diet reduced acne lesion count by 23% vs control (Smith 2007). Omega-3 fatty acids may reduce inflammatory acne. No strong evidence links chocolate specifically to acne.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'acne-zone-01',
    text: 'Acne Location and Cause Mapping: Forehead acne often correlates with hair products (pomade acne) or hat friction. T-zone oiliness is driven by sebaceous gland density. Cheek acne may relate to phone contact, pillowcase hygiene, or makeup. Chin and jawline acne is strongly correlated with hormonal fluctuation (androgens, menstrual cycle). Chest and back acne (truncal) often requires different treatment intensity than facial acne.',
    category: 'acne_management',
    signal: 'inflammation',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
  },

  // ==================== SUN PROTECTION (6 chunks) ====================
  {
    id: 'aad-sun-protection-01',
    text: 'AAD Sun Protection Guidelines: Use broad-spectrum SPF 30 or higher sunscreen daily, even on cloudy days. UV radiation penetrates clouds and windows. Apply 1 ounce (shot glass full) to all exposed skin 15 minutes before going outdoors. Reapply every 2 hours, or immediately after swimming or sweating. Chemical sunscreens need 20 minutes to absorb; mineral sunscreens work immediately.',
    category: 'sun_protection',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'aad-sun-protection-02',
    text: 'AAD SPF Guidelines: SPF 30 blocks 97% of UVB rays, SPF 50 blocks 98%, and SPF 100 blocks 99%. The marginal benefit above SPF 50 is minimal. Look for "broad spectrum" to ensure UVA protection. Key UVA filters include avobenzone, zinc oxide, titanium dioxide, and mexoryl. Reapplication is more important than higher SPF numbers.',
    category: 'sun_protection',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'who-uv-index-01',
    text: 'WHO UV Index Guidelines: UV Index 1-2 (low): no protection needed for most people. UV Index 3-5 (moderate): wear sunscreen, hat, and sunglasses. UV Index 6-7 (high): reduce sun exposure during midday, seek shade. UV Index 8-10 (very high): minimize outdoor time 10AM-4PM. UV Index 11+ (extreme): take all precautions, avoid outdoor activities if possible. Even on overcast days, up to 80% of UV radiation reaches the ground.',
    category: 'sun_protection',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'sunscreen-recs-01',
    text: 'Sunscreen Selection by Skin Type: For oily/acne-prone skin, choose lightweight chemical sunscreens or gel formulations. For sensitive skin, mineral sunscreens (zinc oxide, titanium dioxide) are less likely to cause irritation. For dark skin tones, tinted mineral sunscreens avoid the white cast. Apply sunscreen as the last step of skincare, before makeup. Spray sunscreens should be rubbed in after application.',
    category: 'sun_protection',
    signal: 'sunDamage',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'sun-protection-fitz-01',
    text: 'Sun Protection by Fitzpatrick Type: Types I-II (fair, burns easily) need SPF 50+ and physical barriers. Types III-IV (medium, tans gradually) benefit from SPF 30-50 daily. Types V-VI (dark, rarely burns) still require SPF 30 daily -- UV damage causes hyperpigmentation and uneven tone even without visible sunburn. All skin types experience cumulative UV-driven collagen degradation regardless of burn susceptibility.',
    category: 'sun_protection',
    signal: 'sunDamage',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'photoaging-prevention-01',
    text: 'Photoaging Prevention Strategies: UV exposure is cumulative and irreversible. Key prevention: daily sunscreen, protective clothing (UPF 50+), seeking shade during peak UV hours (10 AM - 4 PM). Antioxidant serums (vitamin C 15-20%, vitamin E, ferulic acid) provide additional photoprotection when layered under sunscreen. Window glass blocks UVB but not UVA -- apply sunscreen for prolonged indoor sun exposure.',
    category: 'sun_protection',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },

  // ==================== SKIN AGING & ELASTICITY (8 chunks) ====================
  {
    id: 'aad-skin-aging-01',
    text: 'AAD Skin Aging Prevention: Photoaging accounts for up to 90% of visible skin aging. Daily sunscreen use reduces skin aging by 24% (Nambour trial). Tretinoin 0.025-0.05% is the gold standard for treating and preventing photoaging. It increases collagen synthesis, accelerates cell turnover, and reduces fine lines within 12 weeks of consistent use.',
    category: 'skin_aging',
    signal: 'elasticity',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'cochrane-retinoid-aging-01',
    text: 'Cochrane Review on Retinoids for Aging: Tretinoin 0.025-0.1% significantly reduces fine wrinkles (12 RCTs, n=2,571). Effects visible at 12 weeks, optimal at 24-48 weeks. Side effects (dryness, peeling, erythema) are dose-dependent and resolve with continued use. Retinol is less effective but better tolerated. No evidence that higher concentrations produce better anti-aging results faster -- start low.',
    category: 'skin_aging',
    signal: 'elasticity',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'collagen-peptides-01',
    text: 'Collagen Peptide Supplementation: Oral collagen peptides (2.5-10g/day) improve skin elasticity and hydration within 4-8 weeks (meta-analysis of 19 RCTs, n=1,125). Hydrolyzed collagen types I and III are most studied for skin. Effects are modest but statistically significant: +7% elasticity, +14% hydration vs placebo. Best combined with vitamin C (500mg/day) which is required for endogenous collagen synthesis.',
    category: 'skin_aging',
    signal: 'elasticity',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'peptide-skincare-01',
    text: 'Topical Peptides for Skin Structure: Palmitoyl pentapeptide-4 (Matrixyl) stimulates collagen I, III, and IV synthesis. Copper peptides (GHK-Cu) promote wound healing and remodeling. Acetyl hexapeptide-3 (Argireline) reduces muscle contraction for expression lines. Peptides work best as adjuncts to retinoids, not replacements. Apply to clean skin before heavier creams. Results require 8-12 weeks of consistent use.',
    category: 'skin_aging',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'elasticity-lifestyle-01',
    text: 'Lifestyle Factors for Skin Elasticity: Smoking accelerates skin aging by 2-4x through MMP activation and microvascular damage. Cessation partially reverses damage within 6-12 months. Alcohol dehydrates skin and depletes vitamin A. High sugar intake promotes glycation (AGE formation) which cross-links collagen, reducing elasticity. Regular exercise improves skin structure via increased blood flow and growth factor delivery.',
    category: 'skin_aging',
    signal: 'elasticity',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'microneedling-01',
    text: 'Microneedling for Skin Renewal: Professional microneedling (1.0-2.0mm) induces controlled micro-injuries that stimulate collagen I and III production by 400% within 6 months (Schwarz 2005). Best for acne scars, fine lines, and skin laxity. At-home dermarollers (0.25-0.5mm) improve product absorption but do not reach the dermis. Allow 4-6 weeks between professional sessions. Not recommended for active acne or infections.',
    category: 'skin_aging',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'led-therapy-01',
    text: 'LED Light Therapy Evidence: Red light (630-660nm) stimulates fibroblast activity and collagen production. Near-infrared (830nm) penetrates deeper for wound healing and inflammation reduction. 12-week trials show improved skin roughness, wrinkle depth, and elasticity with 3x/week treatments. Blue light (415nm) kills P. acnes bacteria and reduces mild-to-moderate acne. LED is safe for all skin types with no downtime.',
    category: 'skin_aging',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'wrinkle-zone-01',
    text: 'Wrinkle Formation by Zone: Forehead lines form from frontalis muscle contraction (expression-driven). Crow\'s feet are UV-accelerated and appear earliest in fair skin. Nasolabial folds deepen from volume loss and gravity. Marionette lines worsen with lower face laxity. Neck lines (tech neck) are increasingly common from device posture. Treatment should target the specific mechanism: expression wrinkles (peptides, neurotoxins), volume loss (hyaluronic acid), laxity (retinoids, RF).',
    category: 'skin_aging',
    signal: 'elasticity',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
  },

  // ==================== RETINOID USE (4 chunks) ====================
  {
    id: 'aad-retinoid-use-01',
    text: 'AAD Retinoid Guidance: Start with the lowest concentration (tretinoin 0.025% or adapalene 0.1%) and apply every other night for the first 2 weeks. Increase to nightly use as tolerated. Common side effects include dryness, peeling, and photosensitivity. Always use sunscreen during the day when using retinoids. Avoid combining with other exfoliating actives (AHA/BHA) until skin is acclimated.',
    category: 'retinoid_use',
    signal: 'structure',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'aad-retinoid-use-02',
    text: 'Retinoid Hierarchy by Strength: Retinol (OTC, gentlest) < Retinaldehyde < Adapalene 0.1% (OTC) < Tretinoin 0.025% < Tretinoin 0.05% < Tretinoin 0.1% < Tazarotene 0.1%. For anti-aging, tretinoin 0.025% is sufficient. For acne, adapalene 0.3% or tretinoin 0.05% may be needed. Retinol requires 10-20x the concentration to match tretinoin efficacy.',
    category: 'retinoid_use',
    signal: 'structure',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'retinoid-pregnancy-01',
    text: 'NICE Retinoid Safety: All retinoids (tretinoin, adapalene, tazarotene, isotretinoin) are contraindicated in pregnancy (Category X). Discontinue topical retinoids 1 month before planned conception. Isotretinoin requires 1 month washout. Safe alternatives during pregnancy: azelaic acid (15-20%), glycolic acid (low concentration), niacinamide, vitamin C. Bakuchiol is a plant-derived retinol alternative with no teratogenic risk.',
    category: 'retinoid_use',
    signal: 'general',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'retinoid-sensitization-01',
    text: 'Retinoid Sensitization Protocol: Week 1-2: apply every 3rd night. Week 3-4: apply every other night. Week 5+: apply nightly if tolerated. Buffer method: apply moisturizer first, wait 5 minutes, then retinoid. Sandwich method: moisturizer, retinoid, moisturizer. If irritation occurs, reduce frequency, do not reduce concentration. Niacinamide 4% pre-application reduces retinoid dermatitis by 50% (Draelos 2006).',
    category: 'retinoid_use',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },

  // ==================== AHA/BHA EXFOLIATION (3 chunks) ====================
  {
    id: 'aha-bha-guidance-01',
    text: 'AHA/BHA Exfoliation Guidelines: AHAs (glycolic acid, lactic acid) are water-soluble and work on the skin surface. Best for sun damage, dryness, and texture. Start at 5-8% concentration. BHAs (salicylic acid) are oil-soluble and penetrate pores. Best for acne and blackheads. Start at 0.5-2%. Do not combine AHA/BHA with retinoids on the same night -- alternate evenings.',
    category: 'aha_bha_guidance',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'aha-bha-guidance-02',
    text: 'AHA Concentration Guide: Glycolic acid at 5-10% (daily use) improves texture and mild hyperpigmentation. At 20-30% (weekly peel), it stimulates collagen. At 50-70% (professional only), it treats moderate scarring and deep wrinkles. Lactic acid is gentler and better for sensitive skin. Mandelic acid (large molecular weight) is safest for darker skin tones as it carries less PIH risk than glycolic acid.',
    category: 'aha_bha_guidance',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'pha-guidance-01',
    text: 'PHA (Polyhydroxy Acid) for Sensitive Skin: Gluconolactone and lactobionic acid are PHAs that exfoliate without irritation. Larger molecular size means slower skin penetration, making them suitable for rosacea-prone and eczema-prone skin. PHAs also act as humectants, attracting moisture. They do not increase photosensitivity like AHAs. Ideal for patients who cannot tolerate glycolic or salicylic acid.',
    category: 'aha_bha_guidance',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },

  // ==================== HORMONAL ACNE (4 chunks) ====================
  {
    id: 'hormonal-acne-01',
    text: 'Hormonal Acne Management: Hormonal acne typically presents along the jawline and chin, worsening around menstruation. Spironolactone 50-100mg is first-line for adult female hormonal acne. Oral contraceptives containing drospirenone or norgestimate are also effective. Topical retinoids and benzoyl peroxide remain important adjuncts. Hormonal acne rarely responds to antibiotics alone.',
    category: 'hormonal_acne',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'acog-cycle-skin-01',
    text: 'ACOG Menstrual Cycle and Skin: Estrogen peaks mid-cycle (day 12-14) and promotes collagen synthesis, hydration, and wound healing -- skin looks best. Progesterone rises in luteal phase (day 15-28), stimulating sebaceous glands and increasing oil production. Premenstrual acne flares (day 21-28) are driven by progesterone-mediated sebum increase and mild immunosuppression. Tracking cycle phase helps predict and preemptively manage flares.',
    category: 'hormonal_acne',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'hormonal-acne-02',
    text: 'Premenstrual Acne Prevention: Start benzoyl peroxide spot treatment 5-7 days before expected period. Increase cleansing frequency to 2x/day during late luteal phase. Avoid heavy occlusives and comedogenic products in the week before menstruation. Some evidence supports zinc supplementation (30mg/day) for premenstrual acne severity reduction. Oil-blotting sheets help manage increased sebum without disrupting skin barrier.',
    category: 'hormonal_acne',
    signal: 'inflammation',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
  },
  {
    id: 'hormonal-acne-03',
    text: 'Androgen-Driven Acne Indicators: Signs that acne may be hormonally mediated include: onset or worsening in adulthood (>25 years), distribution primarily on lower face/jawline/neck, resistance to standard topical therapy, menstrual irregularity, hirsutism, or androgenetic alopecia. Lab workup may include DHEA-S, free testosterone, and 17-hydroxyprogesterone. Endocrine Society recommends screening when clinical features suggest androgen excess.',
    category: 'hormonal_acne',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },

  // ==================== SLEEP & STRESS (4 chunks) ====================
  {
    id: 'sleep-stress-skin-01',
    text: 'Sleep and Stress Impact on Skin: Sleep deprivation increases cortisol, which stimulates sebum production and inflammation, worsening acne and eczema. Aim for 7-9 hours of quality sleep. Chronic stress activates the HPA axis, leading to increased inflammatory cytokines and impaired skin barrier function. Stress management techniques (meditation, exercise) measurably improve skin conditions within 4-6 weeks.',
    category: 'sleep_stress_impact',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'sleep-stress-skin-02',
    text: 'Circadian Rhythm and Skin Repair: Skin cell regeneration peaks between 11 PM and 4 AM. Transepidermal water loss (TEWL) is highest at night, making nighttime moisturization critical. Blue light from screens suppresses melatonin and may impair skin repair cycles. Apply heavier occlusives and active treatments (retinoids, peptides) at night when skin permeability is highest.',
    category: 'sleep_stress_impact',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'cortisol-skin-01',
    text: 'Cortisol and Skin Health: Chronic elevated cortisol thins the dermis, reduces collagen synthesis by 30-40%, impairs wound healing, and increases skin permeability. It also triggers sebaceous gland hyperactivity (acne) and mast cell degranulation (eczema flares). Short-term stress (acute cortisol spike) temporarily impairs barrier function for 24-72 hours. Recovery strategies: 7+ hours sleep, regular exercise, mindfulness practice.',
    category: 'sleep_stress_impact',
    signal: 'elasticity',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'exercise-skin-01',
    text: 'Exercise and Skin Health: Moderate aerobic exercise (150 min/week) improves skin structure by increasing dermal thickness and collagen content (McMaster University 2014). Exercise increases blood flow, delivering oxygen and nutrients to skin cells. Sweat contains dermcidin, an antimicrobial peptide. Post-exercise, shower within 30 minutes to prevent sweat-mediated irritation. Exercise-induced cortisol reduction benefits inflammatory skin conditions.',
    category: 'sleep_stress_impact',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },

  // ==================== MOISTURIZER & HYDRATION (6 chunks) ====================
  {
    id: 'moisturizer-selection-01',
    text: 'Moisturizer Selection Guide: Look for three categories of ingredients: humectants (hyaluronic acid, glycerin) to attract water, emollients (ceramides, squalane) to soften, and occlusives (petrolatum, dimethicone) to seal moisture. For oily skin, use lightweight gel moisturizers with hyaluronic acid. For dry skin, use cream-based formulas with ceramides. Apply to damp skin within 60 seconds of cleansing for best absorption.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'bad-barrier-function-01',
    text: 'BAD Skin Barrier Function: The stratum corneum barrier is composed of corneocytes embedded in a lipid matrix (ceramides 50%, cholesterol 25%, free fatty acids 25%). Disrupted barrier leads to increased transepidermal water loss (TEWL), sensitivity, and inflammation. Key repair ingredients: ceramides (especially ceramide NP, AP, EOP), cholesterol, phytosphingosine, and fatty acids. Barrier repair takes 2-4 weeks with proper moisturization.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'eadv-tewl-01',
    text: 'EADV Hydration Assessment: Transepidermal water loss (TEWL) is the gold standard measure of barrier function. Normal TEWL is 5-10 g/m2/h on cheeks. Values >15 indicate compromised barrier. Clinical proxies: tight feeling after cleansing (high TEWL), matte appearance within 30 minutes of moisturizing (low retention), stinging with normally tolerated products (barrier breach). Specular highlight analysis on photos correlates with surface hydration.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'hyaluronic-acid-01',
    text: 'Hyaluronic Acid Best Practices: HA holds 1000x its weight in water. Low molecular weight HA (<50kDa) penetrates the epidermis for deep hydration. High molecular weight HA (>1000kDa) forms a film on the surface reducing TEWL. Multi-weight HA serums provide both benefits. In dry climates (<30% humidity), HA can draw moisture from dermis instead of air -- always seal with an occlusive in arid environments.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'skin-barrier-repair-01',
    text: 'Skin Barrier Repair Protocol: Signs of compromised barrier include stinging with products, redness, increased sensitivity, and dehydration despite moisturizing. Stop all actives (retinoids, AHA/BHA, vitamin C). Use only a gentle cleanser, ceramide moisturizer, and SPF for 2-4 weeks. Reintroduce actives one at a time, starting with the gentlest. Niacinamide 4-5% helps rebuild barrier integrity. Avoid hot water and over-cleansing.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'climate-hydration-01',
    text: 'Climate-Based Hydration Strategy: Cold/dry climate: heavier cream moisturizers with ceramides + occlusives, humidifier at night, reduce cleansing frequency. Hot/humid climate: gel moisturizers with hyaluronic acid, lighter textures, increase cleansing frequency. Air-conditioned environments: similar to cold/dry -- compensate for low humidity with hydrating mists and occlusive nighttime routine. Adjust routine seasonally for optimal barrier support.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
  },

  // ==================== INGREDIENT INTERACTIONS (4 chunks) ====================
  {
    id: 'ingredient-interactions-01',
    text: 'Ingredient Interaction Warnings: Do not combine vitamin C (ascorbic acid) with niacinamide at high concentrations -- may cause flushing. Do not combine retinoids with AHA/BHA on the same night. Do not combine benzoyl peroxide with tretinoin (oxidizes it). Benzoyl peroxide is safe with adapalene. Vitamin C is best applied in the morning under sunscreen for photoprotective synergy.',
    category: 'ingredient_interactions',
    signal: 'general',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'ingredient-interactions-02',
    text: 'Safe Ingredient Combinations: Hyaluronic acid pairs well with everything. Niacinamide (2-5%) pairs well with retinoids to reduce irritation. Centella asiatica soothes retinoid-irritated skin. Ceramides support barrier repair during active treatment. Azelaic acid (10-15%) is safe with most actives and is pregnancy-safe for acne and hyperpigmentation.',
    category: 'ingredient_interactions',
    signal: 'general',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'routine-layering-01',
    text: 'Skincare Routine Layering Order: AM: cleanser, toner (optional), vitamin C serum, moisturizer, sunscreen. PM: cleanser (double cleanse if wearing sunscreen/makeup), treatment serum (retinoid OR acid, not both), moisturizer, occlusive (optional). Apply thinnest to thickest texture. Wait 1-2 minutes between actives. Fewer products applied consistently outperform complex routines applied inconsistently.',
    category: 'ingredient_interactions',
    signal: 'general',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
  },
  {
    id: 'routine-frequency-01',
    text: 'Product Frequency Guidelines: Retinoids: start 2-3x/week, build to nightly. Vitamin C: daily AM. AHA/BHA: 2-3x/week for maintenance, daily only with established tolerance. Niacinamide: daily, AM or PM. Hyaluronic acid: daily, AM and PM. Clay masks: 1-2x/week maximum. Sheet masks: 1-3x/week. Chemical peels: every 2-4 weeks (mild) or 4-6 weeks (strong). More is not better -- over-treating causes barrier damage.',
    category: 'ingredient_interactions',
    signal: 'general',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
  },

  // ==================== INFLAMMATORY CONDITIONS (5 chunks) ====================
  {
    id: 'inflammatory-skin-01',
    text: 'Rosacea Management: Rosacea triggers include sun, heat, alcohol, spicy food, and stress. Azelaic acid 15% and metronidazole 0.75% are first-line topical treatments. Avoid retinoids and AHAs on rosacea-prone skin unless directed by a dermatologist. Eczema (atopic dermatitis) requires aggressive moisturization and avoidance of irritants. Ceramide-rich moisturizers applied twice daily reduce flare frequency by 50%.',
    category: 'inflammatory_conditions',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'eadv-eczema-01',
    text: 'EADV Atopic Dermatitis Guidelines: Emollient use (minimum 250g/week for adults) is the cornerstone of eczema management and reduces flare frequency by 50%. Apply within 3 minutes of bathing. Topical corticosteroids: use potency appropriate to body site and severity. Facial eczema: mild potency (hydrocortisone 1%). Body: moderate potency. Avoid prolonged use >2 weeks without review. Calcineurin inhibitors (tacrolimus, pimecrolimus) are steroid-sparing alternatives for sensitive areas.',
    category: 'inflammatory_conditions',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },
  {
    id: 'contact-dermatitis-01',
    text: 'Contact Dermatitis Identification: Allergic contact dermatitis causes localized eczema at the site of allergen contact (fragrance, preservatives, nickel, lanolin). Irritant contact dermatitis results from direct skin damage (over-washing, harsh cleansers, alcohol-based toners). Key difference: allergic worsens with each exposure; irritant improves when the irritant is removed. Common skincare allergens to check: methylisothiazolinone (MI), fragrance mix, balsam of Peru.',
    category: 'inflammatory_conditions',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'perioral-dermatitis-01',
    text: 'Perioral Dermatitis: Presents as small papules and pustules around the mouth, nose, and eyes. Often triggered by topical corticosteroids, heavy moisturizers, fluoride toothpaste, or SLS-containing products. Treatment: discontinue triggering products (may cause initial flare), oral tetracycline or doxycycline for 6-8 weeks, topical metronidazole or azelaic acid. Do not use topical steroids -- they cause rebound flares.',
    category: 'inflammatory_conditions',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'seborrheic-dermatitis-01',
    text: 'Seborrheic Dermatitis: Caused by Malassezia yeast overgrowth in sebum-rich areas (scalp, nasolabial folds, eyebrows, ears). Presents as flaky, red, itchy patches. Antifungal treatments: ketoconazole 2% cream/shampoo, zinc pyrithione, selenium sulfide. Maintenance: antifungal wash 2x/week. Avoid heavy oils and occlusive products on affected areas. Stress, fatigue, and cold weather are common triggers.',
    category: 'inflammatory_conditions',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },

  // ==================== STRUCTURE & TEXTURE (4 chunks) ====================
  {
    id: 'pore-minimization-01',
    text: 'Pore Size Management: Pore size is primarily determined by genetics and sebum production. Retinoids reduce pore appearance by normalizing keratinization inside the pore. Niacinamide 2-5% reduces sebum production by 20-30%, visibly tightening pores over 8 weeks. Salicylic acid (BHA) dissolves sebum plugs inside pores. No product can permanently shrink pores, but consistent treatment improves their appearance significantly.',
    category: 'structure_texture',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'texture-refinement-01',
    text: 'Skin Texture Improvement Protocol: Rough texture stems from irregular cell turnover, dehydration, or UV damage. Step 1: gentle chemical exfoliation (glycolic 5-8% or lactic acid 2-3x/week). Step 2: retinoid for accelerated cell turnover. Step 3: hydration (hyaluronic acid + ceramide moisturizer). Step 4: daily SPF to prevent UV-induced texture degradation. Improvement visible at 4-6 weeks, optimal at 12 weeks.',
    category: 'structure_texture',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'visia-texture-01',
    text: 'VISIA-Based Texture Assessment: Clinical texture analysis evaluates surface roughness (Ra value), pore density, and fine-line depth. Normal Ra for 20-30 year olds: 15-25 micrometers. Values >35 indicate significant texture irregularity. Factors worsening texture: dehydration, UV exposure, over-exfoliation, and aging. GLCM contrast and LBP entropy from image analysis correlate with clinical texture scores (r=0.72, Kim 2019).',
    category: 'structure_texture',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
  },
  {
    id: 'niacinamide-01',
    text: 'Niacinamide (Vitamin B3) Benefits: At 2-5%, niacinamide reduces sebum production, minimizes pore appearance, improves skin barrier function (ceramide synthesis +34%), reduces hyperpigmentation (melanosome transfer inhibition), and has anti-inflammatory properties. Well-tolerated by all skin types. Can be combined with most actives. Reduces retinoid irritation when used together. Apply AM and/or PM. One of the most versatile and evidence-backed ingredients available.',
    category: 'structure_texture',
    signal: 'structure',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
  },

  // ==================== FITZPATRICK-SPECIFIC (6 chunks) ====================
  {
    id: 'fitz-iv-vi-pih-01',
    text: 'Post-Inflammatory Hyperpigmentation in Dark Skin (Fitzpatrick IV-VI): PIH is the most common concern in skin of color after acne or inflammation. Duration: 3-24 months without treatment. First-line: azelaic acid 15-20% (safe for all skin tones, minimal irritation). Hydroquinone 2-4% for up to 3 months (monitor for ochronosis). Vitamin C (ascorbic acid 10-20%) and arbutin are effective melanogenesis inhibitors. Always combine with SPF 30+ -- UV reactivates melanocytes.',
    category: 'fitzpatrick_specific',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'IV-VI',
  },
  {
    id: 'fitz-iv-vi-chemical-peels-01',
    text: 'Chemical Peels in Darker Skin Tones: Superficial peels (glycolic 20-35%, salicylic 20-30%) are generally safe for Fitzpatrick IV-VI with proper prep (retinoid + hydroquinone for 2-4 weeks pre-peel). Avoid medium-depth peels (TCA >25%) due to high PIH risk. Mandelic acid peels are preferred over glycolic for darker skin -- larger molecular size means more even penetration. Post-peel: strict sun protection for 4 weeks minimum.',
    category: 'fitzpatrick_specific',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'IV-VI',
  },
  {
    id: 'fitz-iv-vi-keloid-01',
    text: 'Keloid and Hypertrophic Scarring Risk: Fitzpatrick IV-VI skin types have 15x higher keloid risk than types I-II. Keloids extend beyond original wound borders; hypertrophic scars stay within them. Prevention: minimize skin trauma, avoid unnecessary procedures, use silicone sheets/gel post-procedure. Treatment: intralesional corticosteroids (triamcinolone 10-40mg/mL), silicone sheeting, pressure therapy. Ear piercings and chest/shoulder surgery carry highest keloid risk.',
    category: 'fitzpatrick_specific',
    signal: 'structure',
    evidence_level: 'B',
    fitzpatrick_range: 'IV-VI',
  },
  {
    id: 'fitz-i-iii-melanoma-01',
    text: 'Skin Cancer Awareness for Fair Skin (Fitzpatrick I-III): Type I skin has 70x higher melanoma risk than type VI. ABCDE rule: Asymmetry, Border irregularity, Color variation, Diameter >6mm, Evolution (any change). Perform monthly self-exams. Annual professional skin exams recommended. Any new mole after age 30, or any mole that changes, warrants evaluation. Non-melanoma skin cancers (BCC, SCC) appear as persistent non-healing sores or scaly patches.',
    category: 'fitzpatrick_specific',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'I-III',
  },
  {
    id: 'fitz-iv-vi-vitiligo-01',
    text: 'Vitiligo and Depigmentation in Darker Skin: Vitiligo (autoimmune melanocyte destruction) is equally common across all skin types but more visually apparent in darker skin. Aggressive sun protection on affected areas prevents burns on depigmented patches. Topical tacrolimus 0.1% or pimecrolimus promote repigmentation. Narrow-band UVB phototherapy is first-line for extensive disease. Pseudocatalase cream shows promise in early-stage vitiligo.',
    category: 'fitzpatrick_specific',
    signal: 'sunDamage',
    evidence_level: 'B',
    fitzpatrick_range: 'IV-VI',
  },
  {
    id: 'fitz-i-iii-rosacea-01',
    text: 'Rosacea Prevalence in Fair Skin: Rosacea affects up to 10% of Fitzpatrick I-II individuals. Subtypes: erythematotelangiectatic (persistent redness), papulopustular (acne-like), phymatous (thickened skin), ocular (eye involvement). Key triggers: UV exposure, temperature extremes, alcohol, spicy food. Brimonidine 0.33% gel provides temporary redness relief (8-12 hours). Ivermectin 1% cream targets Demodex mites implicated in papulopustular rosacea.',
    category: 'fitzpatrick_specific',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'I-III',
  },

  // ==================== DERMATOLOGIST REFERRAL (2 chunks) ====================
  {
    id: 'dermatologist-referral-01',
    text: 'When to See a Dermatologist: Seek professional evaluation if acne does not improve after 12 weeks of consistent OTC treatment. Urgent referral for: rapidly changing moles (ABCDE criteria), painful cystic acne with scarring risk, widespread unexplained rash, suspected skin infection, or any lesion that bleeds and does not heal within 3 weeks. Annual skin checks are recommended for all adults.',
    category: 'dermatologist_referral',
    signal: 'general',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'AAD 2024 Acne Guidelines',
  },
  {
    id: 'dermatologist-referral-02',
    text: 'Teledermatology and When to Seek In-Person Care: Teledermatology is appropriate for acne follow-ups, eczema management, rosacea monitoring, and routine skincare questions. In-person evaluation is required for: suspicious moles/growths requiring dermoscopy, skin biopsies, procedural treatments (injections, cryotherapy), and any rapidly worsening condition. Store-and-forward dermatology (photo review) has 80-90% concordance with in-person diagnosis for common conditions.',
    category: 'dermatologist_referral',
    signal: 'general',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'JAAD 2020 Teledermatology Review',
  },

  // ==================== MEN'S SKIN HEALTH (3 chunks) ====================
  {
    id: 'mens-skin-pfb-01',
    text: 'Pseudofolliculitis Barbae (PFB): Affects up to 83% of Black men and 20% of White men who shave. Curved hair re-enters the skin causing inflammatory papules and pustules. Prevention: single-blade razors or electric trimmers set to leave 1mm stubble, shave with the grain only, warm compress pre-shave. Treatment: topical retinoids (tretinoin 0.025%) to prevent follicular plugging, benzoyl peroxide 5% wash, glycolic acid 8% lotion. Laser hair removal (Nd:YAG 1064nm) is the definitive treatment for recurrent PFB.',
    category: 'mens_skin_health',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'AFP 2023 PFB Management',
  },
  {
    id: 'mens-skin-truncal-01',
    text: 'Male Truncal Acne: Chest and back acne is more common in men due to higher androgen levels and greater sebaceous gland density. Treatment requires higher-strength topical agents: benzoyl peroxide 5-10% wash (leave on 2-3 minutes), adapalene 0.3% for chest. Oral doxycycline 100mg x 3 months for moderate-severe truncal acne. Body sprays and tight athletic wear worsen truncal acne (acne mechanica). Shower within 30 minutes after exercise.',
    category: 'mens_skin_health',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'AAD 2024 Acne Guidelines',
  },
  {
    id: 'mens-sun-compliance-01',
    text: 'Men\'s Sunscreen Compliance: Men are 2x less likely to use sunscreen than women (CDC NHIS 2019). Men have 55% higher melanoma mortality. Barriers: texture preferences, perceived femininity, lack of habit. Solutions: SPF-containing moisturizers or aftershave reduce application friction. Mineral stick sunscreens are faster to apply for active use. Daily SPF use reduces melanoma risk by 50% (Green 2011 Nambour trial). Brief clinician counseling increases compliance 3-fold.',
    category: 'mens_skin_health',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'JCO 2011 Nambour Trial; CDC NHIS 2019',
  },

  // ==================== BARRIER REPAIR & SENSITIVE SKIN (2 chunks) ====================
  {
    id: 'over-exfoliation-01',
    text: 'Over-Exfoliation Recovery: Signs include persistent stinging, redness, increased breakouts paradoxically, shiny "glass skin" appearance (stratum corneum thinning), and intolerance to previously tolerated products. Immediate protocol: stop ALL actives (retinoids, AHA/BHA, vitamin C, scrubs). Use only: gentle cleanser (CeraVe, Vanicream), ceramide moisturizer 2x daily, SPF 30+. Timeline: barrier recovery takes 14-28 days. Reintroduce one active at a time, starting lowest concentration, every 2 weeks.',
    category: 'barrier_repair',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'BAD 2023 Barrier Dysfunction Guidelines',
  },
  {
    id: 'sensitive-skin-classification-01',
    text: 'Sensitive Skin Classification: Type 1 (stinging) responds to capsaicin, lactic acid — avoid these ingredients. Type 2 (burning) is barrier-dysfunction driven — treat with ceramides. Type 3 (allergic) requires patch testing — common culprits: fragrance, methylisothiazolinone, propylene glycol. Type 4 (acne-type) reacts to comedogenic ingredients. Prevalence: 60-70% of women, 50-60% of men report sensitive skin. True sensitive skin (confirmed by dermatologist) affects ~20%. Management: minimal ingredient count, fragrance-free, pH 4.5-5.5.',
    category: 'barrier_repair',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'EADV 2023 Sensitive Skin Consensus',
  },

  // ==================== HYPERPIGMENTATION (2 chunks) ====================
  {
    id: 'melasma-management-01',
    text: 'Melasma Management: Melasma is distinct from PIH — it is hormonally driven (estrogen, progesterone) and UV-activated. Triple combination cream (hydroquinone 4% + tretinoin 0.05% + fluocinolone 0.01%) is gold standard (Grade A). Oral tranexamic acid 250mg 2x/day shows 49% improvement in melasma severity (MASI score) at 12 weeks with minimal side effects. Strict SPF 50+ with iron oxide (tinted) blocks visible light which triggers melasma in darker skin. Avoid waxing and laser in active melasma.',
    category: 'hyperpigmentation',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'AAD 2023 Melasma Guidelines; JAAD 2022 Tranexamic Acid Review',
  },
  {
    id: 'tyrosinase-inhibitors-01',
    text: 'Tyrosinase Inhibitor Comparison: Hydroquinone 2-4% is most potent but limited to 3-month courses (ochronosis risk). Arbutin (alpha-arbutin 2%) is a gentler alternative with no rebound. Kojic acid 1-2% inhibits melanin but may cause contact dermatitis. Tranexamic acid (topical 3-5%) blocks plasmin-mediated melanocyte activation. Niacinamide 5% inhibits melanosome transfer (not synthesis). Azelaic acid 15-20% is safe in pregnancy and effective for PIH. Layer: AM vitamin C + niacinamide; PM retinoid + azelaic acid.',
    category: 'hyperpigmentation',
    signal: 'sunDamage',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'Cochrane 2023 Topical Depigmenting Agents Review',
  },

  // ==================== NUTRITION & SUPPLEMENTS (2 chunks) ====================
  {
    id: 'vitamin-c-collagen-01',
    text: 'Vitamin C and Collagen Synthesis: Vitamin C (ascorbic acid) is an essential cofactor for prolyl and lysyl hydroxylase — enzymes required for collagen cross-linking. Deficiency impairs wound healing and accelerates skin aging. Oral supplementation: 500-1000mg/day supports endogenous collagen production (meta-analysis, 7 RCTs, n=805). Topical L-ascorbic acid 15-20% at pH <3.5 achieves 20x higher skin concentration than oral. Combine with vitamin E and ferulic acid for synergistic photoprotection (Duke patent formulation).',
    category: 'nutrition_supplements',
    signal: 'structure',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'Nutrients 2017 Meta-Analysis; J Invest Dermatol 2005 Duke Formula',
  },
  {
    id: 'zinc-skin-health-01',
    text: 'Zinc and Skin Health: Zinc supplementation (30-50mg elemental zinc/day) reduces inflammatory acne lesion count by 33% vs placebo (meta-analysis, 12 RCTs). Zinc gluconate and zinc picolinate have superior bioavailability. Zinc also accelerates wound healing (cofactor for MMPs) and supports immune function in the skin. Topical zinc pyrithione 1-2% is effective for seborrheic dermatitis and dandruff. Excess zinc (>50mg/day) depletes copper — take with copper 2mg if supplementing long-term.',
    category: 'nutrition_supplements',
    signal: 'inflammation',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'Dermatol Res Pract 2014 Zinc Meta-Analysis',
  },

  // ==================== LESION RED FLAGS (2 chunks) ====================
  {
    id: 'lesion-red-flags-01',
    text: 'AI-Detected Lesion Referral Criteria: Any AI-detected lesion warrants dermatologist evaluation if: asymmetric shape, irregular borders, color variation within a single lesion, diameter >6mm, or evolution (change over sequential scans). Papules persisting >6 weeks without improvement, nodules >1cm, or any lesion with ulceration/bleeding should be evaluated within 2 weeks. App-based detection is a screening aid, not a diagnostic tool — sensitivity for melanoma is 70-90% with 30-50% specificity in current models.',
    category: 'lesion_assessment',
    signal: 'general',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'NICE 2024 Suspected Cancer Pathway; BMJ 2023 AI Dermatology Review',
  },
  {
    id: 'nmsc-awareness-01',
    text: 'Non-Melanoma Skin Cancer Awareness: Basal cell carcinoma (BCC) presents as a pearly nodule, often with telangiectasia, that grows slowly and rarely metastasizes. Squamous cell carcinoma (SCC) appears as a scaly, crusted plaque or nodule, can metastasize if untreated. Actinic keratoses (AKs) are SCC precursors — rough, sandpaper-like patches on sun-exposed skin. >10 AKs indicates field cancerization requiring field-directed therapy (fluorouracil 5%, imiquimod, or PDT). Monthly self-exam reduces late-stage diagnosis by 44%.',
    category: 'lesion_assessment',
    signal: 'sunDamage',
    evidence_level: 'A',
    fitzpatrick_range: 'all',
    source_citation: 'AAD 2024 NMSC Guidelines; JAMA Dermatol 2022',
  },

  // ==================== SIGNAL-SPECIFIC DEEP DIVES (5 chunks) ====================
  {
    id: 'hydration-tewl-correlation-01',
    text: 'Visual Hydration Markers and TEWL: Skin surface specular reflection (measured via image analysis) correlates with stratum corneum hydration (r=0.68, Kim 2019). Reduced specular highlights indicate dehydration. Corneometer measurements >40 AU indicate adequate hydration, <30 AU indicates clinical dehydration. ITA variance (Typology Angle) from photos correlates with uneven hydration distribution. Hydration fluctuates 15-25% diurnally — lowest at 4 AM, highest 2 hours post-moisturization.',
    category: 'hydration',
    signal: 'hydration',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'Skin Res Technol 2019; IFSCC 2020 Hydration Correlation Study',
  },
  {
    id: 'inflammation-diet-01',
    text: 'Diet-Inflammation Axis in Skin: Mediterranean diet (high omega-3, polyphenols, low glycemic load) reduces systemic inflammatory markers (CRP, IL-6) by 20% within 12 weeks and is associated with 32% lower acne severity (Skroza 2012). Omega-3 supplementation (EPA 2g/day) reduces inflammatory acne lesions by 42% at 10 weeks. Eliminating dairy reduces acne in 48% of patients who try it. Anti-inflammatory foods: fatty fish, walnuts, berries, turmeric, green tea. Pro-inflammatory: refined sugar, processed meats, fried foods.',
    category: 'inflammation_diet',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'J Eur Acad Dermatol Venereol 2012; Lipids Health Dis 2012',
  },
  {
    id: 'elasticity-ages-01',
    text: 'Advanced Glycation End-Products (AGEs) and Skin Aging: Dietary AGEs (formed by high-heat cooking) and endogenous AGEs (from high blood sugar) cross-link collagen fibers, making skin stiff and less elastic. AGE accumulation increases linearly after age 20. Skin fluorescence (AF) at 370nm measures AGE burden and correlates with skin elasticity loss (r=-0.71). Reducing AGE intake: cook at lower temperatures (steaming > grilling), increase antioxidant intake (vitamin C, carnosine), maintain blood sugar <100mg/dL fasting. Carnosine 500mg/day shows anti-glycation benefits in early RCTs.',
    category: 'skin_aging',
    signal: 'elasticity',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'Aging Cell 2018 AGE-Skin Review; Br J Dermatol 2020',
  },
  {
    id: 'structure-sf-vs-blackhead-01',
    text: 'Sebaceous Filaments vs Blackheads: Sebaceous filaments (SFs) are normal structures in every pore — they appear as tiny gray/yellow dots primarily on the nose and chin. They refill within 30 days and cannot be permanently removed. Blackheads (open comedones) are true acne lesions — they appear darker, larger, and raised. SFs: manage with BHA 2% 3x/week and niacinamide to reduce sebum. Blackheads: require retinoid therapy (adapalene 0.1%) for lasting improvement. Pore strips temporarily remove SFs but may cause capillary damage with repeated use.',
    category: 'structure_texture',
    signal: 'structure',
    evidence_level: 'C',
    fitzpatrick_range: 'all',
    source_citation: 'JAAD 2020 Comedone Classification; Dermatol Surg 2019',
  },
  {
    id: 'inflammation-crp-skin-01',
    text: 'Systemic Inflammation and Skin: Elevated CRP (>3mg/L) is associated with 2.3x higher risk of moderate-to-severe acne (Karadag 2011). Chronic low-grade inflammation (metabolic, stress, sleep deprivation) manifests as persistent facial erythema, delayed wound healing, and increased sensitivity. Measurable skin biomarkers: increased TEWL, reduced ceramide:cholesterol ratio, elevated sebum IL-1 alpha. Interventions that lower systemic inflammation improve skin within 4-8 weeks: regular exercise, stress reduction, anti-inflammatory diet, 7+ hours sleep.',
    category: 'inflammatory_conditions',
    signal: 'inflammation',
    evidence_level: 'B',
    fitzpatrick_range: 'all',
    source_citation: 'J Invest Dermatol 2011; Br J Dermatol 2019 Inflammation-Skin Review',
  },
];

// ==================== SEED FUNCTION ====================

/**
 * Upsert all guideline chunks into Pinecone with their embeddings.
 * Call this once to populate the index.
 */
async function seedGuidelines() {
  const index = getPineconeIndex();

  // Generate embeddings for all chunks in parallel batches
  const batchSize = 5;
  const vectors = [];

  for (let i = 0; i < GUIDELINE_CHUNKS.length; i += batchSize) {
    const batch = GUIDELINE_CHUNKS.slice(i, i + batchSize);
    const embeddings = await Promise.all(
      batch.map((chunk) => embedText(chunk.text))
    );

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        id: batch[j].id,
        values: embeddings[j],
        metadata: {
          text: batch[j].text,
          category: batch[j].category,
          signal: batch[j].signal || 'general',
          evidence_level: batch[j].evidence_level || 'C',
          fitzpatrick_range: batch[j].fitzpatrick_range || 'all',
          source_citation: batch[j].source_citation || '',
        },
      });
    }
  }

  // Upsert to Pinecone (v7 SDK uses { records } format)
  await index.upsert({ records: vectors });

  return {
    seeded: vectors.length,
    categories: [...new Set(GUIDELINE_CHUNKS.map((c) => c.category))],
  };
}

// ==================== QUERY FUNCTION ====================

/**
 * Query Pinecone for guideline chunks relevant to the given query.
 * Returns the top-K most relevant guideline excerpts with their scores.
 */
/**
 * @param {string} query - Natural language query
 * @param {number} topK - Number of results
 * @param {string|null} signalFilter - Filter to a specific signal (e.g., 'hydration'). Includes 'general' chunks too.
 */
async function queryGuidelines(query, topK = 3, signalFilter = null) {
  const index = getPineconeIndex();
  const queryEmbedding = await embedText(query);

  const queryOpts = {
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  };

  // Pinecone metadata filter: match the specific signal OR 'general'
  if (signalFilter) {
    queryOpts.filter = { signal: { $in: [signalFilter, 'general'] } };
  }

  const results = await index.query(queryOpts);

  return (results.matches || []).map((match) => ({
    id: match.id,
    score: match.score,
    text: match.metadata?.text || '',
    category: match.metadata?.category || '',
    signal: match.metadata?.signal || 'general',
    evidence_level: match.metadata?.evidence_level || 'C',
    source_citation: match.metadata?.source_citation || '',
  }));
}

/**
 * Run multiple RAG queries in parallel for per-signal + overall context.
 * Returns a merged, deduplicated set of guideline chunks organized by relevance.
 *
 * @param {object} params
 * @param {string} params.primaryCondition - Main condition or driver
 * @param {string} params.userGoal - User's primary skin goal
 * @param {string} params.weakestSignal - Name of the lowest-scoring signal
 * @param {string} [params.secondWeakestSignal] - Name of the second-lowest signal
 * @returns {Promise<object[]>} Deduplicated RAG chunks with scores
 */
async function queryGuidelinesMulti({ primaryCondition, userGoal, weakestSignal, secondWeakestSignal }) {
  const queries = [
    queryGuidelines(`${primaryCondition} treatment recommendation for ${userGoal}`, 3),
    queryGuidelines(`${weakestSignal} improvement skin health`, 2),
  ];

  if (secondWeakestSignal && secondWeakestSignal !== weakestSignal) {
    queries.push(queryGuidelines(`${secondWeakestSignal} skin care guidance`, 2));
  }

  const allResults = await Promise.all(queries);
  const flat = allResults.flat();

  // Deduplicate by id, keeping highest score
  const byId = new Map();
  for (const chunk of flat) {
    const existing = byId.get(chunk.id);
    if (!existing || chunk.score > existing.score) {
      byId.set(chunk.id, chunk);
    }
  }

  // Sort by score descending, limit to 7
  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
}

/**
 * Query guidelines filtered to a specific signal.
 * Used by the signal detail page to show only relevant clinical guidance.
 */
async function queryGuidelinesForSignal(signalKey, userContext = '', topK = 4) {
  const signalNames = {
    structure: 'skin structure texture pores',
    hydration: 'skin hydration moisture barrier',
    inflammation: 'inflammation acne redness irritation',
    sunDamage: 'sun damage UV protection photoaging',
    elasticity: 'skin elasticity firmness collagen aging',
  };
  const signalQuery = signalNames[signalKey] || signalKey;
  const query = userContext
    ? `${signalQuery} recommendation for ${userContext}`
    : `${signalQuery} clinical guideline`;
  return queryGuidelines(query, topK, signalKey);
}

module.exports = {
  embedText,
  seedGuidelines,
  queryGuidelines,
  queryGuidelinesMulti,
  queryGuidelinesForSignal,
  GUIDELINE_CHUNKS,
};
