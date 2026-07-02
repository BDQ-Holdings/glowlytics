import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  resolveMedicalSourceForText,
  resolveMedicalSourceLabel,
  resolveMedicalSourceUrl,
} from '../constants/externalLinks';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import type { RagRecommendation } from '../types';

interface ClinicalSourcesCardProps {
  recommendations?: RagRecommendation[] | null;
  title?: string;
  subtitle?: string;
  limit?: number;
}

interface ResolvedSource {
  citation: string;
  url: string | null;
}

export const ClinicalSourcesCard: React.FC<ClinicalSourcesCardProps> = ({
  recommendations,
  title = 'Clinical Sources',
  subtitle = 'These references anchor the medical guidance shown in Glowlytics.',
  limit = 6,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Only the sources actually cited by the recommendations shown to THIS user.
  const sources = useMemo<ResolvedSource[]>(() => {
    const deduped = new Map<string, ResolvedSource>();
    for (const rec of recommendations || []) {
      if (!rec) continue;
      let resolved: ResolvedSource | null = null;
      // 1) Explicit citation wins — preserve its verbatim label + linked url.
      if (rec.source_citation && rec.source_citation.trim().length > 0) {
        resolved = {
          citation: resolveMedicalSourceLabel(rec.source_citation),
          url: resolveMedicalSourceUrl(rec.source_citation),
        };
      } else {
        // 2) Fall back to the recommendation's own content.
        const match = resolveMedicalSourceForText(
          [rec.text, rec.category, rec.signal].filter(Boolean).join(' '),
        );
        if (match) resolved = { citation: match.label, url: match.url };
      }
      if (!resolved || deduped.has(resolved.citation)) continue;
      deduped.set(resolved.citation, resolved);
    }
    return Array.from(deduped.values()).slice(0, limit);
  }, [limit, recommendations]);

  // No recommendation-specific sources → one muted line, nothing to expand.
  if (sources.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <Feather name="book-open" size={14} color={Colors.textMuted} />
          <Text style={styles.emptyLabel} numberOfLines={1}>
            Standard clinical references
          </Text>
        </View>
      </View>
    );
  }

  const summaryLabel = `Sources (${sources.length})`;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${sources.length} references. ${expanded ? 'Expanded' : 'Collapsed'}.`}
        style={styles.summaryRow}
      >
        <Feather name="book-open" size={14} color={Colors.primary} />
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {summaryLabel}
        </Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.stack}>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {sources.map((item) => (
            <View key={item.citation} style={styles.sourceRow}>
              <Text style={styles.sourceCitation} numberOfLines={2}>
                {item.citation}
              </Text>
              {item.url ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(item.url!).catch(() => {})}
                  accessibilityRole="link"
                  accessibilityLabel={`Open source: ${item.citation}`}
                >
                  <Text style={styles.sourceLink}>Open source</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryLabel: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  emptyLabel: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
  stack: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sourceCitation: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  sourceLink: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
});
