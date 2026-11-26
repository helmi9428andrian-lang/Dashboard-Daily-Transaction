import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type {
  AccountGroup,
  AccountTemplateItem,
  KursMap,
  MarketQuote,
  Transaction,
  TransactionType,
} from '../types/finance';
import {
  DEFAULT_EXPENSE_CATEGORY_MAP,
  DEFAULT_INCOME_CATEGORY_MAP,
  isInvestmentAccountName,
  normalizeInvestmentTransaction,
} from '../utils/financeEngine';
import {
  formatForeignCurrency,
  getCurrencyInfo,
  nowTimeHHMM,
  todayISO,
} from '../utils/format';

export interface InvestPrefill {
  category: string;
  subcategory: string;
  price?: number;
}

interface TransactionModalProps {
  open: boolean;
  editingTx: Transaction | null;
  initialType: TransactionType;
  prefillInvest?: InvestPrefill | null;
  allTransactions: Transaction[];
  accountTemplates: AccountTemplateItem[];
  watchlist?: string[];
  kurs: KursMap;
  liveQuotes?: Record<string, MarketQuote>;
  onAddAccountTemplate: (item: AccountTemplateItem) => void;
  onSave: (txData: Omit<Transaction, 'id'>, editId: string | null) => void;
  onClose: () => void;
  onNotify: (type: 'error' | 'info' | 'success', text: string) => void;
}

const TYPE_LABELS: { id: TransactionType; label: string }[] = [
  { id: 0, label: 'Pengeluaran' },
  { id: 1, label: 'Pemasukan' },
  { id: 2, label: 'Transfer' },
  { id: 3, label: 'Investasi / Valas' },
];

const FIELD_LABELS: Record<TransactionType, [string, string, string]> = {
  0: ['Akun / Bank', 'Kategori Pengeluaran', 'Subkategori'],
  1: ['Akun / Bank', 'Kategori Pemasukan', 'Subkategori'],
  2: ['Dari Akun', 'Ke Akun', ''],
  3: ['Akun Sumber', 'Jenis Instrumen', 'Nama / Kode Instrumen'],
};

const INVEST_TYPES = ['Saham', 'Valas', 'Reksa dana', 'Emas', 'SBN', 'Crypto', 'Lainnya'];
const VALAS_SUGGESTIONS = ['USD', 'SGD', 'JPY', 'GBP', 'EUR', 'AUD', 'MYR', 'CNY', 'HKD'];
const GROUP_ORDER: AccountGroup[] = ['Bank', 'E-Wallet', 'Tunai', 'Investasi', 'Lainnya'];
const GROUP_LABELS: Record<AccountGroup, string> = {
  Bank: 'Rekening Bank',
  'E-Wallet': 'E-Wallet / Dompet Digital',
  Tunai: 'Kas & Tunai',
  Investasi: 'Investasi & Valas',
  Lainnya: 'Akun Lainnya',
};

const CUSTOM_VAL = '__CUSTOM__';

