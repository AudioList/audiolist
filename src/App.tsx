import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ExperienceModeProvider } from './context/ExperienceModeContext';
import { BuildProvider } from './context/BuildContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/layout/Layout';
import GlassLayout from './components/layout/GlassLayout';
import HomePage from './pages/HomePage';

// Lazy-loaded routes for code splitting
const SharedBuildPage = lazy(() => import('./pages/SharedBuildPage'));
const ProductListPage = lazy(() => import('./pages/ProductListPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const CommunityBuildsPage = lazy(() => import('./pages/CommunityBuildsPage'));
const DealsPage = lazy(() => import('./pages/DealsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const TriagePage = lazy(() => import('./pages/TriagePage'));

function LoadingSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-primary-400" />
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
                <Route path="/deals" element={<DealsPage />} />
                <Route path="/quiz" element={<QuizPage />} />
                <Route path="/builds" element={<CommunityBuildsPage />} />
                <Route path="/triage" element={<TriagePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              {/* Glass theme routes -- same pages, different layout */}
              <Route element={<GlassLayout />}>
                <Route path="/glass" element={<HomePage />} />
                <Route path="/glass/build/:shareCode" element={<SharedBuildPage />} />
                <Route path="/glass/products/:category" element={<ProductListPage />} />
                <Route path="/glass/product/:id" element={<ProductDetailPage />} />
                <Route path="/glass/deals" element={<DealsPage />} />
                <Route path="/glass/quiz" element={<QuizPage />} />
                <Route path="/glass/builds" element={<CommunityBuildsPage />} />
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
