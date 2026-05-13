import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { APPLE_STANDARD_EULA_URL, PRIVACY_POLICY_URL } from '../constants/externalLinks';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import type { PaywallPackageSummary } from '../services/subscription';

interface PaywallDisclosureProps {
  summary: PaywallPackageSummary | null;
  title?: string;
}

const formatPeriodLabel = (period?: string | null): string => {
  switch (period) {
    case 'P1W':
      return 'week';
    case 'P1M':
      return 'month';
    case 'P2M':
      return '2 months';
    case 'P3M':
      return '3 months';
    case 'P6M':
      return '6 months';
    case 'P1Y':
      return 'year';
    default:
      return 'billing period';
  }
};

export const PaywallDisclosure: React.FC<PaywallDisclosureProps> = ({
  summary,
  title = 'Glow Pro',
}) => {
  const periodLabel = formatPeriodLabel(summary?.subscriptionPeriod);
  const pricingLine = summary
    ? `${summary.priceString} per ${periodLabel}`
    : 'Auto-renewing subscription pricing appears below before purchase.';
  const monthlyEquivalent =
    summary?.pricePerMonthString && summary.subscriptionPeriod !== 'P1M'
      ? `${summary.pricePerMonthString} per month equivalent.`
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="shield" size={16} color={Colors.primary} />
        <Text style={styles.eyebrow}>Subscription</Text>
      </View>
      <Text style={styles.title}>{summary?.title || title}</Text>
      <Text style={styles.copy}>{pricingLine}</Text>
      {monthlyEquivalent ? <Text style={styles.copy}>{monthlyEquivalent}</Text> : null}
      <Text style={styles.detail}>
        Auto-renews unless canceled at least 24 hours before the end of the current period. Manage
        or cancel anytime in your App Store account settings.
      </Text>
      <View style={styles.linksRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel="Open privacy policy"
        >
          <Text style={styles.link}>Privacy Policy</Text>
        </TouchableOpacity>
        <Text style={styles.dot}>•</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => Linking.openURL(APPLE_STANDARD_EULA_URL).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel="Open terms of use and EULA"
        >
          <Text style={styles.link}>Terms of Use (EULA)</Text>
        </TouchableOpacity>
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
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  eyebrow: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  copy: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  detail: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  dot: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
  link: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
});
