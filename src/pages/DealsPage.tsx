import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDeals } from '../hooks/useDeals';
import { useCoupons } from '../hooks/useCoupons';
import { useGlassMode } from '../context/GlassModeContext';
import DealBadge from '../components/shared/DealBadge';
import CouponChip from '../components/shared/CouponChip';
import type { RetailerCoupon } from '../types';

type DealTab = 'all' | 'on-sale' | 'coupons';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
}

export default function DealsPage() {
  const isGlass = useGlassMode();
  const { deals, loading, error } = useDeals();
  const [activeTab, setActiveTab] = useState<DealTab>('all');

  // Get all unique retailer IDs to fetch coupons
  const allRetailerIds = useMemo(
    () => [...new Set(deals.map(d => d.retailer_id))],
    [deals]
  );
  const { coupons } = useCoupons(allRetailerIds);

  // Filter deals by tab
  const filteredDeals = useMemo(() => {
    switch (activeTab) {
      case 'on-sale':
        return deals.filter(d => d.discount_pct !== null && d.discount_pct > 0);
      case 'coupons':
        return []; // Coupons tab shows retailers, not individual deals
      default:
        return deals;
    }
  }, [deals, activeTab]);

  // Deduplicate by product_id (keep best deal per product)
  const uniqueDeals = useMemo(() => {
    const seen = new Map<string, typeof filteredDeals[0]>();
    for (const deal of filteredDeals) {
      const existing = seen.get(deal.product_id);
      if (!existing || (deal.discount_pct ?? 0) > (existing.discount_pct ?? 0)) {
        seen.set(deal.product_id, deal);
      }
    }
    return [...seen.values()];
  }, [filteredDeals]);

  // Collect retailers with active coupons for the coupons tab
  const retailersWithCoupons = useMemo(() => {
    const result: { retailer_id: string; retailer_name: string; coupons: RetailerCoupon[] }[] = [];
    for (const [retailerId, couponList] of coupons) {
      if (couponList.length > 0) {
        const deal = deals.find(d => d.retailer_id === retailerId);
        result.push({
          retailer_id: retailerId,
          retailer_name: deal?.retailer_name ?? retailerId,
          coupons: couponList,
        });
      }
    }
    return result;
  }, [coupons, deals]);

  const tabs: { id: DealTab; label: string; count: number }[] = [
    { id: 'all', label: 'All Deals', count: uniqueDeals.length },
    { id: 'on-sale', label: 'On Sale', count: deals.filter(d => d.discount_pct !== null && d.discount_pct > 0).length },
    { id: 'coupons', label: 'Coupons', count: retailersWithCoupons.length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50">
          Deals & Savings
        </h1>
        <p className="mt-2 text-surface-600 dark:text-surface-400">
          Products currently on sale, discounted, or with available coupon codes across all retailers.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-surface-200 dark:border-surface-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-surface-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`animate-pulse rounded-xl p-4 ${
                isGlass ? 'glass-1' : 'border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900'
              }`}
            >
              <div className="mb-3 h-4 w-3/4 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="mb-2 h-3 w-1/2 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="h-3 w-1/4 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Coupons tab */}
      {!loading && !error && activeTab === 'coupons' && (
        <div className="space-y-4">
          {retailersWithCoupons.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400">
              No active coupon codes available right now.
            </p>
          ) : (
            retailersWithCoupons.map((r) => (
              <div
                key={r.retailer_id}
                className={`rounded-xl p-5 ${
                  isGlass ? 'glass-1' : 'border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900'
                }`}
              >
                <h3 className="mb-3 text-lg font-bold text-surface-900 dark:text-surface-100">
                  {r.retailer_name}
                </h3>
                <div className="space-y-2">
                  {r.coupons.map((coupon) => (
                    <div key={coupon.id} className="flex items-center gap-3">
                      <CouponChip coupon={coupon} />
                      <span className="text-sm text-surface-600 dark:text-surface-400">
                        {coupon.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Deal listings */}
      {!loading && !error && activeTab !== 'coupons' && (
        <>
          {uniqueDeals.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400">
              No active deals found right now. Check back later!
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {uniqueDeals.map((deal) => (
                <Link
                  key={`${deal.product_id}-${deal.retailer_id}`}
                  to={`/product/${deal.product_id}`}
                  className={`group rounded-xl p-4 transition-shadow hover:shadow-md ${
                    isGlass ? 'glass-1' : 'border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900'
                  }`}
                >
                  {/* Image */}
                  <div className="mb-3 flex items-start gap-3">
                    {deal.product_image ? (
                      <img
                        src={deal.product_image}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-800">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-surface-900 group-hover:text-primary-600 dark:text-surface-100 dark:group-hover:text-primary-400 line-clamp-2">
                        {deal.product_name}
                      </p>
                      {deal.product_brand && (
                        <p className="text-xs text-surface-500 dark:text-surface-400">
                          {deal.product_brand}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Price + badges */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-surface-900 dark:text-surface-100">
                      {formatPrice(deal.price)}
                    </span>
                    {deal.compare_at_price != null && deal.compare_at_price > deal.price && (
                      <span className="font-mono text-sm text-surface-400 line-through dark:text-surface-500">
                        {formatPrice(deal.compare_at_price)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {deal.discount_pct != null && deal.discount_pct > 0 && (
                      <DealBadge type="discount" value={deal.discount_pct} />
                    )}
                    {deal.on_sale && !deal.discount_pct && (
                      <DealBadge type="on-sale" />
                    )}
                    <span className="text-[0.6rem] text-surface-400 dark:text-surface-500">
                      at {deal.retailer_name}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
