import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { CategoryId, Product } from '../types';
import { useBuild } from '../context/BuildContext';
import { supabase } from '../lib/supabase';
import { getRecommendation, type QuizAnswers, type QuizResult } from '../lib/quizRecommender';
import type { StarterBuild } from '../lib/starterBuilds';

/** ------------------------------------------------------------------ */
/* Quiz Questions Definition                                           */
/** ------------------------------------------------------------------ */

interface QuizOption {
  value: string;
  label: string;
  description: string;
}

interface QuizQuestion {
  id: keyof QuizAnswers;
  title: string;
  subtitle: string;
  options: QuizOption[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'budget',
    title: 'What is your budget?',
    subtitle: 'We will find the best setup in your price range.',
    options: [
      { value: 'under50', label: 'Under $50', description: 'Great starting point with surprising quality' },
      { value: '50to150', label: '$50 -- $150', description: 'The sweet spot for portable audio' },
      { value: '150to500', label: '$150 -- $500', description: 'Serious gear, noticeable upgrade' },
      { value: '500to1000', label: '$500 -- $1,000', description: 'Enthusiast-grade equipment' },
      { value: 'over1000', label: '$1,000+', description: 'Reference-level listening' },
    ],
  },
  {
    id: 'location',
    title: 'Where will you mostly listen?',
    subtitle: 'This helps us pick the right form factor.',
    options: [
      { value: 'portable', label: 'On the go', description: 'Commuting, walking, traveling' },
      { value: 'desk', label: 'At my desk', description: 'Home office, gaming, focused listening' },
      { value: 'bed', label: 'In bed / couch', description: 'Relaxed, comfortable listening' },
      { value: 'workout', label: 'Working out', description: 'Gym, running, active use' },
      { value: 'all', label: 'Everywhere', description: 'I need something versatile' },
    ],
  },
  {
    id: 'genre',
    title: 'What do you listen to most?',
    subtitle: 'Different genres benefit from different tuning.',
    options: [
      { value: 'pop_rock', label: 'Pop / Rock', description: 'Vocals, guitars, energetic mixes' },
      { value: 'classical', label: 'Classical / Jazz', description: 'Orchestral, acoustic, detailed' },
      { value: 'hiphop', label: 'Hip-Hop / R&B', description: 'Bass-heavy, rhythmic, vocal-forward' },
      { value: 'electronic', label: 'Electronic / EDM', description: 'Synths, sub-bass, wide soundstage' },
      { value: 'podcast', label: 'Podcasts / Vocal', description: 'Speech clarity is the priority' },
      { value: 'mixed', label: 'A bit of everything', description: 'Balanced tuning works best' },
    ],
  },
  {
    id: 'priority',
    title: 'What matters most to you?',
    subtitle: 'We will optimize for your top priority.',
    options: [
      { value: 'quality', label: 'Sound quality', description: 'Best possible audio performance' },
      { value: 'value', label: 'Value for money', description: 'Maximum bang for buck' },
      { value: 'portability', label: 'Portability', description: 'Light, compact, easy to carry' },
      { value: 'comfort', label: 'Comfort', description: 'Long listening sessions without fatigue' },
      { value: 'build', label: 'Build quality', description: 'Durable, premium materials' },
    ],
  },
  {
    id: 'existingGear',
    title: 'Do you have any audio gear already?',
    subtitle: 'We can build around what you already own.',
    options: [
      { value: 'none', label: 'Starting from scratch', description: 'I need everything' },
      { value: 'dac', label: 'I have a DAC', description: 'I can convert digital to analog already' },
      { value: 'amp', label: 'I have an amp', description: 'I can power headphones already' },
      { value: 'both', label: 'I have a DAC and amp', description: 'I just need headphones / IEMs' },
    ],
  },
];

