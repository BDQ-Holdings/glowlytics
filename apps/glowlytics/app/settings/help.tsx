import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
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

const QUESTIONS = [
  { q: 'How accurate is the Glow score?',          sub: 'Confidence per scan, explained' },
  { q: 'Where do my photos live?',                 sub: 'On your phone, encrypted' },
  { q: "Why didn't it find a pattern this week?",  sub: 'What we look for' },
  { q: 'I started a new medication',               sub: 'Tag a baseline reset' },
  { q: 'Why is the score lower in winter?',        sub: 'Climate context' },
];

const FEEDBACK_TYPES = ['Bug', 'Idea', 'Praise', 'Other'] as const;

export default function HelpScreen() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<(typeof FEEDBACK_TYPES)[number]>('Idea');
  const [message, setMessage] = useState('');

  return (
    <SettingsPage>
      <SettingsHeader title="Help & feedback" />

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={P.muted} />
          <TextInput
            placeholder="Ask anything…"
            placeholderTextColor={P.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            accessibilityLabel="Search help"
          />
        </View>
      </View>

      <SectionLabel>Top questions</SectionLabel>
      <ListGroup>
        {QUESTIONS.map((q) => (
          <Row key={q.q} label={q.q} sub={q.sub} onPress={() => undefined} />
        ))}
      </ListGroup>

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
        <Row label="Email a person" value="hello@glowlytics.ai" sub="Usually within a day" />
        <Row label="Talk to a derm"  value="Plus" sub="Optional add-on" />
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
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: 13,
    color: P.ink,
    padding: 0,
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
