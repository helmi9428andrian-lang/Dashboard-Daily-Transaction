import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  FileText,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react';
import { AccountsTransfersView } from './components/AccountsTransfersView';
import { ChartFilterBar } from './components/ChartFilterBar';
import {
  BreakdownDonutCard,
  DailyCashflowChart,
  MonthlyBarsChart,
  MonthlyTrendChart,
} from './components/ChartsSection';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DailyLedger } from './components/DailyLedger';
import { ImportSpreadsheetModal } from './components/ImportSpreadsheetModal';
import { InsightPanel } from './components/InsightPanel';
import { InvestmentsView } from './components/InvestmentsView';
import { KpiGrid } from './components/KpiGrid';
import { PeriodToolbar } from './components/PeriodToolbar';
import { Sidebar } from './components/Sidebar';
import { SpreadsheetHub } from './components/SpreadsheetHub';
import { TransactionModal, type InvestPrefill } from './components/TransactionModal';
import type {
  AccountTemplateItem,
  AppConfig,
  CompareMode,
  MarketQuote,
  NavSection,
  PeriodPreset,
  PeriodRange,
  ToastMessage,
  Transaction,
  TransactionType,
} from './types/finance';
import {
  applyChartFilters,
  buildCalendarAndDays,
  type ChartFilterState,
  computeAccountFlows,
  computeCompareRange,
  computeHoldings,
  computeStats,
  createSampleTransactions,
  DEFAULT_ACCOUNT_TEMPLATES,
  DEFAULT_KURS,
  filterByPeriod,
  generateInsights,
  isCashflowTx,
  resolvePresetRange,
} from './utils/financeEngine';
import { formatDateLabel } from './utils/format';
import {
  dedupKey,
  downloadTemplateExcel,
  exportFinancePDF,
  exportTransactionsExcel,
} from './utils/spreadsheet';

const LS_TX_KEY = 'artha_transactions_v2';
const LS_CFG_KEY = 'artha_config_v1';
const LS_THEME_KEY = 'artha_theme_v1';

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore storage quota errors
  }
}

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Ringkasan Keuangan',
  ledger: 'Buku Kas Harian',
  accounts: 'Akun & Transfer',
  investments: 'Investasi & Valas',
  spreadsheet: 'Spreadsheet & Laporan',
};

