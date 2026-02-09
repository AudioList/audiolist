import { useState } from 'react';
import type { RetailerCoupon } from '../../types';

interface CouponChipProps {
  coupon: RetailerCoupon;
  productHandle?: string;
  storeDomain?: string;
}

export default function CouponChip({ coupon, productHandle, storeDomain }: CouponChipProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  // Build auto-apply URL if available
  const autoApplyUrl = coupon.auto_apply_url && productHandle && storeDomain
    ? `https://${storeDomain}/discount/${coupon.code}?redirect=/products/${productHandle}`
    : coupon.auto_apply_url ?? null;

  const discountLabel = coupon.discount_type === 'percentage'
    ? `${coupon.discount_value}% off`
    : coupon.discount_type === 'fixed'
      ? `$${coupon.discount_value} off`
      : 'Free shipping';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        title={`${coupon.description} -- Click to copy code`}
        className="group inline-flex items-center gap-1 rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-mono font-bold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" aria-hidden="true">
          <path fillRule="evenodd" d="M10.986 3H12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1.014A2.25 2.25 0 0 1 7.25 1h1.5a2.25 2.25 0 0 1 2.236 2ZM9.5 4v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4h3Z" clipRule="evenodd" />
        </svg>
        {copied ? 'Copied!' : coupon.code}
      </button>
      <span className="text-[0.55rem] text-surface-500 dark:text-surface-400">
        {discountLabel}
      </span>
      {autoApplyUrl && (
        <a
          href={autoApplyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.55rem] text-primary-600 underline hover:text-primary-500 dark:text-primary-400"
          title="Auto-apply this discount"
        >
          auto-apply
        </a>
      )}
    </span>
  );
}
