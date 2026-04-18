import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AtmosphereScreen } from '../src/components/AtmosphereScreen';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../src/constants/theme';

const EFFECTIVE_DATE = 'March 19, 2026';
const CONTACT_EMAIL = 'drmustafa@bdqholdings.com';
const DOMAIN = 'glowlytics.ai';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={styles.dividerContainer}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export default function TermsAndPrivacyScreen() {
  const router = useRouter();

  return (
    <AtmosphereScreen>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.eyebrow}>Legal</Text>
          <Text style={styles.title}>Terms & Privacy</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Paragraph>
          Effective date: {EFFECTIVE_DATE}
        </Paragraph>
        <Paragraph>
          BDQ Holdings LLC ("we", "our", or "us") operates the Glowlytics mobile
          application ({DOMAIN}). This document contains both our Terms of Service
          and Privacy Policy. By downloading, installing, or using Glowlytics,
          you agree to be bound by these terms and our data practices described below.
        </Paragraph>
      </View>

      {/* ============================================================ */}
      {/* TERMS OF SERVICE                                              */}
      {/* ============================================================ */}

      <SectionDivider label="Terms of Service" />

      {/* 1. Acceptance */}
      <View style={styles.card}>
        <Section title="1. Acceptance of Terms">
          <Paragraph>
            By creating an account or using Glowlytics, you agree to these Terms
            of Service. If you do not agree, you must not use the app. We reserve
            the right to update these terms at any time. Continued use after
            changes constitutes acceptance.
          </Paragraph>
        </Section>
      </View>

      {/* 2. Service Description */}
      <View style={styles.card}>
        <Section title="2. Service Description">
          <Paragraph>
            Glowlytics is a skin health tracking application that uses artificial
            intelligence, including fine-tuned GPT-4o models and custom computer
            vision models, to analyze skin photos and track changes over time.
          </Paragraph>
          <Paragraph>
            Glowlytics is not a medical device and does not provide medical
            diagnoses. All analysis is for informational and educational purposes
            only. You should consult a qualified dermatologist or healthcare
            professional for any medical concerns about your skin.
          </Paragraph>
        </Section>
      </View>

      {/* 3. Accounts */}
      <View style={styles.card}>
        <Section title="3. User Accounts">
          <Paragraph>
            You must create an account to use Glowlytics. Authentication is
            provided by Clerk, a third-party identity provider. You are
            responsible for maintaining the confidentiality of your account
            credentials and for all activity under your account.
          </Paragraph>
          <BulletList
            items={[
              'You must provide accurate information when creating your account.',
              'You must be at least 13 years of age to use Glowlytics.',
              'You may not share or transfer your account to another person.',
              'We reserve the right to suspend or terminate accounts that violate these terms.',
            ]}
          />
        </Section>
      </View>

      {/* 4. Subscriptions */}
      <View style={styles.card}>
        <Section title="4. Subscriptions and Billing">
          <Paragraph>
            Glowlytics offers a premium subscription ("Glow Pro") managed
            through RevenueCat and the Apple App Store / Google Play Store.
          </Paragraph>
          <BulletList
            items={[
              'Free trial: new users receive a 7-day free trial of Glow Pro features.',
              'After the trial period, a paid subscription is required to access premium features including unlimited scans and detailed reports.',
              'Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period.',
              'Cancellation and refunds are handled by the Apple App Store or Google Play Store per their respective policies.',
              'We do not directly process payments. All billing is handled by Apple or Google through RevenueCat.',
            ]}
          />
        </Section>
      </View>

      {/* 5. Acceptable Use */}
      <View style={styles.card}>
        <Section title="5. Acceptable Use">
          <Paragraph>
            You agree not to:
          </Paragraph>
          <BulletList
            items={[
              'Use Glowlytics for any unlawful purpose or in violation of any applicable law.',
              'Attempt to reverse engineer, decompile, or disassemble the app or its AI models.',
              'Upload photos of other individuals without their consent.',
              'Attempt to circumvent subscription requirements, trial limitations, or security measures.',
              'Use the app to generate content that is harmful, misleading, or defamatory.',
              'Interfere with or disrupt the app or its backend services.',
            ]}
          />
        </Section>
      </View>

      {/* 6. Intellectual Property */}
      <View style={styles.card}>
        <Section title="6. Intellectual Property">
          <Paragraph>
            All content, features, functionality, AI models, algorithms, and
            design elements of Glowlytics are owned by BDQ Holdings LLC and are
            protected by copyright, trademark, and other intellectual property
            laws.
          </Paragraph>
          <Paragraph>
            You retain ownership of the photos you capture through the app. By
            using Glowlytics, you grant us a limited license to process your
            photos solely for the purpose of providing skin analysis services.
          </Paragraph>
        </Section>
      </View>

      {/* 7. Disclaimers */}
      <View style={styles.card}>
        <Section title="7. Disclaimers and Limitation of Liability">
          <Paragraph>
            Glowlytics is provided "as is" and "as available" without warranties
            of any kind, whether express or implied.
          </Paragraph>
          <BulletList
            items={[
              'AI-generated skin analysis is not a substitute for professional medical advice, diagnosis, or treatment.',
              'We do not guarantee the accuracy, completeness, or reliability of any analysis results.',
              'We are not liable for any health decisions made based on information provided by the app.',
              'To the maximum extent permitted by law, BDQ Holdings LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages.',
              'Our total liability shall not exceed the amount you have paid for the service in the 12 months preceding the claim.',
            ]}
          />
        </Section>
      </View>

      {/* 8. Termination */}
      <View style={styles.card}>
        <Section title="8. Termination">
          <Paragraph>
            You may terminate your account at any time by contacting us at{' '}
            {CONTACT_EMAIL} or by using the "Reset all data" option in the app.
            We may terminate or suspend your account if you violate these terms.
          </Paragraph>
          <Paragraph>
            Upon termination, your right to use the app ceases immediately. Data
            deletion follows the retention policy described in our Privacy Policy
            below.
          </Paragraph>
        </Section>
      </View>

      {/* 9. Governing Law */}
      <View style={styles.card}>
        <Section title="9. Governing Law">
          <Paragraph>
            These Terms are governed by the laws of the State of Delaware,
            United States, without regard to conflict of law principles. Any
            disputes arising under these terms shall be resolved in the courts
            of Delaware.
          </Paragraph>
        </Section>
      </View>

      {/* ============================================================ */}
      {/* PRIVACY POLICY                                                */}
      {/* ============================================================ */}

      <SectionDivider label="Privacy Policy" />

      {/* 10. Introduction */}
      <View style={styles.card}>
        <Section title="10. Privacy Policy Introduction">
          <Paragraph>
            BDQ Holdings LLC ("we", "our", or "us") operates the Glowlytics
            mobile application. This Privacy Policy explains how we collect,
            use, store, and protect your personal information when you use our
            app.
          </Paragraph>
          <Paragraph>
            We are committed to GDPR and CCPA compliance. By using Glowlytics,
            you agree to the collection and use of information in accordance
            with this policy.
          </Paragraph>
        </Section>
      </View>

      {/* 11. Data We Collect */}
      <View style={styles.card}>
        <Section title="11. Information We Collect">
          <Paragraph>
            We collect the following categories of information to provide and
            improve our skin health tracking service:
          </Paragraph>
          <BulletList
            items={[
              'Account information: email address and authentication credentials managed through Clerk.',
              'Skin scan photos: images captured via your device camera during scans. Photos are processed on-device for real-time lesion detection and via our secure backend for full analysis. Photos are never shared with third parties.',
              'Health metrics: skin analysis scores, signal data (structure, hydration, inflammation, sun damage, elasticity), lesion detection results, and trend history.',
              'Daily check-in context: sunscreen use, new products, sleep quality, and stress level -- collected after each scan to personalize analysis.',
              'Product usage data: skincare products you add, ingredient lists, and usage schedules.',
              'Demographic information: age range, location (coarse), period tracking preference, and lifestyle factors you optionally provide during onboarding.',
              'Device information: device type, operating system, and app version for troubleshooting purposes.',
              'Anonymized usage analytics: collected via PostHog to understand how features are used and improve the app. This data is anonymized and cannot be used to identify you personally.',
            ]}
          />
        </Section>
      </View>

      {/* 12. How We Use Your Data */}
      <View style={styles.card}>
        <Section title="12. How We Use Your Data">
          <Paragraph>
            Your information is used exclusively to deliver and improve the
            Glowlytics experience:
          </Paragraph>
          <BulletList
            items={[
              'Skin analysis: processing scan photos through our 3-layer AI pipeline (on-device processing, custom computer vision models, and fine-tuned GPT-4o) to generate skin health scores.',
              'Trend tracking: comparing daily scans against your baseline to monitor changes in skin health signals over time.',
              'Personalized recommendations: tailoring product effectiveness scores and skin care insights based on your skin profile, goals, and AAD/ACOG medical guidelines (via our RAG pipeline).',
              'Service improvement: aggregated, anonymized usage patterns (via PostHog) help us improve the app experience.',
            ]}
          />
          <Paragraph>
            We do not sell your personal data to third parties. We do not use
            your data for advertising purposes.
          </Paragraph>
        </Section>
      </View>

      {/* 13. AI Processing */}
      <View style={styles.card}>
        <Section title="13. AI and Automated Processing">
          <Paragraph>
            Glowlytics uses artificial intelligence to analyze your skin photos.
            It is important to understand:
          </Paragraph>
          <BulletList
            items={[
              'On-device processing: real-time lesion detection runs directly on your device during camera alignment. This data does not leave your phone.',
              'Backend AI processing: photos are sent to our secure backend where they are analyzed by custom ONNX computer vision models and a fine-tuned GPT-4o model.',
              'AI analysis is NOT a medical diagnosis. Results are informational only and should never replace professional dermatological advice.',
              'Photos sent to OpenAI for analysis are processed under our API agreement and are not stored or used for model training by OpenAI.',
              'All AI-generated scores represent algorithmic assessments, not clinical evaluations.',
            ]}
          />
        </Section>
      </View>

      {/* 14. Data Storage */}
      <View style={styles.card}>
        <Section title="14. Data Storage and Security">
          <Paragraph>
            Your data is stored in two locations:
          </Paragraph>
          <BulletList
            items={[
              'Local device storage: scan photos, analysis results, and user preferences are stored on your device using secure local storage (AsyncStorage).',
              'Encrypted backend: account data and scan history are synced to our secure PostgreSQL database, encrypted in transit (TLS) and at rest.',
            ]}
          />
          <Paragraph>
            We implement industry-standard security measures including CORS
            restrictions, rate limiting on public endpoints, JWT-based
            authentication via Clerk, and server-side authorization checks to
            protect your data against unauthorized access.
          </Paragraph>
        </Section>
      </View>

      {/* 15. Third-Party Services */}
      <View style={styles.card}>
        <Section title="15. Third-Party Services">
          <Paragraph>
            Glowlytics integrates with the following third-party services, each
            bound by their own privacy policies:
          </Paragraph>
          <BulletList
            items={[
              'Clerk (authentication): manages user sign-up, sign-in, and session tokens. Processes your email address and authentication credentials.',
              'OpenAI (vision analysis): scan photos are sent to OpenAI\'s API for AI-powered skin analysis. Photos are not stored or used for training by OpenAI per our API data usage agreement.',
              'RevenueCat (subscriptions): manages subscription state, free trial periods, and purchase verification. Processes your subscription status and purchase history. Does not receive your photos or health data.',
              'PostHog (analytics): collects anonymized, aggregated usage data to help us understand feature adoption and improve the app. PostHog does not receive your photos, health data, or personally identifiable information.',
              'Pinecone (RAG pipeline): stores anonymized medical guideline embeddings (AAD/ACOG) for generating evidence-based recommendations. Does not store or process your personal data.',
            ]}
          />
          <Paragraph>
            No third-party service receives your scan photos for marketing,
            advertising, or model training purposes.
          </Paragraph>
        </Section>
      </View>

      {/* 16. User Rights */}
      <View style={styles.card}>
        <Section title="16. Your Rights (GDPR / CCPA)">
          <Paragraph>
            Depending on your jurisdiction, you have the following rights
            regarding your personal data:
          </Paragraph>
          <BulletList
            items={[
              'Right to access: request a copy of the personal data we hold about you.',
              'Right to deletion: request that we delete all personal data associated with your account.',
              'Right to portability: request your data in a structured, machine-readable format.',
              'Right to rectification: request correction of inaccurate personal data.',
              'Right to restrict processing: request that we limit how we use your data.',
              'Right to object: object to processing of your personal data for specific purposes.',
              'Right to opt out of sale: we do not sell personal data, but you may exercise this right at any time.',
            ]}
          />
          <Paragraph>
            To exercise any of these rights, contact us at {CONTACT_EMAIL}. We
            will respond within 30 days.
          </Paragraph>
        </Section>
      </View>

      {/* 17. Data Retention */}
      <View style={styles.card}>
        <Section title="17. Data Retention and Deletion">
          <Paragraph>
            We retain your data for as long as your account is active. You can
            delete all of your data at any time through the Profile screen in the
            app by using the "Reset all data" option, or by contacting us at{' '}
            {CONTACT_EMAIL}.
          </Paragraph>
          <Paragraph>
            Upon account deletion, all associated data (scan photos, health
            metrics, product information, and account details) is permanently
            removed from our servers within 30 days.
          </Paragraph>
        </Section>
      </View>

      {/* 18. Camera and Photo Permissions */}
      <View style={styles.card}>
        <Section title="18. Camera and Photo Permissions">
          <Paragraph>
            Glowlytics requires camera access to perform skin scans. Photos
            captured during scans are:
          </Paragraph>
          <BulletList
            items={[
              'Processed on-device for real-time lesion detection during camera alignment.',
              'Stored locally on your device.',
              'Sent to our secure backend for AI-powered analysis (encrypted in transit via TLS).',
              'Never shared with third parties for marketing or advertising.',
              'Never posted publicly or made accessible to other users.',
            ]}
          />
          <Paragraph>
            You can revoke camera permissions at any time through your device
            settings. Without camera access, the scan feature will be unavailable.
          </Paragraph>
        </Section>
      </View>

      {/* 19. Health Data */}
      <View style={styles.card}>
        <Section title="19. Health Data Disclaimer">
          <Paragraph>
            Glowlytics provides skin health tracking for informational purposes
            only. Our analysis is non-diagnostic and should not be considered
            medical advice.
          </Paragraph>
          <BulletList
            items={[
              'Skin health scores and signals are generated using algorithmic analysis and AI (including fine-tuned GPT-4o and custom computer vision models), not clinical evaluation.',
              'Results are not a substitute for professional dermatological consultation.',
              'Recommendations are informed by AAD and ACOG guidelines but are not medical prescriptions.',
              'Health-related data (skin metrics, trends, lesion detections) is never shared with third parties, including insurance companies or employers.',
            ]}
          />
          <Paragraph>
            If you have concerns about a skin condition, please consult a
            qualified healthcare professional.
          </Paragraph>
        </Section>
      </View>

      {/* 20. Children's Privacy */}
      <View style={styles.card}>
        <Section title="20. Children's Privacy">
          <Paragraph>
            Glowlytics is not intended for use by individuals under the age of
            13. We do not knowingly collect personal information from children
            under 13. If we become aware that we have collected data from a child
            under 13, we will take steps to delete that information promptly.
          </Paragraph>
          <Paragraph>
            If you are a parent or guardian and believe your child has provided us
            with personal data, please contact us at {CONTACT_EMAIL}.
          </Paragraph>
        </Section>
      </View>

      {/* 21. Changes */}
      <View style={styles.card}>
        <Section title="21. Changes to These Terms">
          <Paragraph>
            We may update these Terms of Service and Privacy Policy from time to
            time. Changes will be posted within the app, and the "Effective date"
            at the top will be revised accordingly. Continued use of Glowlytics
            after changes constitutes acceptance of the updated terms.
          </Paragraph>
          <Paragraph>
            For material changes, we will provide prominent notice within the app
            or via email.
          </Paragraph>
        </Section>
      </View>

      {/* 22. Contact */}
      <View style={styles.card}>
        <Section title="22. Contact Information">
          <Paragraph>
            If you have questions or concerns about these Terms of Service,
            Privacy Policy, or our data practices, please contact us:
          </Paragraph>
          <BulletList
            items={[
              'Company: BDQ Holdings LLC',
              `Website: ${DOMAIN}`,
              `Email: ${CONTACT_EMAIL}`,
              'Subject line: Glowlytics Legal Inquiry',
            ]}
          />
          <TouchableOpacity
            style={styles.emailButton}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Glowlytics%20Legal%20Inquiry`)}
            activeOpacity={0.7}
          >
            <Feather name="mail" size={16} color={Colors.primaryLight} />
            <Text style={styles.emailButtonText}>Contact us</Text>
          </TouchableOpacity>
        </Section>
      </View>

      <View style={styles.footerSpacer} />
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    marginBottom: Spacing.xs,
  },
  paragraph: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
    marginBottom: Spacing.sm,
  },
  bulletList: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.primary,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderStrong,
  },
  dividerLabel: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    letterSpacing: 0.3,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.glassStrong,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  emailButtonText: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  footerSpacer: {
    height: Spacing.xl,
  },
});
