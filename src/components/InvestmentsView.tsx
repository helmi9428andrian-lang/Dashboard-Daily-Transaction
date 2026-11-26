import React, { useState } from 'react';
import {
  Activity,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type {
  AccountFlow,
  AppConfig,
  Holding,
  MarketQuote,
  Transaction,
} from '../types/finance';
import {
  formatDateLabel,
  formatForeignCurrency,
  formatInstrumentUnits,
  formatRp,
  getCurrencyInfo,
} from '../utils/format';

interface InvestmentsViewProps {
  holdings: Holding[];
  investmentAccounts: AccountFlow[];
  investTransactions: Transaction[];
  config: AppConfig;
  liveQuotes: Record<string, MarketQuote>;
  liveFx: Record<string, MarketQuote>;
  ihsgQuote: MarketQuote | null;
  isSyncingLive: boolean;
  autoTrackLive: boolean;
  lastSyncAt: string | null;
  watchlist: string[];
  onToggleAutoTrack: () => void;
  onRefreshLive: () => void;
  onSyncLiveKurs: () => void;
  onAddWatchlist: (ticker: string) => void;
  onRemoveWatchlist: (ticker: string) => void;
  onQuickBuyStock: (ticker: string, price: number) => void;
  onUpdatePrice: (key: string, price: number) => void;
  onUpdateKurs: (currency: string, field: 'b' | 'j', value: number) => void;
  onAddInvestment: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  holdings,
  investmentAccounts,
  investTransactions,
  config,
  liveQuotes,
  liveFx,
  ihsgQuote,
  isSyncingLive,
  autoTrackLive,
  lastSyncAt,
  watchlist,
  onToggleAutoTrack,
  onRefreshLive,
  onSyncLiveKurs,
  onAddWatchlist,
  onRemoveWatchlist,
  onQuickBuyStock,
  onUpdatePrice,
  onUpdateKurs,
  onAddInvestment,
  onEdit,
  onDelete,
}) => {
  const [tickerInput, setTickerInput] = useState('');

  const currencies = ['USD', 'SGD', 'JPY', 'GBP', 'EUR'];
  holdings.forEach((h) => {
    const code = h.symbol.toUpperCase();
    if (/^valas$/i.test(h.instrumentType) && code && !currencies.includes(code)) {
      currencies.push(code);
    }
  });

  const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalMarketValue = holdings.reduce(
    (sum, h) => sum + (h.currentValue !== null ? h.currentValue : h.costBasis),
    0
  );
  const totalPl = totalMarketValue - totalCostBasis;
  const totalPlPct = totalCostBasis > 0 ? (totalPl / totalCostBasis) * 100 : null;

  const handleWatchlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tickerInput.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!cleaned) return;
    onAddWatchlist(cleaned);
    setTickerInput('');
  };

  return (
    <div className="space-y-4">
      {/* Live Market & IHSG Tracker Header Bar */}
      <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Indeks IHSG (^JKSE)</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-xl font-extrabold font-mono-num tabular-nums text-slate-900 dark:text-white">
                  {ihsgQuote
                    ? ihsgQuote.price.toLocaleString('id-ID', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : isSyncingLive
                      ? 'Memuat…'
                      : '—'}
                </span>
                {ihsgQuote && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold font-mono-num tabular-nums ${
                      ihsgQuote.change >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {ihsgQuote.change >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {ihsgQuote.change >= 0 ? '+' : ''}
                    {ihsgQuote.change.toFixed(2)} ({ihsgQuote.changePercent >= 0 ? '+' : ''}
                    {ihsgQuote.changePercent.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Kurs USD Spot
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-base font-bold font-mono-num tabular-nums text-slate-900 dark:text-white">
                  {liveFx.USD ? formatRp(liveFx.USD.price) : formatRp(config.kurs.USD?.j || 0)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {lastSyncAt ? `Update ${lastSyncAt}` : 'Belum disinkronkan'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleAutoTrack}
              aria-pressed={autoTrackLive}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
                autoTrackLive
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{autoTrackLive ? 'Auto-Update Live: Aktif (60d)' : 'Auto-Update Live: Nonaktif'}</span>
            </button>

            <button
              type="button"
              onClick={onRefreshLive}
              disabled={isSyncingLive}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin' : ''}`} />
              <span>{isSyncingLive ? 'Menyinkronkan…' : 'Perbarui Live'}</span>
            </button>

            <button
              type="button"
              onClick={onAddInvestment}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catat Investasi / Valas</span>
            </button>
          </div>
        </div>
      </section>

      {/* Portfolio KPI Summary Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Total Modal Investasi
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono-num tabular-nums text-slate-900 dark:text-white">
            {formatRp(totalCostBasis)}
          </div>
        </div>
        <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Nilai Pasar Portofolio
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono-num tabular-nums text-slate-900 dark:text-white">
            {formatRp(totalMarketValue)}
          </div>
        </div>
        <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Potensi Untung / Rugi
          </div>
          <div
            className={`mt-1.5 text-lg font-extrabold font-mono-num tabular-nums ${
              totalPl < 0
                ? 'text-rose-600 dark:text-rose-400'
                : totalPl > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-white'
            }`}
          >
            {totalPl < 0 ? '−' : totalPl > 0 ? '+' : ''}
            {formatRp(Math.abs(totalPl))}
            {totalPlPct !== null ? ` (${totalPlPct >= 0 ? '+' : ''}${totalPlPct.toFixed(1)}%)` : ''}
          </div>
        </div>
        <div className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Instrumen Aktif
          </div>
          <div className="mt-1.5 text-lg font-extrabold font-mono-num tabular-nums text-slate-900 dark:text-white">
            {holdings.length} aset
          </div>
        </div>
      </section>

      {/* Investment & Forex Instruments Portfolio */}
      <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Instrumen Investasi &amp; Valas
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Satuan mata uang (USD $, SGD S$, JPY ¥, dll) dan harga saham IHSG otomatis menyesuaikan dengan aset serta data pasar terkini.
            </p>
          </div>
        </div>

        {holdings.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada transaksi investasi atau valas tercatat. Klik “Catat Investasi / Valas” untuk memulai.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-2 text-left">Instrumen</th>
                  <th className="py-2.5 px-2 text-right">Saldo / Unit</th>
                  <th className="py-2.5 px-2 text-right">Rata-rata Beli</th>
                  <th className="py-2.5 px-2 text-right">Modal (Rp)</th>
                  <th className="py-2.5 px-2 text-right">Harga / Kurs Terkini</th>
                  <th className="py-2.5 px-2 text-right">Nilai Pasar</th>
                  <th className="py-2.5 px-2 text-right">Untung / Rugi</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((x) => {
                  const pl = x.currentValue !== null ? x.currentValue - x.costBasis : null;
                  const plPct = pl !== null && x.costBasis > 0 ? (pl / x.costBasis) * 100 : null;
                  const isValas = /^valas$/i.test(x.instrumentType);
                  const isSaham = /^saham$/i.test(x.instrumentType);
                  const symUpper = x.symbol.toUpperCase().replace(/\.JK$/i, '');
                  const liveStock = isSaham ? liveQuotes[symUpper] : undefined;
                  const liveRate = isValas ? liveFx[symUpper] : undefined;
                  const unitDisplay = formatInstrumentUnits(x.units, x.instrumentType, x.symbol);
                  const currMeta = isValas ? getCurrencyInfo(x.symbol) : null;

                  return (
                    <tr
                      key={x.key}
                      className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-2 text-left">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {isValas && currMeta ? `${currMeta.code} (${currMeta.symbol.trim()})` : x.symbol}{' '}
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                            · {x.instrumentType}
                          </span>
                        </div>
                        {liveStock?.name && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                            {liveStock.name}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {unitDisplay.primary}
                        </div>
                        {unitDisplay.secondary && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {unitDisplay.secondary}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-slate-700 dark:text-slate-300">
                        <div>{formatRp(x.avgPrice)}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {isValas && currMeta
                            ? `/ 1 ${currMeta.code}`
                            : isSaham
                              ? '/ lbr'
                              : '/ unit'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums text-slate-700 dark:text-slate-300">
                        {formatRp(x.costBasis)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums">
                        {isValas ? (
                          <div>
                            <div className="text-slate-800 dark:text-slate-200 font-medium">
                              {x.currentPrice ? formatRp(x.currentPrice) : 'Isi kurs di bawah'}
                            </div>
                            {liveRate && (
                              <div className="text-xs text-indigo-600 dark:text-indigo-400">
                                Spot: {formatRp(liveRate.price)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              step="any"
                              value={config.prices[x.key] || ''}
                              placeholder="Harga"
                              onChange={(e) => onUpdatePrice(x.key, Number(e.target.value) || 0)}
                              className="w-28 text-right bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono-num tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            {liveStock && (
                              <span
                                className={`text-xs font-semibold ${
                                  liveStock.changePercent >= 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                Live {liveStock.changePercent >= 0 ? '▲ +' : '▼ '}
                                {liveStock.changePercent.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums">
                        <div className="text-slate-900 dark:text-slate-100 font-semibold">
                          {x.currentValue !== null ? formatRp(x.currentValue) : '—'}
                        </div>
                        {isValas && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {formatForeignCurrency(x.units, x.symbol)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono-num tabular-nums">
                        {pl === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              pl < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {pl < 0 ? '−' : '+'}
                            {formatRp(Math.abs(pl))}
                            {plPct !== null ? ` (${plPct.toFixed(1)}%)` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* IDX / IHSG Stock Watchlist */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pantau Saham IHSG (Live IDX)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pantau pergerakan harga saham Bursa Efek Indonesia secara live dan catat pembelian langsung ke portofolio.
              </p>
            </div>

            <form onSubmit={handleWatchlistSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="Kode saham (mis. BBRI)"
                maxLength={10}
                className="w-44 bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono-num uppercase text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pantau</span>
              </button>
            </form>
          </div>

          {watchlist.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Belum ada emiten di daftar pantau. Masukkan kode saham IDX seperti BBCA, BBRI, BMRI, atau TLKM.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {watchlist.map((sym) => {
                const q = liveQuotes[sym];
                const isUp = q ? q.change >= 0 : true;
                return (
                  <div
                    key={sym}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F1A]/70 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold font-mono-num text-slate-900 dark:text-white">
                          {sym}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">IDX</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {q?.name || 'Menunggu kuotasi…'}
                      </div>
                      <div className="mt-2 flex items-baseline gap-2 font-mono-num tabular-nums">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {q ? formatRp(q.price) : '—'}
                        </span>
                        {q && (
                          <span
                            className={`text-xs font-semibold ${
                              isUp
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isUp ? '+' : ''}
                            {q.changePercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onQuickBuyStock(sym, q ? Math.round(q.price) : 0)}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap"
                      >
                        + Beli
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveWatchlist(sym)}
                        aria-label={`Hapus ${sym} dari pantauan`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dedicated Investment Accounts Summary (BNI Valas, Bibit, RDN, etc.) */}
        {investmentAccounts.length > 0 && (
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              Akun Investasi &amp; Valas Terkait
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Rekening khusus investasi seperti BNI Valas, Bibit, atau RDN dipisahkan ke halaman ini agar arus rekening operasional tetap bersih.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-2 text-left">Akun Investasi</th>
                    <th className="py-2 px-2 text-right">Aktivitas</th>
                    <th className="py-2 px-2 text-right">Top-Up / Transfer Masuk</th>
                    <th className="py-2 px-2 text-right">Tarik / Transfer Keluar</th>
                    <th className="py-2 px-2 text-right">Investasi (Beli−Jual)</th>
                    <th className="py-2 px-2 text-right">Kas Mengendap</th>
                  </tr>
                </thead>
                <tbody>
                  {investmentAccounts.map((acc) => (
                    <tr
                      key={acc.account}
                      className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2 px-2 text-left font-semibold text-slate-900 dark:text-white">
                        {acc.account}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-num tabular-nums text-slate-600 dark:text-slate-300">
                        {acc.txCount}x
                      </td>
                      <td className="py-2 px-2 text-right font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatRp(acc.transferIn + acc.income)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-num tabular-nums text-rose-600 dark:text-rose-400">
                        {formatRp(acc.transferOut + acc.expense)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-num tabular-nums text-slate-700 dark:text-slate-300">
                        {formatRp(acc.investNet)}
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-mono-num tabular-nums font-bold ${
                          acc.net < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatRp(acc.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BNI Forex Rates Table */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Referensi Kurs Valas ({currencies.join(', ')})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Nilai aset valas dihitung dari Kurs Jual. Sinkronkan dari kurs pasar live atau ubah manual sesuai situs BNI.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSyncLiveKurs}
                disabled={isSyncingLive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin' : ''}`} />
                <span>Sync Kurs Live</span>
              </button>
              <a
                href="https://www.bni.co.id/id-id/beranda/informasi-valas"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Buka Kurs BNI</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2 px-2 text-left">Mata Uang</th>
                  <th className="py-2 px-2 text-right">Kurs Spot Live</th>
                  <th className="py-2 px-2 text-right">Kurs Jual</th>
                  <th className="py-2 px-2 text-right">Kurs Beli</th>
                  <th className="py-2 px-2 text-right">Selisih</th>
                  <th className="py-2 px-2 text-right">Diperbarui</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((code) => {
                  const meta = getCurrencyInfo(code);
                  const k = config.kurs[code] || { b: 0, j: 0, ts: '' };
                  const spot = liveFx[code];
                  const spread = k.j && k.b ? k.j - k.b : null;
                  return (
                    <tr
                      key={code}
                      className="border-b border-slate-100 dark:border-slate-800/80"
                    >
                      <td className="py-2 px-2 text-left">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {code} ({meta.symbol.trim()})
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                          {meta.name}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono-num tabular-nums text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                        {spot ? formatRp(spot.price) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="any"
                          value={k.j || ''}
                          onChange={(e) => onUpdateKurs(code, 'j', Number(e.target.value) || 0)}
                          className="w-28 text-right bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono-num tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="any"
                          value={k.b || ''}
                          onChange={(e) => onUpdateKurs(code, 'b', Number(e.target.value) || 0)}
                          className="w-28 text-right bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono-num tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono-num tabular-nums text-slate-600 dark:text-slate-400">
                        {spread !== null ? spread.toLocaleString('id-ID') : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-xs text-slate-500 dark:text-slate-400">
                        {k.ts || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Investment transaction log */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Transaksi Investasi pada Periode
          </h3>
          {investTransactions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum ada transaksi investasi pada periode ini.
            </p>
          ) : (
            <div className="divide-y divide-dashed divide-slate-200 dark:divide-slate-800">
              {investTransactions.slice(0, 20).map((tx) => {
                const isValas = /^valas$/i.test(tx.category);
                const isSaham = /^saham$/i.test(tx.category);
                const unitInfo = isValas
                  ? `${formatForeignCurrency(tx.unit || 0, tx.subcategory)} ${tx.subcategory.toUpperCase()}`
                  : isSaham
                    ? `${(tx.unit || 0).toLocaleString('id-ID')} lbr ${tx.subcategory}`
                    : `${tx.unit || 0} ${tx.subcategory}`;

                return (
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
                          {tx.action === -1 ? 'Jual ' : 'Beli '}
                          {unitInfo} @ {formatRp(tx.price || 0)} ({tx.category})
                        </span>
                        {tx.note && (
                          <span className="text-slate-500 dark:text-slate-400 text-xs">
                            {' '}
                            · {tx.note}
                          </span>
                        )}
                        <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">
                          {tx.account} · {formatDateLabel(tx.date)}
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
                        aria-label="Edit investasi"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(tx)}
                        aria-label="Hapus investasi"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
