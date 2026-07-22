// src/components/ConnectedAppsSection.tsx
// Lists OAuth applications connected to the user via the Glowlytics MCP server.
// Beta feature — surfaces each connected client with a Revoke action.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';
import {
  listConnectedApps,
  revokeConnectedApp,
  type McpClient,
} from '../services/mcpClients';

const formatConnectedAt = (iso: string | null): string => {
  if (!iso) return 'Connected';
  try {
    return `Connected ${new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })}`;
  } catch {
    return 'Connected';
  }
};

export const ConnectedAppsSection: React.FC = () => {
  const [apps, setApps] = useState<McpClient[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await listConnectedApps());
    } catch (e) {
      setError('Could not load connected apps. Pull to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = useCallback((client: McpClient) => {
    Alert.alert(
      `Disconnect ${client.clientName || 'this app'}?`,
      'This app will no longer be able to read your Glowlytics data. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeConnectedApp(client.clientId);
              setApps((prev) => (prev || []).filter((a) => a.clientId !== client.clientId));
            } catch {
              Alert.alert('Could not disconnect', 'Please try again in a moment.');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <View style={styles.card} testID="connected-apps-section">
      <View style={styles.titleRow}>
        <Feather name="link" size={15} color={Colors.primary} />
        <Text style={styles.title}>Connected apps (Beta)</Text>
      </View>

      {loading && apps === null ? (
        <ActivityIndicator color={Colors.primary} />
      ) : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : !apps || apps.length === 0 ? (
        <Text style={styles.empty} testID="connected-apps-empty">
          No apps connected yet. Link Glowlytics to Claude or ChatGPT to ask about your skin data.
        </Text>
      ) : (
        apps.map((app) => (
          <View key={app.clientId} style={styles.row} testID={`connected-app-${app.clientId}`}>
            <View style={styles.rowText}>
              <Text style={styles.appName}>{app.clientName || 'Connected app'}</Text>
              <Text style={styles.appMeta}>{formatConnectedAt(app.connectedAt)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleRevoke(app)}
              accessibilityRole="button"
              accessibilityLabel={`Disconnect ${app.clientName || 'app'}`}
              style={styles.revokeBtn}
            >
              <Feather name="x" size={16} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  title: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.md, color: Colors.text },
  empty: { fontFamily: FontFamily.sans, fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  rowText: { flex: 1 },
  appName: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.md, color: Colors.text },
  appMeta: { fontFamily: FontFamily.sans, fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  revokeBtn: { padding: Spacing.sm },
});
