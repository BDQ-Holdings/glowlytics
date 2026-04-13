import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { AtmosphereScreen } from '../../src/components/AtmosphereScreen';
import { Button } from '../../src/components/Button';
import { ScoreTile } from '../../src/components/ScoreTile';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  Surfaces,
} from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import { gateWithPaywall } from '../../src/services/subscription';
import { trackEvent } from '../../src/services/analytics';
import { buildReportHtml, type ReportHtmlData } from '../../src/services/reportHtml';

type TimeRange = 7 | 14 | 30;

const average = (values: number[]) => {
  const valid = values.filter(Number.isFinite);
  return valid.length > 0
    ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
    : 0;
};

const trend = (values: number[]) => {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return 0;
  return valid[valid.length - 1] - valid[0];
};

export default function GenerateReport() {
  const router = useRouter();
  const subscription = useStore((s) => s.subscription);
  const user = useStore((s) => s.user);

  useEffect(() => {
    if (!subscription.is_active) {
      (async () => {
        const allowed = await gateWithPaywall();
        if (!allowed) router.back();
      })();
    }
  }, []);

  useEffect(() => {
    trackEvent('report_viewed', { time_range: timeRange });
  }, []);

  const protocol = useStore((s) => s.protocol);
  const products = useStore((s) => s.products);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);

  const [timeRange, setTimeRange] = useState<TimeRange>(14);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - timeRange);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const filteredRecords = dailyRecords.filter((record) => record.date >= cutoffStr);
  const filteredIds = new Set(filteredRecords.map((record) => record.daily_id));
  const filteredOutputs = modelOutputs.filter((output) => filteredIds.has(output.daily_id));

  const totalScans = filteredRecords.length;
  const sunscreenDays = filteredRecords.filter((record) => record.sunscreen_used).length;
  const sunscreenRate = totalScans > 0 ? Math.round((sunscreenDays / totalScans) * 100) : 0;
  const passCount = filteredRecords.filter((record) => record.scanner_quality_flag === 'pass').length;
  const confidenceRate = totalScans > 0 ? Math.round((passCount / totalScans) * 100) : 0;

  const acneScores = filteredOutputs.map((output) => output.acne_score);
  const sunScores = filteredOutputs.map((output) => output.sun_damage_score);
  const ageScores = filteredOutputs.map((output) => output.skin_age_score);

  const dateTo = new Date().toISOString().split('T')[0];

  const prepareReportData = async (): Promise<ReportHtmlData> => {
    const recordsWithPhotos = filteredRecords.filter((r) => r.photo_uri);
    const selected: typeof recordsWithPhotos = [];
    if (recordsWithPhotos.length > 0) {
      selected.push(recordsWithPhotos[0]);
      if (recordsWithPhotos.length >= 3) {
        selected.push(recordsWithPhotos[Math.floor(recordsWithPhotos.length / 2)]);
      }
      if (recordsWithPhotos.length >= 2) {
        selected.push(recordsWithPhotos[recordsWithPhotos.length - 1]);
      }
    }

    const photos: { date: string; base64: string }[] = [];
    for (const record of selected) {
      try {
        const base64 = await FileSystemLegacy.readAsStringAsync(record.photo_uri!, { encoding: FileSystemLegacy.EncodingType.Base64 });
        photos.push({ date: record.date, base64 });
      } catch {
        // Skip photos that can't be read
      }
    }

    return {
      timeRange,
      dateFrom: cutoffStr,
      dateTo,
      ageRange: user?.age_range || 'N/A',
      locationCoarse: user?.location_coarse || 'N/A',
      scanRegion: protocol?.scan_region?.replace(/_/g, ' ') || 'N/A',
      totalScans,
      confidenceRate,
      acneAvg: average(acneScores),
      acneDelta: trend(acneScores),
      acneScores,
      sunAvg: average(sunScores),
      sunDelta: trend(sunScores),
      sunScores,
      ageAvg: average(ageScores),
      ageDelta: trend(ageScores),
      ageScores,
      photos,
      products: products.map((p) => ({
        name: p.product_name,
        ingredients: p.ingredients_list.join(', '),
        schedule: p.usage_schedule,
        startDate: p.start_date,
      })),
      sunscreenRate,
      sunscreenDays,
      totalSunscreenDays: totalScans,
      periodApplicable: user?.period_applicable === 'yes',
      cycleLengthDays: user?.cycle_length_days,
      hasSleepContext: filteredRecords.some((r) => r.sleep_quality),
      generatedDate: dateTo,
    };
  };

  const generatePdfFile = async (): Promise<string> => {
    const reportData = await prepareReportData();
    const html = buildReportHtml(reportData);
    const { uri } = await Print.printToFileAsync({ html });
    const filename = `Glowlytics-Report-${dateTo}.pdf`;
    const newUri = `${FileSystemLegacy.documentDirectory}${filename}`;
    await FileSystemLegacy.moveAsync({ from: uri, to: newUri });
    return newUri;
  };

  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const pdfUri = await generatePdfFile();
      await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      trackEvent('report_exported', { time_range: timeRange, total_scans: totalScans, has_photos: filteredRecords.some((r) => r.photo_uri) });
    } catch {
      Alert.alert('Export failed', 'Unable to generate or share the PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShareEmail = async () => {
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      Alert.alert('No email configured', 'Please set up an email account on this device first.');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const pdfUri = await generatePdfFile();
      await MailComposer.composeAsync({
        subject: `Glowlytics Skin Report - ${cutoffStr} to ${dateTo}`,
        body: `Please find attached the Glowlytics clinician report covering ${cutoffStr} to ${dateTo} (${totalScans} scans).`,
        attachments: [pdfUri],
      });
      trackEvent('report_shared_email', { time_range: timeRange, total_scans: totalScans, has_photos: filteredRecords.some((r) => r.photo_uri) });
    } catch {
      Alert.alert('Share failed', 'Unable to generate the PDF or open email. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (totalScans === 0) {
    return (
      <AtmosphereScreen scroll={false} contentContainerStyle={styles.emptyLayout}>
        <View style={styles.emptyContent}>
          <Text style={styles.eyebrow}>SHARE REPORT</Text>
          <Text style={styles.title}>No scans yet.</Text>
          <Text style={styles.emptySubtitle}>
            Take a few scans first so the report has enough signal to be credible.
          </Text>
        </View>
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </AtmosphereScreen>
    );
  }

  return (
    <AtmosphereScreen>
      {/* ── Header + Time Range ── */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <Text style={styles.eyebrow}>SHARE REPORT</Text>
        <Text style={styles.title}>Package your trend story.</Text>
        <Text style={styles.subtitle}>
          Choose a time window, review the summary, and generate a clinician-facing preview.
        </Text>
        <View style={styles.segmentedControl}>
          {([7, 14, 30] as TimeRange[]).map((range) => (
            <TouchableOpacity
              key={range}
              style={[styles.segmentButton, timeRange === range && styles.segmentButtonActive]}
              onPress={() => setTimeRange(range)}
            >
              <Text style={[styles.segmentText, timeRange === range && styles.segmentTextActive]}>
                {range}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* ── Export Snapshot — hero card ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.snapshotCard}>
        <Text style={styles.snapshotEyebrow}>EXPORT SNAPSHOT</Text>
        <Text style={styles.snapshotHeadline}>
          {totalScans} scan{totalScans !== 1 ? 's' : ''} ready to summarize.
        </Text>
        <Text style={styles.snapshotBody}>
          Sunscreen adherence is {sunscreenRate}% and capture quality passed {confidenceRate}% of the time.
        </Text>
        <View style={styles.snapshotStats}>
          <View style={[styles.snapshotStat, { backgroundColor: 'rgba(52, 167, 123, 0.08)' }]}>
            <Text style={[styles.snapshotStatValue, { color: Colors.success }]}>{sunscreenRate}%</Text>
            <Text style={[styles.snapshotStatLabel, { color: Colors.success }]}>ADHERENCE</Text>
          </View>
          <View style={[styles.snapshotStat, { backgroundColor: 'rgba(90, 170, 230, 0.08)' }]}>
            <Text style={[styles.snapshotStatValue, { color: '#5AAAE6' }]}>{confidenceRate}%</Text>
            <Text style={[styles.snapshotStatLabel, { color: '#5AAAE6' }]}>QUALITY</Text>
          </View>
          <View style={styles.snapshotStat}>
            <Text style={styles.snapshotStatValue}>{timeRange}d</Text>
            <Text style={styles.snapshotStatLabel}>WINDOW</Text>
          </View>
        </View>
      </Animated.View>

      {/* ── Generate button — prominent, early ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.generateAction}>
        <Button
          title="Generate preview"
          onPress={handleExportPdf}
          loading={isGeneratingPdf}
          disabled={isGeneratingPdf}
          size="lg"
        />
      </Animated.View>

      {/* ── Trend Snapshot ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(300)}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: Colors.primary }]} />
          <Text style={styles.sectionTitle}>Trend snapshot</Text>
        </View>
        <View style={styles.metricStack}>
          <ScoreTile
            label="Acne trend"
            score={average(acneScores)}
            delta={trend(acneScores)}
            color={Colors.acne}
            sparklineData={acneScores}
            compact
            lowLabel="Start"
            highLabel="Now"
          />
          <ScoreTile
            label="Sun trend"
            score={average(sunScores)}
            delta={trend(sunScores)}
            color={Colors.sunDamage}
            sparklineData={sunScores}
            compact
            lowLabel="Start"
            highLabel="Now"
          />
          <ScoreTile
            label="Age trend"
            score={average(ageScores)}
            delta={trend(ageScores)}
            color={Colors.skinAge}
            sparklineData={ageScores}
            compact
            lowLabel="Start"
            highLabel="Now"
          />
        </View>
      </Animated.View>

      {/* ── Photos ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(400)}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: '#5AAAE6' }]} />
          <Text style={styles.sectionTitle}>Representative photos</Text>
        </View>
        {(() => {
          const recordsWithPhotos = filteredRecords.filter((r) => r.photo_uri);
          if (recordsWithPhotos.length === 0) {
            return <Text style={styles.bodyText}>No photos captured in this period.</Text>;
          }
          const selected: typeof recordsWithPhotos = [];
          selected.push(recordsWithPhotos[0]);
          if (recordsWithPhotos.length >= 3) {
            selected.push(recordsWithPhotos[Math.floor(recordsWithPhotos.length / 2)]);
          }
          if (recordsWithPhotos.length >= 2) {
            selected.push(recordsWithPhotos[recordsWithPhotos.length - 1]);
          }
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {selected.map((record) => (
                <View key={record.daily_id} style={styles.photoCard}>
                  <Image source={{ uri: record.photo_uri }} style={styles.photoImage} />
                  <Text style={styles.photoDate}>{record.date}</Text>
                </View>
              ))}
            </ScrollView>
          );
        })()}
      </Animated.View>

      {/* ── Products ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(500)}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: '#9B7FDB' }]} />
          <Text style={styles.sectionTitle}>Products used</Text>
        </View>
        {products.length > 0 ? (
          <View style={styles.productList}>
            {products.map((product) => (
              <View key={product.user_product_id} style={styles.productRow}>
                <Text style={styles.productName}>{product.product_name}</Text>
                <Text style={styles.productDetail}>
                  {product.usage_schedule} · Since {product.start_date}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>No products logged.</Text>
        )}
      </Animated.View>

      {/* ── Context ── */}
      <Animated.View entering={FadeIn.duration(300).delay(600)} style={styles.contextSection}>
        <Text style={styles.contextTitle}>Patient context</Text>
        <View style={styles.contextGrid}>
          {user?.age_range && (
            <View style={styles.contextItem}>
              <Feather name="user" size={12} color={Colors.primary} />
              <Text style={styles.contextText}>{user.age_range}</Text>
            </View>
          )}
          {user?.location_coarse && (
            <View style={styles.contextItem}>
              <Feather name="map-pin" size={12} color={Colors.primary} />
              <Text style={styles.contextText}>{user.location_coarse}</Text>
            </View>
          )}
          {protocol?.scan_region && (
            <View style={styles.contextItem}>
              <Feather name="target" size={12} color={Colors.primary} />
              <Text style={styles.contextText}>{protocol.scan_region.replace(/_/g, ' ')}</Text>
            </View>
          )}
          {user?.period_applicable === 'yes' && user.cycle_length_days && (
            <View style={styles.contextItem}>
              <Feather name="calendar" size={12} color={Colors.primary} />
              <Text style={styles.contextText}>{user.cycle_length_days}d cycle</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* ── Secondary actions ── */}
      <Animated.View entering={FadeIn.duration(300).delay(700)} style={styles.secondaryActions}>
        <TouchableOpacity style={styles.emailButton} onPress={handleShareEmail} disabled={isGeneratingPdf}>
          <Feather name="mail" size={16} color={Colors.primaryLight} />
          <Text style={styles.emailButtonText}>Share via email</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Disclaimer ── */}
      <Text style={styles.disclaimer}>
        Non-diagnostic metrics for clinician interpretation. Generated by Glowlytics on {dateTo}.
      </Text>
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  emptyLayout: {
    justifyContent: 'space-between',
  },
  emptyContent: {
    gap: Spacing.sm,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
    maxWidth: '85%',
  },

  // Header
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.hero,
    lineHeight: 44,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xs,
    marginTop: Spacing.xs,
  },
  segmentButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  segmentTextActive: {
    color: Colors.backgroundRaised,
  },

  // Snapshot hero card
  snapshotCard: {
    ...Surfaces.hero,
    padding: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  snapshotEyebrow: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 1.4,
  },
  snapshotHeadline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
  },
  snapshotBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  snapshotStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  snapshotStat: {
    flex: 1,
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  snapshotStatValue: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  snapshotStatLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 8,
    letterSpacing: 1,
  },

  // Generate action
  generateAction: {
    marginBottom: Spacing.xl,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  sectionTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  bodyText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Metrics
  metricStack: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  // Photos
  photoRow: {
    flexDirection: 'row',
  },
  photoCard: {
    alignItems: 'center',
    marginRight: Spacing.md,
    gap: Spacing.xs,
  },
  photoImage: {
    width: 100,
    height: 130,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoDate: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },

  // Products — clean list, no card
  productList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  productName: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  productDetail: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },

  // Context — recessed, compact
  contextSection: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  contextTitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  contextGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  contextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contextText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },

  // Secondary actions
  secondaryActions: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  emailButtonText: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },

  // Disclaimer
  disclaimer: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
});
