import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Brand and copyright */}
          <div className="text-sm text-surface-500 dark:text-surface-400">
            <span className="font-semibold text-surface-700 dark:text-surface-200">
              AudioList
            </span>{' '}
            &copy; {year}
          </div>

          {/* Links */}
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/products/iem"
              className="text-surface-500 transition-colors hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
            >
              Products
            </Link>
            <span className="text-surface-300 dark:text-surface-700">|</span>
            <Link
              to="/"
              className="text-surface-500 transition-colors hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
            >
              Builder
            </Link>
          </nav>
        </div>

        {/* PPI info */}
        <p className="mt-4 text-center text-xs text-surface-400 dark:text-surface-500 sm:text-left">
          Predicted Preference Index — Scores indicate what listeners would rank the sound out of 100.
        </p>
      </div>
    </footer>
  );
}
