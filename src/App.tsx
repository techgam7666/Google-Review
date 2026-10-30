/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminDashboard } from './components/AdminDashboard';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { AuthProvider } from './context/AuthContext';
import { BusinessProvider } from './context/BusinessContext';
import { HomePage } from './pages/HomePage';
import { MerchantWorkspacePage } from './pages/MerchantWorkspacePage';
import { ReviewGeneratorPage } from './pages/ReviewGeneratorPage';

function ScrollToTopOnRouteChange() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [pathname, hash]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <BrowserRouter>
          <ScrollToTopOnRouteChange />
          <div className="min-h-screen flex flex-col bg-white text-slate-900">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/dashboard" element={<MerchantWorkspacePage />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/review/demo" element={<Navigate to="/dashboard" replace />} />
                <Route path="/business-demo" element={<Navigate to="/dashboard" replace />} />
                <Route path="/review/:businessSlug" element={<ReviewGeneratorPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </BusinessProvider>
    </AuthProvider>
  );
}
