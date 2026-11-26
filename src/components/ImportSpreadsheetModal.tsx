import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { Transaction } from '../types/finance';
import { formatDateLabel, formatRp } from '../utils/format';
import {
  type ColumnMapping,
  extractSheetRows,
  type ParsedSheetResult,
  parseMappedRows,
  readSpreadsheetFile,
} from '../utils/spreadsheet';

interface ImportSpreadsheetModalProps {
  open: boolean;
  initialFile?: File | null;
  onClose: () => void;
  onImport: (rows: Omit<Transaction, 'id'>[], mode: 'add' | 'replace') => void;
}

const TYPE_NAME = ['Pengeluaran', 'Pemasukan', 'Transfer', 'Investasi'];

export const ImportSpreadsheetModal: React.FC<ImportSpreadsheetModalProps> = ({
  open,
  onClose,
  onImport,
}) => {
  const [parsed, setParsed] = useState<ParsedSheetResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [showMapping, setShowMapping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const previewResult = useMemo(() => {
    if (!mapping || rawRows.length === 0) return { rows: [], skipped: 0 };
    return parseMappedRows(rawRows, mapping);
  }, [rawRows, mapping]);

  if (!open) return null;

  const handleFile = async (file: File) => {
    try {
      setErrorMsg('');
      const res = await readSpreadsheetFile(file);
      setParsed(res);
      setMapping(res.mapping);
      setRawRows(res.rawRows);
      setHeaders(res.headers);
      setActiveSheet(res.activeSheet);
      setFileName(file.name);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal membaca file spreadsheet. Pastikan format .xlsx, .xls, atau .csv valid.'
      );
      setParsed(null);
      setMapping(null);
      setRawRows([]);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!parsed) return;
    const next = extractSheetRows(parsed.workbook, sheetName);
    setActiveSheet(sheetName);
    setHeaders(next.headers);
    setRawRows(next.rawRows);
    setMapping(next.mapping);
  };

  const updateMapField = (field: keyof ColumnMapping, col: string) => {
    if (!mapping) return;
    setMapping({ ...mapping, [field]: col });
  };

  const resetAndClose = () => {
    setParsed(null);
    setMapping(null);
    setRawRows([]);
    setHeaders([]);
    setFileName('');
    setErrorMsg('');
    setShowMapping(false);
    onClose();
  };

  const handleConfirmImport = () => {
    if (previewResult.rows.length === 0) return;
    onImport(previewResult.rows, mode);
    resetAndClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="import-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Import dari Spreadsheet (.xlsx / .xls / .csv)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mendukung Template Excel Artha, ekspor aplikasi pencatat keuangan, maupun tabel spreadsheet kustom dengan kolom Masuk/Keluar terpisah.
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dropzone */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10'
              : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/70 dark:bg-[#0B0F1A]'
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {fileName ? (
            <div className="flex items-center gap-2.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
              <FileSpreadsheet className="w-5 h-5 shrink-0" />
              <span>{fileName}</span>
            </div>
          ) : (
            <Upload className="w-6 h-6 text-slate-400 dark:text-slate-500" />
          )}
          <span className="text-xs text-slate-600 dark:text-slate-300 text-center">
            {fileName
              ? 'Klik atau seret file lain untuk mengganti'
              : 'Seret & lepas file Excel/CSV di sini, atau klik untuk memilih file'}
          </span>
        </label>

        {errorMsg && (
          <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}

        {parsed && mapping && (
          <div className="mt-4 space-y-4">
            {/* Sheet selector & summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                  {previewResult.rows.length.toLocaleString('id-ID')} transaksi siap diimpor
                </span>
                {previewResult.skipped > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">
                    · {previewResult.skipped} baris dilewati
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {parsed.sheetNames.length > 1 && (
                  <select
                    aria-label="Pilih sheet"
                    value={activeSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-100"
                  >
                    {parsed.sheetNames.map((s) => (
                      <option key={s} value={s}>
                        Sheet: {s}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => setShowMapping((v) => !v)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131929] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {showMapping ? 'Sembunyikan Pemetaan Kolom' : 'Sesuaikan Kolom'}
                </button>
              </div>
            </div>

            {/* Optional Custom Column Mapping Panel */}
            {showMapping && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200 dark:border-slate-800 rounded-xl">
                {(
                  [
                    ['date', 'Tanggal *'],
                    ['type', 'Jenis (Masuk/Keluar)'],
                    ['amount', 'Nominal (Tunggal)'],
                    ['incomeAmount', 'Kolom Masuk (Opsional)'],
                    ['expenseAmount', 'Kolom Keluar (Opsional)'],
                    ['account', 'Akun / Bank'],
                    ['category', 'Kategori / Akun Tujuan'],
                    ['subcategory', 'Subkategori / Kode'],
                    ['note', 'Catatan'],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="block">
                    <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {label}
                    </span>
                    <select
                      value={mapping[field]}
                      onChange={(e) => updateMapField(field, e.target.value)}
                      className="w-full bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-100"
                    >
                      <option value="">— Tidak dipakai —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}

            {/* Preview first 5 rows */}
            {previewResult.rows.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#0B0F1A] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-2.5 text-left">Tanggal</th>
                      <th className="py-2 px-2.5 text-left">Jenis</th>
                      <th className="py-2 px-2.5 text-left">Akun</th>
                      <th className="py-2 px-2.5 text-left">Kategori</th>
                      <th className="py-2 px-2.5 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.rows.slice(0, 5).map((r, idx) => (
                      <tr
                        key={idx}
                        className="border-b last:border-b-0 border-slate-100 dark:border-slate-800/70"
                      >
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDateLabel(r.date)}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">
                          {TYPE_NAME[r.type]}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">
                          {r.account}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                          {r.category}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono-num tabular-nums font-semibold text-slate-900 dark:text-white">
                          {formatRp(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Import mode */}
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'add'}
                  onChange={() => setMode('add')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    Tambahkan ke transaksi yang ada
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Baris yang sama persis akan otomatis dilewati agar tidak terjadi duplikasi.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    Ganti seluruh data dashboard
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Menghapus data saat ini dan hanya menampilkan isi file spreadsheet ini.
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={resetAndClose}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={previewResult.rows.length === 0}
            onClick={handleConfirmImport}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors"
          >
            Impor {previewResult.rows.length > 0 ? `(${previewResult.rows.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
