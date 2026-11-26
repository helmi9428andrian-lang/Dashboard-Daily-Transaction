import type {
  AccountFlow,
  AccountTemplateItem,
  AppConfig,
  CompareMode,
  DaySummary,
  DeltaInfo,
  Holding,
  KursMap,
  PeriodPreset,
  PeriodRange,
  PeriodStats,
  Transaction,
} from '../types/finance';
import {
  addDaysISO,
  addMonthsISO,
  formatCompactRp,
  formatDateLabel,
  formatRp,
  lastDayOfMonth,
  todayISO,
} from './format';

export const DEFAULT_KURS: KursMap = {
  USD: { b: 15850, j: 16050, ts: 'Catatan awal' },
  SGD: { b: 11820, j: 11980, ts: 'Catatan awal' },
  JPY: { b: 103.5, j: 106.2, ts: 'Catatan awal' },
  GBP: { b: 20150, j: 20450, ts: 'Catatan awal' },
  EUR: { b: 16780, j: 17050, ts: 'Catatan awal' },
};

export const DEFAULT_ACCOUNT_TEMPLATES: AccountTemplateItem[] = [
  { name: 'Bank 1 (BCA)', group: 'Bank' },
  { name: 'Bank 2 (Mandiri)', group: 'Bank' },
  { name: 'Bank 3 (BNI)', group: 'Bank' },
  { name: 'Seabank', group: 'Bank' },
  { name: 'GoPay', group: 'E-Wallet' },
  { name: 'OVO', group: 'E-Wallet' },
  { name: 'Dana', group: 'E-Wallet' },
  { name: 'ShopeePay', group: 'E-Wallet' },
  { name: 'Dompet Tunai', group: 'Tunai' },
  { name: 'BNI Valas', group: 'Investasi' },
  { name: 'Bibit', group: 'Investasi' },
  { name: 'RDN / Sekuritas', group: 'Investasi' },
];

export const DEFAULT_EXPENSE_CATEGORY_MAP: Record<string, string[]> = {
  'Makanan & Minuman': ['Makan Siang', 'Kopi & Jajan', 'Belanja Bulanan', 'GoFood / Pesan Antar'],
  Transportasi: ['Ojek Online', 'BBM & Tol', 'Parkir', 'Transportasi Umum'],
  'Tagihan & Utilitas': ['Listrik & Air', 'Internet & WiFi', 'Pulsa & Paket Data', 'Asuransi / BPJS'],
  'Tempat Tinggal': ['Sewa & IPL', 'Cicilan Rumah', 'Perawatan Rumah'],
  Belanja: ['Kebutuhan Harian', 'Pakaian', 'Elektronik', 'Marketplace'],
  Kesehatan: ['Obat & Klinik', 'Gym & Vitamin'],
  Hiburan: ['Streaming & Cloud', 'Tiket Bioskop', 'Hobi & Liburan'],
  'Keluarga & Sosial': ['Orang Tua / Keluarga', 'Hadiah & Donasi'],
  Lainnya: ['Biaya Admin Bank', 'Lain-lain'],
};

export const DEFAULT_INCOME_CATEGORY_MAP: Record<string, string[]> = {
  Gaji: ['Gaji Pokok', 'Tunjangan', 'Lembur'],
  Freelance: ['Proyek', 'Konsultasi', 'Desain / Jasa'],
  Bonus: ['THR', 'Insentif / Komisi'],
  Dividen: ['Bunga Tabungan', 'Dividen Saham', 'Imbal Hasil'],
  'Hadiah / Refund': ['Cashback', 'Refund', 'Pemberian'],
  Lainnya: ['Pemasukan Lain'],
};

export function resolvePresetRange(preset: PeriodPreset, allTransactions: Transaction[]): PeriodRange {
  const t = todayISO();
  const y = t.slice(0, 4);
  if (preset === 'mtd') return { from: `${t.slice(0, 8)}01`, to: t };
  if (preset === 'ytd') return { from: `${y}-01-01`, to: t };
  if (preset === 'm3') return { from: addDaysISO(addMonthsISO(t, -3), 1), to: t };
  if (preset === 'm6') return { from: addDaysISO(addMonthsISO(t, -6), 1), to: t };
  if (preset === 'h1') return { from: `${y}-01-01`, to: `${y}-06-30` };
  if (preset === 'h2') return { from: `${y}-07-01`, to: `${y}-12-31` };
  if (preset === 'pm') {
    const pm = addMonthsISO(`${t.slice(0, 8)}01`, -1);
    return { from: pm, to: lastDayOfMonth(pm.slice(0, 7)) };
  }
  if (preset === 'all') {
    const dates = allTransactions.map((r) => r.date).sort();
    return { from: dates[0] || `${y}-01-01`, to: dates[dates.length - 1] || t };
  }
  return { from: `${y}-01-01`, to: t };
}

