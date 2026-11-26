import React, { useMemo, useState } from 'react';
import { Filter, Pencil, Plus, RotateCcw, Trash2, Wallet, X } from 'lucide-react';
import type {
  AccountFlow,
  AccountGroup,
  AccountTemplateItem,
  Transaction,
} from '../types/finance';
import { CHART_PALETTE, formatCompactRp, formatDateLabel, formatRp } from '../utils/format';

interface AccountsTransfersViewProps {
  accounts: AccountFlow[];
  transfers: Transaction[];
  accountTemplates: AccountTemplateItem[];
  onAddAccountTemplate: (item: AccountTemplateItem) => void;
  onRemoveAccountTemplate: (name: string) => void;
  onAddTransfer: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

type SortMode = 'freq' | 'volume' | 'net' | 'alpha';
type UsageMetric = 'freq' | 'volume' | 'pct';
type ActivityFilter = 'all' | 'cashflow' | 'transfer';

export const AccountsTransfersView: React.FC<AccountsTransfersViewProps> = ({
  accounts,
  transfers,
  accountTemplates,
  onAddAccountTemplate,
  onRemoveAccountTemplate,
  onAddTransfer,
  onEdit,
  onDelete,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [hideInvestmentAccounts, setHideInvestmentAccounts] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<SortMode>('freq');
  const [usageMetric, setUsageMetric] = useState<UsageMetric>('freq');
  const [hoverUsageIdx, setHoverUsageIdx] = useState<number | null>(null);
  const [hoverFlowIdx, setHoverFlowIdx] = useState<number | null>(null);
  const [limit, setLimit] = useState(15);
  const [newTplName, setNewTplName] = useState('');
  const [newTplGroup, setNewTplGroup] = useState<AccountGroup>('Bank');

  const scopedAccounts = useMemo(() => {
    const base = hideInvestmentAccounts
      ? accounts.filter((a) => !a.isInvestment)
      : accounts;

    const activityFiltered = base.filter((a) => {
      if (activityFilter === 'cashflow') return a.incomeCount + a.expenseCount > 0;
      if (activityFilter === 'transfer') return a.transferCount > 0;
      return true;
    });

    const sorted = [...activityFiltered].sort((a, b) => {
      if (sortBy === 'freq') return b.txCount - a.txCount || b.weight - a.weight;
      if (sortBy === 'volume') return b.weight - a.weight;
      if (sortBy === 'net') return b.net - a.net;
      return a.account.localeCompare(b.account);
    });

    return sorted;
  }, [accounts, hideInvestmentAccounts, activityFilter, sortBy]);

  const tableAccounts = useMemo(() => {
    if (!selectedAccount) return scopedAccounts;
    return scopedAccounts.filter((a) => a.account === selectedAccount);
  }, [scopedAccounts, selectedAccount]);

  const totalTxAcrossScoped = useMemo(
    () => scopedAccounts.reduce((acc, a) => acc + a.txCount, 0) || 1,
    [scopedAccounts]
  );

  const chartAccounts = useMemo(() => scopedAccounts.slice(0, 8), [scopedAccounts]);

  const maxUsageVal = useMemo(() => {
    let mx = 1;
    for (const a of chartAccounts) {
      const val =
        usageMetric === 'freq'
          ? a.txCount
          : usageMetric === 'pct'
            ? (a.txCount / totalTxAcrossScoped) * 100
            : a.weight;
      if (val > mx) mx = val;
    }
    return mx;
  }, [chartAccounts, usageMetric, totalTxAcrossScoped]);

  const maxFlowVal = useMemo(() => {
    let mx = 1;
    for (const a of chartAccounts) {
      const inflow = a.income + a.transferIn;
      const outflow = a.expense + a.transferOut;
      mx = Math.max(mx, inflow, outflow);
    }
    return mx;
  }, [chartAccounts]);

  const filteredTransfers = useMemo(() => {
    if (!selectedAccount) return transfers;
    return transfers.filter(
      (t) => t.account === selectedAccount || t.category === selectedAccount
    );
  }, [transfers, selectedAccount]);

  const visibleTransfers = filteredTransfers.slice(0, limit);
  const hiddenInvCount = useMemo(
    () => accounts.filter((a) => a.isInvestment).length,
    [accounts]
  );
  const hasFilter = Boolean(selectedAccount) || activityFilter !== 'all' || !hideInvestmentAccounts;

  return (
    <div className="space-y-4">
      {/* Filter Toolbar for Accounts & Transfers */}
      <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 mr-1">
            <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="whitespace-nowrap">Filter Akun:</span>
          </div>

          <select
            aria-label="Pilih akun spesifik"
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Akun ({scopedAccounts.length})</option>
            {scopedAccounts.map((a) => (
              <option key={a.account} value={a.account}>
                {a.account} ({a.txCount}x)
              </option>
            ))}
          </select>

          <select
            aria-label="Filter jenis aktivitas akun"
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Semua Aktivitas</option>
            <option value="cashflow">Pemasukan &amp; Pengeluaran</option>
            <option value="transfer">Transfer Antar Akun</option>
          </select>

          <select
            aria-label="Urutkan akun"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="freq">Paling Sering Dipakai</option>
            <option value="volume">Total Volume Terbesar</option>
            <option value="net">Net Arus Tertinggi</option>
            <option value="alpha">Nama A–Z</option>
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap shrink-0 ml-1">
            <input
              type="checkbox"
              checked={hideInvestmentAccounts}
              onChange={(e) => {
                setHideInvestmentAccounts(e.target.checked);
                setSelectedAccount('');
              }}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              Fokus akun bank/dompet{hiddenInvCount > 0 ? ` (${hiddenInvCount} akun invest di halaman Investasi)` : ''}
            </span>
          </label>

          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSelectedAccount('');
                setActivityFilter('all');
                setHideInvestmentAccounts(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onAddTransfer}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Catat Transfer
        </button>
      </div>

      {/* 2 Interactive Account Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Most Frequently Used Accounts */}
        <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Akun Paling Sering Dipakai
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Klik batang akun untuk memfilter tabel dan riwayat transfer.
              </p>
            </div>

            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800 shrink-0">
              {(
                [
                  ['freq', 'Frekuensi'],
                  ['pct', '% Porsi'],
                  ['volume', 'Volume Rp'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setUsageMetric(k)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    usageMetric === k
                      ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {chartAccounts.length === 0 ? (
            <div className="flex-1 min-h-[180px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada aktivitas akun untuk filter ini.
            </div>
          ) : (
            <div className="relative space-y-2.5">
              {chartAccounts.map((acc, idx) => {
                const rawVal =
                  usageMetric === 'freq'
                    ? acc.txCount
                    : usageMetric === 'pct'
                      ? (acc.txCount / totalTxAcrossScoped) * 100
                      : acc.weight;
                const widthPct = Math.max(3, (rawVal / maxUsageVal) * 100);
                const sharePct = ((acc.txCount / totalTxAcrossScoped) * 100)
                  .toFixed(1)
                  .replace('.', ',');
                const color = CHART_PALETTE[idx % CHART_PALETTE.length];
                const isSelected = selectedAccount === acc.account;
                const isHovered = hoverUsageIdx === idx;

                return (
                  <div
                    key={acc.account}
                    onMouseEnter={() => setHoverUsageIdx(idx)}
                    onMouseLeave={() => setHoverUsageIdx(null)}
                    onClick={() =>
                      setSelectedAccount((prev) =>
                        prev === acc.account ? '' : acc.account
                      )
                    }
                    className={`relative p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-500/10'
                        : isHovered
                          ? 'bg-slate-50 dark:bg-slate-800/50'
                          : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {acc.account}
                      </span>
                      <span className="font-mono-num tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                        {usageMetric === 'freq' && (
                          <>
                            <strong className="text-slate-900 dark:text-white">{acc.txCount}x</strong>
                            <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                              · {sharePct}%
                            </span>
                          </>
                        )}
                        {usageMetric === 'pct' && (
                          <>
                            <strong className="text-slate-900 dark:text-white">{sharePct}%</strong>
                            <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                              · {acc.txCount}x
                            </span>
                          </>
                        )}
                        {usageMetric === 'volume' && (
                          <>
                            <strong className="text-slate-900 dark:text-white">
                              {formatCompactRp(acc.weight)}
                            </strong>
                            <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                              · {acc.txCount}x
                            </span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: color,
                          opacity:
                            selectedAccount && !isSelected ? 0.35 : 1,
                        }}
                      />
                    </div>

                    {/* Floating Glass Tooltip on Hover */}
                    {isHovered && (
                      <div className="pointer-events-none absolute right-2 -top-2 -translate-y-full z-20 w-60 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#172036]/95 backdrop-blur-md p-3 shadow-xl shadow-slate-900/10 dark:shadow-black/50">
                        <div className="flex items-baseline justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {acc.account}
                          </span>
                          <span className="text-[11px] font-mono-num text-indigo-600 dark:text-indigo-400 font-semibold">
                            {acc.txCount}x ({sharePct}%)
                          </span>
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Pengeluaran ({acc.expenseCount}x)</span>
                            <span className="font-mono-num tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                              {formatRp(acc.expense)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Pemasukan ({acc.incomeCount}x)</span>
                            <span className="font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                              {formatRp(acc.income)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Transfer ({acc.transferCount}x)</span>
                            <span className="font-mono-num tabular-nums text-slate-700 dark:text-slate-200">
                              +{formatCompactRp(acc.transferIn)} / −{formatCompactRp(acc.transferOut)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Chart 2: Account Inflow vs Outflow Comparison */}
        <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Arus Masuk vs Keluar Per Akun
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Perbandingan total dana masuk (pemasukan + transfer masuk) dan keluar per akun.
            </p>
          </div>

          {chartAccounts.length === 0 ? (
            <div className="flex-1 min-h-[180px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada data arus akun.
            </div>
          ) : (
            <>
              <div className="space-y-3 flex-1">
                {chartAccounts.map((acc, idx) => {
                  const inflow = acc.income + acc.transferIn;
                  const outflow = acc.expense + acc.transferOut;
                  const inPct = Math.max(inflow > 0 ? 3 : 0, (inflow / maxFlowVal) * 100);
                  const outPct = Math.max(outflow > 0 ? 3 : 0, (outflow / maxFlowVal) * 100);
                  const isHovered = hoverFlowIdx === idx;

                  return (
                    <div
                      key={acc.account}
                      onMouseEnter={() => setHoverFlowIdx(idx)}
                      onMouseLeave={() => setHoverFlowIdx(null)}
                      className={`relative p-2 rounded-xl transition-colors ${
                        isHovered ? 'bg-slate-50 dark:bg-slate-800/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {acc.account}
                        </span>
                        <span
                          className={`font-mono-num tabular-nums font-semibold shrink-0 ${
                            acc.net >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          Net {formatCompactRp(acc.net)}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                              style={{ width: `${inPct}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-[11px] font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                            {formatCompactRp(inflow)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-rose-500 transition-all duration-200"
                              style={{ width: `${outPct}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-[11px] font-mono-num tabular-nums text-rose-600 dark:text-rose-400 shrink-0">
                            {formatCompactRp(outflow)}
                          </span>
                        </div>
                      </div>

                      {isHovered && (
                        <div className="pointer-events-none absolute right-2 -top-2 -translate-y-full z-20 w-56 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#172036]/95 backdrop-blur-md p-3 shadow-xl shadow-slate-900/10 dark:shadow-black/50">
                          <div className="pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
                            {acc.account}
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-slate-400">Dana Masuk</span>
                              <span className="font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                                {formatRp(inflow)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-slate-400">Dana Keluar</span>
                              <span className="font-mono-num tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                                {formatRp(outflow)}
                              </span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80">
                              <span className="text-slate-500 dark:text-slate-400">Net Arus</span>
                              <span
                                className={`font-mono-num tabular-nums font-bold ${
                                  acc.net >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {formatRp(acc.net)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-5 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" aria-hidden="true" />
                  Dana Masuk (Pemasukan + Transfer Masuk)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" aria-hidden="true" />
                  Dana Keluar (Pengeluaran + Transfer Keluar)
                </span>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Account Matrix & Transfer History */}
      <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Mutasi Per Akun{selectedAccount ? ` · ${selectedAccount}` : ''}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Akun investasi &amp; valas (seperti BNI Valas, Bibit) dikelola di halaman Investasi &amp; Valas.
            </p>
          </div>
        </div>

        {tableAccounts.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada pergerakan akun yang sesuai filter pada periode ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-2 text-left">Akun</th>
                  <th className="py-2.5 px-2 text-right">Dipakai</th>
                  <th className="py-2.5 px-2 text-right">Pemasukan</th>
                  <th className="py-2.5 px-2 text-right">Pengeluaran</th>
                  <th className="py-2.5 px-2 text-right">Transfer Masuk</th>
                  <th className="py-2.5 px-2 text-right">Transfer Keluar</th>
                  <th className="py-2.5 px-2 text-right">Net Arus</th>
                </tr>
              </thead>
              <tbody>
                {tableAccounts.slice(0, 16).map((acc) => (
                  <tr
                    key={acc.account}
                    onClick={() =>
                      setSelectedAccount((prev) =>
                        prev === acc.account ? '' : acc.account
                      )
                    }
                    className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-2 text-left font-medium text-slate-900 dark:text-slate-100">
                      {acc.account}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-slate-600 dark:text-slate-300">
                      {acc.txCount}x
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatRp(acc.income)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-rose-600 dark:text-rose-400">
                      {formatRp(acc.expense)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-slate-700 dark:text-slate-300">
                      {formatRp(acc.transferIn)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-slate-700 dark:text-slate-300">
                      {formatRp(acc.transferOut)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono-num tabular-nums font-bold ${
                        acc.net < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatRp(acc.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Riwayat Transfer pada Periode{selectedAccount ? ` (${selectedAccount})` : ''}
          </h3>

          {visibleTransfers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum ada transfer antar akun yang sesuai filter pada periode ini.
            </p>
          ) : (
            <div className="divide-y divide-dashed divide-slate-200 dark:divide-slate-800">
              {visibleTransfers.map((tx) => (
                <div
                  key={tx.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono-num tabular-nums text-slate-400 dark:text-slate-500 w-11 shrink-0">
                      {tx.time || '00:00'}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {tx.account} → {tx.category}
                      </span>
                      {tx.note && (
                        <span className="text-slate-500 dark:text-slate-400 text-xs">
                          {' '}
                          · {tx.note}
                        </span>
                      )}
                      <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">
                        {formatDateLabel(tx.date)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-num tabular-nums font-semibold text-slate-900 dark:text-slate-100 mr-2">
                      {formatRp(tx.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(tx)}
                      aria-label="Edit transfer"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(tx)}
                      aria-label="Hapus transfer"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredTransfers.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((prev) => prev + 30)}
              className="mt-3 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Tampilkan lebih banyak
            </button>
          )}
        </div>
      </section>

      {/* Starter Account Templates Manager */}
      <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Daftar Template Akun (Dropdown Transaksi)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Akun di bawah ini otomatis muncul sebagai pilihan dropdown saat Anda menambah pengeluaran, pemasukan, transfer, atau investasi.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = newTplName.trim();
              if (!clean) return;
              onAddAccountTemplate({ name: clean, group: newTplGroup });
              setNewTplName('');
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="Nama akun baru (mis. Bank 4 / LinkAja)"
              className="w-56 bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              aria-label="Kelompok akun"
              value={newTplGroup}
              onChange={(e) => setNewTplGroup(e.target.value as AccountGroup)}
              className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Bank">Bank</option>
              <option value="E-Wallet">E-Wallet</option>
              <option value="Tunai">Tunai</option>
              <option value="Investasi">Investasi</option>
              <option value="Lainnya">Lainnya</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Akun</span>
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(['Bank', 'E-Wallet', 'Tunai', 'Investasi', 'Lainnya'] as AccountGroup[])
            .filter(
              (grp) => grp !== 'Lainnya' || accountTemplates.some((t) => t.group === 'Lainnya')
            )
            .map((grp) => {
            const items = accountTemplates.filter((t) => t.group === grp);
            return (
              <div
                key={grp}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F1A]/60 p-3.5"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  {grp} ({items.length})
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada akun</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li
                        key={item.name}
                        className="flex items-center justify-between gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#131929] border border-slate-200/80 dark:border-slate-800 rounded-lg px-2.5 py-1.5"
                      >
                        <span className="truncate">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveAccountTemplate(item.name)}
                          aria-label={`Hapus template ${item.name}`}
                          className="p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
