/**
 * Bone-structure interventions — finding → three-tier recommendation lookup.
 *
 * Each finding code (emitted by bone-structure-3d.js's findingsFromScores)
 * maps to up to 3 suggestions per tier:
 *   - lifestyle:        non-pharmacological, daily-habit interventions
 *   - pharmacological:  topical/systemic agents, generally OTC or clinician-supervised
 *   - interventional:   surgical, injectable, or device-based procedures
 *
 * The `procedural_disclaimer` flag on the bundle is unconditionally set so the
 * UI can render the strong "consult a board-certified surgeon" notice on the
 * procedural tab in addition to the app-wide informational disclaimer.
 *
 * All copy is intentionally educational. Nothing here is medical advice.
 */

// Catalogue of every recommendation chip the UI can render. Indexed by id so
// findings can share suggestions without duplicating copy.
const SUGGESTIONS = {
  // ----- LIFESTYLE -----
  low_sodium_diet:        { tier: 'lifestyle', title: 'Low-sodium, high-potassium diet',
                            body: 'Reducing dietary sodium and increasing potassium-rich foods (leafy greens, avocado, banana) helps lower fluid retention that softens facial contour.' },
  hydration:              { tier: 'lifestyle', title: 'Steady hydration',
                            body: 'Even daily water intake reduces compensatory water retention that blurs jawline and periorbital definition.' },
  elevated_sleep:         { tier: 'lifestyle', title: 'Sleep with head elevated',
                            body: 'Sleeping on two pillows (or a wedge) lets overnight lymph drain away from the face, reducing morning under-eye and midface puffiness.' },
  lymphatic_massage:      { tier: 'lifestyle', title: 'Lymphatic facial massage',
                            body: 'Gentle downward strokes from the centre of the face toward the ears and clavicle move lymph along its natural drainage paths.' },
  gua_sha:                { tier: 'lifestyle', title: 'Gua sha',
                            body: 'A jade or quartz tool used along jawline and cheekbone sweeps can support drainage; evidence is limited but the effect on visible puffiness is short-term real.' },
  mastic_chewing:         { tier: 'lifestyle', title: 'Mastic-gum / firm-food chewing',
                            body: 'Chewing harder foods or mastic gum exercises the masseter, which can subtly increase jaw angle definition over months.' },
  mewing_posture:         { tier: 'lifestyle', title: 'Tongue-posture (mewing)',
                            body: 'Resting tongue on the palate with lips closed is anecdotally linked to better jaw posture; evidence is weak but the habit is harmless.' },
  posture_neck:           { tier: 'lifestyle', title: 'Neck and head posture',
                            body: 'Forward-head and rounded-shoulder posture compress the lower-face profile; daily posture cues and exercises restore visible jaw definition.' },
  weight_optimisation:    { tier: 'lifestyle', title: 'Modest body-composition shift',
                            body: 'Subcutaneous fat percent has an outsized effect on lower-face contour. Even a 2–4% body-fat shift can change perceived jaw and cheekbone definition.' },
  smoking_cessation:      { tier: 'lifestyle', title: 'Stop smoking',
                            body: 'Smoking accelerates elastin breakdown and reduces dermal volume; cessation halts that loss and lets recovery begin.' },
  sleep_side_rotation:    { tier: 'lifestyle', title: 'Alternate sleep side',
                            body: 'Persistent same-side sleeping creates asymmetric pressure on the midface over years; rotating sides nightly reduces drift.' },
  unilateral_chew_avoid:  { tier: 'lifestyle', title: 'Avoid one-sided chewing',
                            body: 'Chewing primarily on one side can produce mild masseter and zygomatic asymmetry over time; conscious alternation rebalances it.' },
  daily_spf:              { tier: 'lifestyle', title: 'Daily broad-spectrum SPF',
                            body: 'UV is the largest extrinsic driver of dermal-elastin loss; consistent SPF preserves the skin envelope that holds bone-structure perception.' },
  sleep_quality:          { tier: 'lifestyle', title: 'Prioritise 7–9 hours of sleep',
                            body: 'Sleep debt directly raises periorbital fluid retention and dulls midface definition.' },

  // ----- PHARMACOLOGICAL -----
  caffeine_topical:       { tier: 'pharmacological', title: 'Caffeine eye cream',
                            body: 'Topical caffeine constricts microvasculature and reduces periocular fluid; modest, short-acting effect.' },
  topical_tretinoin:      { tier: 'pharmacological', title: 'Topical tretinoin / retinol',
                            body: 'Retinoids thicken the dermis and increase elastin/collagen, which sharpens the skin envelope draped over bone. Discuss strength and tolerance with a dermatologist.' },
  topical_peptides:       { tier: 'pharmacological', title: 'Peptide-based serum',
                            body: 'Argireline, copper peptides, and other peptide serums offer modest skin-tightening evidence as adjuncts to retinoids.' },
  oral_diuretic:          { tier: 'pharmacological', title: 'Short-course oral diuretic',
                            body: 'For refractory periorbital edema, a clinician-supervised low-dose diuretic (e.g. HCTZ) can be useful; never self-prescribe.' },
  antihistamine_atopic:   { tier: 'pharmacological', title: 'Antihistamine (for atopic patients)',
                            body: 'If allergies drive your periorbital puffiness, a daily second-generation antihistamine often resolves it.' },
  niacinamide:            { tier: 'pharmacological', title: 'Topical niacinamide 5–10%',
                            body: 'Improves skin barrier and reduces redness; supports envelope quality but does not alter bone.' },

  // ----- INTERVENTIONAL -----
  mandibular_angle_implant: { tier: 'interventional', title: 'Mandibular angle implant',
                              body: 'A surgical implant placed at the gonion sharpens the jaw angle. Permanent; requires a maxillofacial or plastic surgeon.' },
  jawline_filler:           { tier: 'interventional', title: 'Hyaluronic-acid jawline filler',
                              body: 'Reversible HA filler at the gonion and pre-jowl can mimic the effect of implants. Lasts 12–18 months. Choose an experienced injector.' },
  masseter_botox:           { tier: 'interventional', title: 'Masseter botulinum-toxin',
                              body: 'Reduces masseter bulk for a softer lower-face. Useful when the jaw appears square from masseter hypertrophy. Reversible; results last ~4 months.' },
  lateral_canthopexy:       { tier: 'interventional', title: 'Lateral canthopexy',
                              body: 'Surgical resuspension of the lateral canthal tendon corrects negative canthal tilt and stabilises the lower lid.' },
  lateral_canthoplasty:     { tier: 'interventional', title: 'Lateral canthoplasty',
                              body: 'A more involved version of canthopexy with tendon reshaping; appropriate for more pronounced tilt correction.' },
  lower_lid_retractor_release: { tier: 'interventional', title: 'Lower-lid retractor release',
                              body: 'Surgical procedure that lifts the lower lid to cover the inferior limbus, reducing scleral show.' },
  spacer_graft:             { tier: 'interventional', title: 'Lower-lid spacer graft',
                              body: 'Bio-tissue or synthetic graft placed in the lower lid to raise its position. Adjunct to retractor release in moderate-to-severe scleral show.' },
  fat_transposition_lower:  { tier: 'interventional', title: 'Lower-lid fat transposition',
                              body: 'Repositions infraorbital fat to soften the tear trough and elevate the lid margin.' },
  genioplasty:              { tier: 'interventional', title: 'Genioplasty (chin osteotomy)',
                              body: 'Surgical reshaping of the chin bone for retrognathia. Permanent. Outpatient in experienced hands.' },
  chin_filler:              { tier: 'interventional', title: 'Chin filler',
                              body: 'HA filler placed at the pogonion adds 1–3 mm of forward projection. Reversible. Useful as a trial before considering genioplasty.' },
  malar_implant:            { tier: 'interventional', title: 'Malar (cheekbone) implant',
                              body: 'A silicone implant at the zygomatic eminence increases lateral midface projection. Permanent.' },
  deep_cheek_filler:        { tier: 'interventional', title: 'Deep-cheek filler',
                              body: 'HA filler placed in the deep medial cheek compartment lifts the midface and softens the nasolabial fold.' },
  brow_lift:                { tier: 'interventional', title: 'Brow lift',
                              body: 'Surgical elevation of the brow to a higher position above the supraorbital rim. Options include endoscopic, lateral, or pretrichial approaches.' },
  brow_botox:               { tier: 'interventional', title: 'Chemical brow lift (botox)',
                              body: 'Targeted botox into the depressors (procerus, lateral orbicularis) gives a 1–2 mm subtle lift. Reversible.' },
  rhinoplasty_consult:      { tier: 'interventional', title: 'Rhinoplasty consultation',
                              body: 'A surgical consult to discuss nasal-base, columellar, or alar-width adjustments. The right surgeon will tell you what changes are realistic.' },
  asymmetric_filler:        { tier: 'interventional', title: 'Volumetric asymmetry correction',
                              body: 'Carefully placed HA filler on the smaller side can rebalance moderate volumetric facial asymmetry. Reversible.' },
};

