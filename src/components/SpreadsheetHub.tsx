import React from 'react';
import {
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';

interface SpreadsheetHubProps {
  totalTransactions: number;
  onOpenImport: () => void;
  onDownloadTemplate: () => void;
  onExportExcel: () => void;
  onExportPdfReport: () => void;
  onExportPdfCharts: () => void;
  onLoadSampleData: () => void;
  onRequestClearData: () => void;
}

export const SpreadsheetHub: React.FC<SpreadsheetHubProps> = ({
  totalTransactions,
  onOpenImport,
  onDownloadTemplate,
  onExportExcel,
  onExportPdfReport,
  onExportPdfCharts,
  onLoadSampleData,
  onRequestClearData,
}) => {
  return (
    <div className="space-y-4">
      <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Integrasi Spreadsheet &amp; Laporan PDF
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
            Unggah file Excel atau CSV Anda untuk langsung memvisualisasikan arus kas, tren kategori, mutasi akun, hingga portofolio investasi. Seluruh data diproses langsung di browser Anda.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onOpenImport}
            className="flex items-start gap-4 p-4 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/10 text-left hover:bg-indigo-50 dark:hover:bg-indigo-500/15 transition-colors"
          >
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 dark:text-white block">
                Import Excel / CSV
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 block">
                Mendukung Template Artha, ekspor aplikasi pencatat keuangan, atau kolom kustom dengan pemetaan otomatis.
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onDownloadTemplate}
            className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-colors"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 dark:text-white block">
                Unduh Template Excel
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block">
                Format siap pakai lengkap dengan contoh baris dan lembar petunjuk pengisian.
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            disabled={totalTransactions === 0}
            className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-45 disabled:pointer-events-none text-left transition-colors"
          >
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 dark:text-white block">
                Ekspor Cadangan Excel
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block">
                Simpan seluruh {totalTransactions.toLocaleString('id-ID')} transaksi ke file .xlsx untuk arsip pribadi.
              </span>
            </div>
          </button>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onExportPdfReport}
              disabled={totalTransactions === 0}
              className="flex-1 flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-45 disabled:pointer-events-none text-left transition-colors"
            >
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white block">
                  PDF Laporan
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Laba Rugi &amp; Arus</span>
              </div>
            </button>

            <button
              type="button"
              onClick={onExportPdfCharts}
              disabled={totalTransactions === 0}
              className="flex-1 flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-45 disabled:pointer-events-none text-left transition-colors"
            >
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0">
                <FileDown className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white block">
                  PDF Diagram
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Ringkasan Grafik</span>
              </div>
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-[#131929] border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          Format Kolom yang Didukung Otomatis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200/80 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white mb-1">1. Template Artha</p>
            <p>Tanggal, Jam, Jenis, Akun, Kategori, Subkategori, Catatan, Nominal, Aksi, Unit, Harga.</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200/80 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white mb-1">2. Ekspor Aplikasi Pencatat</p>
            <p>Period, Accounts, Category, Subcategory, Note, IDR, Income/Expense (Money Manager, dll).</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F1A] border border-slate-200/80 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white mb-1">3. Tabel Mutasi Bank / Kustom</p>
            <p>Kolom Pemasukan/Kredit dan Pengeluaran/Debit terpisah dapat dipetakan langsung saat impor.</p>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onLoadSampleData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Muat Data Contoh (3 Bulan)
            </button>

            {totalTransactions > 0 && (
              <button
                type="button"
                onClick={onRequestClearData}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Kosongkan Semua Data
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Data tersimpan secara lokal di browser ini.
          </span>
        </div>
      </section>
    </div>
  );
};
