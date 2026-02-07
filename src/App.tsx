import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ExperienceModeProvider } from './context/ExperienceModeContext';
import { BuildProvider } from './context/BuildContext';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import SharedBuildPage from './pages/SharedBuildPage';
import ProductListPage from './pages/ProductListPage';
import ProductDetailPage from './pages/ProductDetailPage';
import QuizPage from './pages/QuizPage';
import CommunityBuildsPage from './pages/CommunityBuildsPage';

export default function App() {
  return (
    <ThemeProvider>
      <ExperienceModeProvider>
      <BuildProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/build/:shareCode" element={<SharedBuildPage />} />
              <Route path="/products/:category" element={<ProductListPage />} />
              <Route path="/product/:id" element={<ProductDetailPage />} />
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="/builds" element={<CommunityBuildsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </BuildProvider>
      </ExperienceModeProvider>
    </ThemeProvider>
  );
}
