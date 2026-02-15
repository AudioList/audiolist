import { useState } from 'react';
import { getPPILabel } from '../../lib/categories';
import { useGlassMode } from '../../context/GlassModeContext';

const GLOSSARY_URL = 'https://headphones.com/blogs/features/the-glossary-of-audio-measurements-and-terms';

interface ScoreExplainerProps {
  scoreType: 'ppi' | 'sinad' | 'spinorama';
  score: number | null;
}

const EXPLANATIONS: Record<string, { title: string; description: string; scale: string }> = {
  ppi: {
    title: 'Predicted Preference Index',
    description: 'This score measures how closely the sound signature matches what most listeners prefer, based on scientific target curves. It does not measure build quality, comfort, or features -- only sound tuning accuracy.',
    scale: 'Shown as letter bands from S+ (best) to F. A-range and above are top performers, B-range is solid for most listeners.',
  },
  sinad: {
    title: 'Signal-to-Noise and Distortion',
    description: 'This measures how clean and accurate the audio signal is. A higher SINAD means less noise and distortion are added to your music. Above 98 dB is considered transparent -- meaning the device is so clean you cannot hear any flaws.',
    scale: 'Higher is better. 110+ dB is excellent, 98+ dB is great.',
  },
  spinorama: {
    title: 'Spinorama Preference Score',
    description: 'This predicts how much listeners will enjoy this speaker based on comprehensive measurements of its sound from every angle. It accounts for on-axis response, off-axis behavior, and room interaction.',
    scale: 'Higher is better. Scores above 6 are very good, above 7 are excellent.',
  },
};

function getScoreContext(scoreType: string, score: number): string {
  if (scoreType === 'ppi') {
    const band = getPPILabel(score);
    return `A score of ${score.toFixed(1)} is in band ${band} -- ${
      score >= 90 ? 'this is top-tier measured performance.' :
      score >= 80 ? 'this is strong measured performance.' :
      score >= 70 ? 'this is good measured performance for most people.' :
      score >= 60 ? 'this is mixed measured performance with tradeoffs.' :
      'this is weak measured performance and likely has clear compromises.'
    }`;
  }
  if (scoreType === 'sinad') {
    return `A SINAD of ${score.toFixed(0)} dB is ${
      score >= 110 ? 'excellent -- virtually transparent audio quality.' :
      score >= 98 ? 'great -- exceeds the audibility threshold for most listeners.' :
      score >= 85 ? 'good -- clean enough for everyday listening.' :
      score >= 70 ? 'fair -- some distortion may be noticeable.' :
      'below average -- audible distortion is likely.'
    }`;
  }
  // spinorama
  return `A preference score of ${score.toFixed(1)} is ${
    score >= 7 ? 'excellent -- this speaker should sound great to most listeners.' :
    score >= 6 ? 'very good -- well above average speaker performance.' :
    score >= 5 ? 'good -- decent sound quality for the category.' :
    'below average for measured speakers.'
  }`;
}

export default function ScoreExplainer({ scoreType, score }: ScoreExplainerProps) {
  const isGlass = useGlassMode();
  const storageKey = `scoreExplainer_seen_${scoreType}`;
  const hasSeenBefore = typeof window !== 'undefined' && localStorage.getItem(storageKey) === '1';
  const [expanded, setExpanded] = useState(!hasSeenBefore);

  // Mark as seen after first render so subsequent visits start collapsed
  if (!hasSeenBefore && typeof window !== 'undefined') {
    localStorage.setItem(storageKey, '1');
  }
  const info = EXPLANATIONS[scoreType];
  if (!info) return null;

  return (
    <div className={isGlass ? "glass-1 rounded-xl" : "rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/50"}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-surface-600 transition-colors hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200"
        aria-expanded={expanded}
      >
        <span>What does this score mean?</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-surface-200 px-4 py-3 dark:border-surface-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
            {info.title}
          </p>
          <p className="text-sm text-surface-700 dark:text-surface-300">
            {info.description}
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400">
            {info.scale}
          </p>
          {score !== null && (
            <p className="mt-1 text-sm font-medium text-surface-800 dark:text-surface-200">
              {getScoreContext(scoreType, score)}
            </p>
          )}
          <a
            href={GLOSSARY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Learn more in the Glossary
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
              <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
              <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
