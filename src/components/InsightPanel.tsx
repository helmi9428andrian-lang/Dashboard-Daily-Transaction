import React from 'react';
import type { CompareMode } from '../types/finance';

interface InsightPanelProps {
  incomeInsights: string[];
  expenseInsights: string[];
  compareMode: CompareMode;
}

export const InsightPanel: React.FC<InsightPanelProps> = ({
  incomeInsights,
  expenseInsights,
  compareMode,
}) => {
  const compareText =
    compareMode === 'yoy'
      ? 'Dibanding tahun lalu'
      : compareMode === 'prev'
        ? 'Dibanding periode sebelumnya'
        : 'Tanpa pembanding';

  return (
    <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Insight Periode
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {compareText}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2.5">
            Ringkasan Pemasukan
          </h3>
          {incomeInsights.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum ada pemasukan tercatat pada periode ini.
            </p>
          ) : (
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {incomeInsights.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-emerald-500 select-none mt-0.5" aria-hidden="true">
                    —
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 md:pl-6">
          <h3 className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-2.5">
            Ringkasan Pengeluaran
          </h3>
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {expenseInsights.map((line, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-rose-500 select-none mt-0.5" aria-hidden="true">
                  —
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
