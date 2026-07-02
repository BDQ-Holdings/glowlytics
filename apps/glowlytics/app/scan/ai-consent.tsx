import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../src/components/Button';
import { PRIVACY_POLICY_URL } from '../../src/constants/externalLinks';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';

const P = Glow.palette;

const DISCLOSURE_ITEMS = [
  'Your captured skin scan photo, which may include your face.',
  'Your skin-analysis scores, recent scan history, and the skin goals or context you entered.',
  'Limited Apple Health summaries only if you connected Health and they are relevant to the scan insight.',
];

export default function AiConsentScreen() {
  const router = useRouter();
  const setAiProcessingConsentGranted = useStore((s) => s.setAiProcessingConsentGranted);

  const grantConsent = () => {
    setAiProcessingConsentGranted(true);
    router.replace('/scan/camera');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Feather name="shield" size={24} color={P.accent} />
        </View>

        <Text style={styles.eyebrow}>Before your scan</Text>
        <Text style={styles.title}>Allow AI processing for this skin analysis?</Text>
        <Text style={styles.body}>
          Glowlytics sends scan data to our secure backend and OpenAI so the app can generate your
          skin scores, explanations, and recommendations. We need your permission before sharing this
          personal data with OpenAI.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data sent to OpenAI</Text>
          {DISCLOSURE_ITEMS.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Who receives it</Text>
          <Text style={styles.bodySmall}>
            OpenAI receives the data only through our API integration for AI-powered skin analysis.
            OpenAI does not receive your live face-mesh alignment data, and API data is not used for
            OpenAI model training under our API agreement.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>If you do not allow</Text>
          <Text style={styles.bodySmall}>
            Glowlytics will not start a scan that uploads your personal scan data to OpenAI. You can
            review our Privacy Policy before deciding.
          </Text>
        </View>

        <Button title="I allow AI processing" onPress={grantConsent} size="lg" />
        <Button title="Not now" onPress={() => router.back()} variant="ghost" size="md" />
        <Text
          accessibilityRole="link"
          style={styles.policyLink}
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
        >
          Read Privacy Policy
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: P.bg,
  },
  content: {
    paddingTop: 72,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 48,
    gap: Spacing.md,
  },
  iconWrap: {
    alignSelf: 'flex-start',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: P.glow,
  },
  eyebrow: {
    color: P.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: P.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    color: P.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  bodySmall: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.divider,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: P.accent,
  },
  bulletText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  policyLink: {
    alignSelf: 'center',
    color: P.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
    textDecorationLine: 'underline',
  },
});