// findingCode → list of suggestion ids per tier
const FINDING_TO_SUGGESTIONS = {
  // ---- Periorbital ----
  canthal_tilt_negative: {
    lifestyle:       ['lymphatic_massage', 'elevated_sleep', 'sleep_quality'],
    pharmacological: ['topical_tretinoin', 'caffeine_topical'],
    interventional:  ['lateral_canthopexy', 'lateral_canthoplasty'],
  },
  canthal_tilt_excess: {
    lifestyle:       ['lymphatic_massage', 'sleep_quality'],
    pharmacological: [],
    interventional:  ['lateral_canthopexy'],
  },
  scleral_show_inferior: {
    lifestyle:       ['elevated_sleep', 'sleep_quality'],
    pharmacological: ['caffeine_topical'],
    interventional:  ['lower_lid_retractor_release', 'spacer_graft', 'fat_transposition_lower'],
  },
  palpebral_fissure_narrow: {
    lifestyle:       ['lymphatic_massage', 'elevated_sleep'],
    pharmacological: ['caffeine_topical', 'topical_peptides'],
    interventional:  ['lower_lid_retractor_release'],
  },
  ipd_atypical: {
    lifestyle:       [],
    pharmacological: [],
    interventional:  [],
  },

  // ---- Mandibular ----
  gonial_angle_obtuse: {
    lifestyle:       ['mastic_chewing', 'weight_optimisation', 'posture_neck'],
    pharmacological: [],
    interventional:  ['mandibular_angle_implant', 'jawline_filler'],
  },
  gonial_angle_acute: {
    lifestyle:       ['posture_neck'],
    pharmacological: [],
    interventional:  ['masseter_botox'],
  },
  lower_face_wide: {
    lifestyle:       ['weight_optimisation', 'unilateral_chew_avoid'],
    pharmacological: [],
    interventional:  ['masseter_botox'],
  },
  lower_face_narrow: {
    lifestyle:       ['mastic_chewing'],
    pharmacological: [],
    interventional:  ['jawline_filler', 'mandibular_angle_implant'],
  },
  chin_recessed: {
    lifestyle:       ['posture_neck'],
    pharmacological: [],
    interventional:  ['chin_filler', 'genioplasty'],
  },
  chin_excess: {
    lifestyle:       [],
    pharmacological: [],
    interventional:  ['genioplasty'],
  },

  // ---- Midface ----
  bitemporal_narrow: {
    lifestyle:       [],
    pharmacological: ['topical_tretinoin'],
    interventional:  ['deep_cheek_filler'],
  },
  bitemporal_wide: {
    lifestyle:       ['weight_optimisation'],
    pharmacological: [],
    interventional:  [],
  },
  midface_flat: {
    lifestyle:       ['daily_spf', 'smoking_cessation'],
    pharmacological: ['topical_tretinoin', 'topical_peptides'],
    interventional:  ['malar_implant', 'deep_cheek_filler'],
  },

  // ---- Nose ----
  alar_wide: {
    lifestyle:       [],
    pharmacological: [],
    interventional:  ['rhinoplasty_consult'],
  },
  nasolabial_acute: {
    lifestyle:       [],
    pharmacological: [],
    interventional:  ['rhinoplasty_consult'],
  },
  nasolabial_obtuse: {
    lifestyle:       [],
    pharmacological: [],
    interventional:  ['rhinoplasty_consult'],
  },

  // ---- Brow ----
  brow_low: {
    lifestyle:       ['sleep_quality'],
    pharmacological: ['topical_peptides'],
    interventional:  ['brow_botox', 'brow_lift'],
  },
  brow_high: {
    lifestyle:       [],
    pharmacological: [],
    interventional:  [],
  },
  brow_apex_misplaced: {
    lifestyle:       [],
    pharmacological: ['topical_peptides'],
    interventional:  ['brow_botox'],
  },

  // ---- Symmetry ----
  thirds_uneven: {
    lifestyle:       ['posture_neck', 'sleep_side_rotation'],
    pharmacological: ['topical_tretinoin'],
    interventional:  [],
  },
  fifths_uneven: {
    lifestyle:       ['posture_neck'],
    pharmacological: [],
    interventional:  ['asymmetric_filler'],
  },
  asymmetry_elevated: {
    lifestyle:       ['sleep_side_rotation', 'unilateral_chew_avoid', 'posture_neck'],
    pharmacological: [],
    interventional:  ['asymmetric_filler'],
  },
};

