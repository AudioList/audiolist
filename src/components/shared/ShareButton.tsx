import { useState, useCallback } from 'react';

interface ShareButtonProps {
  onShare: () => Promise<string>;
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

export default function ShareButton({ onShare }: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied'>('idle');

  const handleClick = useCallback(async () => {
    if (state === 'loading') return;

    setState('loading');
    try {
      const url = await onShare();
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('idle');
    }
  }, [onShare, state]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className={`
        inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
        transition-all duration-150
        ${
          state === 'copied'
            ? 'bg-ppi-excellent text-white'
            : 'bg-primary-600 hover:bg-primary-500 text-white'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        focus:ring-offset-surface-900
      `}
    >
      {state === 'copied' ? <CheckIcon /> : <LinkIcon />}
      <span>{state === 'copied' ? 'Copied!' : 'Share Build'}</span>
    </button>
  );
}