function inferAccountGroup(name: string): AccountGroup {
  if (isInvestmentAccountName(name)) return 'Investasi';
  if (/(gopay|ovo|dana|shopee|linkaja|isaku|wallet|sakuku|qris)/i.test(name)) return 'E-Wallet';
  if (/(tunai|cash|dompet)/i.test(name)) return 'Tunai';
  return 'Bank';
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  open,
  editingTx,
  initialType,
  prefillInvest,
  allTransactions,
  accountTemplates,
  watchlist = [],
  kurs,
  liveQuotes = {},
  onAddAccountTemplate,
  onSave,
  onClose,
  onNotify,
}) => {
  const [type, setType] = useState<TransactionType>(0);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(nowTimeHHMM());

  const [account, setAccount] = useState('');
  const [isCustomAccount, setIsCustomAccount] = useState(false);
  const [customAccountGroup, setCustomAccountGroup] = useState<AccountGroup>('Bank');

  const [category, setCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customTargetGroup, setCustomTargetGroup] = useState<AccountGroup>('Bank');

  const [subcategory, setSubcategory] = useState('');
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);

  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<1 | -1>(1);
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Merge account templates + all accounts already used in existing transactions
  const groupedAccounts = useMemo(() => {
    const map = new Map<AccountGroup, string[]>();
    GROUP_ORDER.forEach((g) => map.set(g, []));
    const seen = new Set<string>();

    const addItem = (rawName: string, explicitGroup?: AccountGroup) => {
      const name = rawName.trim();
      if (!name) return;
      const lower = name.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      const grp = explicitGroup || inferAccountGroup(name);
      map.get(grp)?.push(name);
    };

    accountTemplates.forEach((t) => addItem(t.name, t.group));
    allTransactions.forEach((tx) => {
      addItem(tx.account);
      if (tx.type === 2) addItem(tx.category);
    });

    return GROUP_ORDER.map((g) => ({
      group: g,
      label: GROUP_LABELS[g],
      items: map.get(g) || [],
    })).filter((g) => g.items.length > 0);
  }, [accountTemplates, allTransactions]);

  const allKnownAccountNames = useMemo(
    () => groupedAccounts.flatMap((g) => g.items),
    [groupedAccounts]
  );

  // Merge starter category/subcategory templates with existing transaction data
  const categoryMap = useMemo(() => {
    const baseSource =
      type === 1 ? DEFAULT_INCOME_CATEGORY_MAP : DEFAULT_EXPENSE_CATEGORY_MAP;
    const merged: Record<string, string[]> = {};

    for (const [cat, subs] of Object.entries(baseSource)) {
      merged[cat] = [...subs];
    }

    for (const tx of allTransactions) {
      if (tx.type !== type || (type !== 0 && type !== 1)) continue;
      const cat = (tx.category || '').trim();
      if (!cat) continue;
      if (!merged[cat]) merged[cat] = [];
      const sub = (tx.subcategory || '').trim();
      if (sub && !merged[cat].includes(sub)) {
        merged[cat].push(sub);
      }
    }

    return merged;
  }, [allTransactions, type]);

  const categoryOptions = useMemo(() => Object.keys(categoryMap), [categoryMap]);

  const subcategoryOptions = useMemo(() => {
    if (type === 3) {
      const inst = category.trim();
      const fromTx = allTransactions
        .filter(
          (t) =>
            t.type === 3 &&
            (!inst || t.category.toLowerCase() === inst.toLowerCase()) &&
            t.subcategory
        )
        .map((t) => t.subcategory.trim());

      if (/^valas$/i.test(inst)) {
        return Array.from(new Set([...VALAS_SUGGESTIONS, ...fromTx]));
      }
      if (/^saham$/i.test(inst)) {
        return Array.from(new Set([...watchlist, ...fromTx]));
      }
      return Array.from(new Set(fromTx));
    }

    const cat = category.trim();
    return cat ? categoryMap[cat] || [] : [];
  }, [allTransactions, category, categoryMap, type, watchlist]);

  useEffect(() => {
    if (!open) return;
    setIsCustomAccount(false);
    setIsCustomCategory(false);
    setIsCustomSubcategory(false);
    setCustomAccountGroup('Bank');
    setCustomTargetGroup('Bank');

    if (editingTx) {
      setType(editingTx.type);
      setDate(editingTx.date);
      setTime(editingTx.time || '00:00');
      setAccount(editingTx.account);
      setCategory(editingTx.category);
      setSubcategory(editingTx.subcategory);
      setNote(editingTx.note);
      setAmount(String(editingTx.amount));
      setAction(editingTx.action === -1 ? -1 : 1);
      setUnit(editingTx.unit != null ? String(editingTx.unit) : '');
      setPrice(editingTx.price != null ? String(editingTx.price) : '');
    } else {
      setType(initialType);
      setDate(todayISO());
      setTime(nowTimeHHMM());
      setAccount(
        prefillInvest && /^saham$/i.test(prefillInvest.category)
          ? 'RDN / Sekuritas'
          : ''
      );
      setCategory(
        prefillInvest?.category || (initialType === 3 ? 'Saham' : '')
      );
      setSubcategory(prefillInvest?.subcategory || '');
      setNote('');
      setAmount('');
      setAction(1);
      setUnit(prefillInvest && /^saham$/i.test(prefillInvest.category) ? '100' : '');
      const prePrice =
        prefillInvest?.price && prefillInvest.price > 0
          ? String(prefillInvest.price)
          : '';
      setPrice(prePrice);
      if (prefillInvest && /^saham$/i.test(prefillInvest.category) && prefillInvest.price) {
        setAmount(String(Math.round(100 * prefillInvest.price)));
      }
    }
  }, [open, editingTx, initialType, prefillInvest]);

  if (!open) return null;

  const isValas = type === 3 && /^valas$/i.test(category.trim());
  const isSaham = type === 3 && /^saham$/i.test(category.trim());
  const valasMeta = isValas ? getCurrencyInfo(subcategory) : null;

  const handleTypeSwitch = (nextType: TransactionType) => {
    setType(nextType);
    setIsCustomCategory(false);
    setIsCustomSubcategory(false);
    if (!editingTx) {
      if (nextType === 3) {
        setCategory('Saham');
        setSubcategory('');
      } else {
        setCategory('');
        setSubcategory('');
      }
    }
  };

  const handleUnitOrPriceChange = (nextUnit: string, nextPrice: string) => {
    setUnit(nextUnit);
    setPrice(nextPrice);
    const u = Number(nextUnit);
    const p = Number(nextPrice);
    if (type === 3 && u > 0 && p > 0) {
      setAmount(String(Math.round(u * p)));
    }
  };

  const handleFillBniRate = async () => {
    const code = subcategory.trim().toUpperCase();
    if (!code) {
      onNotify('info', 'Pilih atau masukkan kode mata uang terlebih dahulu (mis. USD, SGD, JPY).');
      return;
    }
    const entry = kurs[code];
    const rate = action === -1 ? entry?.b : entry?.j;
    if (rate && rate > 0) {
      handleUnitOrPriceChange(unit, String(rate));
      return;
    }

    setFetchingPrice(true);
    try {
      const resp = await fetch(`/api/market/quotes?fx=${encodeURIComponent(code)}`);
      const json = (await resp.json()) as { fx?: Record<string, MarketQuote> };
      const spot = json.fx?.[code]?.price;
      if (spot && spot > 0) {
        handleUnitOrPriceChange(unit, String(Math.round(spot)));
        onNotify('success', `Kurs ${code} diambil dari pasar live.`);
      } else {
        onNotify('info', `Kurs untuk ${code} belum tersedia.`);
      }
    } catch {
      onNotify('error', 'Gagal mengambil kurs live.');
    } finally {
      setFetchingPrice(false);
    }
  };

  const handleFillLiveStockPrice = async () => {
    const ticker = subcategory.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!ticker) {
      onNotify('info', 'Pilih atau masukkan kode emiten IDX terlebih dahulu (mis. BBCA, BBRI).');
      return;
    }
    const cached = liveQuotes[ticker];
    if (cached && cached.price > 0) {
      handleUnitOrPriceChange(unit || '100', String(Math.round(cached.price)));
      return;
    }

    setFetchingPrice(true);
    try {
      const resp = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(ticker)}`);
      const json = (await resp.json()) as { quotes?: Record<string, MarketQuote> };
      const quote = json.quotes?.[ticker];
      if (quote && quote.price > 0) {
        handleUnitOrPriceChange(unit || '100', String(Math.round(quote.price)));
        onNotify(
          'success',
          `Harga live ${ticker}: Rp${Math.round(quote.price).toLocaleString('id-ID')}`
        );
      } else {
        onNotify('info', `Harga live untuk ${ticker} tidak ditemukan.`);
      }
    } catch {
      onNotify('error', 'Gagal mengambil harga live IHSG.');
    } finally {
      setFetchingPrice(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAcc = account.trim();
    const cleanCat = category.trim();
    if (!cleanAcc) {
      onNotify('error', 'Pilih atau masukkan akun terlebih dahulu.');
      return;
    }
    if (!cleanCat) {
      onNotify('error', type === 2 ? 'Pilih akun tujuan transfer.' : 'Pilih kategori transaksi.');
      return;
    }

    const parsedAmount = Math.round(Number(amount));
    if (!(parsedAmount > 0)) {
      onNotify('error', 'Nominal harus lebih besar dari 0.');
      return;
    }

    // Automatically save newly typed accounts into reusable account templates
    if (
      isCustomAccount &&
      !allKnownAccountNames.some((n) => n.toLowerCase() === cleanAcc.toLowerCase())
    ) {
      onAddAccountTemplate({ name: cleanAcc, group: customAccountGroup });
    }
    if (
      type === 2 &&
      isCustomCategory &&
      !allKnownAccountNames.some((n) => n.toLowerCase() === cleanCat.toLowerCase())
    ) {
      onAddAccountTemplate({ name: cleanCat, group: customTargetGroup });
    }

    onSave(
      normalizeInvestmentTransaction({
        date,
        time: time || '00:00',
        account: cleanAcc,
        category: cleanCat,
        subcategory: type === 2 ? '' : subcategory.trim(),
        note: note.trim(),
        amount: parsedAmount,
        type,
        ...(type === 3
          ? {
              action,
              unit: Number(unit) || 0,
              price: Number(price) || 0,
            }
          : {}),
      }),
      editingTx ? editingTx.id : null
    );
  };

  const [lblAccount, lblCategory, lblSubcategory] = FIELD_LABELS[type];
  const parsedUnit = Number(unit);

  const accountSelectVal = isCustomAccount
    ? CUSTOM_VAL
    : allKnownAccountNames.includes(account)
      ? account
      : account
        ? CUSTOM_VAL
        : '';

  const categorySelectVal =
    type === 2
      ? isCustomCategory
        ? CUSTOM_VAL
        : allKnownAccountNames.includes(category)
          ? category
          : category
            ? CUSTOM_VAL
            : ''
      : type === 3
        ? isCustomCategory
          ? CUSTOM_VAL
          : INVEST_TYPES.includes(category)
            ? category
            : category
              ? CUSTOM_VAL
              : ''
        : isCustomCategory
          ? CUSTOM_VAL
          : categoryOptions.includes(category)
            ? category
            : category
              ? CUSTOM_VAL
              : '';

  const subcategorySelectVal = isCustomSubcategory
    ? CUSTOM_VAL
    : subcategoryOptions.includes(subcategory)
      ? subcategory
      : subcategory
        ? CUSTOM_VAL
        : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id="tx-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
            {editingTx ? 'Edit Transaksi' : 'Tambah Transaksi'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Segmented type switcher */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800">
            {TYPE_LABELS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTypeSwitch(item.id)}
                className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  type === item.id
                    ? 'bg-white dark:bg-[#1E263D] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Tanggal
              </span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Jam
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            {type === 3 && (
              <label className="block sm:col-span-2">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Aksi Investasi
                </span>
                <select
                  value={String(action)}
                  onChange={(e) => setAction(e.target.value === '-1' ? -1 : 1)}
                  className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="1">Beli</option>
                  <option value="-1">Jual</option>
                </select>
              </label>
            )}

            {/* Account Dropdown */}
            <div className="block">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {lblAccount}
                </span>
                <select
                  required={!isCustomAccount}
                  value={accountSelectVal}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === CUSTOM_VAL) {
                      setIsCustomAccount(true);
                      setAccount('');
                    } else {
                      setIsCustomAccount(false);
                      setAccount(v);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Pilih Akun —</option>
                  {groupedAccounts.map((grp) => (
                    <optgroup key={grp.group} label={grp.label}>
                      {grp.items.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CUSTOM_VAL}>+ Tambah akun baru…</option>
                </select>
              </label>
              {(isCustomAccount || accountSelectVal === CUSTOM_VAL) && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={account}
                    placeholder="Nama akun (mis. Bank Jago)"
                    onChange={(e) => setAccount(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-[#0B0F1A] border border-indigo-300 dark:border-indigo-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    aria-label="Jenis grup akun baru"
                    value={customAccountGroup}
                    onChange={(e) => setCustomAccountGroup(e.target.value as AccountGroup)}
                    className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {GROUP_ORDER.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Category / Target Account / Instrument Type Dropdown */}
            <div className="block">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {lblCategory}
                </span>

                {type === 2 ? (
                  <select
                    required={!isCustomCategory}
                    value={categorySelectVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM_VAL) {
                        setIsCustomCategory(true);
                        setCategory('');
                      } else {
                        setIsCustomCategory(false);
                        setCategory(v);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Pilih Akun Tujuan —</option>
                    {groupedAccounts.map((grp) => (
                      <optgroup key={grp.group} label={grp.label}>
                        {grp.items.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value={CUSTOM_VAL}>+ Tambah akun tujuan baru…</option>
                  </select>
                ) : type === 3 ? (
                  <select
                    required={!isCustomCategory}
                    value={categorySelectVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM_VAL) {
                        setIsCustomCategory(true);
                        setCategory('');
                      } else {
                        setIsCustomCategory(false);
                        setCategory(v);
                        setSubcategory('');
                        setIsCustomSubcategory(false);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Pilih Jenis Instrumen —</option>
                    {INVEST_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value={CUSTOM_VAL}>+ Jenis instrumen lain…</option>
                  </select>
                ) : (
                  <select
                    required={!isCustomCategory}
                    value={categorySelectVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM_VAL) {
                        setIsCustomCategory(true);
                        setCategory('');
                        setSubcategory('');
                      } else {
                        setIsCustomCategory(false);
                        setCategory(v);
                        setSubcategory('');
                        setIsCustomSubcategory(false);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Pilih Kategori —</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value={CUSTOM_VAL}>+ Tambah kategori baru…</option>
                  </select>
                )}
              </label>

              {(isCustomCategory || categorySelectVal === CUSTOM_VAL) && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={category}
                    placeholder={
                      type === 2
                        ? 'Nama akun tujuan baru'
                        : type === 3
                          ? 'Jenis instrumen'
                          : 'Nama kategori baru'
                    }
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-[#0B0F1A] border border-indigo-300 dark:border-indigo-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {type === 2 && (
                    <select
                      aria-label="Jenis grup akun tujuan baru"
                      value={customTargetGroup}
                      onChange={(e) => setCustomTargetGroup(e.target.value as AccountGroup)}
                      className="bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    >
                      {GROUP_ORDER.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Subcategory / Instrument Symbol Dropdown */}
            {type !== 2 && (
              <div className="block">
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {lblSubcategory}
                  </span>
                  <select
                    required={type === 3 && !isCustomSubcategory}
                    value={subcategorySelectVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM_VAL) {
                        setIsCustomSubcategory(true);
                        setSubcategory('');
                      } else {
                        setIsCustomSubcategory(false);
                        setSubcategory(v);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">
                      {type === 3 ? '— Pilih Kode / Aset —' : '— Opsional / Tidak ada —'}
                    </option>
                    {subcategoryOptions.map((sub) => {
                      const label =
                        isValas ? `${sub} (${getCurrencyInfo(sub).name})` : sub;
                      return (
                        <option key={sub} value={sub}>
                          {label}
                        </option>
                      );
                    })}
                    <option value={CUSTOM_VAL}>
                      {type === 3 ? '+ Masukkan kode/aset lain…' : '+ Tambah subkategori baru…'}
                    </option>
                  </select>
                </label>
                {(isCustomSubcategory || subcategorySelectVal === CUSTOM_VAL) && (
                  <input
                    type="text"
                    required={type === 3}
                    value={subcategory}
                    placeholder={type === 3 ? 'mis. BBCA, USD, Antam' : 'Nama subkategori baru'}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="mt-2 w-full bg-slate-50 dark:bg-[#0B0F1A] border border-indigo-300 dark:border-indigo-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>
            )}

            <label className={`block ${type === 2 ? 'sm:col-span-2' : ''}`}>
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Total Nominal (Rp)
              </span>
              <input
                type="number"
                required
                min={1}
                step={1}
                inputMode="numeric"
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            {type === 3 && (
              <>
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {isValas && valasMeta
                      ? `Jumlah ${valasMeta.code} (${valasMeta.symbol.trim()})`
                      : isSaham
                        ? 'Jumlah Lembar (1 lot = 100 lbr)'
                        : 'Jumlah Unit'}
                  </span>
                  <input
                    type="number"
                    required
                    step="any"
                    min={0}
                    value={unit}
                    onChange={(e) => handleUnitOrPriceChange(e.target.value, price)}
                    className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {isValas && valasMeta && parsedUnit > 0 && (
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      Setara: {formatForeignCurrency(parsedUnit, valasMeta.code)} {valasMeta.code}
                    </span>
                  )}
                  {isSaham && parsedUnit > 0 && (
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      Setara: {(parsedUnit / 100).toLocaleString('id-ID')} lot
                    </span>
                  )}
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {isValas && valasMeta
                      ? `Kurs per 1 ${valasMeta.code} (Rp)`
                      : isSaham
                        ? 'Harga per Lembar (Rp)'
                        : 'Harga / Kurs per Unit (Rp)'}
                  </span>
                  <input
                    type="number"
                    required
                    step="any"
                    min={0}
                    value={price}
                    onChange={(e) => handleUnitOrPriceChange(unit, e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>

                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  {isSaham ? (
                    <button
                      type="button"
                      onClick={handleFillLiveStockPrice}
                      disabled={fetchingPrice}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-60 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${fetchingPrice ? 'animate-spin' : ''}`} />
                      <span>
                        Ambil Harga Live IHSG ({subcategory.trim().toUpperCase() || 'Emiten'})
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFillBniRate}
                      disabled={fetchingPrice}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-60 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${fetchingPrice ? 'animate-spin' : ''}`} />
                      <span>
                        Isi dari Kurs ({subcategory.trim().toUpperCase() || 'Valas'})
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}

            <label className="block sm:col-span-2">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Catatan
              </span>
              <input
                type="text"
                value={note}
                placeholder="Keterangan tambahan…"
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Simpan Transaksi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
