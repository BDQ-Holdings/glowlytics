import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  GhostButton,
  Intro,
  IntroAccent,
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
  Toggle,
} from '../../src/components/settings/SettingsPrimitives';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';

const P = Glow.palette;

type PickerTarget = 'daily-scan' | 'ritual-am' | 'ritual-pm';

const DEFAULT_TIMES: Record<PickerTarget, string> = {
  'daily-scan': '08:00',
  'ritual-am': '07:00',
  'ritual-pm': '21:30',
};

function dateForTime(time: string | null, fallback: string): Date {
  const [hour, minute] = (time ?? fallback).split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute);
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function NotificationsScreen() {
  const notificationSettings = useStore((s) => s.notificationSettings);
  const setDailyReminder = useStore((s) => s.setDailyReminder);
  const setRitualReminder = useStore((s) => s.setRitualReminder);
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  useEffect(() => {
    let mounted = true;
    Notifications.getPermissionsAsync()
      .then(({ status }) => {
        if (mounted) setPermissionStatus(status);
      })
      .catch(() => {
        if (mounted) setPermissionStatus(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const permissionCopy = useMemo(() => {
    if (permissionStatus === 'granted') return 'Allowed';
    if (permissionStatus === 'denied') return 'Denied in system settings';
    if (permissionStatus === null) return 'Checking…';
    return 'Not requested';
  }, [permissionStatus]);

  const requestPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);
    trackEvent('notification_permission_requested', { status });
    return status === 'granted';
  };

  const ensurePermission = async () => {
    if (permissionStatus === 'granted') return true;
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
    if (status === 'granted') return true;
    return requestPermission();
  };

  const setDaily = async (enabled: boolean, time = notificationSettings.notification_time ?? DEFAULT_TIMES['daily-scan']) => {
    if (enabled && !(await ensurePermission())) return;
    await setDailyReminder(enabled, time);
    trackEvent('notification_setting_changed', { type: 'daily_scan', enabled });
  };

  const setRitual = async (
    section: 'am' | 'pm',
    enabled: boolean,
    time = section === 'am'
      ? notificationSettings.ritual_am_time ?? DEFAULT_TIMES['ritual-am']
      : notificationSettings.ritual_pm_time ?? DEFAULT_TIMES['ritual-pm'],
  ) => {
    if (enabled && !(await ensurePermission())) return;
    await setRitualReminder(section, enabled, time);
    trackEvent('notification_setting_changed', { type: `ritual_${section}`, enabled });
  };

  const pickerValue = (() => {
    if (pickerTarget === 'daily-scan') {
      return dateForTime(notificationSettings.notification_time, DEFAULT_TIMES['daily-scan']);
    }
    if (pickerTarget === 'ritual-am') {
      return dateForTime(notificationSettings.ritual_am_time, DEFAULT_TIMES['ritual-am']);
    }
    if (pickerTarget === 'ritual-pm') {
      return dateForTime(notificationSettings.ritual_pm_time, DEFAULT_TIMES['ritual-pm']);
    }
    return dateForTime(null, DEFAULT_TIMES['daily-scan']);
  })();

  const onTimeChange = async (_event: unknown, selected?: Date) => {
    setPickerTarget(Platform.OS === 'ios' ? pickerTarget : null);
    if (!selected || !pickerTarget) return;
    const time = formatTime(selected);
    if (pickerTarget === 'daily-scan') {
      await setDaily(true, time);
    } else if (pickerTarget === 'ritual-am') {
      await setRitual('am', true, time);
    } else {
      await setRitual('pm', true, time);
    }
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Notifications" />

      <Intro>
        Keep only the reminders Glowlytics can actually schedule: <IntroAccent>scan nudges</IntroAccent>
        {' '}and AM / PM ritual nudges.
      </Intro>

      <SectionLabel>Permission</SectionLabel>
      <ListGroup>
        <Row
          label="Push notifications"
          value={permissionCopy}
          sub={permissionStatus === 'granted' ? 'Reminders can be delivered on this device.' : 'Required before any reminders can fire.'}
          onPress={permissionStatus === 'granted' ? undefined : () => { void requestPermission(); }}
          accessibilityHint="Request notification permission"
        />
      </ListGroup>

      <SectionLabel>Scan reminder</SectionLabel>
      <ListGroup>
        <Row
          label="Daily scan"
          sub="One gentle reminder to take your progress scan."
          control={<Toggle on={notificationSettings.notifications_enabled} onChange={(next) => { if (!next && pickerTarget === 'daily-scan') setPickerTarget(null); void setDaily(next); }} />}
        />
        <Row
          label="Time"
          value={notificationSettings.notifications_enabled && notificationSettings.notification_time ? notificationSettings.notification_time : 'Off'}
          onPress={notificationSettings.notifications_enabled ? () => setPickerTarget('daily-scan') : undefined}
          accessibilityHint="Change daily scan reminder time"
        />
      </ListGroup>

      <SectionLabel>Ritual reminders</SectionLabel>
      <ListGroup>
        <Row
          label="Morning ritual"
          sub="AM routine nudge."
          control={<Toggle on={notificationSettings.ritual_am_enabled} onChange={(next) => { if (!next && pickerTarget === 'ritual-am') setPickerTarget(null); void setRitual('am', next); }} />}
        />
        <Row
          label="Morning time"
          value={notificationSettings.ritual_am_enabled && notificationSettings.ritual_am_time ? notificationSettings.ritual_am_time : 'Off'}
          onPress={notificationSettings.ritual_am_enabled ? () => setPickerTarget('ritual-am') : undefined}
          accessibilityHint="Change morning ritual reminder time"
        />
        <Row
          label="Evening ritual"
          sub="PM routine nudge."
          control={<Toggle on={notificationSettings.ritual_pm_enabled} onChange={(next) => { if (!next && pickerTarget === 'ritual-pm') setPickerTarget(null); void setRitual('pm', next); }} />}
        />
        <Row
          label="Evening time"
          value={notificationSettings.ritual_pm_enabled && notificationSettings.ritual_pm_time ? notificationSettings.ritual_pm_time : 'Off'}
          onPress={notificationSettings.ritual_pm_enabled ? () => setPickerTarget('ritual-pm') : undefined}
          accessibilityHint="Change evening ritual reminder time"
        />
      </ListGroup>

      {pickerTarget && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={pickerValue}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
            themeVariant="light"
          />
          {Platform.OS === 'ios' && (
            // iOS's inline spinner has no built-in dismissal — without this the
            // picker sits open forever once a time row is tapped.
            <GhostButton label="Done" onPress={() => setPickerTarget(null)} />
          )}
        </View>
      )}

      <View style={styles.footnote}>
        <Text style={styles.footnoteText}>
          Scheduled reminders are device-local. Turning a row off cancels only that identifier.
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  pickerWrap: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.lg,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: P.surface,
  },
  footnote: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  footnoteText: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
    color: P.muted,
  },
});
