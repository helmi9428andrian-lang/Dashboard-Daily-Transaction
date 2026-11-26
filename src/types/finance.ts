export type TransactionType = 0 | 1 | 2 | 3;
// 0 = Pengeluaran, 1 = Pemasukan, 2 = Transfer, 3 = Investasi/Valas

export interface Transaction {
  id: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  account: string;    // Akun / bank (or Dari akun / Akun sumber)
  category: string;   // Kategori (or Ke akun / Jenis instrumen)
  subcategory: string;// Subkategori (or Nama/kode instrumen)
  note: string;       // Catatan
  amount: number;     // Nominal (Rp, positive integer)
  type: TransactionType;
  action?: 1 | -1;    // For Investasi: 1 = Beli, -1 = Jual
  unit?: number;      // For Investasi: jumlah unit
  price?: number;     // For Investasi: harga/kurs per unit
}

export interface KursEntry {
  b: number;   // Kurs Beli
  j: number;   // Kurs Jual
  ts: string;  // Last updated timestamp
}

export type KursMap = Record<string, KursEntry>;

export type AccountGroup = 'Bank' | 'E-Wallet' | 'Tunai' | 'Investasi' | 'Lainnya';

export interface AccountTemplateItem {
  name: string;
  group: AccountGroup;
}

export interface AppConfig {
  prices: Record<string, number>;
  kurs: KursMap;
  watchlist?: string[];
  accountTemplates?: AccountTemplateItem[];
}

export interface MarketQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  marketTime: number;
  name: string;
}

export type PeriodPreset =
  | 'mtd'
  | 'pm'
  | 'm3'
  | 'm6'
  | 'h1'
  | 'h2'
  | 'ytd'
  | 'all'
  | 'custom';

export type CompareMode = 'prev' | 'yoy' | 'none';

export interface PeriodRange {
  from: string;
  to: string;
}

export interface DaySummary {
  d: string;
  i: number;
  e: number;
  n: number;
  tx: Transaction[];
}

export interface PeriodStats {
  i: number;
  e: number;
  ce: Record<string, number>;
  ci: Record<string, number>;
  ai: Record<string, number>;
  de: Record<string, number>;
  di: Record<string, number>;
  max: Transaction | null;
}

export interface DeltaInfo {
  text: string;
  isGood: boolean;
  pct: number;
}

export interface AccountFlow {
  account: string;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  investNet: number;
  net: number;
  weight: number;
  txCount: number;
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
  investCount: number;
  isInvestment: boolean;
}

export interface Holding {
  key: string;
  instrumentType: string;
  symbol: string;
  buyUnits: number;
  buyAmount: number;
  sellUnits: number;
  units: number;
  avgPrice: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number | null;
}

export type NavSection = 'overview' | 'ledger' | 'accounts' | 'investments' | 'spreadsheet';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}
