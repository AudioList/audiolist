import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useGlassMode } from '../../context/GlassModeContext';
import ThemeToggle from './ThemeToggle';
import ExperienceModeToggle from './ExperienceModeToggle';

const GLOSSARY_URL = 'https://headphones.com/blogs/features/the-glossary-of-audio-measurements-and-terms';

const navLinks = [
  { to: '/', label: 'Guide' },
  { to: '/products/iem', label: 'Products' },
  { to: '/builder', label: 'Builder' },
  { to: '/deals', label: 'Deals' },
  { to: '/builds', label: 'Community' },
] as const;

function NavItem({ to, label, isGlass }: { to: string; label: string; isGlass: boolean }) {
  const href = isGlass ? `/glass${to === '/' ? '' : to}` : to;
  const useExactMatch = !to.startsWith('/products');
  return (
    <NavLink
      to={href}
      end={useExactMatch}
      className={({ isActive }) =>
        [
          'rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isGlass
            ? isActive
              ? 'bg-primary-500/10 text-primary-700 dark:bg-primary-400/10 dark:text-primary-400 rounded-xl'
              : 'text-surface-600 hover:bg-white/40 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-white/[0.06] dark:hover:text-surface-100'
            : isActive
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
              : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100',
        ].join(' ')
      }
    >
      {label}
    </NavLink>
  );
}

function ExternalNavItem({ href, label, isGlass }: { href: string; label: string; isGlass: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isGlass
          ? 'text-surface-600 hover:bg-white/40 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-white/[0.06] dark:hover:text-surface-100'
          : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100',
      ].join(' ')}
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-50" aria-hidden="true">
        <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
        <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
      </svg>
    </a>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isGlass = useGlassMode();
  const homeLink = isGlass ? '/glass' : '/';

  return (
    <header
      className={
        isGlass
          ? 'sticky top-0 z-50 border-b border-white/20 bg-white/60 backdrop-blur-2xl dark:border-white/14 dark:bg-surface-950/60'
          : 'sticky top-0 z-50 border-b border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900'
      }
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Brand */}
        <Link to={homeLink} className="text-xl font-extrabold text-primary-600 dark:text-primary-400 tracking-tight">
          AudioList
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <NavItem key={link.to} to={link.to} label={link.label} isGlass={isGlass} />
          ))}
          <ExternalNavItem href={GLOSSARY_URL} label="Glossary" isGlass={isGlass} />
        </nav>

        {/* Right section */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ExperienceModeToggle />
          </div>
          <ThemeToggle />

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className={[
              'rounded-lg p-2 md:hidden',
              isGlass
                ? 'text-surface-500 hover:bg-white/40 dark:text-surface-400 dark:hover:bg-white/[0.06]'
                : 'text-surface-500 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800',
            ].join(' ')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              {mobileOpen ? (
                <>
                  <line x1={18} y1={6} x2={6} y2={18} />
                  <line x1={6} y1={6} x2={18} y2={18} />
                </>
              ) : (
                <>
                  <line x1={3} y1={6} x2={21} y2={6} />
                  <line x1={3} y1={12} x2={21} y2={12} />
                  <line x1={3} y1={18} x2={21} y2={18} />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav
          className={[
            'border-t px-4 pb-3 pt-2 md:hidden',
            isGlass
              ? 'border-white/20 bg-white/70 backdrop-blur-2xl dark:border-white/10 dark:bg-surface-950/80'
              : 'border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900',
          ].join(' ')}
        >
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const href = isGlass ? `/glass${link.to === '/' ? '' : link.to}` : link.to;
              return (
                <NavLink
                  key={link.to}
                  to={href}
                  end={link.to !== '/products/iem'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    [
                      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isGlass
                        ? isActive
                          ? 'bg-primary-500/10 text-primary-700 dark:bg-primary-400/10 dark:text-primary-400 rounded-xl'
                          : 'text-surface-600 hover:bg-white/40 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-white/[0.06] dark:hover:text-surface-100'
                        : isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                          : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100',
                    ].join(' ')
                  }
                >
                  {link.label}
                </NavLink>
              );
            })}
            <a
              href={GLOSSARY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className={[
                'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isGlass
                  ? 'text-surface-600 hover:bg-white/40 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-white/[0.06] dark:hover:text-surface-100'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100',
              ].join(' ')}
            >
              Glossary
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-50" aria-hidden="true">
                <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
              </svg>
            </a>
          </div>
          <div className="mt-2 flex justify-center sm:hidden">
            <ExperienceModeToggle />
          </div>
        </nav>
      )}
    </header>
  );
}
