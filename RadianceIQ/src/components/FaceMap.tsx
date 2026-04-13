import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, BorderRadius, FontSize, FontFamily, Spacing } from '../constants/theme';
import type { ScanRegion } from '../types';

interface Props {
  selected: ScanRegion | null;
  onSelect: (region: ScanRegion) => void;
  recommended?: ScanRegion;
}

const regions: { key: ScanRegion; label: string; top: number; left: number }[] = [
  { key: 'forehead', label: 'Forehead', top: 8, left: 30 },
  { key: 'temple', label: 'Temple', top: 20, left: 8 },
  { key: 'crows_feet', label: "Crow's Feet", top: 32, left: 5 },
  { key: 'under_eye', label: 'Under Eye', top: 35, left: 25 },
  { key: 'left_cheek', label: 'L Cheek', top: 48, left: 10 },
  { key: 'right_cheek', label: 'R Cheek', top: 48, left: 58 },
  { key: 'jawline', label: 'Jawline', top: 70, left: 25 },
  { key: 'whole_face', label: 'Whole Face', top: 88, left: 25 },
];

export const FaceMap: React.FC<Props> = ({ selected, onSelect, recommended }) => {
  return (
    <View style={styles.container}>
      {/* Face outline */}
      <View style={styles.faceOutline}>
        <View style={styles.faceInner}>
          {/* Eyes */}
          <View style={styles.eyesRow}>
            <View style={styles.eye} />
            <View style={styles.eye} />
          </View>
          {/* Nose */}
          <View style={styles.nose} />
          {/* Mouth */}
          <View style={styles.mouth} />
        </View>
      </View>

      {/* Region buttons */}
      <View style={styles.regionsContainer}>
        {regions.map((r) => {
          const isSelected = selected === r.key;
          const isRecommended = recommended === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => onSelect(r.key)}
              style={[
                styles.regionButton,
                isSelected && styles.regionSelected,
                isRecommended && !isSelected && styles.regionRecommended,
              ]}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.regionLabel,
                isSelected && styles.regionLabelSelected,
              ]}>
                {r.label}
              </Text>
              {isRecommended && !isSelected && (
                <Text style={styles.recommended}>Recommended</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  faceOutline: {
    width: 160,
    height: 200,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  faceInner: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  eyesRow: {
    flexDirection: 'row',
    gap: 30,
    marginTop: 20,
  },
  eye: {
    width: 24,
    height: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary + '30',
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  nose: {
    width: 8,
    height: 20,
    borderRadius: 4,
    backgroundColor: Colors.primary + '20',
  },
  mouth: {
    width: 30,
    height: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary + '20',
  },
  regionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  regionButton: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  regionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '20',
  },
  regionRecommended: {
    borderColor: Colors.accent + '60',
  },
  regionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansMedium,
  },
  regionLabelSelected: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
  },
  recommended: {
    color: Colors.accent,
    fontSize: FontSize.xxs,
    marginTop: Spacing.xxs,
  },
});
