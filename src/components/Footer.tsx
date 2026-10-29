import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50/70">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-slate-200/80">
          <div className="md:col-span-5 space-y-3">
            <Link to="/" className="text-base font-bold tracking-tight text-slate-900">
              ReviewEase AI
            </Link>
            <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
              Monthly QR review scanner platform for local shops, clinics, salons, and cafes — helping guests write genuine Google reviews in seconds.
            </p>
          </div>

          <div className="md:col-span-3 space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Platform</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/#how-it-works" className="hover:text-slate-900 transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/#features" className="hover:text-slate-900 transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/#pricing" className="hover:text-slate-900 transition-colors">
                  Monthly Shop Plans
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="hover:text-slate-900 transition-colors">
                  Merchant Portal &amp; QR Setup
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Transparency Policy</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              ReviewEase AI never posts reviews on a customer&apos;s behalf, gates negative ratings, or alters negative sentiment into praise. Customers copy their edited text and publish directly on Google.
            </p>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            © {new Date().getFullYear()} ReviewEase AI. Monthly QR Scanner SaaS for local businesses.
          </span>
          <div className="flex items-center gap-2">
            <span>English</span>
            <span aria-hidden="true">·</span>
            <span>हिन्दी</span>
            <span aria-hidden="true">·</span>
            <span>Hinglish</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
