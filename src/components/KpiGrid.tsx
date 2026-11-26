import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt, Scale, Wallet } from 'lucide-react';
import type { DeltaInfo, PeriodStats } from '../types/finance';
import { computeDelta } from '../utils/financeEngine';
import { formatRp } from '../utils/format';

interface KpiGridProps {
  stats: PeriodStats;
  compareStats: PeriodStats | null;
  calendarDays: number;
  txCount: number;
}

interface KpiCardItem {
  label: string;
  value: string;
  sublabel?: string;
  tone: 'emerald' | 'rose' | 'indigo' | 'neutral';
  delta: DeltaInfo | null;
  icon: React.FC<{ className?: string }>;
}

export const KpiGrid: React.FC<KpiGridProps> = ({
  stats,
  compareStats,
  calendarDays,
  txCount,
}) => {
  const net = stats.i - stats.e;
  const avgDailyExpense = stats.e / (calendarDays || 1);
  const savingsRate = stats.i > 0 ? Math.round((net / stats.i) * 100) : null;

  const items: KpiCardItem[] = [
    {
      label: 'Total Pemasukan',
      value: formatRp(stats.i),
      tone: 'emerald',
      delta: computeDelta(stats.i, compareStats?.i, true),
      icon: ArrowDownLeft,
    },
    {
      label: 'Total Pengeluaran',
      value: formatRp(stats.e),
      tone: 'rose',
      delta: computeDelta(stats.e, compareStats?.e, false),
      icon: ArrowUpRight,
    },
    {
      label: 'Selisih Bersih',
      value: formatRp(net),
      sublabel: savingsRate !== null ? `Tabungan ${savingsRate}%` : undefined,
      tone: 'indigo',
      delta: null,
      icon: Scale,
    },
    {
      label: 'Rata-rata Keluar / Hari',
      value: formatRp(avgDailyExpense),
      sublabel: `${calendarDays || 1} hari rentang`,
      tone: 'neutral',
      delta: null,
      icon: Wallet,
    },
    {
      label: 'Jumlah Transaksi',
      value: txCount.toLocaleString('id-ID'),
      tone: 'neutral',
      delta: null,
      icon: Receipt,
    },
  ];

  const toneAccent: Record<KpiCardItem['tone'], string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    neutral: 'text-slate-900 dark:text-white',
  };

  const iconBg: Record<KpiCardItem['tone'], string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors rounded-2xl p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {item.label}
              </span>
              <span className={`p-1.5 rounded-lg shrink-0 ${iconBg[item.tone]}`}>
                <Icon className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between gap-2 flex-wrap">
              <span
                className={`text-xl font-bold tracking-tight font-mono-num tabular-nums ${
                  item.label === 'Selisih Bersih' && net < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : toneAccent[item.tone]
                }`}
              >
                {item.value}
              </span>
              {item.delta ? (
                <span
                  className={`text-xs font-semibold tabular-nums whitespace-nowrap ${
                    item.delta.isGood
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {item.delta.text}
                </span>
              ) : item.sublabel ? (
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
                  {item.sublabel}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
