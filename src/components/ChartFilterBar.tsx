import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import type { AmountRangeFilter, ChartFilterState } from '../utils/financeEngine';

interface ChartFilterBarProps {
  filter: ChartFilterState;
  accounts: string[];
  categories: string[];
  filteredCount: number;
  totalCount: number;
  onChange: (next: ChartFilterState) => void;
  onReset: () => void;
}

export const ChartFilterBar: React.FC<ChartFilterBarProps> = ({
  filter,
  accounts,
  categories,
  filteredCount,
  totalCount,
  onChange,
  onReset,
}) => {
  const hasActiveFilter =
    Boolean(filter.account) || Boolean(filter.category) || filter.amountRange !== 'all';

  return (
    <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 mr-1">
          <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="whitespace-nowrap">Filter Grafik:</span>
        </div>

        <select
          aria-label="Filter grafik berdasarkan akun"
          value={filter.account}
          onChange={(e) => onChange({ ...filter, account: e.target.value })}
          className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Semua Akun</option>
          {accounts.map((acc) => (
            <option key={acc} value={acc}>
              Akun: {acc}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter grafik berdasarkan kategori"
          value={filter.category}
          onChange={(e) => onChange({ ...filter, category: e.target.value })}
          className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Semua Kategori</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              Kategori: {cat}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter grafik berdasarkan nominal"
          value={filter.amountRange}
          onChange={(e) =>
            onChange({ ...filter, amountRange: e.target.value as AmountRangeFilter })
          }
          className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Semua Nominal</option>
          <option value="lt100k">&lt; Rp100 rb (Transaksi kecil)</option>
          <option value="ge50k">≥ Rp50 rb</option>
          <option value="ge100k">≥ Rp100 rb</option>
          <option value="ge500k">≥ Rp500 rb</option>
          <option value="ge1m">≥ Rp1 jt (Transaksi besar)</option>
        </select>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        {hasActiveFilter
          ? `Menampilkan ${filteredCount.toLocaleString('id-ID')} dari ${totalCount.toLocaleString('id-ID')} transaksi`
          : `${totalCount.toLocaleString('id-ID')} transaksi pada periode`}
      </span>
    </div>
  );
};