export function computeCompareRange(period: PeriodRange, mode: CompareMode): PeriodRange | null {
  if (mode === 'none') return null;
  if (mode === 'yoy') {
    return {
      from: addMonthsISO(period.from, -12),
      to: addMonthsISO(period.to, -12),
    };
  }
  const spanDays =
    Math.round(
      (new Date(`${period.to}T00:00:00Z`).getTime() -
        new Date(`${period.from}T00:00:00Z`).getTime()) /
        864e5
    ) + 1;
  return {
    from: addDaysISO(period.from, -spanDays),
    to: addDaysISO(period.from, -1),
  };
}

export function isCashflowTx(tx: Transaction): boolean {
  return tx.type === 0 || tx.type === 1;
}

export function filterByPeriod(transactions: Transaction[], period: PeriodRange): Transaction[] {
  return transactions.filter((r) => r.date >= period.from && r.date <= period.to);
}

export function buildCalendarAndDays(
  cashflowInPeriod: Transaction[]
): { days: DaySummary[]; calendar: DaySummary[] } {
  const map: Record<string, DaySummary> = {};
  for (const r of cashflowInPeriod) {
    if (!map[r.date]) {
      map[r.date] = { d: r.date, i: 0, e: 0, n: 0, tx: [] };
    }
    const day = map[r.date];
    day.n += 1;
    day.tx.push(r);
    if (r.type === 1) day.i += r.amount;
    else day.e += r.amount;
  }

  const keys = Object.keys(map).sort();
  const days = keys.map((k) => map[k]);
  const calendar: DaySummary[] = [];

  if (keys.length > 0) {
    let cursor = new Date(`${keys[0]}T00:00:00Z`);
    const end = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
    while (cursor <= end) {
      const k = cursor.toISOString().slice(0, 10);
      calendar.push(map[k] || { d: k, i: 0, e: 0, n: 0, tx: [] });
      cursor = new Date(cursor.getTime() + 864e5);
    }
  }

  return { days, calendar };
}

export function computeStats(cashflowRows: Transaction[]): PeriodStats {
  const s: PeriodStats = {
    i: 0,
    e: 0,
    ce: {},
    ci: {},
    ai: {},
    de: {},
    di: {},
    max: null,
  };

  for (const r of cashflowRows) {
    const cat = r.category || 'Tanpa kategori';
    if (r.type === 1) {
      s.i += r.amount;
      s.ci[cat] = (s.ci[cat] || 0) + r.amount;
      s.ai[r.account] = (s.ai[r.account] || 0) + r.amount;
      s.di[r.date] = (s.di[r.date] || 0) + r.amount;
    } else if (r.type === 0) {
      s.e += r.amount;
      s.ce[cat] = (s.ce[cat] || 0) + r.amount;
      s.de[r.date] = (s.de[r.date] || 0) + r.amount;
      if (!s.max || r.amount > s.max.amount) s.max = r;
    }
  }

  return s;
}

export function topEntry(map: Record<string, number>): [string, number] | null {
  const keys = Object.keys(map).sort((a, b) => map[b] - map[a]);
  return keys.length > 0 ? [keys[0], map[keys[0]]] : null;
}

