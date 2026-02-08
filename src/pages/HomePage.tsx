import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { nanoid } from 'nanoid';
import type { CategoryId, TargetType, Product } from '../types';
import { useBuild } from '../context/BuildContext';
import { CATEGORY_MAP } from '../lib/categories';
import { supabase } from '../lib/supabase';
import BuilderTable from '../components/builder/BuilderTable';
import ProductPicker from '../components/products/ProductPicker';
import ProductDetailModal from '../components/shared/ProductDetailModal';
import ShareButton from '../components/shared/ShareButton';
import { getClientHash } from '../hooks/useCommunityBuilds';
import AdvancedSettings from '../components/builder/AdvancedSettings';
import SignalChainVisualizer from '../components/builder/SignalChainVisualizer';
import StarterBuildCards from '../components/builder/StarterBuildCards';
import { useExperienceMode } from '../context/ExperienceModeContext';
import { useGlassMode } from '../context/GlassModeContext';

export default function HomePage() {
  const { items, itemCount, clearBuild, name, description, setName, setDescription } = useBuild();
  const { mode } = useExperienceMode();
  const isGlass = useGlassMode();
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

  const handleShare = useCallback(async (opts?: { isPublic?: boolean; authorName?: string }): Promise<string> => {
    // Quality gate for community publishing
    if (opts?.isPublic && !name.trim()) {
      throw new Error('A build name is required to publish to the community.');
    }
    if (opts?.isPublic && items.size === 0) {
      throw new Error('Add at least one item to publish to the community.');
    }

    const shareCode = nanoid(8);

    // Insert the build record
    const { data: build, error: buildError } = await supabase
      .from('builds')
      .insert({
        share_code: shareCode,
        name: name.trim().slice(0, 100),
        description: description.trim().slice(0, 500),
        is_public: opts?.isPublic ?? false,
        author_name: opts?.authorName?.trim().slice(0, 50) ?? null,
        client_hash: getClientHash(),
      })
      .select('id')
      .single();

    if (buildError || !build) {
      if (buildError?.message?.includes('Rate limit exceeded')) {
        throw new Error('You are creating builds too quickly. Please wait a few minutes and try again.');
      }
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
  }, [items, name, description]);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your build..."
            maxLength={100}
            className={isGlass ? 'w-full border-b-2 border-transparent bg-transparent text-3xl font-extrabold text-surface-900 outline-none transition-colors placeholder:text-surface-300 hover:border-white/30 focus:border-primary-500 dark:text-surface-50 dark:placeholder:text-surface-600 dark:hover:border-white/30 dark:focus:border-primary-400' : 'w-full border-b-2 border-transparent bg-transparent text-3xl font-extrabold text-surface-900 outline-none transition-colors placeholder:text-surface-300 hover:border-surface-200 focus:border-primary-500 dark:text-surface-50 dark:placeholder:text-surface-600 dark:hover:border-surface-700 dark:focus:border-primary-400'}
            aria-label="Build name"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for your build..."
            maxLength={500}
            className="mt-1 w-full border-b border-transparent bg-transparent text-sm text-surface-600 outline-none transition-colors placeholder:text-surface-400 hover:border-surface-200 focus:border-primary-400 dark:text-surface-300 dark:placeholder:text-surface-500 dark:hover:border-surface-700 dark:focus:border-primary-500"
            aria-label="Build description"
          />
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
          {/* Share button -- always visible so users know the feature exists */}
          <ShareButton onShare={handleShare} disabled={itemCount === 0} />

          {/* Clear build */}
          {itemCount > 0 && (
            <button
              type="button"
              onClick={clearBuild}
              className={isGlass ? 'glass-btn-secondary rounded-lg px-4 py-2 text-sm font-medium' : 'rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'}
            >
              Start New Build
            </button>
          )}
        </div>
      </div>

      {/* Quiz CTA + Starter builds (shown when build is empty) */}
      {itemCount === 0 && (
        <>
          <div className={isGlass ? 'glass-1 glass-inner-glow rounded-2xl border-primary-400/30 flex items-center justify-center gap-3 px-5 py-4' : 'flex items-center justify-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-5 py-4 dark:border-primary-800 dark:bg-primary-900/10'}>
            <div className="text-center">
              <p className="text-sm font-semibold text-primary-800 dark:text-primary-300">
                New to audio? Take our 1-minute setup quiz.
              </p>
              <p className="mt-0.5 text-xs text-primary-600 dark:text-primary-400">
                We will recommend the perfect build for your budget and listening style.
              </p>
            </div>
            <Link
              to="/quiz"
              className={isGlass ? 'glass-btn-primary shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold' : 'shrink-0 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500'}
            >
              Take the Quiz
            </Link>
          </div>
          <StarterBuildCards />
        </>
      )}

      {/* Signal chain visualizer (beginner/default only) */}
      {mode !== 'advanced' && itemCount > 0 && (
        <SignalChainVisualizer items={items} />
      )}

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
