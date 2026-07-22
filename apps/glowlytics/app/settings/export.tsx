import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  Intro,
  IntroAccent,
  ListGroup,
  PrimaryButton,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';
import { useStore } from '../../src/store/useStore';
import type { ModelOutput, ProductEntry, UserProfile } from '../../src/types';

const P = Glow.palette;

const stripProfileInternals = (profile: UserProfile | null) => {
  if (!profile) return null;
  const { user_id: _userId, ...exportableProfile } = profile;
  return exportableProfile;
};

const summarizeModelOutput = (output: ModelOutput) => ({
  output_id: output.output_id,
  daily_id: output.daily_id,
  acne_score: output.acne_score,
  sun_damage_score: output.sun_damage_score,
  skin_age_score: output.skin_age_score,
  confidence: output.confidence,
  primary_driver: output.primary_driver,
  recommended_action: output.recommended_action,
  escalation_flag: output.escalation_flag,
  signal_scores: output.signal_scores,
  generated_insights: output.generated_insights,
  bone_harmony: output.bone_structure?.harmony ?? null,
  bone_status: output.bone_structure?.status ?? null,
});

const stripProductInternals = (product: ProductEntry) => {
  const { user_id: _userId, ...exportableProduct } = product;
  return exportableProduct;
};

export default function ExportScreen() {
  const user = useStore((s) => s.user);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const products = useStore((s) => s.products);
  const ritualCompletions = useStore((s) => s.ritualCompletions);
  const patterns = useStore((s) => s.patterns);

  const handleShareExport = async () => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing unavailable', 'This device cannot open the system share sheet.');
        return;
      }

      const exportedAt = new Date().toISOString();
      const payload = {
        exported_at: exportedAt,
        profile: stripProfileInternals(user),
        dailyRecords,
        modelOutputs: modelOutputs.map(summarizeModelOutput),
        products: products.map(stripProductInternals),
        ritualCompletions,
        patterns,
      };
      const safeStamp = exportedAt.replace(/[:.]/g, '-');
      const uri = `${FileSystemLegacy.documentDirectory}glowlytics-export-${safeStamp}.json`;
      await FileSystemLegacy.writeAsStringAsync(uri, JSON.stringify(payload, null, 2), {
        encoding: FileSystemLegacy.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'Share your Glowlytics export',
      });
    } catch {
      Alert.alert('Export failed', 'Unable to prepare your data export. Please try again.');
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Export your data" />
      <Intro>
        Share a JSON copy of your saved Glowlytics data. <IntroAccent>It's yours.</IntroAccent>
      </Intro>

      <SectionLabel>Included data</SectionLabel>
      <ListGroup>
        <Row label="Profile" value={user ? '1' : 'None'} sub="Preferences without internal account id" />
        <Row label="Scan records" value={String(dailyRecords.length)} sub="Daily scanner readings" />
        <Row label="Analysis summaries" value={String(modelOutputs.length)} sub="Scores, insights, and Harmony summary" />
        <Row label="Products" value={String(products.length)} sub="Your skincare shelf" />
        <Row label="Ritual completions" value={String(Object.keys(ritualCompletions).length)} sub="Days with saved routine steps" />
        <Row label="Patterns" value={String(patterns.length)} sub="Detected correlations" />
      </ListGroup>

      <View style={styles.footer}>
        <PrimaryButton label="Share JSON export" onPress={handleShareExport} />
        <Text style={styles.footnote}>Photos are not bundled; the export contains saved app data only.</Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: 8,
  },
  footnote: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    textAlign: 'center',
  },
});
