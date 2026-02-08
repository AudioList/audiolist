import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-6xl font-extrabold text-surface-300 dark:text-surface-600">
          404
        </h1>
        <p className="mt-4 text-xl font-semibold text-surface-800 dark:text-surface-200">
          Page not found
        </p>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