export function computeDelta(
  current: number,
  previous: number | undefined,
  upIsGood: boolean
): DeltaInfo | null {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const isGood = upIsGood ? pct >= 0 : pct <= 0;
  return {
    text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`,
    isGood,
    pct,
  };
}

export function generateInsights(
  s: PeriodStats,
  c: PeriodStats | null,
  calendarLength: number
): { income: string[]; expense: string[] } {
  const nd = calendarLength || 1;
  const I: string[] = [];
  const E: string[] = [];

  const chg = (a: number, b: number) =>
    b
      ? `${a >= b ? 'naik' : 'turun'} ${Math.abs(((a - b) / b) * 100).toFixed(0)}% dari ${formatRp(b)}`
      : 'belum ada data pembanding';

  if (!s.i && !s.e) {
    return {
      income: [],
      expense: ['Tidak ada transaksi pemasukan atau pengeluaran pada periode ini.'],
    };
  }

  I.push(`Total pemasukan ${formatRp(s.i)} (${c ? chg(s.i, c.i) : 'tanpa pembanding'}).`);
  const ti = topEntry(s.ci);
  if (ti && s.i > 0) {
    I.push(`Sumber terbesar: ${ti[0]}, menyumbang ${Math.round((ti[1] / s.i) * 100)}% dari pemasukan.`);
  }
  const ta = topEntry(s.ai);
  if (ta) {
    I.push(`Akun penerima terbesar: ${ta[0]} (${formatRp(ta[1])}).`);
  }
  const td = topEntry(s.di);
  if (td) {
    I.push(`Hari pemasukan tertinggi: ${formatDateLabel(td[0])} (${formatRp(td[1])}).`);
  }
  I.push(
    `Rata-rata ${formatRp(s.i / nd)} per hari; tercatat pemasukan di ${Object.keys(s.di).length} dari ${nd} hari.`
  );

  E.push(
    `Total pengeluaran ${formatRp(s.e)} (${c ? chg(s.e, c.e) : 'tanpa pembanding'}), rata-rata ${formatRp(s.e / nd)} per hari.`
  );
  const te = topEntry(s.ce);
  if (te && s.e > 0) {
    E.push(`Kategori terbesar: ${te[0]}, porsi ${Math.round((te[1] / s.e) * 100)}% dari pengeluaran.`);
  }
  if (c) {
    const df: Record<string, number> = {};
    Object.keys(s.ce).forEach((k) => {
      df[k] = s.ce[k] - (c.ce[k] || 0);
    });
    Object.keys(c.ce).forEach((k) => {
      if (!(k in df)) df[k] = -c.ce[k];
    });
    const ks = Object.keys(df).sort((a, b) => df[b] - df[a]);
    if (ks.length > 0) {
      if (df[ks[0]] > 0) {
        E.push(`Kenaikan terbesar: ${ks[0]} (+${formatCompactRp(df[ks[0]])}).`);
      }
      const last = ks[ks.length - 1];
      if (df[last] < 0) {
        E.push(`Penurunan terbesar: ${last} (${formatCompactRp(df[last])}).`);
      }
    }
  }
  if (s.max) {
    E.push(
      `Pengeluaran tunggal terbesar: ${formatRp(s.max.amount)} (${s.max.category || 'Tanpa kategori'}${s.max.note ? `, ${s.max.note}` : ''}) pada ${formatDateLabel(s.max.date)}.`
    );
  }
  const tdy = topEntry(s.de);
  if (tdy) {
    E.push(
      `Hari pengeluaran tertinggi: ${formatDateLabel(tdy[0])} (${formatRp(tdy[1])}); ${Math.max(0, nd - Object.keys(s.de).length)} hari tanpa pengeluaran.`
    );
  }
  if (s.i > 0) {
    E.push(
      `Selisih bersih ${formatRp(s.i - s.e)}, tingkat tabungan ${Math.round(((s.i - s.e) / s.i) * 100)}% dari pemasukan.`
    );
  }

  return { income: I, expense: E };
}

const INVEST_ACCOUNT_RE =
  /(bni\s*valas|valas|bibit|bareksa|stockbit|ajaib|pluang|indodax|tokocrypto|pegadaian|rdn|sekuritas|nanovest|treasury|pintu|reku|tanamduit|ipot|mirae|bions|most|trimegah|invest)/i;

const INVEST_CATEGORY_RE =
  /^(saham|reksa\s*dana|reksadana|emas|sbn|valas|crypto|kripto|obligasi|deposito|investasi|invest)$/i;

export function isInvestmentAccountName(name: string): boolean {
  return INVEST_ACCOUNT_RE.test(String(name || '').trim());
}

export function isInvestmentCategory(cat: string): boolean {
  return INVEST_CATEGORY_RE.test(String(cat || '').trim());
}

export function normalizeInvestmentTransaction(
  tx: Omit<Transaction, 'id'>
): Omit<Transaction, 'id'> {
  if (tx.type === 3) {
    const unit = tx.unit && tx.unit > 0 ? tx.unit : 1;
    const price = tx.price && tx.price > 0 ? tx.price : tx.amount;
    return {
      ...tx,
      subcategory: tx.subcategory || tx.note || tx.account || 'Aset',
      action: tx.action === -1 ? -1 : 1,
      unit,
      price,
    };
  }

  // Auto-route Expense or Income on dedicated investment accounts/categories straight to Investment Instruments
  if (
    (tx.type === 0 || tx.type === 1) &&
    (isInvestmentAccountName(tx.account) || isInvestmentCategory(tx.category))
  ) {
    const inferredType = isInvestmentCategory(tx.category)
      ? tx.category
      : /valas/i.test(tx.account)
        ? 'Valas'
        : 'Investasi';
    const inferredSymbol =
      tx.subcategory ||
      (/valas/i.test(inferredType) && /\b(USD|SGD|JPY|GBP|EUR|AUD)\b/i.test(`${tx.note} ${tx.category}`)
        ? (`${tx.note} ${tx.category}`.match(/\b(USD|SGD|JPY|GBP|EUR|AUD)\b/i)?.[1].toUpperCase() ?? tx.account)
        : tx.note || tx.category || tx.account);
    const unit = tx.unit && tx.unit > 0 ? tx.unit : 1;
    const price = tx.price && tx.price > 0 ? tx.price : tx.amount;

    return {
      ...tx,
      type: 3,
      category: inferredType,
      subcategory: inferredSymbol,
      action: tx.type === 1 ? -1 : 1,
      unit,
      price,
    };
  }

  return tx;
}

export function computeAccountFlows(
  allTransactions: Transaction[],
  period: PeriodRange
): AccountFlow[] {
  const m: Record<
    string,
    {
      a: string;
      i: number;
      e: number;
      ti: number;
      to: number;
      v: number;
      txCount: number;
      expenseCount: number;
      incomeCount: number;
      transferCount: number;
      investCount: number;
    }
  > = {};

  const ensure = (acc: string) => {
    const key = acc || 'Lainnya';
    if (!m[key]) {
      m[key] = {
        a: key,
        i: 0,
        e: 0,
        ti: 0,
        to: 0,
        v: 0,
        txCount: 0,
        expenseCount: 0,
        incomeCount: 0,
        transferCount: 0,
        investCount: 0,
      };
    }
    return m[key];
  };

  for (const r of filterByPeriod(allTransactions, period)) {
    if (r.type === 1) {
      const x = ensure(r.account);
      x.i += r.amount;
      x.txCount += 1;
      x.incomeCount += 1;
    } else if (r.type === 0) {
      const x = ensure(r.account);
      x.e += r.amount;
      x.txCount += 1;
      x.expenseCount += 1;
    } else if (r.type === 2) {
      const src = ensure(r.account);
      src.to += r.amount;
      src.txCount += 1;
      src.transferCount += 1;

      const dst = ensure(r.category);
      dst.ti += r.amount;
      dst.txCount += 1;
      dst.transferCount += 1;
    } else if (r.type === 3) {
      const x = ensure(r.account);
      x.v += (r.action === -1 ? -1 : 1) * r.amount;
      x.txCount += 1;
      x.investCount += 1;
    }
  }

  return Object.values(m)
    .map((x) => {
      const isInv =
        isInvestmentAccountName(x.a) ||
        (x.investCount > 0 && x.expenseCount === 0 && x.incomeCount === 0);
      return {
        account: x.a,
        income: x.i,
        expense: x.e,
        transferIn: x.ti,
        transferOut: x.to,
        investNet: x.v,
        net: x.i - x.e + x.ti - x.to - x.v,
        weight: x.i + x.e + x.ti + x.to + Math.abs(x.v),
        txCount: x.txCount,
        expenseCount: x.expenseCount,
        incomeCount: x.incomeCount,
        transferCount: x.transferCount,
        investCount: x.investCount,
        isInvestment: isInv,
      };
    })
    .sort((a, b) => b.txCount - a.txCount || b.weight - a.weight);
}

export function computeHoldings(allTransactions: Transaction[], config: AppConfig): Holding[] {
  const map: Record<
    string,
    { key: string; j: string; n: string; bu: number; ba: number; su: number }
  > = {};

  for (const r of allTransactions) {
    if (r.type !== 3) continue;
    const j = r.category || 'Lainnya';
    const n = r.subcategory || r.note || r.account || 'Tanpa nama';
    const k = `${j}|${n}`;
    if (!map[k]) map[k] = { key: k, j, n, bu: 0, ba: 0, su: 0 };
    const u = r.unit && r.unit > 0 ? r.unit : 1;
    if (r.action === -1) {
      map[k].su += u;
    } else {
      map[k].bu += u;
      map[k].ba += r.amount;
    }
  }

  return Object.values(map).map((x) => {
    const units = x.bu - x.su;
    const avgPrice = x.bu > 0 ? x.ba / x.bu : 0;
    const costBasis = units * avgPrice;
    const rawPrice =
      x.j === 'Valas' ? (config.kurs[x.n.toUpperCase()] || {}).j : config.prices[x.key];
    const currentPrice = rawPrice && rawPrice > 0 ? rawPrice : null;
    const currentValue = currentPrice !== null ? units * currentPrice : null;

    return {
      key: x.key,
      instrumentType: x.j,
      symbol: x.n,
      buyUnits: x.bu,
      buyAmount: x.ba,
      sellUnits: x.su,
      units,
      avgPrice,
      costBasis,
      currentPrice,
      currentValue,
    };
  });
}

export type BreakdownMode = 'cat' | 'sub' | 'acc';

export type AmountRangeFilter = 'all' | 'ge50k' | 'ge100k' | 'ge500k' | 'ge1m' | 'lt100k';

export interface ChartFilterState {
  account: string;         // '' = Semua Akun
  category: string;        // '' = Semua Kategori
  amountRange: AmountRangeFilter;
}

export function applyChartFilters(
  rows: Transaction[],
  filter: ChartFilterState
): Transaction[] {
  return rows.filter((r) => {
    if (filter.account && r.account !== filter.account) return false;
    if (filter.category && (r.category || 'Tanpa kategori') !== filter.category) return false;
    if (filter.amountRange === 'ge50k' && r.amount < 50_000) return false;
    if (filter.amountRange === 'ge100k' && r.amount < 100_000) return false;
    if (filter.amountRange === 'ge500k' && r.amount < 500_000) return false;
    if (filter.amountRange === 'ge1m' && r.amount < 1_000_000) return false;
    if (filter.amountRange === 'lt100k' && r.amount >= 100_000) return false;
    return true;
  });
}

export function groupBreakdown(
  rows: Transaction[],
  type: 0 | 1,
  mode: BreakdownMode
): Record<string, number> {
  const g: Record<string, number> = {};
  for (const r of rows) {
    if (r.type === type) {
      let key = 'Tanpa nama';
      if (mode === 'acc') key = r.account || 'Tanpa akun';
      else if (mode === 'sub') key = r.subcategory || r.category || 'Tanpa subkategori';
      else key = r.category || 'Tanpa kategori';
      g[key] = (g[key] || 0) + r.amount;
    }
  }
  return g;
}

export function getAllMonths(cashflowRows: Transaction[]): string[] {
  const s = new Set<string>();
  for (const r of cashflowRows) {
    s.add(r.date.slice(0, 7));
  }
  return Array.from(s).sort();
}

export function createSampleTransactions(): Transaction[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const maxDayThisMonth = now.getDate();

  const ym = (offset: number) => {
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return d.toISOString().slice(0, 7);
  };
  const m0 = ym(0);
  const m1 = ym(-1);
  const m2 = ym(-2);

  const dayStr = (monthStr: string, day: number, clampToday = false) => {
    const d = clampToday ? Math.min(day, maxDayThisMonth) : day;
    return `${monthStr}-${String(Math.max(1, d)).padStart(2, '0')}`;
  };

  return [
    // --- Bulan ke-1 (2 bulan lalu) ---
    { id: 'dum-01', date: dayStr(m2, 1), time: '08:55', account: 'Bank 1 (BCA)', category: 'Gaji', subcategory: 'Gaji Pokok', note: 'Gaji bulanan', amount: 12500000, type: 1 },
    { id: 'dum-02', date: dayStr(m2, 1), time: '09:30', account: 'Bank 1 (BCA)', category: 'Bank 2 (Mandiri)', subcategory: '', note: 'Sisihkan bayar tagihan & sewa', amount: 4200000, type: 2 },
    { id: 'dum-03', date: dayStr(m2, 1), time: '09:40', account: 'Bank 1 (BCA)', category: 'Seabank', subcategory: '', note: 'Dana kebutuhan harian', amount: 2200000, type: 2 },
    { id: 'dum-04', date: dayStr(m2, 2), time: '10:05', account: 'Bank 1 (BCA)', category: 'GoPay', subcategory: '', note: 'Top up ojek & makan', amount: 850000, type: 2 },
    { id: 'dum-05', date: dayStr(m2, 2), time: '10:15', account: 'Bank 2 (Mandiri)', category: 'Tempat Tinggal', subcategory: 'Sewa & IPL', note: 'Sewa tempat tinggal & IPL', amount: 3000000, type: 0 },
    { id: 'dum-06', date: dayStr(m2, 4), time: '12:25', account: 'Seabank', category: 'Makanan & Minuman', subcategory: 'Makan Siang', note: 'Makan siang kantor', amount: 420000, type: 0 },
    { id: 'dum-07', date: dayStr(m2, 6), time: '18:20', account: 'GoPay', category: 'Transportasi', subcategory: 'Ojek Online', note: 'Komuter mingguan', amount: 245000, type: 0 },
    { id: 'dum-08', date: dayStr(m2, 9), time: '13:10', account: 'GoPay', category: 'Makanan & Minuman', subcategory: 'GoFood / Pesan Antar', note: 'Pesan makan siang & kopi', amount: 215000, type: 0 },
    { id: 'dum-09', date: dayStr(m2, 12), time: '14:15', account: 'Bank 1 (BCA)', category: 'Bibit', subcategory: '', note: 'Top up reksa dana rutin', amount: 2000000, type: 2 },
    { id: 'dum-10', date: dayStr(m2, 12), time: '14:20', account: 'Bibit', category: 'Reksa dana', subcategory: 'RDPU Sucorinvest', note: 'Nabung rutin reksa dana pasar uang', amount: 2000000, type: 3, action: 1, unit: 1000, price: 2000 },
    { id: 'dum-11', date: dayStr(m2, 15), time: '16:40', account: 'Bank 3 (BNI)', category: 'Freelance', subcategory: 'Proyek', note: 'Jasa konsultasi akhir pekan', amount: 1850000, type: 1 },
    { id: 'dum-12', date: dayStr(m2, 18), time: '19:00', account: 'Bank 2 (Mandiri)', category: 'Tagihan & Utilitas', subcategory: 'Listrik & Air', note: 'Tagihan PLN & PDAM', amount: 465000, type: 0 },
    { id: 'dum-13', date: dayStr(m2, 20), time: '19:15', account: 'Bank 2 (Mandiri)', category: 'Tagihan & Utilitas', subcategory: 'Internet & WiFi', note: 'Tagihan WiFi rumah', amount: 365000, type: 0 },
    { id: 'dum-14', date: dayStr(m2, 23), time: '15:30', account: 'Seabank', category: 'Makanan & Minuman', subcategory: 'Belanja Bulanan', note: 'Belanja dapur & kebutuhan rumah', amount: 1120000, type: 0 },
    { id: 'dum-15', date: dayStr(m2, 26), time: '11:10', account: 'Bank 1 (BCA)', category: 'Dompet Tunai', subcategory: '', note: 'Tarik tunai ATM', amount: 500000, type: 2 },
    { id: 'dum-16', date: dayStr(m2, 27), time: '17:45', account: 'Dompet Tunai', category: 'Makanan & Minuman', subcategory: 'Kopi & Jajan', note: 'Jajan pasar & laundry', amount: 240000, type: 0 },

    // --- Bulan ke-2 (1 bulan lalu) ---
    { id: 'dum-17', date: dayStr(m1, 1), time: '09:00', account: 'Bank 1 (BCA)', category: 'Gaji', subcategory: 'Gaji Pokok', note: 'Gaji bulanan', amount: 12500000, type: 1 },
    { id: 'dum-18', date: dayStr(m1, 1), time: '09:20', account: 'Bank 1 (BCA)', category: 'Bank 2 (Mandiri)', subcategory: '', note: 'Alokasi sewa & tagihan', amount: 4200000, type: 2 },
    { id: 'dum-19', date: dayStr(m1, 1), time: '09:30', account: 'Bank 1 (BCA)', category: 'Seabank', subcategory: '', note: 'Dana belanja bulanan', amount: 2000000, type: 2 },
    { id: 'dum-20', date: dayStr(m1, 2), time: '10:00', account: 'Bank 2 (Mandiri)', category: 'Tempat Tinggal', subcategory: 'Sewa & IPL', note: 'Sewa tempat tinggal & IPL', amount: 3000000, type: 0 },
    { id: 'dum-21', date: dayStr(m1, 3), time: '12:15', account: 'Bank 1 (BCA)', category: 'GoPay', subcategory: '', note: 'Top up saldo GoPay', amount: 900000, type: 2 },
    { id: 'dum-22', date: dayStr(m1, 3), time: '12:20', account: 'Bank 1 (BCA)', category: 'OVO', subcategory: '', note: 'Top up OVO parkir & retail', amount: 400000, type: 2 },
    { id: 'dum-23', date: dayStr(m1, 5), time: '13:05', account: 'GoPay', category: 'Makanan & Minuman', subcategory: 'Kopi & Jajan', note: 'Kopi & makan siang', amount: 340000, type: 0 },
    { id: 'dum-24', date: dayStr(m1, 7), time: '14:00', account: 'Bank 3 (BNI)', category: 'Freelance', subcategory: 'Konsultasi', note: 'Proyek UI/UX paruh waktu', amount: 2400000, type: 1 },
    { id: 'dum-25', date: dayStr(m1, 9), time: '18:10', account: 'OVO', category: 'Transportasi', subcategory: 'Parkir', note: 'Parkir & tol harian', amount: 185000, type: 0 },
    { id: 'dum-26', date: dayStr(m1, 10), time: '10:30', account: 'Bank 1 (BCA)', category: 'BNI Valas', subcategory: '', note: 'Pindah dana tabungan USD', amount: 1605000, type: 2 },
    { id: 'dum-27', date: dayStr(m1, 10), time: '10:35', account: 'BNI Valas', category: 'Valas', subcategory: 'USD', note: 'Beli tabungan Dolar AS', amount: 1605000, type: 3, action: 1, unit: 100, price: 16050 },
    { id: 'dum-28', date: dayStr(m1, 14), time: '11:00', account: 'Bank 1 (BCA)', category: 'RDN / Sekuritas', subcategory: '', note: 'Setor RDN saham IDX', amount: 2200000, type: 2 },
    { id: 'dum-29', date: dayStr(m1, 14), time: '11:15', account: 'RDN / Sekuritas', category: 'Saham', subcategory: 'BBCA', note: 'Beli BBCA 2 lot', amount: 1160000, type: 3, action: 1, unit: 200, price: 5800 },
    { id: 'dum-30', date: dayStr(m1, 14), time: '11:20', account: 'RDN / Sekuritas', category: 'Saham', subcategory: 'BBRI', note: 'Beli BBRI 3 lot', amount: 930000, type: 3, action: 1, unit: 300, price: 3100 },
    { id: 'dum-31', date: dayStr(m1, 17), time: '16:30', account: 'Bank 3 (BNI)', category: 'Kesehatan', subcategory: 'Gym & Vitamin', note: 'Iuran olahraga & suplemen', amount: 450000, type: 0 },
    { id: 'dum-32', date: dayStr(m1, 19), time: '20:00', account: 'Bank 2 (Mandiri)', category: 'Tagihan & Utilitas', subcategory: 'Listrik & Air', note: 'PLN + PDAM', amount: 495000, type: 0 },
    { id: 'dum-33', date: dayStr(m1, 21), time: '20:10', account: 'Bank 2 (Mandiri)', category: 'Tagihan & Utilitas', subcategory: 'Internet & WiFi', note: 'Internet bulanan', amount: 365000, type: 0 },
    { id: 'dum-34', date: dayStr(m1, 24), time: '14:40', account: 'Seabank', category: 'Makanan & Minuman', subcategory: 'Belanja Bulanan', note: 'Belanja supermarket', amount: 1190000, type: 0 },
    { id: 'dum-35', date: dayStr(m1, 28), time: '09:00', account: 'Seabank', category: 'Dividen', subcategory: 'Bunga Tabungan', note: 'Bunga tabungan bulanan', amount: 95000, type: 1 },

    // --- Bulan berjalan (clamped agar tanggal tidak melewati hari ini) ---
    { id: 'dum-36', date: dayStr(m0, 1, true), time: '08:50', account: 'Bank 1 (BCA)', category: 'Gaji', subcategory: 'Gaji Pokok', note: 'Gaji bulanan', amount: 13000000, type: 1 },
    { id: 'dum-37', date: dayStr(m0, 1, true), time: '09:20', account: 'Bank 1 (BCA)', category: 'Bank 2 (Mandiri)', subcategory: '', note: 'Alokasi sewa & utilitas', amount: 4200000, type: 2 },
    { id: 'dum-38', date: dayStr(m0, 1, true), time: '09:25', account: 'Bank 1 (BCA)', category: 'Seabank', subcategory: '', note: 'Dana kebutuhan bulanan', amount: 2200000, type: 2 },
    { id: 'dum-39', date: dayStr(m0, 2, true), time: '10:05', account: 'Bank 2 (Mandiri)', category: 'Tempat Tinggal', subcategory: 'Sewa & IPL', note: 'Sewa tempat tinggal & IPL', amount: 3000000, type: 0 },
    { id: 'dum-40', date: dayStr(m0, 3, true), time: '11:10', account: 'Bank 1 (BCA)', category: 'GoPay', subcategory: '', note: 'Top up transportasi & makan', amount: 850000, type: 2 },
    { id: 'dum-41', date: dayStr(m0, 3, true), time: '11:15', account: 'Bank 1 (BCA)', category: 'Dana', subcategory: '', note: 'Top up pulsa & paket data', amount: 250000, type: 2 },
    { id: 'dum-42', date: dayStr(m0, 5, true), time: '12:30', account: 'GoPay', category: 'Transportasi', subcategory: 'Ojek Online', note: 'Transportasi harian', amount: 230000, type: 0 },
    { id: 'dum-43', date: dayStr(m0, 7, true), time: '13:00', account: 'Dana', category: 'Tagihan & Utilitas', subcategory: 'Pulsa & Paket Data', note: 'Paket data internet HP', amount: 125000, type: 0 },
    { id: 'dum-44', date: dayStr(m0, 9, true), time: '12:20', account: 'GoPay', category: 'Makanan & Minuman', subcategory: 'GoFood / Pesan Antar', note: 'Makan siang tim', amount: 265000, type: 0 },
    { id: 'dum-45', date: dayStr(m0, 11, true), time: '15:00', account: 'Bank 1 (BCA)', category: 'Bibit', subcategory: '', note: 'DCA reksa dana bulanan', amount: 1500000, type: 2 },
    { id: 'dum-46', date: dayStr(m0, 11, true), time: '15:05', account: 'Bibit', category: 'Reksa dana', subcategory: 'RDPU Sucorinvest', note: 'Tambah unit RDPU', amount: 1500000, type: 3, action: 1, unit: 745, price: 2013 },
    { id: 'dum-47', date: dayStr(m0, 13, true), time: '19:45', account: 'Seabank', category: 'Hiburan', subcategory: 'Tiket Bioskop', note: 'Nonton akhir pekan', amount: 150000, type: 0 },
    { id: 'dum-48', date: dayStr(m0, 15, true), time: '14:15', account: 'Seabank', category: 'Makanan & Minuman', subcategory: 'Belanja Bulanan', note: 'Belanja kebutuhan bulanan', amount: 980000, type: 0 },
    { id: 'dum-49', date: dayStr(m0, 16, true), time: '18:30', account: 'Bank 3 (BNI)', category: 'Keluarga & Sosial', subcategory: 'Orang Tua / Keluarga', note: 'Kiriman rutin keluarga', amount: 1000000, type: 0 },
    { id: 'dum-50', date: dayStr(m0, 18, true), time: '20:15', account: 'Bank 2 (Mandiri)', category: 'Tagihan & Utilitas', subcategory: 'Listrik & Air', note: 'Token listrik & air', amount: 455000, type: 0 },
    { id: 'dum-51', date: dayStr(m0, 20, true), time: '20:30', account: 'Bank 1 (BCA)', category: 'Hiburan', subcategory: 'Streaming & Cloud', note: 'Langganan musik & cloud', amount: 179000, type: 0 },
    { id: 'dum-52', date: dayStr(m0, 22, true), time: '10:00', account: 'Seabank', category: 'Dividen', subcategory: 'Bunga Tabungan', note: 'Bunga tabungan bulanan', amount: 105000, type: 1 },
  ];
}
