import { FACET_SIGNAL_ROUTE, GLOW_FACETS, facetValues, type GlowFacetKey } from '../facets';
import type { CompositeSignals } from '../../services/skinInsights';

describe('FACET_SIGNAL_ROUTE', () => {
  it('maps each Glow facet to its underlying signal route key', () => {
    expect(FACET_SIGNAL_ROUTE.hydrated).toBe('hydration');
    expect(FACET_SIGNAL_ROUTE.calm).toBe('inflammation');
    expect(FACET_SIGNAL_ROUTE.even).toBe('sun_damage');
    expect(FACET_SIGNAL_ROUTE.firm).toBe('structure');
  });

  it('covers every GLOW_FACETS key with no gaps', () => {
    const facetKeys = GLOW_FACETS.map((f) => f.key).sort();
    const routeKeys = (Object.keys(FACET_SIGNAL_ROUTE) as GlowFacetKey[]).sort();
    expect(routeKeys).toEqual(facetKeys);

    for (const f of GLOW_FACETS) {
      expect(FACET_SIGNAL_ROUTE[f.key]).toBeDefined();
    }
  });

  it('only routes to signals the detail page understands', () => {
    const allowed = ['hydration', 'inflammation', 'sun_damage', 'structure'];
    for (const route of Object.values(FACET_SIGNAL_ROUTE)) {
      expect(allowed).toContain(route);
    }
  });
});

describe('facetValues', () => {
  // sunDamage and elasticity deliberately differ so an averaging bug (the old
  // even = round((sunDamage + elasticity) / 2)) is distinguishable from the
  // fixed rule (even = the sunDamage signal alone).
  const signals: CompositeSignals = {
    structure: 71,
    hydration: 64,
    inflammation: 82,
    sunDamage: 58,
    elasticity: 90,
  };

  it('maps even to the sunDamage signal alone, matching the sun_damage detail hero', () => {
    // Regression guard: even must equal sunDamage, NOT avg(sunDamage, elasticity) (= 74).
    expect(facetValues(signals).even).toBe(58);
  });

  it('keeps the other three facets on their source signals', () => {
    const v = facetValues(signals);
    expect(v.hydrated).toBe(signals.hydration);
    expect(v.calm).toBe(signals.inflammation);
    expect(v.firm).toBe(signals.structure);
  });

  it('returns all-null facets when there is no reading', () => {
    expect(facetValues(null)).toEqual({ hydrated: null, calm: null, even: null, firm: null });
  });
});
