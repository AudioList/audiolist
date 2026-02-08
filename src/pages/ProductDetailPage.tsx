import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Product, CategoryId } from '../types';
import { supabase } from '../lib/supabase';
import { CATEGORY_MAP, getScoreLabel, isSpinormaCategory, isSinadCategory, sinadToScore, isAmpCategory, AMP_LOAD_IMPEDANCES, formatPowerMw } from '../lib/categories';
import type { AmpLoadOhms } from '../lib/categories';
import { useBuild } from '../context/BuildContext';
import { useExperienceMode } from '../context/ExperienceModeContext';
import { useGlassMode } from '../context/GlassModeContext';
import { getMicConnectionLabel, getMicTypeLabel, getMicPatternLabel } from '../hooks/useProducts';
import PPIBadge from '../components/shared/PPIBadge';
import PriceDisplay from '../components/shared/PriceDisplay';
import WhereToBuy from '../components/shared/WhereToBuy';
import PriceHistoryChart from '../components/shared/PriceHistoryChart';
import ScoreExplainer from '../components/shared/ScoreExplainer';
import BestValueBadge from '../components/shared/BestValueBadge';
import WatchPriceButton from '../components/shared/WatchPriceButton';
import PopularPairings from '../components/shared/PopularPairings';
import { buildSourceUrl, formatSourceLabel } from '../lib/sourceUrl';
import { getDisplayName, getBestModeLabel } from '../lib/productUtils';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setProduct, getSelection, removeProduct } = useBuild();
  const { mode } = useExperienceMode();
  const isGlass = useGlassMode();

  const [product, setProductData] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedCategory, setAddedCategory] = useState<CategoryId | null>(null);
  const [selectedLoad, setSelectedLoad] = useState<AmpLoadOhms>(32);

  useEffect(() => {
    if (!id) return;

    async function fetchProduct() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (queryError || !data) {
          setError('Product not found');
          return;
        }

        setProductData(data as Product);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product');
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [id]);

  const isInBuild = product ? getSelection(product.category_id)?.product.id === product.id : false;
  const bestModeLabel = product ? getBestModeLabel(product) : null;

  function handleAddToBuild(categoryId: CategoryId) {
    if (!product) return;
    // Toggle: remove if already in build, add otherwise
    if (isInBuild) {
      removeProduct(categoryId);
      return;
    }
    setProduct(categoryId, product);
    setAddedCategory(categoryId);
    setTimeout(() => setAddedCategory(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500 dark:text-surface-400">
            Loading product...
          </p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className={isGlass ? 'glass-1 rounded-2xl p-8 text-center' : 'rounded-xl border border-surface-200 bg-white p-8 text-center dark:border-surface-700 dark:bg-surface-900'}>
          <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            Product not found
          </h2>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            This product may have been removed or the link is invalid.
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={isGlass ? 'glass-btn-primary mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-medium' : 'mt-6 inline-block rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500'}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const category = CATEGORY_MAP.get(product.category_id);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-surface-500 transition-colors hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back
        </button>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left: Image / placeholder */}
        <div className={isGlass ? 'flex h-64 w-full shrink-0 items-center justify-center glass-1 glass-inner-glow rounded-2xl lg:h-80 lg:w-80' : 'flex h-64 w-full shrink-0 items-center justify-center rounded-xl border border-surface-200 bg-surface-100 dark:border-surface-700 dark:bg-surface-800 lg:h-80 lg:w-80'}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="max-h-full max-w-full object-contain p-4"
            />
          ) : (
            <span className="text-5xl text-surface-300 dark:text-surface-600" aria-hidden="true">
              ?
            </span>
          )}
        </div>

        {/* Right: Details */}
        <div className="flex-1 space-y-5">
          {/* Brand + category breadcrumb */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-300">
            {category && (
              <Link
                to={`/products/${product.category_id}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {category.name}
              </Link>
            )}
            {product.brand && (
              <>
                <span className="text-surface-400">/</span>
                <span>{product.brand}</span>
              </>
            )}
          </div>

          {/* Product name */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-surface-900 dark:text-surface-50">
              {getDisplayName(product)}
            </h1>
            {product.discontinued && (
              <span className="inline-flex items-center rounded-lg bg-surface-200 px-2.5 py-1 text-sm font-bold text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                Discontinued
              </span>
            )}
            {product.asr_device_type && product.asr_device_type.toUpperCase().includes('AMP') && (
              <span className="inline-flex items-center rounded-lg bg-violet-100 px-2.5 py-1 text-sm font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                DAC/Amp
              </span>
            )}
            {bestModeLabel && (
              <span className="inline-flex items-center rounded-lg bg-green-100 px-2.5 py-1 text-sm font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                {bestModeLabel}
              </span>
            )}
            {product.iem_type === 'tws' && (
              <span className="inline-flex items-center rounded-lg bg-cyan-100 px-2.5 py-1 text-sm font-bold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                TWS
              </span>
            )}
          </div>

          {/* Editorial blurb */}
          {product.editorial_blurb && (
            <div className={isGlass ? 'border-l-4 border-primary-400/60 bg-primary-50/50 backdrop-blur-sm rounded-xl px-4 py-3 dark:border-primary-400/60 dark:bg-primary-900/10' : 'rounded-lg border-l-4 border-primary-500 bg-primary-50 px-4 py-3 dark:border-primary-400 dark:bg-primary-900/10'}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-400">
                Why This Product
              </p>
              <p className="mt-1 text-sm leading-relaxed text-surface-700 dark:text-surface-300">
                {product.editorial_blurb}
              </p>
            </div>
          )}

          {/* Price */}
          <div className="flex items-center gap-3 text-xl">
            <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} />
            <BestValueBadge
              score={isSinadCategory(product.category_id)
                ? (product.sinad_db !== null ? sinadToScore(product.sinad_db) : null)
                : product.ppi_score}
              price={product.price}
            />
          </div>

          {/* Score badge (large) — PPI for IEM/headphone, Spinorama for speakers */}
          {category?.has_ppi && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                {getScoreLabel(product.category_id, mode)}:
              </span>
              <PPIBadge score={product.ppi_score} size="lg" label={getScoreLabel(product.category_id, mode)} />
            </div>
          )}

          {/* Score explainer (beginner/default only) */}
          {mode !== 'advanced' && category?.has_ppi && product.ppi_score !== null && (
            <ScoreExplainer
              scoreType={isSpinormaCategory(product.category_id) ? 'spinorama' : 'ppi'}
              score={product.ppi_score}
            />
          )}

          {/* Spinorama breakdown table (speakers, hidden in beginner mode) */}
          {mode !== 'beginner' && category?.has_ppi && product.ppi_score !== null && isSpinormaCategory(product.category_id) && (
            <div className={isGlass ? 'glass-1 rounded-xl' : 'rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800'}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={isGlass ? 'border-b bg-white/40 text-left text-surface-500 dark:bg-white/[0.04] dark:text-surface-400 border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 text-left text-surface-500 dark:border-surface-700 dark:text-surface-400'}>
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                    <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Hint</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Olive Predicted Preference Score — higher is better (scale of 0-10)">
                      Preference Score
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.pref_score !== null ? product.pref_score.toFixed(1) : 'N/A'}
                      <span className="ml-1 text-xs text-surface-500">/ 10</span>
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">higher is better</td>
                  </tr>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Preference score when paired with a subwoofer — often higher than standalone">
                      Score w/ Sub
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.pref_score_wsub !== null ? product.pref_score_wsub.toFixed(1) : 'N/A'}
                      <span className="ml-1 text-xs text-surface-500">/ 10</span>
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">higher is better</td>
                  </tr>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Low Frequency Extension — how deep the bass goes (lower Hz = deeper bass)">
                      Bass Extension (LFX)
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.lfx_hz !== null ? `${product.lfx_hz.toFixed(0)} Hz` : 'N/A'}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">lower Hz is deeper</td>
                  </tr>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Narrow Band Deviation on axis — lower = smoother frequency response">
                      NBD On-Axis
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.nbd_on_axis !== null ? product.nbd_on_axis.toFixed(2) : 'N/A'}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">lower is better</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Predicted In-Room smoothness — lower = more even sound in a typical room">
                      Smoothness (SM PIR)
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.sm_pred_in_room !== null ? product.sm_pred_in_room.toFixed(2) : 'N/A'}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">lower is better</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* PPI breakdown table (IEM/headphone, hidden in beginner mode) */}
          {mode !== 'beginner' && category?.has_ppi && product.ppi_score !== null && !isSpinormaCategory(product.category_id) && (
            <div className={isGlass ? 'glass-1 rounded-xl' : 'rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800'}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={isGlass ? 'border-b bg-white/40 text-left text-surface-500 dark:bg-white/[0.04] dark:text-surface-400 border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 text-left text-surface-500 dark:border-surface-700 dark:text-surface-400'}>
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                    <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Hint</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Standard deviation from target curve — lower = closer to ideal tuning">
                      Std Deviation
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.ppi_stdev !== null ? product.ppi_stdev.toFixed(2) : 'N/A'}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">lower is better</td>
                  </tr>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Frequency response slope — closer to 0 = more balanced bass-to-treble tilt">
                      Slope
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.ppi_slope !== null ? product.ppi_slope.toFixed(3) : 'N/A'}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">closer to 0</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Average error from target curve — lower = more accurate sound reproduction">
                      Avg Error
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.ppi_avg_error !== null
                        ? product.ppi_avg_error.toFixed(2)
                        : 'N/A'}
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">lower is better</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SINAD score badge (DAC/Amp) */}
          {isSinadCategory(product.category_id) && product.sinad_db !== null && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                SINAD:
              </span>
              <PPIBadge score={sinadToScore(product.sinad_db)} size="lg" label="SINAD" />
            </div>
          )}

          {/* SINAD score explainer (beginner/default only) */}
          {mode !== 'advanced' && isSinadCategory(product.category_id) && product.sinad_db !== null && (
            <ScoreExplainer scoreType="sinad" score={product.sinad_db} />
          )}

          {/* SINAD breakdown table (DAC/Amp, hidden in beginner mode) */}
          {mode !== 'beginner' && isSinadCategory(product.category_id) && product.sinad_db !== null && (
            <div className={isGlass ? 'glass-1 rounded-xl' : 'rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800'}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={isGlass ? 'border-b bg-white/40 text-left text-surface-500 dark:bg-white/[0.04] dark:text-surface-400 border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 text-left text-surface-500 dark:border-surface-700 dark:text-surface-400'}>
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                    <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Hint</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Signal-to-Noise and Distortion ratio — higher = cleaner, more transparent signal">
                      SINAD
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.sinad_db} dB
                    </td>
                    <td className="hidden px-4 py-2 text-right text-xs text-surface-400 sm:table-cell">higher is better</td>
                  </tr>
                  {product.asr_device_type && (
                    <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                      <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Device classification from AudioScienceReview">
                        Device Type
                      </td>
                      <td className="px-4 py-2 text-right text-surface-900 dark:text-surface-100">
                        {product.asr_device_type}
                      </td>
                    </tr>
                  )}
                  {product.asr_recommended !== null && (
                    <tr className={isGlass ? 'border-b border-white/15 dark:border-white/[0.06]' : 'border-b border-surface-200 dark:border-surface-700'}>
                      <td className="px-4 py-2 text-surface-700 dark:text-surface-300" title="Whether AudioScienceReview recommends this product based on measured performance">
                        ASR Recommended
                      </td>
                      <td className="px-4 py-2 text-right text-surface-900 dark:text-surface-100">
                        {product.asr_recommended ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  {product.asr_review_date && (
                    <tr>
                      <td className="px-4 py-2 text-surface-700 dark:text-surface-300">
                        Review Date
                      </td>
                      <td className="px-4 py-2 text-right text-surface-900 dark:text-surface-100">
                        {product.asr_review_date}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {product.asr_review_url && (
                <div className="border-t border-surface-200 px-4 py-2 dark:border-surface-700">
                  <a
                    href={product.asr_review_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    Read full ASR review &rarr;
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Output Power section (Amps only, hidden in beginner mode) */}
          {mode !== 'beginner' && isAmpCategory(product.category_id) && (() => {
            const powerData: { ohms: AmpLoadOhms; mw: number | null }[] = AMP_LOAD_IMPEDANCES.map((ohms) => ({
              ohms,
              mw: product[`power_${ohms}ohm_mw` as keyof typeof product] as number | null,
            }));
            const hasPowerData = powerData.some((d) => d.mw !== null);
            const selectedPower = powerData.find((d) => d.ohms === selectedLoad);

            return (
              <div className="rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800">
                <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700">
                  <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                    Output Power
                  </h3>
                  <p className="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
                    {hasPowerData
                      ? 'Select a load impedance to view power output'
                      : 'Power measurements not yet available for this amplifier'}
                  </p>
                </div>

                {/* Load impedance selector */}
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-0" role="group" aria-label="Load impedance selector">
                    {powerData.map(({ ohms, mw }, index) => {
                      const isActive = selectedLoad === ohms;
                      const isFirst = index === 0;
                      const isLast = index === powerData.length - 1;
                      const hasData = mw !== null;

                      const roundedClass = isFirst
                        ? 'rounded-l-lg'
                        : isLast
                          ? 'rounded-r-lg'
                          : '';

                      const colorClass = isActive
                        ? 'bg-primary-600 text-white border-primary-600 dark:bg-primary-600 dark:border-primary-600'
                        : hasData
                          ? 'bg-surface-800 text-surface-300 border-surface-600 hover:bg-surface-700 hover:text-surface-100 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-600 dark:hover:bg-surface-700'
                          : 'bg-surface-800/50 text-surface-500 border-surface-700 dark:bg-surface-800/50 dark:text-surface-500 dark:border-surface-700';

                      const marginClass = index > 0 ? '-ml-px' : '';

                      return (
                        <button
                          key={ohms}
                          type="button"
                          onClick={() => setSelectedLoad(ohms)}
                          className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:z-10 ${colorClass} ${roundedClass} ${marginClass}`}
                          aria-pressed={isActive}
                        >
                          {ohms >= 1000 ? `${ohms / 1000}k` : ohms}&Omega;
                        </button>
                      );
                    })}
                  </div>

                  {/* Power display for selected load */}
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-sm text-surface-500 dark:text-surface-400">
                      Power @ {selectedLoad}&Omega;:
                    </span>
                    {selectedPower?.mw !== null && selectedPower?.mw !== undefined ? (
                      <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
                        {formatPowerMw(selectedPower.mw)}
                      </span>
                    ) : (
                      <span className="text-sm italic text-surface-400 dark:text-surface-500">
                        No data
                      </span>
                    )}
                  </div>
                </div>

                {/* Summary row showing all available loads */}
                {hasPowerData && (
                  <div className="border-t border-surface-200 dark:border-surface-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-200 text-left text-surface-500 dark:border-surface-700 dark:text-surface-400">
                          <th className="px-4 py-2 font-medium">Load</th>
                          <th className="px-4 py-2 text-right font-medium">Power</th>
                        </tr>
                      </thead>
                      <tbody>
                        {powerData
                          .filter((d) => d.mw !== null)
                          .map(({ ohms, mw }, idx, arr) => (
                            <tr
                              key={ohms}
                              className={`${idx < arr.length - 1 ? 'border-b border-surface-200 dark:border-surface-700' : ''} ${
                                selectedLoad === ohms ? 'bg-primary-600/10 dark:bg-primary-600/10' : ''
                              }`}
                            >
                              <td className="px-4 py-2 text-surface-700 dark:text-surface-300">
                                {ohms}&Omega;
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                                {formatPowerMw(mw!)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {product.power_source && (
                  <div className="border-t border-surface-200 px-4 py-2 dark:border-surface-700">
                    <span className="text-xs text-surface-500 dark:text-surface-400">
                      Source: {product.power_source}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Additional info */}
          <div className="flex flex-wrap gap-3">
            {product.asr_device_type && product.asr_device_type.toUpperCase().includes('AMP') && (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" title="This device functions as both a DAC and an Amplifier">
                DAC/Amp Combo
              </span>
            )}
            {mode !== 'beginner' && product.source_domain && (() => {
              const sourceUrl = buildSourceUrl(product.source_domain, product.source_id);
              return sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors" title="View original measurement graph">
                  Source: {formatSourceLabel(product.source_domain)}
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" title="Measurement data source">
                  Source: {formatSourceLabel(product.source_domain)}
                </span>
              );
            })()}
            {mode !== 'beginner' && product.rig_type && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" title="Measurement rig used for testing — 5128 is the newer, more accurate standard">
                Rig: {product.rig_type}
              </span>
            )}
            {mode !== 'beginner' && product.speaker_type && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Type: {product.speaker_type}
              </span>
            )}
            {product.mic_connection && (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                {getMicConnectionLabel(product.mic_connection)}
              </span>
            )}
            {product.mic_type && (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                {getMicTypeLabel(product.mic_type)}
              </span>
            )}
            {product.mic_pattern && (
              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {getMicPatternLabel(product.mic_pattern)}
              </span>
            )}
            {mode === 'advanced' && product.asr_recommended && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-300">
                ASR Recommended
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {/* Add/Remove from build */}
            <button
              type="button"
              onClick={() => handleAddToBuild(product.category_id)}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
                addedCategory === product.category_id
                  ? 'bg-ppi-excellent text-white'
                  : isInBuild
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : (isGlass ? 'glass-btn-primary' : 'bg-primary-600 text-white hover:bg-primary-500')
              }`}
            >
              {addedCategory === product.category_id
                ? 'Added to Build!'
                : isInBuild
                  ? `Remove from Build (${category?.name ?? product.category_id})`
                  : `Add to Build (${category?.name ?? product.category_id})`}
            </button>

            {/* Affiliate / buy link */}
            {product.affiliate_url && (
              <a
                href={product.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className={isGlass ? 'glass-btn-secondary inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium' : 'inline-flex items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-5 py-2.5 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'}
              >
                Buy Now
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                  <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                </svg>
              </a>
            )}

            {/* Watch price */}
            <WatchPriceButton
              productId={product.id}
              productName={product.name}
              currentPrice={product.price}
            />
          </div>
        </div>
      </div>

      {/* Where to Buy */}
      <WhereToBuy productId={product.id} productName={product.name} discontinued={product.discontinued} />

      {/* Price History */}
      <PriceHistoryChart productId={product.id} />

      {/* Popular Pairings */}
      <PopularPairings productId={product.id} />
    </div>
  );
}