const DEFAULT_WATCHLIST = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'BRIS'];

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const raw = localStorage.getItem(LS_TX_KEY);
      if (raw !== null) return JSON.parse(raw) as Transaction[];
    } catch {
      // Fallback to dummy dataset
    }
    return createSampleTransactions();
  });
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = loadStorage<Partial<AppConfig>>(LS_CFG_KEY, {});
    return {
      prices: saved.prices || {},
      kurs: { ...DEFAULT_KURS, ...(saved.kurs || {}) },
      watchlist: Array.isArray(saved.watchlist) ? saved.watchlist : DEFAULT_WATCHLIST,
      accountTemplates:
        Array.isArray(saved.accountTemplates) && saved.accountTemplates.length > 0
          ? saved.accountTemplates
          : DEFAULT_ACCOUNT_TEMPLATES,
    };
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = loadStorage<'dark' | 'light' | null>(LS_THEME_KEY, null);
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [preset, setPreset] = useState<PeriodPreset>('all');
  const [period, setPeriod] = useState<PeriodRange>(() =>
    resolvePresetRange('all', transactions)
  );
  const [compareMode, setCompareMode] = useState<CompareMode>('prev');

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [highlightedDay, setHighlightedDay] = useState<string | null>(null);
  const [chartFilter, setChartFilter] = useState<ChartFilterState>({
    account: '',
    category: '',
    amountRange: 'all',
  });

  // Modals
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txModalInitialType, setTxModalInitialType] = useState<TransactionType>(0);
  const [prefillInvest, setPrefillInvest] = useState<InvestPrefill | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Live IHSG / Forex market tracking
  const [liveQuotes, setLiveQuotes] = useState<Record<string, MarketQuote>>({});
  const [liveFx, setLiveFx] = useState<Record<string, MarketQuote>>({});
  const [ihsgQuote, setIhsgQuote] = useState<MarketQuote | null>(null);
  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoTrackLive, setAutoTrackLive] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Lanjutkan',
    danger: false,
    onConfirm: () => {},
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  // Sync dark class
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    saveStorage(LS_THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  // Persist transactions and config
  useEffect(() => {
    saveStorage(LS_TX_KEY, transactions);
  }, [transactions]);

  useEffect(() => {
    saveStorage(LS_CFG_KEY, config);
  }, [config]);

  // Derived financial datasets
  const allCashflowRows = useMemo(
    () => transactions.filter(isCashflowTx),
    [transactions]
  );

  const cashflowInPeriod = useMemo(
    () => filterByPeriod(allCashflowRows, period),
    [allCashflowRows, period]
  );

  const { days, calendar } = useMemo(
    () => buildCalendarAndDays(cashflowInPeriod),
    [cashflowInPeriod]
  );

  // Chart filter options & filtered datasets
  const chartAccounts = useMemo(() => {
    const s = new Set<string>();
    allCashflowRows.forEach((r) => {
      if (r.account) s.add(r.account);
    });
    return Array.from(s).sort();
  }, [allCashflowRows]);

  const chartCategories = useMemo(() => {
    const s = new Set<string>();
    allCashflowRows.forEach((r) => {
      if (r.category) s.add(r.category);
    });
    return Array.from(s).sort();
  }, [allCashflowRows]);

  const filteredPeriodCashflow = useMemo(
    () => applyChartFilters(cashflowInPeriod, chartFilter),
    [cashflowInPeriod, chartFilter]
  );

  const filteredAllCashflow = useMemo(
    () => applyChartFilters(allCashflowRows, chartFilter),
    [allCashflowRows, chartFilter]
  );

  const { calendar: filteredCalendar } = useMemo(
    () => buildCalendarAndDays(filteredPeriodCashflow),
    [filteredPeriodCashflow]
  );

  const activeFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (chartFilter.account) parts.push(chartFilter.account);
    if (chartFilter.category) parts.push(chartFilter.category);
    if (chartFilter.amountRange === 'lt100k') parts.push('< Rp100 rb');
    else if (chartFilter.amountRange === 'ge50k') parts.push('≥ Rp50 rb');
    else if (chartFilter.amountRange === 'ge100k') parts.push('≥ Rp100 rb');
    else if (chartFilter.amountRange === 'ge500k') parts.push('≥ Rp500 rb');
    else if (chartFilter.amountRange === 'ge1m') parts.push('≥ Rp1 jt');
    return parts.join(' · ');
  }, [chartFilter]);

  const stats = useMemo(() => computeStats(cashflowInPeriod), [cashflowInPeriod]);

  const compareStats = useMemo(() => {
    const cmpRange = computeCompareRange(period, compareMode);
    if (!cmpRange) return null;
    const rows = filterByPeriod(allCashflowRows, cmpRange);
    return computeStats(rows);
  }, [allCashflowRows, period, compareMode]);

  const insights = useMemo(
    () => generateInsights(stats, compareStats, calendar.length),
    [stats, compareStats, calendar.length]
  );

  const accounts = useMemo(
    () => computeAccountFlows(transactions, period),
    [transactions, period]
  );

  const transfersInPeriod = useMemo(
    () =>
      filterByPeriod(
        transactions.filter((t) => t.type === 2),
        period
      ).sort((a, b) => (`${a.date}${a.time}` < `${b.date}${b.time}` ? 1 : -1)),
    [transactions, period]
  );

  const holdings = useMemo(
    () => computeHoldings(transactions, config),
    [transactions, config]
  );

  const watchlist = config.watchlist || DEFAULT_WATCHLIST;

  // Collect all IDX stock symbols & foreign currencies to query live market quotes
  const stockSymbolKeys = useMemo(() => {
    const syms = new Set<string>(watchlist);
    const holdingKeyByTicker: Record<string, string[]> = {};
    for (const r of transactions) {
      if (r.type !== 3) continue;
      const j = r.category || 'Lainnya';
      const n = r.subcategory || r.note || r.account || 'Tanpa nama';
      if (/^saham$/i.test(j) && n) {
        const clean = n.trim().toUpperCase().replace(/\.JK$/i, '');
        if (/^[A-Z0-9]{2,10}$/.test(clean)) {
          syms.add(clean);
          const key = `${j}|${n}`;
          if (!holdingKeyByTicker[clean]) holdingKeyByTicker[clean] = [];
          if (!holdingKeyByTicker[clean].includes(key)) {
            holdingKeyByTicker[clean].push(key);
          }
        }
      }
    }
    return {
      tickers: Array.from(syms),
      holdingKeyByTicker,
    };
  }, [transactions, watchlist]);

  const fxCodes = useMemo(() => {
    const codes = new Set<string>(['USD', 'SGD', 'JPY', 'GBP', 'EUR', 'AUD', 'MYR', 'CNY', 'HKD']);
    for (const r of transactions) {
      if (r.type !== 3) continue;
      const j = r.category || '';
      const n = r.subcategory || '';
      if (/^valas$/i.test(j) && n) {
        const c = n.trim().toUpperCase();
        if (/^[A-Z]{3}$/.test(c)) codes.add(c);
      }
    }
    return Array.from(codes);
  }, [transactions]);

  const fetchLiveMarketData = useCallback(
    async (syncKursToo = false) => {
      setIsSyncingLive(true);
      try {
        const symbolsParam = ['^JKSE', ...stockSymbolKeys.tickers].join(',');
        const fxParam = fxCodes.join(',');
        const resp = await fetch(
          `/api/market/quotes?symbols=${encodeURIComponent(symbolsParam)}&fx=${encodeURIComponent(fxParam)}`
        );
        if (!resp.ok) throw new Error('Market API error');
        const data = (await resp.json()) as {
          quotes?: Record<string, MarketQuote>;
          fx?: Record<string, MarketQuote>;
          fetchedAt?: string;
        };

        const quotes = data.quotes || {};
        const fx = data.fx || {};

        if (quotes['^JKSE']) {
          setIhsgQuote(quotes['^JKSE']);
        }
        setLiveQuotes(quotes);
        setLiveFx(fx);

        const nowStr = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setLastSyncAt(nowStr);

        // Auto-sync live IDX stock prices and BNI e-Rate FX quotes into portfolio config
        setConfig((prev) => {
          let pricesChanged = false;
          const nextPrices = { ...prev.prices };
          for (const [ticker, keys] of Object.entries(stockSymbolKeys.holdingKeyByTicker)) {
            const q = quotes[ticker];
            if (q && q.price > 0) {
              const rounded = Math.round(q.price);
              for (const k of keys) {
                if (nextPrices[k] !== rounded) {
                  nextPrices[k] = rounded;
                  pricesChanged = true;
                }
              }
            }
          }

          let kursChanged = false;
          const nextKurs = { ...prev.kurs };
          const fallbackTs = `${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;

          for (const [code, q] of Object.entries(fx)) {
            if (!q || !(q.price > 0)) continue;
            const hasBniPair = typeof q.buy === 'number' && q.buy > 0 && typeof q.sell === 'number' && q.sell > 0;
            if (!hasBniPair && !syncKursToo) continue;

            const decimals = code === 'JPY' || code === 'KRW' || code === 'THB' ? 2 : 0;
            const factor = 10 ** decimals;
            const nextSell = hasBniPair
              ? Math.round((q.sell as number) * 100) / 100
              : Math.round(q.price * 1.006 * factor) / factor;
            const nextBuy = hasBniPair
              ? Math.round((q.buy as number) * 100) / 100
              : Math.round(q.price * 0.994 * factor) / factor;
            const nextTs = hasBniPair
              ? `${q.rateUpdatedAt || fallbackTs} (BNI e-Rate)`
              : `${fallbackTs} (Live)`;

            const existing = prev.kurs[code];
            if (!existing || existing.b !== nextBuy || existing.j !== nextSell || existing.ts !== nextTs) {
              nextKurs[code] = { b: nextBuy, j: nextSell, ts: nextTs };
              kursChanged = true;
            }
          }

          if (!pricesChanged && !kursChanged) return prev;

          return {
            ...prev,
            prices: nextPrices,
            kurs: nextKurs,
          };
        });

        if (syncKursToo) {
          notify('success', 'Kurs BNI (e-Rate) & harga saham IHSG live berhasil disinkronkan.');
        }
      } catch {
        if (syncKursToo) {
          notify('error', 'Gagal mengambil data pasar live. Periksa koneksi server.');
        }
      } finally {
        setIsSyncingLive(false);
      }
    },
    [fxCodes, notify, stockSymbolKeys]
  );

  // Fetch on mount & when tracked tickers change; interval every 60s when autoTrackLive is active
  useEffect(() => {
    void fetchLiveMarketData(false);
  }, [fetchLiveMarketData]);

  useEffect(() => {
    if (!autoTrackLive) return;
    const timer = window.setInterval(() => {
      void fetchLiveMarketData(false);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [autoTrackLive, fetchLiveMarketData]);

  const investmentsInPeriod = useMemo(
    () =>
      filterByPeriod(
        transactions.filter((t) => t.type === 3),
        period
      ).sort((a, b) => (`${a.date}${a.time}` < `${b.date}${b.time}` ? 1 : -1)),
    [transactions, period]
  );

  const txCountInPeriod = useMemo(
    () => days.reduce((acc, d) => acc + d.n, 0),
    [days]
  );

  // Handlers
  const handleSelectPreset = (nextPreset: PeriodPreset) => {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      setPeriod(resolvePresetRange(nextPreset, transactions));
    }
    setExpandedDays({});
  };

  const handleChangeRange = (from: string, to: string) => {
    setPreset('custom');
    setPeriod({ from, to });
    setExpandedDays({});
  };

  const handleOpenTxForm = (
    type: TransactionType = 0,
    tx: Transaction | null = null,
    investPrefill: InvestPrefill | null = null
  ) => {
    setTxModalInitialType(type);
    setEditingTx(tx);
    setPrefillInvest(investPrefill);
    setTxModalOpen(true);
  };

  const handleSaveTx = (data: Omit<Transaction, 'id'>, editId: string | null) => {
    if (editId) {
      setTransactions((prev) =>
        prev.map((t) => (t.id === editId ? { ...data, id: editId } : t))
      );
      notify(
        'success',
        data.type === 3
          ? 'Transaksi diperbarui di Instrumen Investasi.'
          : 'Transaksi berhasil diperbarui.'
      );
    } else {
      const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setTransactions((prev) => [...prev, { ...data, id }]);
      notify(
        'success',
        data.type === 3
          ? 'Transaksi langsung dicatat ke Instrumen Investasi.'
          : 'Transaksi baru berhasil disimpan.'
      );
    }
    setTxModalOpen(false);
    setEditingTx(null);
  };

  const handleRequestDeleteTx = (tx: Transaction) => {
    setConfirmState({
      open: true,
      title: 'Hapus Transaksi',
      message: `Yakin ingin menghapus transaksi "${tx.category}${tx.note ? ` · ${tx.note}` : ''}" pada ${formatDateLabel(tx.date)}?`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => {
        setTransactions((prev) => prev.filter((item) => item.id !== tx.id));
        setConfirmState((s) => ({ ...s, open: false }));
        notify('info', 'Transaksi telah dihapus.');
      },
    });
  };

  const handleImportRows = (
    incomingRows: Omit<Transaction, 'id'>[],
    mode: 'add' | 'replace'
  ) => {
    const executeImport = () => {
      if (mode === 'replace') {
        const nextList: Transaction[] = incomingRows.map((r, i) => ({
          ...r,
          id: `imp-${Date.now()}-${i}`,
        }));
        setTransactions(nextList);
        setPreset('all');
        setPeriod(resolvePresetRange('all', nextList));
        notify('success', `${nextList.length} transaksi berhasil dimuat ke dashboard baru.`);
      } else {
        const existingKeys = new Set(transactions.map(dedupKey));
        const toAdd: Transaction[] = [];
        let skippedDup = 0;

        incomingRows.forEach((r, i) => {
          const k = dedupKey(r);
          if (existingKeys.has(k)) {
            skippedDup++;
          } else {
            existingKeys.add(k);
            toAdd.push({ ...r, id: `imp-${Date.now()}-${i}` });
          }
        });

        setTransactions((prev) => [...prev, ...toAdd]);
        if (transactions.length === 0 && toAdd.length > 0) {
          setPreset('all');
          setPeriod(resolvePresetRange('all', toAdd));
        }
        notify(
          'success',
          `${toAdd.length} transaksi ditambahkan${skippedDup > 0 ? `, ${skippedDup} duplikat dilewati` : ''}.`
        );
      }
    };

    if (mode === 'replace' && transactions.length > 0) {
      setConfirmState({
        open: true,
        title: 'Ganti Seluruh Data Dashboard',
        message: `Seluruh ${transactions.length} transaksi saat ini akan digantikan oleh ${incomingRows.length} transaksi dari file spreadsheet. Lanjutkan?`,
        confirmLabel: 'Ya, Ganti Data',
        danger: true,
        onConfirm: () => {
          setConfirmState((s) => ({ ...s, open: false }));
          executeImport();
        },
      });
    } else {
      executeImport();
    }
  };

  const handleLoadSampleData = () => {
    const samples = createSampleTransactions();
    setTransactions(samples);
    setPreset('all');
    setPeriod(resolvePresetRange('all', samples));
    setExpandedDays({});
    notify('success', `${samples.length} transaksi contoh dimuat. Anda dapat menggantinya kapan saja dengan mengimpor spreadsheet Anda.`);
  };

  const handleRequestClearData = () => {
    setConfirmState({
      open: true,
      title: 'Kosongkan Semua Data',
      message:
        'Semua transaksi yang tersimpan di browser ini akan dihapus permanen. Pastikan Anda sudah mencadangkan melalui Ekspor Excel jika diperlukan.',
      confirmLabel: 'Kosongkan Data',
      danger: true,
      onConfirm: () => {
        setTransactions([]);
        setExpandedDays({});
        setConfirmState((s) => ({ ...s, open: false }));
        notify('info', 'Seluruh data transaksi telah dikosongkan.');
      },
    });
  };

  const handleJumpToDay = (date: string) => {
    setExpandedDays((prev) => ({ ...prev, [date]: true }));
    setHighlightedDay(date);
    setTimeout(() => {
      const el = document.getElementById(`day-row-${date}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const handleExportPdf = (kind: 'laporan' | 'diagram') => {
    exportFinancePDF(kind, {
      period,
      stats,
      cashflowRows: cashflowInPeriod,
      calendar,
      accounts,
      holdings,
      insightsIncome: insights.income,
      insightsExpense: insights.expense,
    });
    notify('success', `PDF ${kind === 'laporan' ? 'Laporan' : 'Diagram'} berhasil diunduh.`);
  };

  const handleUpdatePrice = (key: string, price: number) => {
    setConfig((prev) => ({
      ...prev,
      prices: { ...prev.prices, [key]: price },
    }));
  };

  const handleUpdateKurs = (currency: string, field: 'b' | 'j', value: number) => {
    const now = new Date();
    const ts = `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    setConfig((prev) => {
      const cur = prev.kurs[currency] || { b: 0, j: 0, ts: '' };
      return {
        ...prev,
        kurs: {
          ...prev.kurs,
          [currency]: {
            ...cur,
            [field]: value,
            ts,
          },
        },
      };
    });
  };

  const handleAddWatchlist = (ticker: string) => {
    const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!clean) return;
    setConfig((prev) => {
      const current = prev.watchlist || DEFAULT_WATCHLIST;
      if (current.includes(clean)) return prev;
      return { ...prev, watchlist: [clean, ...current] };
    });
    notify('success', `Emiten ${clean} ditambahkan ke daftar pantau IHSG.`);
  };

  const handleRemoveWatchlist = (ticker: string) => {
    setConfig((prev) => ({
      ...prev,
      watchlist: (prev.watchlist || DEFAULT_WATCHLIST).filter((s) => s !== ticker),
    }));
  };

  const accountTemplates = config.accountTemplates || DEFAULT_ACCOUNT_TEMPLATES;

  const handleAddAccountTemplate = (item: AccountTemplateItem) => {
    const clean = item.name.trim();
    if (!clean) return;
    setConfig((prev) => {
      const current = prev.accountTemplates || DEFAULT_ACCOUNT_TEMPLATES;
      if (current.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        accountTemplates: [...current, { name: clean, group: item.group }],
      };
    });
    notify('success', `Akun "${clean}" ditambahkan ke daftar dropdown.`);
  };

  const handleRemoveAccountTemplate = (name: string) => {
    setConfig((prev) => ({
      ...prev,
      accountTemplates: (prev.accountTemplates || DEFAULT_ACCOUNT_TEMPLATES).filter(
        (t) => t.name !== name
      ),
    }));
    notify('info', `Akun template "${name}" dihapus dari daftar.`);
  };

  const handleRefreshDashboard = async () => {
    setIsRefreshing(true);
    try {
      const latestRaw = localStorage.getItem(LS_TX_KEY);
      if (latestRaw !== null) {
        const parsed = JSON.parse(latestRaw) as Transaction[];
        if (Array.isArray(parsed)) {
          setTransactions(parsed);
          if (preset !== 'custom') {
            setPeriod(resolvePresetRange(preset, parsed));
          }
        }
      }
    } catch {
      // Ignore storage parse error
    }
    setHighlightedDay(null);
    await fetchLiveMarketData(false);
    setTimeout(() => setIsRefreshing(false), 300);
    notify('success', 'Data dashboard & kuotasi pasar live berhasil diperbarui.');
  };

  return (
    <div className="min-h-screen flex bg-[#F6F7FB] dark:bg-[#0B0F1A] text-slate-900 dark:text-slate-100">
      <Sidebar
        active={activeNav}
        onSelect={setActiveNav}
        totalCount={transactions.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#131929]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {SECTION_TITLES[activeNav]}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {formatDateLabel(period.from)} – {formatDateLabel(period.to)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleRefreshDashboard()}
              disabled={isRefreshing || isSyncingLive}
              aria-label="Refresh dashboard"
              title="Refresh data & harga pasar live"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing || isSyncingLive ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A2136] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Excel
            </button>

            <button
              type="button"
              onClick={() => handleOpenTxForm(0, null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Period filter bar across data views */}
          {activeNav !== 'spreadsheet' && (
            <PeriodToolbar
              preset={preset}
              period={period}
              compareMode={compareMode}
              onSelectPreset={handleSelectPreset}
              onChangeRange={handleChangeRange}
              onChangeCompare={setCompareMode}
            />
          )}

          {/* Empty state banner when no transactions exist */}
          {transactions.length === 0 && activeNav !== 'spreadsheet' && (
            <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
              <div className="max-w-2xl">
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Siap Menganalisis Keuangan Anda
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Lampirkan spreadsheet Excel atau CSV Anda untuk langsung menampilkan grafik arus kas, rincian kategori, mutasi akun, dan laporan laba rugi. Atau muat data contoh 3 bulan untuk mencoba seluruh fitur dashboard sekarang.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-4 h-4" />
                    Import Spreadsheet
                  </button>

                  <button
                    type="button"
                    onClick={downloadTemplateExcel}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Unduh Template Excel
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSampleData}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Lihat Data Contoh
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* View 1: Overview */}
          {activeNav === 'overview' && (
            <>
              <KpiGrid
                stats={stats}
                compareStats={compareStats}
                calendarDays={calendar.length}
                txCount={txCountInPeriod}
              />

              <InsightPanel
                incomeInsights={insights.income}
                expenseInsights={insights.expense}
                compareMode={compareMode}
              />

              <ChartFilterBar
                filter={chartFilter}
                accounts={chartAccounts}
                categories={chartCategories}
                filteredCount={filteredPeriodCashflow.length}
                totalCount={cashflowInPeriod.length}
                onChange={setChartFilter}
                onReset={() =>
                  setChartFilter({ account: '', category: '', amountRange: 'all' })
                }
              />

              <DailyCashflowChart
                calendar={filteredCalendar}
                onSelectDay={handleJumpToDay}
                activeFilterLabel={activeFilterLabel}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BreakdownDonutCard
                  title="Rincian Pengeluaran"
                  rows={filteredPeriodCashflow}
                  type={0}
                  globalAccountFilter={chartFilter.account}
                />
                <BreakdownDonutCard
                  title="Rincian Pemasukan"
                  rows={filteredPeriodCashflow}
                  type={1}
                  globalAccountFilter={chartFilter.account}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MonthlyTrendChart
                  allCashflowRows={filteredAllCashflow}
                  activeFilterLabel={activeFilterLabel}
                />
                <MonthlyBarsChart
                  allCashflowRows={filteredAllCashflow}
                  period={period}
                  onSelectMonth={handleChangeRange}
                  activeFilterLabel={activeFilterLabel}
                />
              </div>

              <DailyLedger
                days={days}
                expandedDays={expandedDays}
                onToggleDay={(d) =>
                  setExpandedDays((prev) => ({ ...prev, [d]: !prev[d] }))
                }
                onEdit={(tx) => handleOpenTxForm(tx.type, tx)}
                onDelete={handleRequestDeleteTx}
                highlightedDay={highlightedDay}
              />

              {/* Bottom Excel Recording Template & Export Section (always visible) */}
              <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="max-w-xl">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Template Pencatatan Keuangan (Excel) &amp; Ekspor Laporan
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Unduh template Excel (.xlsx) untuk mencatat pemasukan, pengeluaran, transfer, serta investasi/valas, lalu unggah kembali kapan saja untuk dianalisis otomatis di dashboard ini.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      downloadTemplateExcel();
                      notify('success', 'Template Excel pencatatan keuangan berhasil diunduh.');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Download Template Excel
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import Excel
                  </button>

                  {transactions.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          exportTransactionsExcel(transactions);
                          notify('success', 'File Excel berhasil diunduh.');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Ekspor Data
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf('laporan')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        PDF Laporan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf('diagram')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        PDF Diagram
                      </button>
                    </>
                  )}
                </div>
              </section>
            </>
          )}

          {/* View 2: Daily Ledger */}
          {activeNav === 'ledger' && (
            <DailyLedger
              days={days}
              expandedDays={expandedDays}
              onToggleDay={(d) =>
                setExpandedDays((prev) => ({ ...prev, [d]: !prev[d] }))
              }
              onEdit={(tx) => handleOpenTxForm(tx.type, tx)}
              onDelete={handleRequestDeleteTx}
              highlightedDay={highlightedDay}
            />
          )}

          {/* View 3: Accounts & Transfers */}
          {activeNav === 'accounts' && (
            <AccountsTransfersView
              accounts={accounts}
              transfers={transfersInPeriod}
              accountTemplates={accountTemplates}
              onAddAccountTemplate={handleAddAccountTemplate}
              onRemoveAccountTemplate={handleRemoveAccountTemplate}
              onAddTransfer={() => handleOpenTxForm(2, null)}
              onEdit={(tx) => handleOpenTxForm(tx.type, tx)}
              onDelete={handleRequestDeleteTx}
            />
          )}

          {/* View 4: Investments & Forex */}
          {activeNav === 'investments' && (
            <InvestmentsView
              holdings={holdings}
              investmentAccounts={accounts.filter((a) => a.isInvestment)}
              investTransactions={investmentsInPeriod}
              config={config}
              liveQuotes={liveQuotes}
              liveFx={liveFx}
              ihsgQuote={ihsgQuote}
              isSyncingLive={isSyncingLive}
              autoTrackLive={autoTrackLive}
              lastSyncAt={lastSyncAt}
              watchlist={watchlist}
              onToggleAutoTrack={() => setAutoTrackLive((v) => !v)}
              onRefreshLive={() => void fetchLiveMarketData(false)}
              onSyncLiveKurs={() => void fetchLiveMarketData(true)}
              onAddWatchlist={handleAddWatchlist}
              onRemoveWatchlist={handleRemoveWatchlist}
              onQuickBuyStock={(ticker, price) =>
                handleOpenTxForm(3, null, {
                  category: 'Saham',
                  subcategory: ticker,
                  price,
                })
              }
              onUpdatePrice={handleUpdatePrice}
              onUpdateKurs={handleUpdateKurs}
              onAddInvestment={() => handleOpenTxForm(3, null)}
              onEdit={(tx) => handleOpenTxForm(tx.type, tx)}
              onDelete={handleRequestDeleteTx}
            />
          )}

          {/* View 5: Spreadsheet & PDF Hub */}
          {activeNav === 'spreadsheet' && (
            <SpreadsheetHub
              totalTransactions={transactions.length}
              onOpenImport={() => setImportModalOpen(true)}
              onDownloadTemplate={() => {
                downloadTemplateExcel();
                notify('success', 'Template Excel berhasil diunduh.');
              }}
              onExportExcel={() => {
                exportTransactionsExcel(transactions);
                notify('success', 'File Excel cadangan berhasil diunduh.');
              }}
              onExportPdfReport={() => handleExportPdf('laporan')}
              onExportPdfCharts={() => handleExportPdf('diagram')}
              onLoadSampleData={handleLoadSampleData}
              onRequestClearData={handleRequestClearData}
            />
          )}
        </main>

        <footer className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 border-t border-slate-200/70 dark:border-slate-800/70 text-xs text-slate-500 dark:text-slate-400">
          Data tersimpan hanya di browser Anda dan tidak dikirim ke server eksternal. Cadangkan secara berkala lewat Ekspor Excel. Transfer antar akun dan investasi tidak dihitung sebagai pemasukan atau pengeluaran.
        </footer>
      </div>

      {/* Modals */}
      <TransactionModal
        open={txModalOpen}
        editingTx={editingTx}
        initialType={txModalInitialType}
        prefillInvest={prefillInvest}
        allTransactions={transactions}
        accountTemplates={accountTemplates}
        watchlist={watchlist}
        kurs={config.kurs}
        liveQuotes={liveQuotes}
        liveFx={liveFx}
        onAddAccountTemplate={handleAddAccountTemplate}
        onSave={handleSaveTx}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          setPrefillInvest(null);
        }}
        onNotify={notify}
      />

      <ImportSpreadsheetModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportRows}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        danger={confirmState.danger}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
          aria-live="polite"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-xl border shadow-lg text-xs font-medium ${
                toast.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  : toast.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-white dark:bg-[#1A2136] border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
              }`}
            >
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
