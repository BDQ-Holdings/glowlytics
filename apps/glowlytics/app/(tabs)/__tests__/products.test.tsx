import React from 'react';
import { render } from '@testing-library/react-native';

const mockPush = jest.fn();

interface ShelfProduct {
  user_product_id: string;
  product_name: string;
  brand?: string;
  usage_schedule: string;
  image_url?: string | null;
}

interface ShelfStoreState {
  products: ShelfProduct[];
  protocol: null;
  modelOutputs: unknown[];
  dailyRecords: unknown[];
  consideringList: unknown[];
  openAddProductTrigger: number;
}

let mockState: ShelfStoreState;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The AddProductSheet drags in native camera modules; it plays no part in the
// shelf-thumb wiring, so stub it out.
jest.mock('../../../src/components/AddProductSheet', () => ({
  AddProductSheet: () => null,
}));

jest.mock('../../../src/components/FocusFade', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    FocusFade: ({ children }: { children?: React.ReactNode }) => ReactLib.createElement(NativeView, null, children),
  };
});

jest.mock('../../../src/components/glow/GlowPrimitives', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    FadeUp: ({ children }: { children?: React.ReactNode }) => ReactLib.createElement(NativeView, null, children),
    BreathingGlow: () => ReactLib.createElement(NativeView),
  };
});

jest.mock('../../../src/components/glow/GlowIcons', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    GlowIcon: () => ReactLib.createElement(NativeView),
  };
});

// Stand in for the shared product thumbnail so we can observe exactly what the
// shelf row passes down: a real URL renders it verbatim, a null falls back to
// the gradient placeholder.
jest.mock('../../../src/components/advisor/ProductThumb', () => {
  const ReactLib = require('react');
  const { Text: NativeText } = require('react-native');
  return {
    ProductThumb: ({ imageUrl }: { imageUrl?: string | null }) =>
      ReactLib.createElement(NativeText, null, imageUrl == null ? 'GRADIENT' : imageUrl),
  };
});

jest.mock('../../../src/services/analytics', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../../../src/services/ingredientDB', () => ({
  computeProductEffectiveness: () => ({ score: 0 }),
}));

jest.mock('../../../src/services/skinInsights', () => ({
  buildOverallSkinInsight: () => ({ signals: undefined }),
  getLatestDailyForOutput: () => null,
}));

jest.mock('../../../src/services/ritual', () => ({
  activeProducts: (products: unknown[]) => products,
}));

jest.mock('../../../src/store/useStore', () => ({
  useStore: (selector: (state: ShelfStoreState) => unknown) => selector(mockState),
}));

const ShelfTab = require('../products').default as React.ComponentType;

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    products: [
      {
        user_product_id: 'p-barcode',
        product_name: 'CeraVe Moisturizing Cream',
        usage_schedule: 'AM',
        image_url: 'https://img.example/cerave.png',
      },
      {
        // Manual add — never assigned an image field at all.
        user_product_id: 'p-manual',
        product_name: 'Hand-typed serum',
        usage_schedule: 'PM',
      },
      {
        // Photo add — explicitly image-less (null).
        user_product_id: 'p-photo',
        product_name: 'Snapped bottle',
        usage_schedule: 'both',
        image_url: null,
      },
    ],
    protocol: null,
    modelOutputs: [],
    dailyRecords: [],
    consideringList: [],
    openAddProductTrigger: 0,
  };
});

describe('Shelf thumbnails', () => {
  it('renders the real product image for barcode/search adds', () => {
    const { getByText } = render(<ShelfTab />);
    expect(getByText('https://img.example/cerave.png')).toBeTruthy();
  });

  it('falls back to the gradient placeholder for image-less (photo/manual) adds', () => {
    const { getAllByText } = render(<ShelfTab />);
    // The manual (undefined) and photo (null) rows both coalesce to null.
    expect(getAllByText('GRADIENT')).toHaveLength(2);
  });
});
