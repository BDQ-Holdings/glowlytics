import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { resolveMedicalSourceLabel, resolveMedicalSourceUrl } from '../constants/externalLinks';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import type { RagRecommendation } from '../types';

interface ClinicalSourcesCardProps {
  recommendations?: RagRecommendation[] | null;
  title?: string;
  subtitle?: string;
  limit?: number;
}

export const ClinicalSourcesCard: React.FC<ClinicalSourcesCardProps> = ({
  recommendations,
  title = 'Clinical Sources',
  subtitle = 'These references anchor the medical guidance shown in Glowlytics.',
  limit = 3,
}) => {
  const items = useMemo(() => {
    const deduped = new Map<string, { citation: string; text: string; url: string | null }>();

    for (const rec of recommendations || []) {
      const citation = resolveMedicalSourceLabel(rec?.source_citation);
      if (!rec?.source_citation || deduped.has(citation)) continue;

      deduped.set(citation, {
        citation,
        text: rec.text,
        url: resolveMedicalSourceUrl(rec.source_citation),
      });
    }

    return Array.from(deduped.values()).slice(0, limit);
  }, [limit, recommendations]);

  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="book-open" size={15} color={Colors.primary} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.stack}>
        {items.map((item) => (
          <View key={item.citation} style={styles.sourceRow}>
            <Text style={styles.sourceCitation}>{item.citation}</Text>
            <Text style={styles.sourceText} numberOfLines={3}>
              {item.text}
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
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  stack: {
    gap: Spacing.md,
  },
  sourceRow: {
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  sourceCitation: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sourceText: {
    color: Colors.text,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  sourceLink: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
});
