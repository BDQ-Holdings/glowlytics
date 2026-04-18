import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../constants/theme';

interface OnboardingOptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  multiSelect?: boolean;
}

export const OnboardingOptionCard: React.FC<OnboardingOptionCardProps> = ({
  label,
  description,
  selected,
  onPress,
  multiSelect,
}) => {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole={multiSelect ? 'checkbox' : 'radio'}
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={styles.content}>
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      {multiSelect ? (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Text style={styles.checkmark}>&#10003;</Text>}
        </View>
      ) : (
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      )}
    </TouchableOpacity>
  );
};

interface OnboardingChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const OnboardingChip: React.FC<OnboardingChipProps> = ({
  label,
  selected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
};

interface OnboardingGridOptionProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const OnboardingGridOption: React.FC<OnboardingGridOptionProps> = ({
  label,
  selected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.gridOption, selected && styles.gridOptionSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.gridLabel, selected && styles.gridLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Full-width card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  cardSelected: {
    borderColor: '#3A9E8F',
    backgroundColor: 'rgba(58, 158, 143, 0.08)',
    shadowColor: '#3A9E8F',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  content: {
    flex: 1,
    gap: Spacing.xxs,
  },
  label: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
  },
  labelSelected: {
    color: '#2B7D70',
  },
  description: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#3A9E8F',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3A9E8F',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: '#3A9E8F',
    backgroundColor: '#3A9E8F',
  },
  checkmark: {
    color: Colors.textOnDark,
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: 16,
  },

  // Chip (multi-select)
  chip: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  chipSelected: {
    borderColor: '#3A9E8F',
    backgroundColor: 'rgba(58, 158, 143, 0.08)',
    shadowColor: '#3A9E8F',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  chipLabel: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  chipLabelSelected: {
    color: '#2B7D70',
  },

  // Grid option (2-column)
  gridOption: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  gridOptionSelected: {
    borderColor: '#3A9E8F',
    backgroundColor: 'rgba(58, 158, 143, 0.08)',
    shadowColor: '#3A9E8F',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  gridLabel: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  gridLabelSelected: {
    color: '#2B7D70',
  },
});
