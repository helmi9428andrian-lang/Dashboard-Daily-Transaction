import React from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  FileSpreadsheet,
  LayoutDashboard,
  TrendingUp,
  X,
} from 'lucide-react';
import type { NavSection } from '../types/finance';

interface SidebarProps {
  active: NavSection;
  onSelect: (section: NavSection) => void;
  totalCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'ledger', label: 'Buku Kas Harian', icon: BookOpen },
  { id: 'accounts', label: 'Akun & Transfer', icon: ArrowLeftRight },
  { id: 'investments', label: 'Investasi & Valas', icon: TrendingUp },
  { id: 'spreadsheet', label: 'Spreadsheet & PDF', icon: FileSpreadsheet },
];

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  onSelect,
  totalCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#131929] border-r border-slate-200 dark:border-slate-800 px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 mb-8">
          <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            101Financial
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Tutup menu"
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="space-y-1" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 px-2 space-y-1.5">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Penyimpanan Lokal Browser
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {totalCount.toLocaleString('id-ID')} transaksi tercatat
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen">
        {navContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-[80vw] h-full shadow-xl">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
