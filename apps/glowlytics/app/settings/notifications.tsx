import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  Intro,
  IntroAccent,
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
  Toggle,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;

export default function NotificationsScreen() {
  const [state, setState] = useState({
    morning: true,
    evening: true,
    sunday: true,
    hydration: true,
    spf: true,
    sleep: false,
    pattern: true,
    weekendSleep: true,
    weeklySummary: true,
    productNews: false,
  });

  const set = (k: keyof typeof state) => (next: boolean) =>
    setState((prev) => ({ ...prev, [k]: next }));

  return (
    <SettingsPage>
      <SettingsHeader title="Notifications" />

      <Intro>
        We aim for{' '}
        <IntroAccent>two nudges a day, never more</IntroAccent>. You can turn any of them off.
      </Intro>

      <SectionLabel>Routine</SectionLabel>
      <ListGroup>
        <Row
          label="Morning check-in"
          sub="A soft tap to capture your read"
          value="7:30 AM"
          control={<Toggle on={state.morning} onChange={set('morning')} />}
        />
        <Row
          label="Evening ritual"
          sub="Retinoid nights only"
          value="9:30 PM"
          control={<Toggle on={state.evening} onChange={set('evening')} />}
        />
        <Row
          label="Sunday story"
          sub="Your week in patterns"
          value="9:00 AM"
          control={<Toggle on={state.sunday} onChange={set('sunday')} />}
        />
      </ListGroup>

      <SectionLabel>Gentle nudges</SectionLabel>
      <ListGroup>
        <Row
          label="Hydration reminders"
          sub="If your glass count dips"
          control={<Toggle on={state.hydration} onChange={set('hydration')} />}
        />
        <Row
          label="SPF before noon"
          sub="On clear-sky days"
          control={<Toggle on={state.spf} onChange={set('spf')} />}
        />
        <Row
          label="Sleep before midnight"
          sub="When your pattern says so"
          control={<Toggle on={state.sleep} onChange={set('sleep')} />}
        />
        <Row
          label="New pattern found"
          sub="When we're confident"
          control={<Toggle on={state.pattern} onChange={set('pattern')} />}
        />
      </ListGroup>

      <SectionLabel>Quiet hours</SectionLabel>
      <ListGroup>
        <Row label="Do not disturb" value="10 PM — 6:30 AM" />
        <Row
          label="Weekends sleep in"
          sub="Push the morning check-in by 90 min"
          control={<Toggle on={state.weekendSleep} onChange={set('weekendSleep')} />}
        />
      </ListGroup>

      <SectionLabel>Email</SectionLabel>
      <ListGroup>
        <Row
          label="Weekly summary"
          sub="Sunday morning · plaintext"
          control={<Toggle on={state.weeklySummary} onChange={set('weeklySummary')} />}
        />
        <Row
          label="Product news"
          sub="Off by default"
          control={<Toggle on={state.productNews} onChange={set('productNews')} />}
        />
      </ListGroup>

      <View style={styles.footnote}>
        <Text style={styles.footnoteText}>
          Push permissions: <Text style={styles.footnoteOk}>Allowed</Text>. Edit in iOS Settings.
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  footnote: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  footnoteText: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    lineHeight: 16,
  },
  footnoteOk: {
    color: '#3D6B52',
    fontFamily: FontFamily.sansBold,
  },
});
