export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const CHART_PALETTE = [
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#F43F5E', // Rose
  '#F59E0B', // Amber
  '#0EA5E9', // Sky
  '#8B5CF6', // Violet
  '#64748B', // Slate
  '#EC4899', // Pink
];

export interface CurrencyMeta {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const CURRENCY_META: Record<string, CurrencyMeta> = {
  USD: { code: 'USD', symbol: '$', name: 'Dolar AS', decimals: 2 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Dolar Singapura', decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Yen Jepang', decimals: 0 },
  GBP: { code: 'GBP', symbol: '£', name: 'Pound Sterling', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Dolar Australia', decimals: 2 },
  MYR: { code: 'MYR', symbol: 'RM', name: 'Ringgit Malaysia', decimals: 2 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Yuan Tiongkok', decimals: 2 },
  HKD: { code: 'HKD', symbol: 'HK$', name: 'Dolar Hong Kong', decimals: 2 },
  KRW: { code: 'KRW', symbol: '₩', name: 'Won Korea', decimals: 0 },
  CHF: { code: 'CHF', symbol: 'CHF ', name: 'Franc Swiss', decimals: 2 },
};

export function getCurrencyInfo(code: string): CurrencyMeta {
  const upper = String(code || '').trim().toUpperCase();
  return (
    CURRENCY_META[upper] || {
      code: upper || 'VALAS',
      symbol: upper ? `${upper} ` : '',
      name: upper || 'Mata Uang Asing',
      decimals: 2,
    }
  );
}

export function formatForeignCurrency(amount: number, code: string): string {
  const meta = getCurrencyInfo(code);
  const formatted = amount.toLocaleString('id-ID', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${meta.symbol}${formatted}`;
}

export function formatInstrumentUnits(
  units: number,
  instrumentType: string,
  symbol: string
): { primary: string; secondary?: string } {
  if (/^valas$/i.test(instrumentType)) {
    const info = getCurrencyInfo(symbol);
    return {
      primary: `${formatForeignCurrency(units, symbol)} ${info.code}`,
      secondary: info.name,
    };
  }
  if (/^saham$/i.test(instrumentType)) {
    const lots = units / 100;
    return {
      primary: `${Number(units.toFixed(2)).toLocaleString('id-ID')} lbr`,
      secondary: `${Number(lots.toFixed(2)).toLocaleString('id-ID')} lot`,
    };
  }
  if (/^emas$/i.test(instrumentType)) {
    return { primary: `${Number(units.toFixed(4)).toLocaleString('id-ID')} gr` };
  }
  if (/^reksa/i.test(instrumentType)) {
    return { primary: `${Number(units.toFixed(4)).toLocaleString('id-ID')} unit` };
  }
  return { primary: `${Number(units.toFixed(6)).toLocaleString('id-ID')}` };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatRp(n: number): string {
  const abs = Math.round(Math.abs(n));
  const prefix = n < 0 ? '−Rp' : 'Rp';
  return prefix + abs.toLocaleString('id-ID');
}

export function formatSignedRp(n: number): string {
  if (n === 0) return 'Rp0';
  const abs = Math.round(Math.abs(n));
  return (n < 0 ? '−Rp' : '+Rp') + abs.toLocaleString('id-ID');
}

export function formatCompactRp(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e9) return `${s}Rp${(a / 1e9).toFixed(1).replace('.', ',')} M`;
  if (a >= 1e6) return `${s}Rp${(a / 1e6).toFixed(1).replace('.', ',')} jt`;
  if (a >= 1e3) return `${s}Rp${Math.round(a / 1e3)} rb`;
  return `${s}Rp${Math.round(a)}`;
}

export function formatMonthLabel(ym: string): string {
  const mIdx = parseInt(ym.slice(5, 7), 10) - 1;
  return `${MONTH_NAMES[mIdx] || ym.slice(5)} ${ym.slice(2, 4)}`;
}

export function formatDateLabel(d: string): string {
  if (!d || d.length < 10) return d;
  const x = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(x.getTime())) return d;
  const day = DAY_NAMES[x.getUTCDay()];
  const num = parseInt(d.slice(8, 10), 10);
  const mon = MONTH_NAMES[parseInt(d.slice(5, 7), 10) - 1];
  return `${day}, ${num} ${mon} ${d.slice(0, 4)}`;
}

export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

export function nowTimeHHMM(): string {
  const n = new Date();
  return `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
}

export function addDaysISO(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonthsISO(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function lastDayOfMonth(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