/** ------------------------------------------------------------------ */
/* Tier badge (reused from StarterBuildCards style)                    */
/** ------------------------------------------------------------------ */

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '$50': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  '$150': { bg: 'bg-sky-50 dark:bg-sky-900/20', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-200 dark:border-sky-800' },
  '$500': { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800' },
  '$1000': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
};

/** ------------------------------------------------------------------ */
/* Component                                                          */
/** ------------------------------------------------------------------ */

export default function QuizPage() {
  const navigate = useNavigate();
  const { setProduct, setName, setDescription, clearBuild } = useBuild();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({
    genre: '',
    budget: '',
    location: '',
    priority: '',
    existingGear: '',
  });
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);

  const currentQuestion = QUESTIONS[step];
  const totalSteps = QUESTIONS.length;
  const isLastStep = step === totalSteps - 1;
  const showResults = result !== null;

  const handleSelect = useCallback(
    (value: string) => {
      const updated = { ...answers, [currentQuestion.id]: value };
      setAnswers(updated);

      if (isLastStep) {
        // Calculate recommendation
        const rec = getRecommendation(updated);
        setResult(rec);
      } else {
        // Go to next question
        setStep((s) => s + 1);
      }
    },
    [answers, currentQuestion, isLastStep]
  );

  const handleBack = useCallback(() => {
    if (showResults) {
      setResult(null);
    } else if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step, showResults]);

  const handleRestart = useCallback(() => {
    setStep(0);
    setAnswers({ genre: '', budget: '', location: '', priority: '', existingGear: '' });
    setResult(null);
  }, []);

  const handleLoadBuild = useCallback(
    async (build: StarterBuild) => {
      setLoading(true);
      try {
        const productIds = build.items.map((item) => item.productId);
        const { data: products, error } = await supabase
          .from('products')
          .select('*')
          .in('id', productIds);

        if (error || !products) {
          console.error('Failed to fetch quiz build products:', error?.message);
          setLoading(false);
          return;
        }

        const productMap = new Map<string, Product>();
        for (const p of products) {
          productMap.set(p.id, p as Product);
        }

        clearBuild();
        await new Promise((resolve) => setTimeout(resolve, 50));

        setName(build.name);
        setDescription(build.description);

        for (const item of build.items) {
          const product = productMap.get(item.productId);
          if (product) {
            setProduct(item.categoryId as CategoryId, product);
          }
        }

        navigate('/');
      } catch (err) {
        console.error('Error loading build:', err);
      } finally {
        setLoading(false);
      }
    },
    [setProduct, setName, setDescription, clearBuild, navigate]
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold text-surface-900 dark:text-surface-50">
          {showResults ? 'Your Recommendation' : 'Audio Setup Quiz'}
        </h1>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          {showResults
            ? 'Based on your answers, here is what we recommend.'
            : 'Answer a few questions and we will find the perfect build for you.'}
        </p>
      </div>

      {/* Progress bar (hidden on results) */}
      {!showResults && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
            <span>
              Question {step + 1} of {totalSteps}
            </span>
            <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Question */}
      {!showResults && currentQuestion && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
              {currentQuestion.title}
            </h2>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {currentQuestion.subtitle}
            </p>
          </div>

          <div className="space-y-2">
            {currentQuestion.options.map((option) => {
              const isSelected = answers[currentQuestion.id] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full rounded-xl border-2 px-5 py-4 text-left transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
                      : 'border-surface-200 bg-white hover:border-surface-300 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:hover:border-surface-600 dark:hover:bg-surface-800'
                  }`}
                >
                  <span
                    className={`block text-base font-semibold ${
                      isSelected
                        ? 'text-primary-700 dark:text-primary-300'
                        : 'text-surface-900 dark:text-surface-100'
                    }`}
                  >
                    {option.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-sm ${
                      isSelected
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-surface-500 dark:text-surface-400'
                    }`}
                  >
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Navigation */}
          {step > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleBack}
                className="text-sm font-medium text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
              >
                &larr; Back
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {showResults && result && (
        <div className="space-y-6">
          {/* Recommended build */}
          <div className="rounded-xl border-2 border-primary-500 bg-white p-6 dark:border-primary-400 dark:bg-surface-900">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                Best Match
              </span>
              {(() => {
                const tc = TIER_COLORS[result.recommended.tier];
                return tc ? (
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${tc.bg} ${tc.text} ${tc.border}`}>
                    {result.recommended.tier}
                  </span>
                ) : null;
              })()}
            </div>
            <h3 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              {result.recommended.name}
            </h3>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {result.recommended.useCase}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-surface-700 dark:text-surface-300">
              {result.explanation}
            </p>

            {/* Items */}
            <div className="mt-4 space-y-2">
              {result.recommended.items.map((item) => (
                <div
                  key={`${item.categoryId}-${item.productId}`}
                  className="flex items-start gap-3 rounded-lg bg-surface-50 px-4 py-3 dark:bg-surface-800/50"
                >
                  <span className="mt-0.5 shrink-0 rounded bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    {item.categoryId === 'headphone' ? 'HP' : item.categoryId.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                      {item.productName}
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {item.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Price + action */}
            <div className="mt-5 flex items-center justify-between border-t border-surface-100 pt-4 dark:border-surface-800">
              <span className="text-xl font-bold text-surface-900 dark:text-surface-100">
                ~${result.recommended.budget}
              </span>
              <button
                type="button"
                onClick={() => handleLoadBuild(result.recommended)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  'Load This Build'
                )}
              </button>
            </div>
          </div>

          {/* Alternatives */}
          {result.alternatives.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold text-surface-700 dark:text-surface-300">
                Also consider:
              </h3>
              <div className="space-y-3">
                {result.alternatives.map((alt) => {
                  const tc = TIER_COLORS[alt.tier];
                  return (
                    <div
                      key={alt.id}
                      className="flex items-center justify-between rounded-xl border border-surface-200 bg-white px-5 py-4 dark:border-surface-700 dark:bg-surface-900"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-surface-900 dark:text-surface-100">
                            {alt.name}
                          </span>
                          {tc && (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tc.bg} ${tc.text} ${tc.border}`}>
                              {alt.tier}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-surface-500 dark:text-surface-400">
                          {alt.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadBuild(alt)}
                        disabled={loading}
                        className="ml-4 shrink-0 rounded-lg border border-primary-500 px-4 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:opacity-50 dark:border-primary-400 dark:text-primary-400 dark:hover:bg-primary-900/20"
                      >
                        Load
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom actions */}
          <div className="flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700">
            <button
              type="button"
              onClick={handleRestart}
              className="text-sm font-medium text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
            >
              &larr; Retake Quiz
            </button>
            <Link
              to="/"
              className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Go to Builder &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
