import { useState } from 'react';
import type { TargetType } from '../../types';

interface AdvancedSettingsProps {
  targetType: TargetType;
  onTargetTypeChange: (type: TargetType) => void;
}

export default function AdvancedSettings({ targetType, onTargetTypeChange }: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200 transition-colors"
        aria-expanded={isOpen}
      >
        <span>Advanced Settings</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-surface-200 dark:border-surface-700 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                Predicted Preference Index Target Curve
              </p>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                Reference target used for audio quality score calculations
              </p>
            </div>
            <div
              className="inline-flex rounded-lg border border-surface-300 dark:border-surface-600"
              role="group"
              aria-label="Target curve"
            >
              <button
                type="button"
                onClick={() => onTargetTypeChange('df')}
                className={`rounded-l-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  targetType === 'df'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-surface-600 hover:bg-surface-100 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                }`}
              >
                Diffuse Field
              </button>
              <button
                type="button"
                onClick={() => onTargetTypeChange('harman')}
                className={`-ml-px rounded-r-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  targetType === 'harman'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-surface-600 hover:bg-surface-100 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                }`}
              >
                Harman
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
