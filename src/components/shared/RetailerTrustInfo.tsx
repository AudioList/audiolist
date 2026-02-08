import { useState, useRef, useEffect } from 'react';
import type { Retailer } from '../../types';

interface RetailerTrustInfoProps {
  retailer: Retailer;
}

export default function RetailerTrustInfo({ retailer }: RetailerTrustInfoProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const hasInfo = retailer.description || retailer.ships_from || retailer.return_policy || retailer.authorized_dealer;
  if (!hasInfo) return null;

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center rounded p-0.5 text-surface-400 transition-colors hover:text-primary-500 dark:text-surface-500 dark:hover:text-primary-400"
        aria-label={`Info about ${retailer.name}`}
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-surface-200 bg-white p-3 shadow-lg dark:border-surface-600 dark:bg-surface-800"
        >
          {/* Retailer name */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-bold text-surface-900 dark:text-surface-100">
              {retailer.name}
            </span>
            {retailer.authorized_dealer && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-2.5 w-2.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                    clipRule="evenodd"
                  />
                </svg>
                Authorized
              </span>
            )}
          </div>

          {/* Description */}
          {retailer.description && (
            <p className="mb-2 text-xs text-surface-600 dark:text-surface-300">
              {retailer.description}
            </p>
          )}

          {/* Details */}
          <div className="space-y-1">
            {retailer.ships_from && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-surface-500 dark:text-surface-400">Ships from:</span>
                <span className="text-surface-700 dark:text-surface-200">{retailer.ships_from}</span>
              </div>
            )}
            {retailer.return_policy && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-surface-500 dark:text-surface-400">Returns:</span>
                <span className="text-surface-700 dark:text-surface-200">{retailer.return_policy}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