const PROCEDURAL_DISCLAIMER =
  'Surgical and injectable procedures carry real risk. Discuss with a board-certified plastic surgeon or dermatologist before pursuing any procedural option.';

/**
 * Resolve a list of findings into the unioned suggestion bundle.
 * - Deduplicates suggestion ids
 * - Caps each tier at `perTierCap` items (default 6) to keep the UI tidy
 * - Preserves severity order (most severe findings get their suggestions first)
 */
function recommendInterventions(findings, { perTierCap = 6 } = {}) {
  const lifestyle = [];
  const pharmacological = [];
  const interventional = [];
  const seen = { lifestyle: new Set(), pharmacological: new Set(), interventional: new Set() };

  const append = (tier, id) => {
    const bucket =
      tier === 'lifestyle' ? lifestyle :
      tier === 'pharmacological' ? pharmacological :
      interventional;
    if (seen[tier].has(id) || bucket.length >= perTierCap) return;
    const suggestion = SUGGESTIONS[id];
    if (!suggestion) return;
    seen[tier].add(id);
    bucket.push({ id, ...suggestion });
  };

  for (const f of (findings || [])) {
    const map = FINDING_TO_SUGGESTIONS[f.findingCode];
    if (!map) continue;
    for (const id of map.lifestyle || [])       append('lifestyle', id);
    for (const id of map.pharmacological || []) append('pharmacological', id);
    for (const id of map.interventional || [])  append('interventional', id);
  }

  return {
    lifestyle,
    pharmacological,
    interventional,
    procedural_disclaimer: PROCEDURAL_DISCLAIMER,
  };
}

module.exports = {
  recommendInterventions,
  SUGGESTIONS,
  FINDING_TO_SUGGESTIONS,
  PROCEDURAL_DISCLAIMER,
};
