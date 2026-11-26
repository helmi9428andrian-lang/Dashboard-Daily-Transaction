import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react';
import type { DaySummary, Transaction } from '../types/finance';
import { formatDateLabel, formatRp } from '../utils/format';

interface DailyLedgerProps {
  days: DaySummary[];
  expandedDays: Record<string, boolean>;
  onToggleDay: (date: string) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  highlightedDay?: string | null;
}

export const DailyLedger: React.FC<DailyLedgerProps> = ({
  days,
  expandedDays,
  onToggleDay,
  onEdit,
  onDelete,
  highlightedDay,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [limit, setLimit] = useState(40);

  const filteredDays = useMemo(() => {
    const q = search.trim().toLowerCase();
    const reversed = [...days].reverse();

    return reversed
      .map((day) => {
        const filteredTx = day.tx.filter((tx) => {
          if (typeFilter === 'income' && tx.type !== 1) return false;
          if (typeFilter === 'expense' && tx.type !== 0) return false;
          if (!q) return true;
          return (
            tx.category.toLowerCase().includes(q) ||
            tx.subcategory.toLowerCase().includes(q) ||
            tx.account.toLowerCase().includes(q) ||
            tx.note.toLowerCase().includes(q)
          );
        });
        if (filteredTx.length === 0) return null;

        let i = 0;
        let e = 0;
        filteredTx.forEach((tx) => {
          if (tx.type === 1) i += tx.amount;
          else e += tx.amount;
        });

        return {
          d: day.d,
          n: filteredTx.length,
          i,
          e,
          tx: filteredTx,
        };
      })
      .filter((x): x is DaySummary => x !== null);
  }, [days, search, typeFilter]);

  const visibleDays = filteredDays.slice(0, limit);

  return (
    <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Transaksi Per Hari
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {filteredDays.length} hari aktif · Klik baris tanggal untuk melihat rincian
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kategori, akun, catatan…"
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
            />
          </div>

          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800">
            {(
              [
                ['all', 'Semua'],
                ['income', 'Masuk'],
                ['expense', 'Keluar'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTypeFilter(k)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === k
                    ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visibleDays.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Tidak ada transaksi yang sesuai filter pada periode ini.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-2 text-left">Tanggal</th>
                <th className="py-2.5 px-2 text-right">Transaksi</th>
                <th className="py-2.5 px-2 text-right">Pemasukan</th>
                <th className="py-2.5 px-2 text-right">Pengeluaran</th>
                <th className="py-2.5 px-2 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day) => {
                const isOpen = !!expandedDays[day.d];
                const net = day.i - day.e;
                const isHighlighted = highlightedDay === day.d;

                return (
                  <React.Fragment key={day.d}>
                    <tr
                      id={`day-row-${day.d}`}
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => onToggleDay(day.d)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggleDay(day.d);
                        }
                      }}
                      className={`border-b border-slate-100 dark:border-slate-800/80 cursor-pointer transition-colors ${
                        isOpen || isHighlighted
                          ? 'bg-indigo-50/70 dark:bg-indigo-500/10 font-semibold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-2 text-left text-slate-900 dark:text-slate-100">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span>{formatDateLabel(day.d)}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-slate-600 dark:text-slate-300">
                        {day.n}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400">
                        {day.i > 0 ? formatRp(day.i) : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-rose-600 dark:text-rose-400">
                        {day.e > 0 ? formatRp(day.e) : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono-num tabular-nums ${
                          net < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : net > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatRp(net)}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1322]">
                        <td colSpan={5} className="px-4 py-2">
                          <div className="divide-y divide-dashed divide-slate-200 dark:divide-slate-800">
                            {[...day.tx]
                              .sort((a, b) => (a.time < b.time ? 1 : -1))
                              .map((tx) => (
                                <div
                                  key={tx.id}
                                  className="py-2 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-mono-num tabular-nums text-slate-400 dark:text-slate-500 w-11 shrink-0">
                                      {tx.time || '00:00'}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="font-medium text-slate-900 dark:text-slate-100">
                                        {tx.category || 'Tanpa kategori'}
                                      </span>
                                      {tx.subcategory && (
                                        <span className="text-slate-500 dark:text-slate-400">
                                          {' '}
                                          › {tx.subcategory}
                                        </span>
                                      )}
                                      {tx.note && (
                                        <span className="text-slate-500 dark:text-slate-400">
                                          {' '}
                                          · {tx.note}
                                        </span>
                                      )}
                                      <span className="text-slate-400 dark:text-slate-500 ml-2">
                                        {tx.account}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span
                                      className={`font-mono-num tabular-nums font-semibold mr-2 ${
                                        tx.type === 1
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {tx.type === 1 ? '+' : '−'}
                                      {formatRp(tx.amount)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(tx);
                                      }}
                                      aria-label="Edit transaksi"
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(tx);
                                      }}
                                      aria-label="Hapus transaksi"
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredDays.length > limit && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setLimit((prev) => prev + 40)}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Tampilkan lebih banyak ({filteredDays.length - limit} hari lagi)
          </button>
        </div>
      )}
    </section>
  );
};
