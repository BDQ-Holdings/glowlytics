import { useStore } from '../store/useStore';
import { activeProducts } from './ritual';
import { lookupProductImage } from './productLookup';
import type { ProductEntry } from '../types';

const attemptedProductIds = new Set<string>();
const MAX_CONCURRENT_LOOKUPS = 2;

const needsImageBackfill = (product: ProductEntry): boolean => {
  if (product.image_url) return false;
  return product.product_capture_method === 'barcode' || product.product_capture_method === 'search';
};

export async function backfillProductImages(): Promise<void> {
  const candidates = activeProducts(useStore.getState().products)
    .filter(needsImageBackfill)
    .filter((product) => !attemptedProductIds.has(product.user_product_id));

  if (candidates.length === 0) return;

  for (const product of candidates) {
    attemptedProductIds.add(product.user_product_id);
  }

  let nextIndex = 0;
  const runWorker = async (): Promise<void> => {
    for (;;) {
      const product = candidates[nextIndex];
      nextIndex += 1;
      if (!product) return;

      try {
        const imageUrl = await lookupProductImage(product.product_name, product.brand);
        if (imageUrl) {
          useStore.getState().setProductImage(product.user_product_id, imageUrl);
        }
      } catch {
        // lookupProductImage is best-effort and should not throw, but a bad mock or
        // platform edge should never break Shelf mounting.
      }
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_LOOKUPS, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}
