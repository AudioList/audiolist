import { Outlet } from 'react-router-dom';
import { GlassModeProvider } from '../../context/GlassModeContext';
import Header from './Header';
import Footer from './Footer';
import PriceAlertBanner from '../shared/PriceAlertBanner';

export default function GlassLayout() {
  return (
    <GlassModeProvider>
      <div className="glass-theme relative flex min-h-screen flex-col">
        <div className="glass-mesh-bg pointer-events-none fixed inset-0 -z-10" />
        <Header />
        <main className="relative z-0 mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <PriceAlertBanner />
          <Outlet />
        </main>
        <Footer />
      </div>
    </GlassModeProvider>
  );
}
