import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import { FontFamily, Glow } from '../../src/constants/theme';
import {
  Chip,
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;

const FEEDBACK_TYPES = ['Bug', 'Idea', 'Praise', 'Other'] as const;
const SUPPORT_EMAIL = 'hello@glowlytics.ai';

export default function HelpScreen() {
  const [type, setType] = useState<(typeof FEEDBACK_TYPES)[number]>('Idea');
  const [message, setMessage] = useState('');

  const composeFeedbackEmail = async (bodyOverride?: string) => {
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      Alert.alert('No email configured', 'Please set up an email account on this device first.');
      return;
    }
    await MailComposer.composeAsync({
      recipients: [SUPPORT_EMAIL],
      subject: `Glowlytics feedback: ${type}`,
      body: bodyOverride ?? message,
    });
  };

  const handleSendFeedback = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Feedback is empty', 'Write a note first so we know what to look at.');
      return;
    }
    try {
      await composeFeedbackEmail(trimmed);
    } catch {
      Alert.alert('Email failed', 'Unable to open your email composer. Please try again.');
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Help & feedback" />

      <View style={styles.helpIntro}>
        <Text style={styles.helpIntroTitle}>Need a hand?</Text>
        <Text style={styles.helpIntroBody}>
          Send a note from your configured email app and a person will reply.
        </Text>
      </View>

      <SectionLabel>Send feedback</SectionLabel>
      <View style={styles.feedbackWrap}>
        <View style={styles.feedbackCard}>
          <TextInput
            multiline
            value={message}
            onChangeText={setMessage}
            placeholder="Anything that's bugging you, surprising you, or you wish we'd build…"
            placeholderTextColor={P.muted}
            style={styles.feedbackInput}
            accessibilityLabel="Feedback message"
          />
          <View style={styles.feedbackFoot}>
            <View style={styles.chipRow}>
              {FEEDBACK_TYPES.map((t) => (
                <Chip key={t} soft active={type === t} onPress={() => setType(t)}>
                  {t}
                </Chip>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSendFeedback}
              accessibilityRole="button"
              accessibilityLabel="Send feedback"
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <SectionLabel>Reach a human</SectionLabel>
      <ListGroup>
        <Row
          label="Email a person"
          value={SUPPORT_EMAIL}
          sub="Usually within a day"
          onPress={() => {
            composeFeedbackEmail('').catch(() => {
              Alert.alert('Email failed', 'Unable to open your email composer. Please try again.');
            });
          }}
        />
      </ListGroup>

      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>
          All systems <Text style={styles.statusCalm}>calm</Text> · status.glowlytics.ai
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  helpIntro: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
  },
  helpIntroTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: P.ink,
  },
  helpIntroBody: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  feedbackWrap: {
    paddingHorizontal: 16,
  },
  feedbackCard: {
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 14,
    padding: 14,
  },
  feedbackInput: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    color: P.ink,
    minHeight: 70,
    textAlignVertical: 'top',
    padding: 0,
  },
  feedbackFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: P.glow,
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: P.ink,
  },
  sendText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 12,
    color: P.surface,
  },
  statusRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3D6B52',
  },
  statusText: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
  },
  statusCalm: {
    color: '#3D6B52',
    fontFamily: FontFamily.accent,
  },
});
