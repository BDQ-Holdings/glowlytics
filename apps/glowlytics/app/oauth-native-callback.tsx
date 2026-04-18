import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing } from '../src/constants/theme';

export default function OAuthNativeCallback() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={Colors.primary} />
      <Text style={styles.title}>Finishing sign-in...</Text>
      <Text style={styles.subtitle}>Please wait while Glowlytics returns to your account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.lg,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
