import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type {
  AccountFlow,
  DaySummary,
  Holding,
  PeriodRange,
  PeriodStats,
  Transaction,
  TransactionType,
} from '../types/finance';
import { normalizeInvestmentTransaction } from './financeEngine';
import { pad2, todayISO } from './format';

export interface ColumnMapping {
  date: string;
  time: string;
  type: string;
  account: string;
  category: string;
  subcategory: string;
  note: string;
  amount: string;
  incomeAmount: string;  // Optional: separate Pemasukan/Kredit column
  expenseAmount: string; // Optional: separate Pengeluaran/Debit column
  action: string;
  unit: string;
  price: string;
}

export interface ParsedSheetResult {
  headers: string[];
  rawRows: Record<string, unknown>[];
  mapping: ColumnMapping;
  sheetNames: string[];
  activeSheet: string;
  workbook: XLSX.WorkBook;
}

export interface ParseTransactionsOutput {
  rows: Omit<Transaction, 'id'>[];
  skipped: number;
}

const ALIASES: Record<keyof ColumnMapping, string[]> = {
  date: ['tanggal', 'tgl', 'date', 'period', 'waktu', 'hari'],
  time: ['jam', 'time', 'pukul'],
  type: ['jenis', 'tipe', 'type', 'income/expense', 'arus', 'mutasi'],
  account: ['akun', 'rekening', 'bank', 'dompet', 'wallet', 'accounts', 'account', 'sumber'],
  category: ['kategori', 'category', 'pos', 'grup', 'ke akun'],
  subcategory: ['subkategori', 'sub-kategori', 'subcategory', 'sub kategori', 'instrumen'],
  note: ['catatan', 'keterangan', 'uraian', 'deskripsi', 'note', 'notes', 'description', 'memo'],
  amount: ['nominal', 'jumlah', 'amount', 'idr', 'rp', 'total', 'nilai'],
  incomeAmount: ['pemasukan', 'kredit', 'credit', 'masuk', 'income'],
  expenseAmount: ['pengeluaran', 'debit', 'keluar', 'expense'],
  action: ['aksi', 'action', 'beli/jual'],
  unit: ['unit', 'lot', 'qty', 'jumlah unit'],
  price: ['harga', 'kurs', 'price', 'harga/unit'],
};

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const lowerMap: Record<string, string> = {};
  for (const h of headers) {
    lowerMap[h.toLowerCase().trim()] = h;
  }

  const pick = (keys: string[]) => {
    for (const alias of keys) {
      if (lowerMap[alias]) return lowerMap[alias];
    }
    for (const h of headers) {
      const hl = h.toLowerCase().trim();
      if (keys.some((alias) => hl === alias || hl.includes(alias))) return h;
    }
    return '';
  };

  const amountCol = pick(ALIASES.amount);
  const typeCol = pick(ALIASES.type);

  // Only bind split income/expense columns if standard amount+type aren't both matched
  const incomeCol = !amountCol ? pick(ALIASES.incomeAmount) : '';
  const expenseCol = !amountCol ? pick(ALIASES.expenseAmount) : '';

  return {
    date: pick(ALIASES.date),
    time: pick(ALIASES.time),
    type: typeCol,
    account: pick(ALIASES.account),
    category: pick(ALIASES.category),
    subcategory: pick(ALIASES.subcategory),
    note: pick(ALIASES.note),
    amount: amountCol,
    incomeAmount: incomeCol,
    expenseAmount: expenseCol,
    action: pick(ALIASES.action),
    unit: pick(ALIASES.unit),
    price: pick(ALIASES.price),
  };
}

export async function readSpreadsheetFile(file: File, sheetName?: string): Promise<ParsedSheetResult> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  const activeSheet = sheetName && workbook.SheetNames.includes(sheetName)
    ? sheetName
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[activeSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headersSet = new Set<string>();
  for (const row of rawRows.slice(0, 20)) {
    Object.keys(row).forEach((k) => {
      if (k && !k.startsWith('__EMPTY')) headersSet.add(k);
      else if (k) headersSet.add(k);
    });
  }
  const headers = Array.from(headersSet);
  const mapping = autoDetectMapping(headers);
  return {
    headers,
    rawRows,
    mapping,
    sheetNames: workbook.SheetNames,
    activeSheet,
    workbook,
  };
}

