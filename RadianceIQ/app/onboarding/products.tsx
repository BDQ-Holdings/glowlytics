import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle, Path, Ellipse } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { ProductCard } from '../../src/components/ProductCard';
import { AddProductSheet } from '../../src/components/AddProductSheet';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';

function ProductsIllustration() {
  return (
    <Svg width={200} height={160} viewBox="0 0 200 160">
      <Defs>
        <RadialGradient id="prodGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.5} />
          <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="prodAmber" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#C07B2A" stopOpacity={0.45} />
          <Stop offset="60%" stopColor="#C07B2A" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#C07B2A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Background glow */}
      <Ellipse cx={100} cy={80} rx={80} ry={65} fill="url(#prodGlow)" />
      {/* Serum dropper bottle */}
      <Rect x={55} y={50} width={22} height={55} rx={6} fill="#3A9E8F" fillOpacity={0.3} />
      <Rect x={55} y={50} width={22} height={55} rx={6} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.5} />
      <Rect x={62} y={38} width={8} height={14} rx={2} fill="#3A9E8F" fillOpacity={0.4} />
      <Circle cx={66} cy={34} r={3} fill="#3A9E8F" fillOpacity={0.5} />
      {/* Pump bottle */}
      <Rect x={88} y={42} width={24} height={62} rx={7} fill="#C07B2A" fillOpacity={0.25} />
      <Rect x={88} y={42} width={24} height={62} rx={7} fill="none" stroke="#C07B2A" strokeWidth={1} strokeOpacity={0.45} />
      <Rect x={96} y={30} width={8} height={14} rx={2} fill="#C07B2A" fillOpacity={0.35} />
      <Path d="M100 30 L108 26 L112 26" stroke="#C07B2A" strokeWidth={1.2} strokeOpacity={0.4} strokeLinecap="round" fill="none" />
      {/* Wide jar */}
      <Rect x={123} y={60} width={28} height={44} rx={8} fill="#3A9E8F" fillOpacity={0.2} />
      <Rect x={123} y={60} width={28} height={44} rx={8} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.4} />
      <Rect x={125} y={55} width={24} height={8} rx={4} fill="#3A9E8F" fillOpacity={0.3} />
      {/* Accent particles */}
      <Circle cx={45} cy={40} r={2} fill="#3A9E8F" fillOpacity={0.3} />
      <Circle cx={160} cy={45} r={2} fill="#C07B2A" fillOpacity={0.3} />
      <Circle cx={40} cy={110} r={1.5} fill="#C07B2A" fillOpacity={0.2} />
      <Circle cx={165} cy={115} r={2} fill="#3A9E8F" fillOpacity={0.25} />
      <Circle cx={100} cy={125} r={1.5} fill="#3A9E8F" fillOpacity={0.2} />
    </Svg>
  );
}

export default function Products() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const products = useStore((s) => s.products);
  const removeProduct = useStore((s) => s.removeProduct);

  const [showSheet, setShowSheet] = useState(false);

  const handleContinue = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<ProductsIllustration />}
      heading="What's in your routine right now?"
      subtext="Adding your products helps us track what's working. You can always update this later."
      primaryLabel={products.length > 0 ? 'Continue' : 'Skip for now'}
      primaryOnPress={handleContinue}
      secondaryLabel={products.length > 0 ? 'Skip for now' : undefined}
      secondaryOnPress={products.length > 0 ? handleContinue : undefined}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      {products.length > 0 && (
        <View style={styles.productList}>
          {products.map((p) => (
            <ProductCard
              key={p.user_product_id}
              product={p}
              onPress={() => Alert.alert(
                'Remove product?',
                p.product_name,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeProduct(p.user_product_id) },
                ],
              )}
            />
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowSheet(true)}
        activeOpacity={0.7}
      >
        <Feather name="plus" size={18} color={Colors.primaryLight} />
        <Text style={styles.addButtonText}>Add a product</Text>
      </TouchableOpacity>

      <AddProductSheet visible={showSheet} onClose={() => setShowSheet(false)} />
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  productList: {
    gap: Spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.surfaceLight,
  },
  addButtonText: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
});
