import React from 'react';
import { Calendar, GitCompareArrows } from 'lucide-react';
import type { CompareMode, PeriodPreset, PeriodRange } from '../types/finance';

interface PeriodToolbarProps {
  preset: PeriodPreset;
  period: PeriodRange;
  compareMode: CompareMode;
  onSelectPreset: (preset: PeriodPreset) => void;
  onChangeRange: (from: string, to: string) => void;
  onChangeCompare: (mode: CompareMode) => void;
}

export const PeriodToolbar: React.FC<PeriodToolbarProps> = ({
  preset,
  period,
  compareMode,
  onSelectPreset,
  onChangeRange,
  onChangeCompare,
}) => {
  return (
    <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          <select
            aria-label="Pilih periode preset"
            value={preset}
            onChange={(e) => onSelectPreset(e.target.value as PeriodPreset)}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="mtd">MTD (bulan berjalan)</option>
            <option value="pm">Bulan lalu</option>
            <option value="m3">3 bulan terakhir</option>
            <option value="m6">6 bulan terakhir</option>
            <option value="h1">Half year 1 (Jan–Jun)</option>
            <option value="h2">Half year 2 (Jul–Des)</option>
            <option value="ytd">YTD (tahun berjalan)</option>
            <option value="all">Semua data</option>
            <option value="custom">Kustom…</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Dari</span>
            <input
              type="date"
              value={period.from}
              onChange={(e) => {
                const v = e.target.value;
                if (v && period.to && v <= period.to) onChangeRange(v, period.to);
              }}
              className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <span className="text-slate-400 dark:text-slate-600">–</span>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Sampai</span>
            <input
              type="date"
              value={period.to}
              onChange={(e) => {
                const v = e.target.value;
                if (v && period.from && period.from <= v) onChangeRange(period.from, v);
              }}
              className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <GitCompareArrows className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
        <select
          aria-label="Pilih periode pembanding"
          value={compareMode}
          onChange={(e) => onChangeCompare(e.target.value as CompareMode)}
          className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="prev">Banding: Periode sebelumnya (MoM/QoQ)</option>
          <option value="yoy">Banding: Tahun lalu (YoY)</option>
          <option value="none">Tanpa pembanding</option>
        </select>
      </div>
    </div>
  );
};