export function extractSheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string
): { headers: string[]; rawRows: Record<string, unknown>[]; mapping: ColumnMapping } {
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headersSet = new Set<string>();
  for (const row of rawRows.slice(0, 20)) {
    Object.keys(row).forEach((k) => headersSet.add(k));
  }
  const headers = Array.from(headersSet);
  return { headers, rawRows, mapping: autoDetectMapping(headers) };
}

function parseExcelDate(v: unknown): [string, string] | null {
  if (typeof v === 'number' && v > 20000) {
    const dd = new Date(Math.round((v - 25569) * 864e5));
    if (!Number.isNaN(dd.getTime())) {
      return [
        dd.toISOString().slice(0, 10),
        `${pad2(dd.getUTCHours())}:${pad2(dd.getUTCMinutes())}`,
      ];
    }
  }
  const s = String(v ?? '').trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    return [
      `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`,
      `${pad2(Number(m[4] || 0))}:${m[5] || '00'}`,
    ];
  }

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    return [
      `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`,
      `${pad2(Number(m[4] || 0))}:${m[5] || '00'}`,
    ];
  }

  return null;
}

function parseNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}/.test(s) && !s.includes(',')) {
    s = s.replace(/\./g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseTime(v: unknown, fallback: string): string {
  if (v === '' || v == null) return fallback;
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const dt = parseExcelDate(v + 25569);
    if (dt) return dt[1];
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${pad2(Number(m[1]))}:${m[2]}`;
  return fallback;
}

export function parseMappedRows(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping
): ParseTransactionsOutput {
  const out: Omit<Transaction, 'id'>[] = [];
  let skipped = 0;

  for (const row of rawRows) {
    const dt = mapping.date ? parseExcelDate(row[mapping.date]) : null;
    if (!dt) {
      // Check if row has any meaningful non-empty data before counting as skipped
      const hasContent = Object.values(row).some((val) => String(val ?? '').trim() !== '');
      if (hasContent) skipped++;
      continue;
    }

    const time = mapping.time ? parseTime(row[mapping.time], dt[1]) : dt[1];
    const rawType = mapping.type ? String(row[mapping.type] ?? '').toLowerCase().trim() : '';

    let type: TransactionType | -1 = -1;
    let amount = mapping.amount ? Math.round(Math.abs(parseNumber(row[mapping.amount]))) : 0;

    if (rawType) {
      if (/^(pengeluaran|exp|keluar|debit|out)/.test(rawType)) type = 0;
      else if (/^(pemasukan|income|masuk|kredit|credit|in)/.test(rawType)) type = 1;
      else if (rawType === 'transfer' || rawType === 'transfer-out' || rawType === 'pindah dana') type = 2;
      else if (/^(investasi|valas|invest)/.test(rawType)) type = 3;
      else if (/^(transfer-in|expense balance|income balance)$/.test(rawType)) {
        continue; // Intentionally ignored app export rows
      }
    } else if (mapping.incomeAmount || mapping.expenseAmount) {
      const inc = mapping.incomeAmount ? Math.round(Math.abs(parseNumber(row[mapping.incomeAmount]))) : 0;
      const exp = mapping.expenseAmount ? Math.round(Math.abs(parseNumber(row[mapping.expenseAmount]))) : 0;
      if (inc > 0 && exp === 0) {
        type = 1;
        amount = inc;
      } else if (exp > 0 && inc === 0) {
        type = 0;
        amount = exp;
      } else if (inc > 0) {
        type = 1;
        amount = inc;
      }
    } else if (mapping.amount) {
      const signed = parseNumber(row[mapping.amount]);
      if (signed < 0) {
        type = 0;
        amount = Math.round(Math.abs(signed));
      } else if (signed > 0) {
        type = 0; // Default positive un-typed amount to Pengeluaran unless type is specified
        amount = Math.round(signed);
      }
    }

    if (type === -1) {
      skipped++;
      continue;
    }
    const validType: TransactionType = type;

    const account = (mapping.account ? String(row[mapping.account] ?? '').trim() : '') || 'Utama';
    const category = (mapping.category ? String(row[mapping.category] ?? '').trim() : '') || (validType === 2 ? 'Lainnya' : 'Umum');
    const subcategory = validType === 2 ? '' : (mapping.subcategory ? String(row[mapping.subcategory] ?? '').trim() : '');
    const note = mapping.note ? String(row[mapping.note] ?? '').trim() : '';

    let action: 1 | -1 | undefined;
    let unit: number | undefined;
    let price: number | undefined;

    if (validType === 3) {
      const rawAction = mapping.action ? String(row[mapping.action] ?? '').trim() : '';
      action = /^jual/i.test(rawAction) ? -1 : 1;
      unit = mapping.unit ? parseNumber(row[mapping.unit]) : 0;
      price = mapping.price ? parseNumber(row[mapping.price]) : 0;
      if (!amount && unit > 0 && price > 0) {
        amount = Math.round(unit * price);
      }
    }

    if (!(amount > 0)) {
      skipped++;
      continue;
    }

    out.push(
      normalizeInvestmentTransaction({
        date: dt[0],
        time,
        account,
        category,
        subcategory,
        note,
        amount,
        type: validType,
        ...(validType === 3 ? { action, unit, price } : {}),
      })
    );
  }

  return { rows: out, skipped };
}

export function dedupKey(r: Omit<Transaction, 'id'>): string {
  return [r.date, r.time, r.account, r.category, r.amount, r.type].join('|');
}

export function downloadTemplateExcel(): void {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Tanggal',
    'Jam',
    'Jenis',
    'Akun',
    'Kategori',
    'Subkategori',
    'Catatan',
    'Nominal',
    'Aksi',
    'Unit',
    'Harga',
  ];
  const sampleRows = [
    ['2026-11-20', '12:30', 'Pengeluaran', 'Bank 1 (BCA)', 'Makanan & Minuman', 'Makan Siang', 'Makan siang (contoh)', 35000],
    ['2026-11-20', '09:00', 'Pemasukan', 'Bank 1 (BCA)', 'Gaji', 'Gaji Pokok', 'Gaji bulanan (contoh)', 10000000],
    ['2026-11-20', '10:00', 'Transfer', 'Bank 1 (BCA)', 'GoPay', '', 'Top up e-wallet (contoh)', 500000],
    ['2026-11-20', '11:00', 'Investasi', 'BNI Valas', 'Valas', 'USD', 'Beli USD (contoh)', 1605000, 'Beli', 100, 16050],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...sampleRows]), 'Transaksi');

  const guide = [
    ['Petunjuk Pengisian Template Keuangan'],
    ['1. Jenis: isi dengan Pengeluaran, Pemasukan, Transfer, atau Investasi.'],
    ['2. Transfer: Kolom Akun = akun sumber (Dari), Kolom Kategori = akun tujuan (Ke).'],
    ['3. Investasi: Akun = akun sumber, Kategori = jenis instrumen (Saham, Reksa dana, Emas, SBN, Valas, Crypto), Subkategori = kode/nama aset, Aksi = Beli atau Jual, isi Unit dan Harga.'],
    ['4. Tanggal format YYYY-MM-DD (mis. 2026-11-20) atau DD/MM/YYYY. Jam format HH:MM (boleh kosong).'],
    ['5. Nominal dalam rupiah (angka tanpa titik/koma pemisah ribuan).'],
    ['6. Hapus baris contoh sebelum mengimpor data Anda.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), 'Petunjuk');
  XLSX.writeFile(wb, 'template-transaksi.xlsx');
}

export function exportTransactionsExcel(transactions: Transaction[]): void {
  const headers = [
    'Tanggal',
    'Jam',
    'Jenis',
    'Akun',
    'Kategori',
    'Subkategori',
    'Catatan',
    'Nominal',
    'Aksi',
    'Unit',
    'Harga',
  ];
  const typeLabels = ['Pengeluaran', 'Pemasukan', 'Transfer', 'Investasi'];
  const sorted = [...transactions].sort((a, b) =>
    `${a.date}${a.time}` < `${b.date}${b.time}` ? 1 : -1
  );

  const rows = sorted.map((r) => {
    const isInv = r.type === 3;
    return [
      r.date,
      r.time,
      typeLabels[r.type],
      r.account,
      r.category,
      r.subcategory,
      r.note,
      r.amount,
      isInv ? (r.action === -1 ? 'Jual' : 'Beli') : '',
      isInv ? r.unit ?? '' : '',
      isInv ? r.price ?? '' : '',
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Transaksi');
  XLSX.writeFile(wb, `transaksi-${todayISO()}.xlsx`);
}

function cleanPdfText(s: string): string {
  return String(s || '').replace(/[^\x20-\x7E]/g, '').trim() || 'Lainnya';
}

function pdfRp(n: number): string {
  return `${n < 0 ? '-' : ''}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
}

export function exportFinancePDF(
  kind: 'laporan' | 'diagram',
  params: {
    period: PeriodRange;
    stats: PeriodStats;
    cashflowRows: Transaction[];
    calendar: DaySummary[];
    accounts: AccountFlow[];
    holdings: Holding[];
    insightsIncome: string[];
    insightsExpense: string[];
  }
): void {
  const { period, stats: s, cashflowRows, calendar, accounts, holdings, insightsIncome, insightsExpense } = params;
  const d = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = 595;
  const M = 40;
  let y = M;

  const ensurePage = (needed: number) => {
    if (y + needed > 800) {
      d.addPage();
      y = M;
    }
  };
  const tx = (
    text: string,
    x: number,
    yy: number,
    opts: { align?: 'left' | 'center' | 'right' } | null = null,
    size = 10,
    bold = false
  ) => {
    d.setFont('helvetica', bold ? 'bold' : 'normal');
    d.setFontSize(size);
    d.setTextColor(30);
    if (opts) d.text(String(text), x, yy, opts);
    else d.text(String(text), x, yy);
  };

  const row = (label: string, val: string, bold = false, indent = 0) => {
    ensurePage(16);
    tx(cleanPdfText(label), M + indent, y, null, 10, bold);
    tx(val, W - M, y, { align: 'right' }, 10, bold);
    y += 15;
  };

  const hd = (title: string) => {
    ensurePage(34);
    y += 8;
    tx(title, M, y, null, 12, true);
    y += 6;
    d.setDrawColor(160);
    d.line(M, y, W - M, y);
    y += 15;
  };

  const lines = (text: string, indent = 0) => {
    const wrapped = d.splitTextToSize(cleanPdfText(text), W - 2 * M - indent) as string[];
    for (const line of wrapped) {
      ensurePage(14);
      tx(line, M + indent, y, null, 10);
      y += 13;
    }
  };

  const drawPdfBars = (title: string, map: Record<string, number>, col: [number, number, number]) => {
    const ks = Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, 8);
    const mx = ks.length ? map[ks[0]] || 1 : 1;
    hd(title);
    if (!ks.length) {
      lines('Tidak ada data.');
      return;
    }
    for (const k of ks) {
      ensurePage(18);
      tx(cleanPdfText(k).slice(0, 26), M, y, null, 9);
      d.setFillColor(col[0], col[1], col[2]);
      d.rect(M + 150, y - 8, Math.max(2, (map[k] / mx) * 250), 9, 'F');
      tx(pdfRp(map[k]), W - M, y, { align: 'right' }, 9);
      y += 17;
    }
  };

  tx(kind === 'laporan' ? 'Laporan Laba Rugi Pribadi' : 'Ringkasan Diagram Keuangan', M, y, null, 18, true);
  y += 18;
  tx(`Periode: ${period.from} s.d. ${period.to}`, M, y, null, 10);
  y += 14;
  tx(`Dibuat: ${todayISO()}`, M, y, null, 9);
  y += 14;

  if (kind === 'laporan') {
    const sec = (title: string, obj: Record<string, number>, tot: number) => {
      hd(title);
      Object.keys(obj)
        .sort((a, b) => obj[b] - obj[a])
        .forEach((k) => row(k, pdfRp(obj[k]), false, 10));
      row(`Total ${title.toLowerCase()}`, pdfRp(tot), true);
    };

    sec('Pendapatan', s.ci, s.i);
    sec('Beban', s.ce, s.e);
    hd('Laba (Rugi) Bersih');
    row('Pendapatan - Beban', pdfRp(s.i - s.e), true);
    if (s.i > 0) row('Tingkat tabungan', `${Math.round(((s.i - s.e) / s.i) * 100)}%`);

    hd('Arus per Akun');
    accounts.slice(0, 12).forEach((x) => {
      row(
        `${x.account} (masuk ${pdfRp(x.income + x.transferIn)}, keluar ${pdfRp(x.expense + x.transferOut + x.investNet)})`,
        pdfRp(x.net)
      );
    });

    if (holdings.length > 0) {
      hd('Investasi dan Valas (Posisi Saat Ini)');
      holdings.forEach((x) => {
        row(
          `${x.symbol} - modal ${pdfRp(x.costBasis)}`,
          x.currentValue !== null
            ? `${pdfRp(x.currentValue)} (${pdfRp(x.currentValue - x.costBasis)})`
            : 'nilai belum diisi'
        );
      });
    }

    hd('Insight Periode');
    [...insightsIncome, ...insightsExpense].forEach((item) => lines(`- ${item}`, 6));
  } else {
    drawPdfBars('Pengeluaran per Kategori', s.ce, [225, 65, 65]);
    drawPdfBars('Pemasukan per Akun', s.ai, [16, 165, 115]);

    const ms: Record<string, { i: number; e: number }> = {};
    cashflowRows.forEach((r) => {
      const m = r.date.slice(0, 7);
      if (!ms[m]) ms[m] = { i: 0, e: 0 };
      if (r.type === 1) ms[m].i += r.amount;
      else if (r.type === 0) ms[m].e += r.amount;
    });
    const mk = Object.keys(ms).sort();
    hd('Pemasukan dan Pengeluaran per Bulan');
    if (mk.length > 0) {
      ensurePage(160);
      let mx = 1;
      mk.forEach((k) => {
        mx = Math.max(mx, ms[k].i, ms[k].e);
      });
      const bw = Math.min(60, (W - 2 * M) / Math.max(mk.length, 1));
      const base = y + 120;
      mk.forEach((k, i) => {
        const x = M + i * bw;
        const barW = Math.max(4, bw / 2 - 4);
        d.setFillColor(16, 165, 115);
        const hi = (ms[k].i / mx) * 115;
        d.rect(x, base - hi, barW, hi, 'F');
        d.setFillColor(225, 65, 65);
        const he = (ms[k].e / mx) * 115;
        d.rect(x + barW + 2, base - he, barW, he, 'F');
        tx(k.slice(2), x, base + 11, null, 8);
      });
      y = base + 30;
      tx(`Hijau: pemasukan, merah: pengeluaran. Nilai tertinggi: ${pdfRp(mx)}`, M, y, null, 8);
      y += 14;
    }

    hd('Pengeluaran Harian');
    if (calendar.length > 1) {
      ensurePage(150);
      let mxd = 1;
      calendar.forEach((c) => {
        mxd = Math.max(mxd, c.e);
      });
      const x1 = M;
      const x2 = W - M;
      const yb = y + 120;
      d.setDrawColor(225, 65, 65);
      d.setLineWidth(0.9);
      for (let i = 1; i < calendar.length; i++) {
        const px1 = x1 + ((i - 1) / (calendar.length - 1)) * (x2 - x1);
        const py1 = yb - (calendar[i - 1].e / mxd) * 115;
        const px2 = x1 + (i / (calendar.length - 1)) * (x2 - x1);
        const py2 = yb - (calendar[i].e / mxd) * 115;
        d.line(px1, py1, px2, py2);
      }
      d.setDrawColor(150);
      d.line(x1, yb, x2, yb);
      tx(period.from, x1, yb + 11, null, 8);
      tx(period.to, x2, yb + 11, { align: 'right' }, 8);
      tx(`Puncak harian: ${pdfRp(mxd)}`, x1, y + 4, null, 8);
      y = yb + 24;
    }
  }

  ensurePage(30);
  y += 10;
  tx(
    'Dibuat dari catatan transaksi pribadi. Transfer antar akun dan investasi tidak dihitung sebagai pendapatan atau beban.',
    M,
    y,
    null,
    7
  );

  const filename = `${kind === 'laporan' ? 'laporan-laba-rugi' : 'diagram-keuangan'}-${period.from}_${period.to}.pdf`;
  d.save(filename);
}
