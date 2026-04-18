import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, BorderRadius, FontSize, FontFamily, Spacing } from '../constants/theme';

interface Option {
  label: string;
  value: string;
  description?: string;
}

interface Props {
  options: Option[];
  selected: string | null;
  onSelect: (value: string) => void;
  horizontal?: boolean;
}

export const OptionSelector: React.FC<Props> = ({
  options, selected, onSelect, horizontal,
}) => {
  return (
    <View style={[styles.container, horizontal && styles.horizontal]}>
      {options.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[
              styles.option,
              horizontal && styles.optionHorizontal,
              isSelected && styles.optionSelected,
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
              {opt.label}
            </Text>
            {opt.description && (
              <Text style={styles.optionDesc}>{opt.description}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  horizontal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  option: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  optionHorizontal: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  optionLabel: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemiBold,
  },
  optionLabelSelected: {
    color: Colors.primary,
  },
  optionDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
    lineHeight: 19,
  },
});
