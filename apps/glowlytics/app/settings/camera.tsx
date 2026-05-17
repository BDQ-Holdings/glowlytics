import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily, Glow } from '../../src/constants/theme';
import {
  ListGroup,
  Row,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
  Toggle,
} from '../../src/components/settings/SettingsPrimitives';

const P = Glow.palette;

export default function CameraSettingsScreen() {
  const [softLight, setSoftLight] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [grid, setGrid] = useState(false);
  const [hdr, setHdr] = useState(true);
  const [saveOriginals, setSaveOriginals] = useState(true);

  return (
    <SettingsPage>
      <SettingsHeader title="Camera & photos" />

      {/* Storage card */}
      <View style={styles.storageCard}>
        <LinearGradient
          colors={[P.surface, P.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: 18 }}>
          <Text style={styles.storageEyebrow}>Photo album</Text>
          <View style={styles.storageRow}>
            <Text style={styles.storageNum}>47</Text>
            <Text style={styles.storageMeta}>captures · 124 MB on this iPhone</Text>
          </View>
          <View style={styles.storageBar}>
            <View style={[styles.storageSeg, { width: '34%', backgroundColor: P.accent }]} />
            <View style={[styles.storageSeg, { width: '22%', backgroundColor: P.accent2 }]} />
            <View style={[styles.storageSeg, { width: '18%', backgroundColor: P.glow }]} />
          </View>
          <View style={styles.legendRow}>
            <Text style={styles.legendItem}>Forehead · 16</Text>
            <Text style={styles.legendItem}>Cheeks · 10</Text>
            <Text style={styles.legendItem}>Full · 21</Text>
          </View>
        </View>
      </View>

      <SectionLabel>Capture</SectionLabel>
      <ListGroup>
        <Row
          label="Soft-light cue"
          sub="Subtle warn when light is harsh"
          control={<Toggle on={softLight} onChange={setSoftLight} />}
        />
        <Row
          label="Mirror selfie"
          sub="Match what you see"
          control={<Toggle on={mirror} onChange={setMirror} />}
        />
        <Row
          label="Grid overlay"
          sub={grid ? 'On' : 'Off'}
          control={<Toggle on={grid} onChange={setGrid} />}
        />
        <Row
          label="Front camera HDR"
          control={<Toggle on={hdr} onChange={setHdr} />}
        />
      </ListGroup>

      <SectionLabel>Storage</SectionLabel>
      <ListGroup>
        <Row
          label="Save originals on device"
          sub="Higher quality, more storage"
          control={<Toggle on={saveOriginals} onChange={setSaveOriginals} />}
        />
        <Row
          label="Auto-delete after"
          value="90 days"
          sub="We keep the read forever, just not the photo"
        />
        <Row label="Encrypted backup" value="iCloud" sub="End-to-end" />
      </ListGroup>

      <SectionLabel danger>Wipe</SectionLabel>
      <ListGroup>
        <Row
          label="Delete all photos"
          sub="Keeps your scores and patterns. Photos can't be recovered."
          danger
        />
      </ListGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  storageCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: P.glow,
    overflow: 'hidden',
  },
  storageEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  storageNum: {
    fontFamily: FontFamily.sans,
    fontSize: 38,
    color: P.ink,
    lineHeight: 38,
  },
  storageMeta: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
  },
  storageBar: {
    flexDirection: 'row',
    marginTop: 12,
    height: 4,
    backgroundColor: P.bg,
    borderRadius: 999,
    overflow: 'hidden',
  },
  storageSeg: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  legendItem: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.3,
  },
});
