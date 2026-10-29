import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSectionLink = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    setMobileOpen(false);

    if (location.pathname === '/') {
      const target = document.getElementById(sectionId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    navigate(`/#${sectionId}`);
  };

  const isReviewPage = location.pathname.startsWith('/review');
  const isSandboxPage = location.pathname === '/business-demo';
  const isWorkspacePage = location.pathname === '/dashboard';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single clean text wordmark */}
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600"
        >
          ReviewEase AI
        </Link>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="/#how-it-works"
            onClick={(e) => handleSectionLink(e, 'how-it-works')}
            className="hover:text-slate-950 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            How It Works
          </a>
          <a
            href="/#pricing"
            onClick={(e) => handleSectionLink(e, 'pricing')}
            className="hover:text-slate-950 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            Pricing
          </a>
          <Link
            to="/review/demo"
            className={`hover:text-slate-950 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0 ${
              isReviewPage ? 'text-indigo-600 font-semibold' : ''
            }`}
          >
            Review Demo
          </Link>
          <Link
            to="/business-demo"
            className={`hover:text-slate-950 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0 ${
              isSandboxPage ? 'text-indigo-600 font-semibold' : ''
            }`}
          >
            Business Demo
          </Link>
          <Link
            to="/dashboard"
            className={`hover:text-slate-950 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0 ${
              isWorkspacePage ? 'text-indigo-600 font-semibold' : ''
            }`}
          >
            Merchant Portal
          </Link>
        </nav>

        {/* Zone 3: 1 primary CTA on desktop + mobile toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/dashboard"
            className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {user ? 'My Workspace' : 'Start Subscription'}
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1 shadow-sm">
          <a
            href="/#how-it-works"
            onClick={(e) => handleSectionLink(e, 'how-it-works')}
            className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950"
          >
            How It Works
          </a>
          <a
            href="/#pricing"
            onClick={(e) => handleSectionLink(e, 'pricing')}
            className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950"
          >
            Pricing
          </a>
          <Link
            to="/review/demo"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${
              isReviewPage ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Review Demo
          </Link>
          <Link
            to="/business-demo"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${
              isSandboxPage ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Business Demo
          </Link>
          <Link
            to="/dashboard"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${
              isWorkspacePage ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Merchant Portal
          </Link>
          <div className="pt-2">
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {user ? 'Open My Workspace' : 'Start Subscription'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
