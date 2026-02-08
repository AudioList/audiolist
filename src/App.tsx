import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ExperienceModeProvider } from './context/ExperienceModeContext';
import { BuildProvider } from './context/BuildContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';

// Lazy-loaded routes for code splitting
const SharedBuildPage = lazy(() => import('./pages/SharedBuildPage'));
const ProductListPage = lazy(() => import('./pages/ProductListPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const CommunityBuildsPage = lazy(() => import('./pages/CommunityBuildsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function LoadingSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-surface-200 border-t-primary-500" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ExperienceModeProvider>
      <BuildProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/build/:shareCode" element={<SharedBuildPage />} />
                <Route path="/products/:category" element={<ProductListPage />} />
                <Route path="/product/:id" element={<ProductDetailPage />} />
                <Route path="/quiz" element={<QuizPage />} />
                <Route path="/builds" element={<CommunityBuildsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
      </BuildProvider>
      </ExperienceModeProvider>
    </ThemeProvider>
  );
}
