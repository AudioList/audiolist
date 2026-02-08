import { useState, useCallback, useRef, useEffect } from 'react';
import { useGlassMode } from '../../context/GlassModeContext';

interface ShareButtonProps {
  onShare: (opts?: { isPublic?: boolean; authorName?: string }) => Promise<string>;
  disabled?: boolean;
}

function LinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
      <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function ShareButton({ onShare, disabled = false }: ShareButtonProps) {
  const isGlass = useGlassMode();
  const [state, setState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const [showPanel, setShowPanel] = useState(false);
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!showPanel) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPanel]);

  const handleShare = useCallback(async () => {
    if (state === 'loading' || disabled) return;

    setState('loading');
    setErrorMsg(null);
    try {
      const url = await onShare({
        isPublic: publishToCommunity,
        authorName: publishToCommunity ? authorName.trim() || undefined : undefined,
      });
      await navigator.clipboard.writeText(url);
      setState('copied');
      setShowPanel(false);
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      setState('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to share build');
    }
  }, [onShare, state, disabled, publishToCommunity, authorName]);

  const handleClick = useCallback(() => {
    if (state === 'copied') return;
    if (disabled) return;
    setShowPanel((prev) => !prev);
    setErrorMsg(null);
  }, [state, disabled]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={state === 'loading' || disabled}
        title={disabled ? 'Add components to your build first' : 'Share your build with a link'}
        className={`
          inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
          transition-all duration-150
          ${
            state === 'copied'
              ? 'bg-ppi-excellent text-white'
              : 'bg-primary-600 hover:bg-primary-500 text-white'
          }
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary-600
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
          focus:ring-offset-surface-900
        `}
      >
        {state === 'copied' ? <CheckIcon /> : <LinkIcon />}
        <span>{state === 'copied' ? 'Copied!' : 'Share Build'}</span>
      </button>

      {showPanel && (
        <div
          ref={panelRef}
          className={isGlass
            ? "absolute right-0 top-full z-50 mt-2 w-72 glass-2 rounded-xl p-4 shadow-lg"
            : "absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-surface-200 bg-white p-4 shadow-lg dark:border-surface-600 dark:bg-surface-800"
          }
        >
          <p className="mb-3 text-sm font-semibold text-surface-900 dark:text-surface-100">
            Share Options
          </p>

          {/* Publish to community toggle */}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={publishToCommunity}
              onChange={(e) => setPublishToCommunity(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
            />
            <div>
              <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                Publish to Community
              </span>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                Make this build visible in the Community gallery.
              </p>
            </div>
          </label>

          {/* Author name (shown if publishing) */}
          {publishToCommunity && (
            <div className="mt-3">
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400" htmlFor="author-name">
                Your name (optional)
              </label>
              <input
                id="author-name"
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Anonymous"
                maxLength={50}
                className={isGlass
                  ? "mt-1 w-full glass-input px-3 py-1.5 text-sm text-surface-900 dark:text-surface-100"
                  : "mt-1 w-full rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm text-surface-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
                }
              />
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            onClick={handleShare}
            disabled={state === 'loading'}
            className={isGlass
              ? "mt-4 w-full glass-btn-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              : "mt-4 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
            }
          >
            {state === 'loading' ? 'Sharing...' : 'Share & Copy Link'}
          </button>
        </div>
      )}
    </div>
  );
}
