import { useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { CategoryId, TargetType, Product } from '../types';
import { useBuild } from '../context/BuildContext';
import { CATEGORY_MAP } from '../lib/categories';
import { supabase } from '../lib/supabase';
import BuilderTable from '../components/builder/BuilderTable';
import ProductPicker from '../components/products/ProductPicker';
import ProductDetailModal from '../components/shared/ProductDetailModal';
import ShareButton from '../components/shared/ShareButton';
import AdvancedSettings from '../components/builder/AdvancedSettings';

export default function HomePage() {
  const { items, itemCount, clearBuild } = useBuild();
  const [pickerCategory, setPickerCategory] = useState<CategoryId | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [targetType, setTargetType] = useState<TargetType>('df');

  const handleChooseProduct = useCallback((categoryId: CategoryId) => {
    setPickerCategory(categoryId);
  }, []);

  const handleClosePicker = useCallback(() => {
    setPickerCategory(null);
  }, []);

  const handleViewDetail = useCallback((product: Product) => {
    setDetailProduct(product);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailProduct(null);
  }, []);

  const handleSwapFromDetail = useCallback(() => {
    if (!detailProduct) return;
    const categoryId = detailProduct.category_id;
    setDetailProduct(null);
    setPickerCategory(categoryId);
  }, [detailProduct]);

  const handleShare = useCallback(async (): Promise<string> => {
    const shareCode = nanoid(8);
    const buildName = 'My Audio Build';

    // Insert the build record
    const { data: build, error: buildError } = await supabase
      .from('builds')
      .insert({ share_code: shareCode, name: buildName })
      .select('id')
      .single();

    if (buildError || !build) {
      throw new Error(buildError?.message ?? 'Failed to create build');
    }

    // Insert build items
    const buildItems = Array.from(items.values()).map((sel) => ({
      build_id: build.id,
      category_id: sel.category_id,
      product_id: sel.product.id,
      custom_price: sel.custom_price ?? null,
      quantity: sel.quantity,
    }));

    if (buildItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('build_items')
        .insert(buildItems);

      if (itemsError) {
        throw new Error(itemsError.message);
      }
    }

    return `${window.location.origin}/build/${shareCode}`;
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            Build Your Audio Setup
          </h1>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Pick components, compare prices, and share your build.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Share button */}
          {itemCount > 0 && <ShareButton onShare={handleShare} />}

          {/* Clear build */}
          {itemCount > 0 && (
            <button
              type="button"
              onClick={clearBuild}
              className="rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
            >
              Start New Build
            </button>
          )}
        </div>
      </div>

      {/* Builder table */}
      <BuilderTable onChooseProduct={handleChooseProduct} onViewDetail={handleViewDetail} />

      {/* Advanced settings (target curve toggle etc.) */}
      <AdvancedSettings targetType={targetType} onTargetTypeChange={setTargetType} />

      {/* Product detail modal */}
      <ProductDetailModal
        product={detailProduct}
        categoryHasPpi={
          detailProduct
            ? (CATEGORY_MAP.get(detailProduct.category_id)?.has_ppi ?? false)
            : false
        }
        onClose={handleCloseDetail}
        onSwap={handleSwapFromDetail}
      />

      {/* Product picker modal */}
      <ProductPicker
        categoryId={pickerCategory ?? 'iem'}
        isOpen={pickerCategory !== null}
        onClose={handleClosePicker}
        onViewDetail={handleViewDetail}
      />
    </div>
  );
}
